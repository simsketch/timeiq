import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function load(path, overrides = {}, globals = {}) {
  const compiled = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, Date, Error, Intl, URL, URLSearchParams,
    require(name) {
      if (name in overrides) return overrides[name];
      if (name === "@/lib/signup-attribution") return load("lib/signup-attribution.ts");
      if (name === "@/lib/analytics-url") return load("lib/analytics-url.ts");
      if (name === "@/lib/calendar-time") return load("lib/calendar-time.ts");
      if (name === "@/lib/utils") return { cn: (...values) => values.filter(Boolean).join(" ") };
      if (name === "next/link") return { __esModule: true, default: "Link" };
      if (name.startsWith("@/components/") || name === "lucide-react") return new Proxy({}, { get: (_, key) => key });
      return require(name);
    },
    ...globals,
  });
  return compiled.exports;
}

function harness(path, name, props = {}, options = {}) {
  const states = [];
  const effects = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useMemo: (compute) => compute(),
    useCallback: (callback) => callback,
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useRef: (initial) => ({ current: initial ?? null }),
    useEffect: (effect) => { if (options.effects) effects.push(effect); },
  };
  const component = load(path, { react, ...options.modules }, options.globals)[name];
  return {
    render() { cursor = 0; return component(props); },
    async mount() {
      this.render();
      for (const effect of effects.splice(0)) effect();
      await new Promise(setImmediate);
    },
  };
}

function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [
    ...(predicate(tree) ? [tree] : []),
    ...[tree.props?.children].flat(Infinity).flatMap((child) => nodes(child, predicate)),
  ];
}
const find = (tree, predicate) => nodes(tree, predicate)[0];
const auth = { useAuth: () => ({ getToken: async () => "test-token" }) };
const toastModule = { useToast: () => ({ toast() {} }) };

test("booking branding uploads a resized logo, saves white labeling, and preserves saved values after errors", async () => {
  const calls = [];
  const messages = [];
  let fail = false;
  const png = "data:image/png;base64,test-logo";
  const card = harness("components/booking-branding-card.tsx", "BookingBrandingCard", { username: "host" }, {
    modules: {
      "@clerk/nextjs": auth,
      "@/components/ui/use-toast": { useToast: () => ({ toast: (message) => messages.push(message) }) },
      "@/lib/api": { apiFetch: async (path, options) => {
        calls.push({ path, ...options });
        if (fail) throw new Error("Not saved");
        return JSON.parse(options.body);
      } },
    },
    globals: {
      createImageBitmap: async () => ({ width: 2000, height: 500, close() {} }),
      document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => png }) },
    },
  });
  let tree = card.render();
  const event = { target: { files: [{ type: "image/png", size: 1000 }], value: "logo.png" } };
  find(tree, (node) => node.type === "input" && node.props.type === "file").props.onChange(event);
  await new Promise(setImmediate);
  assert.equal(event.target.value, "");
  assert.equal(calls[0].path, "/api/me");
  assert.equal(calls[0].headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(calls[0].body), { booking_logo: png, booking_white_label: true });
  assert.equal(find(card.render(), (node) => node.type === "img").props.src, png);
  assert.equal(find(card.render(), (node) => node.type === "Switch").props.checked, true);
  fail = true;
  await find(card.render(), (node) => node.type === "Switch").props.onCheckedChange(false);
  assert.equal(find(card.render(), (node) => node.type === "Switch").props.checked, true);
  assert.equal(messages.at(-1).description, "Not saved");
  fail = false;
  await find(card.render(), (node) => node.type === "Button" && node.props.children === "Remove logo").props.onClick();
  assert.equal(find(card.render(), (node) => node.type === "img"), undefined);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { booking_logo: null, booking_white_label: true });
});

