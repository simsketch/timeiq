import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../src/components/booking/booking-flow.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function flow(embed, status = "pending_payment") {
  const start = "2026-11-02T10:00:00Z";
  const checkout = "https://checkout.stripe.test/session";
  const states = [
    { name: "Call", price_cents: 5000, currency: "usd", duration_minutes: 30 },
    new Date(start), [{ start }], start, false,
  ];
  let cursor = 0;
  const navigations = [];
  const compiled = { exports: {} };
  const apiFetch = async () => ({ status, checkout_url: status === "pending_payment" ? checkout : null });
  function mockRequire(name) {
    if (name === "react") return {
      useEffect() {},
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (value) => { states[index] = value; }];
      },
    };
    if (name === "next/navigation") return { useParams: () => ({ username: "host", eventSlug: "call" }) };
    if (name === "@/lib/api") return { apiFetch };
    if (name === "@/lib/booking-payments") return { bookingPrice: () => "$50.00", REFUND_POLICY: "Policy" };
    if (name === "@/lib/booking-time") return {
      guestTimeZone: () => "UTC", timeZoneLabel: () => "UTC", describeSlot: () => ({ date: "Nov 2", time: "10 AM" }),
    };
    if (name === "next/link") return { __esModule: true, default: "Link" };
    if (name.startsWith("@/components/") || name === "lucide-react") return new Proxy({}, { get: (_, key) => key });
    return require(name);
  }
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports, require: mockRequire,
    window: { location: { assign: (url) => navigations.push(url) } },
    alert: (message) => { throw new Error(message); },
  });
  return {
    checkout, navigations,
    render() { cursor = 0; return compiled.exports.default({ embed }); },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
}

test("paid embeds open hosted checkout through a user-clicked link outside the iframe", async () => {
  const f = flow(true);
  await find(f.render(), (node) => node.type === "BookingForm").props.onSubmit({ name: "Guest", email: "guest@example.com" });
  assert.deepEqual(f.navigations, []);
  const link = find(f.render(), (node) => node.type === "a" && node.props.href === f.checkout);
  assert.ok(link, "the held booking must expose a checkout link");
  assert.equal(link.props.target, "_blank");
  assert.match(link.props.rel, /noopener/);
  assert.equal(find(f.render(), (node) => node.type === "BookingForm"), undefined);
});

test("standalone bookings still redirect directly to hosted checkout", async () => {
  const f = flow(false);
  await find(f.render(), (node) => node.type === "BookingForm").props.onSubmit({ name: "Guest", email: "guest@example.com" });
  assert.deepEqual(f.navigations, [f.checkout]);
});

test("free embedded bookings still show confirmation", async () => {
  const f = flow(true, "confirmed");
  await find(f.render(), (node) => node.type === "BookingForm").props.onSubmit({ name: "Guest", email: "guest@example.com" });
  assert.deepEqual(f.navigations, []);
  assert.ok(find(f.render(), (node) => node.props?.children === "Booking confirmed"));
});
