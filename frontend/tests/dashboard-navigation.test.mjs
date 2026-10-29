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
    module: compiled, exports: compiled.exports, Date, Intl, URLSearchParams,
    require(name) {
      if (name in overrides) return overrides[name];
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

test("navigation preserves routes, highlights nested pages and closes the mobile drawer on every link", () => {
  let closed = 0;
  const sidebar = harness("components/dashboard/sidebar.tsx", "Sidebar", { onNavigate: () => closed++ }, {
    modules: { "next/navigation": { usePathname: () => "/meetings/123" } },
  });
  const tree = sidebar.render();
  const links = nodes(tree, (node) => node.type === "Link");
  assert.deepEqual(links.slice(1).map((node) => node.props.href), [
    "/dashboard", "/event-types", "/availability", "/calendars", "/bookings", "/meetings", "/time", "/clients", "/invoices", "/settings",
  ]);
  assert.equal(find(tree, (node) => node.props?.["aria-current"] === "page").props.href, "/meetings");
  for (const link of links) link.props.onClick();
  assert.equal(closed, links.length);
  assert.deepEqual(nodes(tree, (node) => node.type === "p").map((node) => node.props.children), ["Scheduling", "Time & invoicing"]);

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
  assert.equal(background().props.style.top, 88);
  assert.equal(background().props.style.height, 352);
  const block = find(calendar.render(), (node) => node.type === "button" && node.props?.title?.startsWith("Call ·"));
  assert.equal(block.props.style.width, "calc(100% - 4px)");
  assert.equal(block.props.style.top, 132);
  hours[0] = { ...hours[0], start_time: "11:00:00" };
  assert.equal(background().props.style.top, 176);
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