test("public booking profiles show custom logos and honor white labeling with and without scenes and embeds", () => {
  for (const noScene of [true, false]) {
    for (const embed of [true, false]) {
      for (const whiteLabel of [true, false]) {
        const profile = { username: "host", name: "Host", image_url: null, event_types: [], booking_logo: "data:image/png;base64,logo", booking_white_label: whiteLabel };
        const card = harness("components/booking/booking-profile.tsx", "BookingProfile", { profile, embed }, {
          modules: {
            "./booking-profile.module.css": new Proxy({}, { get: (_, key) => key }),
            "./scenes": { isNoScene: () => noScene, sceneFor: () => ({ id: "orrery", ink: "light" }) },
            "./booking-scene": { BookingScene: "BookingScene" },
            "@/lib/booking-payments": {},
          },
        });
        const tree = card.render();
        assert.equal(find(tree, (node) => node.type === "img" && node.props.alt === "Host logo").props.src, profile.booking_logo);
        assert.equal(Boolean(find(tree, (node) => node.type === "footer")), !embed && !whiteLabel);
        assert.equal(Boolean(find(tree, (node) => node.props?.["aria-label"] === "TimeIQ home")), !embed && !whiteLabel);
      }
    }
  }
});

test("white-label booking metadata uses the host's title and logo instead of TimeIQ branding", async () => {
  for (const enabled of [false, true]) {
    const { generateMetadata } = load("app/book/[username]/layout.tsx", {
      "@/lib/public-booking-profile": { getPublicBookingProfile: async () => ({ name: "Acme Studio", booking_white_label: enabled, booking_logo: "data:image/png;base64,logo" }) },
    });
    const metadata = await generateMetadata({ params: Promise.resolve({ username: "acme" }) });
    if (enabled) {
      assert.equal(metadata.title, "Book time with Acme Studio");
      assert.equal(metadata.icons.icon, "data:image/png;base64,logo");
      assert.equal(metadata.openGraph.siteName, "Acme Studio");
    } else assert.equal(Object.keys(metadata).length, 0);
  }
});

test("availability sharing sends inclusive custom dates, validates ranges and never shows another range's output", async () => {
  const cases = [
    ...[1, 3, 5, 7, 14].map((preset) => ({ preset })),
    { start: "2026-11-20", end: "2026-11-20", days: 1 },
    { start: "2026-11-20", end: "2026-11-22", days: 3 },
    { start: "2026-11-20", end: "2026-12-20", days: 31 },
    { start: "2026-11-20", end: "2026-12-21" },
    { start: "2026-11-22", end: "2026-11-20" },
    { start: "", end: "2026-11-20" }, { start: "2026-11-20", end: "" },
  ];
  for (const c of cases) {
    const calls = [];
    const share = harness("components/share-availability.tsx", "ShareAvailability", {}, {
      effects: true,
      modules: {
        "@clerk/nextjs": auth,
        "@/components/ui/use-toast": toastModule,
        "@/lib/api": { apiFetch: async (path) => {
          calls.push(path);
          return { timezone: "UTC", username: "test", days: Array.from({ length: c.preset ?? c.days }, (_, i) => ({ date: `2026-11-${9 + i}` })) };
        } },
        "@/lib/availability-share": { COMMON_ZONES: [], IMAGE_THEMES: load("lib/availability-share.ts").IMAGE_THEMES, zoneAbbr: (zone) => zone, buildText: (s) => `Range: ${s.days.length}`, drawImage() {} },
      },
      globals: { window: { location: { origin: "https://timeiq.test" } } },
    });
    let tree = share.render();
    if (c.preset) find(tree, (node) => node.type === "Button" && node.props?.children?.[0] === c.preset).props.onClick();
    else {
      find(tree, (node) => node.type === "Button" && node.props.children === "Custom").props.onClick();
      const inputs = () => nodes(share.render(), (node) => node.type === "input" && node.props.type === "date");
      inputs()[0].props.onChange({ target: { value: c.start } });
      inputs()[1].props.onChange({ target: { value: c.end } });
    }
    find(share.render(), (node) => node.type === "Dialog").props.onOpenChange(true);
    await share.mount();
    tree = share.render();
    const valid = Boolean(c.preset ?? c.days);
    const query = c.preset ? `days=${c.preset}` : `start_date=${c.start}&end_date=${c.end}`;
    assert.deepEqual(calls, valid ? [`/api/availability/summary?${query}`] : []);
    if (valid) {
      assert.equal(find(tree, (node) => node.type === "textarea").props.value, `Range: ${c.preset ?? c.days}`);
      find(tree, (node) => node.type === "Button" && node.props.children?.includes?.("Midnight")).props.onClick();
      assert.equal(find(share.render(), (node) => node.type === "canvas").props["aria-label"], "Availability image, Midnight theme");
      if (!c.preset) {
        nodes(share.render(), (node) => node.type === "input" && node.props.type === "date")[0].props.onChange({ target: { value: "2026-11-21" } });
        assert.equal(find(share.render(), (node) => node.type === "textarea"), undefined);
      }
    } else assert.ok(find(tree, (node) => node.props?.role === "alert"));
  }
});

test("chat keeps reset disabled until the reply completes and preserves tool history for follow-ups", async () => {
  const calls = [];
  let finish;
  const chat = harness("components/dashboard/assistant-chat.tsx", "AssistantChat", {}, {
    modules: {
      "@clerk/nextjs": auth,
      "@/lib/speech": { speechRecognizer: () => null },
      "@/lib/api": { apiFetch: (path, options) => {
        calls.push({ path, ...options });
        return new Promise((resolve) => { finish = resolve; });
      } },
    },
  });
  const message = (text) => find(chat.render(), (n) => n.type === "textarea").props.onChange({ target: { value: text } });
  const submit = () => find(chat.render(), (n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  const reset = () => find(chat.render(), (n) => n.type === "button" && n.props.children?.includes?.(" New chat"));
  message("When am I free?");
  submit();
  await new Promise(setImmediate);
  assert.equal(reset().props.disabled, true);
  assert.equal(calls[0].path, "/api/me/assistant");
  assert.equal(calls[0].headers.Authorization, "Bearer test-token");
  const history = [
    { role: "user", content: "When am I free?" },
    { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "get_free_times", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "9 AM" }] },
    { role: "assistant", content: [{ type: "text", text: "You're free at 9 AM." }] },
  ];
  finish({ messages: history, steps: [{ tool: "get_free_times", ok: true }] });
  await new Promise(setImmediate);
  assert.equal(reset().props.disabled, false);
  message("And tomorrow?");
  submit();
  await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(calls[1].body).messages, [...history, { role: "user", content: "And tomorrow?" }]);
  finish({ messages: [...history, { role: "assistant", content: [{ type: "text", text: "Tomorrow too." }] }], steps: [] });
  await new Promise(setImmediate);
  reset().props.onClick();
  assert.equal(reset(), undefined);
});

test("chat restores the draft and shows API errors so a failed request can be retried", async () => {
  const chat = harness("components/dashboard/assistant-chat.tsx", "AssistantChat", {}, {
    modules: {
      "@clerk/nextjs": auth,
      "@/lib/speech": { speechRecognizer: () => null },
      "@/lib/api": { apiFetch: async () => { throw new Error("Try again in a moment."); } },
    },
  });
  find(chat.render(), (n) => n.type === "textarea").props.onChange({ target: { value: "My week?" } });
  find(chat.render(), (n) => n.type === "form").props.onSubmit({ preventDefault() {} });
  await new Promise(setImmediate);
  const tree = chat.render();
  assert.equal(find(tree, (n) => n.type === "textarea").props.value, "My week?");
  assert.equal(find(tree, (n) => n.props?.role === "alert").props.children, "Try again in a moment.");
  assert.equal(find(tree, (n) => n.props?.["aria-label"] === "Send").props.disabled, false);
});

test("navigation preserves routes, highlights nested pages and closes the mobile drawer on every link", async () => {
  let closed = 0;
  const modules = (invoicing, admin = false) => ({
    "next/navigation": { usePathname: () => "/meetings/123" },
    "@clerk/nextjs": { useAuth: () => ({ isLoaded: true, getToken: async () => "t" }) },
    "@/lib/api": { apiFetch: async (path) => (assert.equal(path, "/api/me"), { invoicing_enabled: invoicing, is_admin: admin }) },
  });
  const sidebar = harness("components/dashboard/sidebar.tsx", "Sidebar", { onNavigate: () => closed++ }, {
    modules: modules(false), effects: true,
  });
  await sidebar.mount();
  const tree = sidebar.render();
  const links = nodes(tree, (node) => node.type === "Link");
  // Time tracking and invoicing stay hidden unless the account has them.
  assert.deepEqual(links.slice(1).map((node) => node.props.href), [
    "/dashboard", "/event-types", "/availability", "/calendars", "/bookings", "/meetings", "/settings",
  ]);
  assert.equal(find(tree, (node) => node.props?.["aria-current"] === "page").props.href, "/meetings");
  for (const link of links) link.props.onClick();
  assert.equal(closed, links.length);
  assert.deepEqual(nodes(tree, (node) => node.type === "p").map((node) => node.props.children), ["Scheduling", "Workspace"]);

  const owner = harness("components/dashboard/sidebar.tsx", "Sidebar", {}, { modules: modules(true), effects: true });
  await owner.mount();
  const ownerTree = owner.render();
  assert.deepEqual(nodes(ownerTree, (node) => node.type === "Link").slice(1).map((node) => node.props.href), [
    "/dashboard", "/event-types", "/availability", "/calendars", "/bookings", "/meetings", "/time", "/clients", "/invoices", "/settings",
  ]);
  assert.deepEqual(nodes(ownerTree, (node) => node.type === "p").map((node) => node.props.children), ["Scheduling", "Time & invoicing", "Workspace"]);

  const admin = harness("components/dashboard/sidebar.tsx", "Sidebar", {}, { modules: modules(false, true), effects: true });
  await admin.mount();
  assert.equal(nodes(admin.render(), (node) => node.type === "Link").some((node) => node.props.href === "/admin"), true);

  const mobile = harness("components/dashboard/mobile-nav.tsx", "MobileNav", {}, {
    modules: { "next/navigation": { usePathname: () => "/availability" }, "@clerk/nextjs": {} },
  });
  find(mobile.render(), (node) => node.props?.["aria-label"] === "Open navigation").props.onClick();
  assert.equal(find(mobile.render(), (node) => node.type === "aside").props["aria-hidden"], false);
  find(mobile.render(), (node) => node.type === "Sidebar").props.onNavigate();
  assert.equal(find(mobile.render(), (node) => node.type === "aside").props["aria-hidden"], true);
});

test("username saves only its own field and leaves shared links on the saved username after errors", async () => {
  const calls = [];
  const copied = [];
  let fail = false;
  const props = { username: "old-name", onSaved: (username) => { props.username = username; } };
  const card = harness("components/booking-link-card.tsx", "BookingLinkCard", props, {
    modules: {
      "@clerk/nextjs": auth,
      "@/components/ui/use-toast": toastModule,
      "@/lib/api": { apiFetch: async (path, options) => {
        calls.push({ path, ...options });
        if (fail) throw new Error("Username already taken. Choose another.");
        return { username: JSON.parse(options.body).username };
      } },
    },
    globals: { window: { location: { origin: "https://timeiq.example" } }, navigator: { clipboard: { writeText: async (value) => copied.push(value) } } },
  });
  const input = find(card.render(), (node) => node.props?.id === "username");
  assert.equal(input.props.pattern, "[a-zA-Z0-9_-]+");
  assert.equal(input.props.required, true);
  input.props.onChange({ target: { value: "new-name" } });
  await find(card.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(calls[0].body), { username: "new-name" });
  assert.equal(calls[0].path, "/api/me");
  assert.equal(calls[0].method, "PATCH");
  assert.equal(calls[0].headers.Authorization, "Bearer test-token");
  assert.equal(props.username, "new-name");
  fail = true;
  find(card.render(), (node) => node.props?.id === "username").props.onChange({ target: { value: "taken" } });
  await find(card.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  await find(card.render(), (node) => node.props?.["aria-label"] === "Copy booking link").props.onClick();
  assert.equal(copied[0], "https://timeiq.example/book/new-name");
  assert.equal(find(card.render(), (node) => node.type === "a").props.href, "/book/new-name");
});

test("calendar subscription keeps privacy rollback, regeneration confirmation and API contracts", async () => {
  const feed = { url: "https://calendar.example/old.ics", webcal_url: "webcal://calendar.example/old.ics", obfuscate: false };
  const calls = [];
  let confirmed = false;
  const card = harness("components/calendar-subscription-card.tsx", "CalendarSubscriptionCard", {}, {
    effects: true,
    modules: {
      "@clerk/nextjs": auth,
      "@/components/ui/use-toast": toastModule,
      "@/lib/api": { apiFetch: async (path, options) => {
        calls.push({ path, ...options });
        if (options.method === "PATCH") throw new Error("Privacy setting did not save.");
        return options.method === "POST" ? { ...feed, url: "https://calendar.example/new.ics" } : feed;
      } },
    },
    globals: { confirm: () => confirmed },
  });
  await card.mount();
  await find(card.render(), (node) => node.props?.id === "obfuscate").props.onCheckedChange(true);
  assert.equal(find(card.render(), (node) => node.props?.id === "obfuscate").props.checked, false);
  assert.deepEqual(JSON.parse(calls[1].body), { obfuscate: true });
  const regenerate = () => find(card.render(), (node) => node.props?.title?.startsWith("Generate a new link")).props.onClick();
  await regenerate();
  assert.equal(calls.length, 2);
  confirmed = true;
  await regenerate();
  assert.equal(calls[2].path, "/api/me/feed/regenerate");
  assert.equal(calls[2].method, "POST");
  assert.ok(find(card.render(), (node) => node.props?.value === "https://calendar.example/new.ics"));
});

test("Stripe return feedback reflects account readiness and expired links", async () => {
  for (const [result, status, title] of [
    ["return", "ready", "Stripe connected"],
    ["return", "needs_info", "Stripe setup needs more information"],
    ["refresh", "needs_info", "Stripe onboarding link expired"],
  ]) {
    const toasts = [];
    const replaced = [];
    const card = harness("components/connect-card.tsx", "ConnectCard", {}, {
      effects: true,
      modules: {
        "@clerk/nextjs": auth,
        "@/components/ui/use-toast": { useToast: () => ({ toast: (value) => toasts.push(value) }) },
        "@/lib/api": { apiFetch: async () => ({ enabled: true, status }) },
      },
      globals: { window: { location: { search: `?connect=${result}&keep=1`, pathname: "/event-types", hash: "#payments" }, history: { replaceState: (...args) => replaced.push(args[2]) } } },
    });
    await card.mount();
    assert.equal(toasts[0].title, title);
    assert.equal(replaced[0], "/event-types?keep=1#payments");
  }
});

test("account timezone conversion preserves date boundaries and daylight-saving week lengths", () => {
  const { calendarDate, calendarInstant } = load("lib/calendar-time.ts");
  const local = calendarDate(new Date("2026-11-02T01:00:00Z"), "America/New_York");
  assert.equal(local.getDate(), 1);
  assert.equal(local.getHours(), 20);
  const tokyo = calendarDate(new Date("2026-11-01T22:00:00Z"), "Asia/Tokyo");
  assert.equal(tokyo.getDate(), 2);
  assert.equal(tokyo.getHours(), 7);
  for (const [start, end, expectedHours] of [
    [new Date(2026, 2, 2), new Date(2026, 2, 9), 167],
    [new Date(2026, 9, 26), new Date(2026, 10, 2), 169],
  ]) {
    assert.equal((calendarInstant(end, "America/New_York") - calendarInstant(start, "America/New_York")) / 3_600_000, expectedHours);
  }
});

test("live hours are background blocks and never shrink overlapping busy events", () => {
  const hours = [{ day_of_week: 0, start_time: "09:00:00", end_time: "17:00:00", is_active: true }];
  const busy = { id: "busy", title: "Call", start: new Date("2026-11-02T15:00:00Z"), end: new Date("2026-11-02T16:00:00Z"), color: "#6366f1" };
  const props = { events: [busy], weekStart: new Date(2026, 10, 2), onWeekChange() {}, availableHours: hours, timezone: "America/New_York" };
  const calendar = harness("components/week-calendar.tsx", "WeekCalendar", props);
  const background = () => find(calendar.render(), (node) => node.type === "div" && node.props?.title?.startsWith("Available ·"));
  // The grid starts at 8 AM, 44px per hour.
  assert.equal(background().props.style.top, 44);
  assert.equal(background().props.style.height, 352);
  const block = find(calendar.render(), (node) => node.type === "button" && node.props?.title?.startsWith("Call ·"));
  assert.equal(block.props.style.width, "calc(100% - 4px)");
  assert.equal(block.props.style.top, 88);
  hours[0] = { ...hours[0], start_time: "11:00:00" };
  assert.equal(background().props.style.top, 132);
  hours[0] = { ...hours[0], is_active: false };
  assert.equal(background(), undefined);
  hours[0] = { ...hours[0], is_active: true, start_time: "18:00:00" };
  assert.equal(background(), undefined);
});

test("daylight-saving days still align busy events with the wall-clock grid", () => {
  const calendar = harness("components/week-calendar.tsx", "WeekCalendar", {
    events: [{ id: "call", title: "Call", start: new Date("2026-11-01T14:00:00Z"), end: new Date("2026-11-01T15:00:00Z"), color: "#6366f1" }],
    weekStart: new Date(2026, 9, 26), onWeekChange() {}, timezone: "America/New_York",
    availableHours: [{ day_of_week: 6, start_time: "00:00:00", end_time: "06:00:00", is_active: true }],
  });
  const block = find(calendar.render(), (node) => node.type === "button" && node.props?.title?.startsWith("Call ·"));
  assert.equal(block.props.style.top, 9 * 44);
  assert.equal(block.props.style.height, 42);
});


test("admin analytics shows counts, refreshes, and keeps private data out of error states", async () => {
  const calls = [];
  let fail = false;
  const page = harness("app/(dashboard)/admin/page.tsx", "default", {}, {
    effects: true,
    modules: {
      "@clerk/nextjs": { useAuth: () => ({ isLoaded: true, userId: "owner", getToken: async () => "owner-token" }) },
      "@/lib/api": { apiFetch: async (path, options) => {
        calls.push({path, ...options});
        if (fail) throw new Error("Admin access is restricted to the owner.");
        return {
          generated_at: "2026-11-09T12:00:00Z",
          users: {total: 12, last_24h: 1, last_7d: 3, last_30d: 8, active_subscriptions: 2, trials: 1, complimentary: 1},
          signups: [{date: "2026-11-09", count: 1}], activity: {cc_agent_meetings: 4},
          recent_users: [{name: "Owner", username: "owner", email: "owner@example.com", created_at: "2026-11-09T12:00:00Z", subscription_status: "active"}],
        };
      } },
    },
  });
  await page.mount();
  let tree = page.render();
  assert.equal(calls[0].path, "/api/admin/analytics");
  assert.equal(calls[0].headers.Authorization, "Bearer owner-token");
  assert.equal(calls[0].cache, "no-store");
  assert.ok(find(tree, (node) => node.type === "td" && node.props.children === "owner@example.com"));
  assert.ok(find(tree, (node) => node.type === "p" && node.props.children === "Registered users"));
  assert.ok(find(tree, (node) => node.props?.["aria-label"] === "2026-11-09: 1 sign-ups"));
  find(tree, (node) => node.type === "Button").props.onClick();
  fail = true;
  await page.mount();
  tree = page.render();
  assert.equal(find(tree, (node) => node.props?.role === "alert").props.children, "Admin access is restricted to the owner.");
  assert.equal(nodes(tree, (node) => node.type === "td").length, 0);
});


test("campaign capture survives signup navigation, expires, and excludes private URLs", () => {
  const {captureAttribution, readAttribution} = load("lib/signup-attribution.ts");
  const values = new Map();
  const storage = {getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key)};
  const now = Date.now();
  captureAttribution("https://timeiq.app/?utm_source=facebook&utm_campaign=founder100&utm_content=G-all-calendars&fbclid=private-click", storage, now);
  assert.equal(readAttribution(storage, now).utm_content, "G-all-calendars");
  assert.equal([...values.values()][0].includes("private-click"), false);
  captureAttribution("https://timeiq.app/sign-up", storage, now+100);
  captureAttribution("https://timeiq.app/?utm_source=other", storage, now+200);
  assert.equal(readAttribution(storage, now+300).utm_source, "facebook");
  assert.equal(readAttribution(storage, now+31*86400000), null);
  captureAttribution("https://timeiq.app/invoice/secret?utm_source=facebook", storage, now);
  assert.equal(values.size, 0);
  captureAttribution("https://timeiq.app/?utm_source=instagram&ad_id=123", storage, now);
  assert.equal(readAttribution(storage, now).ad_id, "123");
});

test("new account reports saved attribution independently of the Meta pixel", async () => {
  const calls = [];
  const page = harness("components/signup-pixel.tsx", "SignupPixel", {}, {
    effects: true,
    modules: {
      "@clerk/nextjs": {useUser: () => ({user: {createdAt: new Date(Date.now()-2*3600000)}}), useAuth: () => ({getToken: async () => "new-user"})},
      "@/components/meta-pixel": {track() {}},
      "@/lib/signup-attribution": {readAttribution: () => ({utm_source: "facebook", captured_at: new Date().toISOString()})},
      "@/lib/api": {apiFetch: async (path, options) => calls.push({path,...options})},
    },
    globals: {window: {localStorage: {}}},
  });
  await page.mount();
  assert.equal(calls[0].path, "/api/me/attribution");
  assert.equal(calls[0].headers.Authorization, "Bearer new-user");
  assert.equal(JSON.parse(calls[0].body).utm_source, "facebook");
});


test("ad report loads separate from analytics and clears stale results when the period changes", async () => {
  const calls = [];
  let fail = false;
  const panel = harness("components/admin-ad-performance.tsx", "AdminAdPerformance", {}, {
    effects: true,
    modules: {
      "@clerk/nextjs": {useAuth: () => ({getToken: async () => "owner"})},
      "@/lib/api": {apiFetch: async (path, options) => {
        calls.push({path,...options});
        if (fail) throw new Error("Meta connection needs renewing");
        const totals = {spend: 35.97, impressions: 1358, link_clicks: 32, landing_page_views: 15, attributed_users: 0, meta_registrations: 0, purchases: 0};
        return {generated_at: new Date().toISOString(), since: "2026-11-02", until: "2026-11-08", currency: "USD", timezone: "America/New_York", totals, ads: [{id: "123", name: "G-all-calendars", campaign: "TimeIQ Founder 100", ...totals}]};
      }},
    },
  });
  await panel.mount();
  let tree = panel.render();
  assert.equal(calls[0].path, "/api/admin/ads?days=7");
  assert.ok(find(tree, (node) => node.type === "td" && node.props.children === "$35.97"));
  find(tree, (node) => node.type === "select").props.onChange({target: {value: "30"}});
  fail = true;
  await panel.mount();
  tree = panel.render();
  assert.equal(calls.at(-1).path, "/api/admin/ads?days=30");
  assert.equal(nodes(tree, (node) => node.type === "td").length, 0);
  assert.equal(find(tree, (node) => node.props?.role === "alert").props.children, "Meta connection needs renewing");
});
