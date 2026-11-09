import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/availability-share.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: compiled, exports: compiled.exports, Date, Intl });
const { drawImage, IMAGE_THEMES } = compiled.exports;

function render(days, zones = ["America/New_York", "America/Los_Angeles"], timezone = "America/New_York", theme = "classic") {
  const labels = [];
  const blocks = [];
  const fills = [];
  const ctx = {
    setTransform() {}, fillRect() { fills.push(this.fillStyle); }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() { fills.push(this.fillStyle); },
    fillText(text, x, y) { labels.push({ text, x, y }); },
    roundRect(x, y, width, height) { blocks.push({ x, y, width, height }); },
  };
  const canvas = { getContext: () => ctx };
  drawImage(canvas, { timezone, username: "host", days }, zones, "https://timeiq.app/book/host", theme);
  return { canvas, labels, blocks, fills };
}

test("every image theme changes the exported palette and keeps actual timezone times", () => {
  for (const [theme, palette] of Object.entries(IMAGE_THEMES)) {
    const { labels, fills } = render([day("2026-11-09")], undefined, undefined, theme);
    assert.equal(fills[0], palette.background);
    assert.ok(fills.includes(palette.opening));
    assert.ok(labels.some(({ text }) => text === "PST 6–7 AM"));
  }
});

function day(date, start = `${date}T14:00:00Z`, end = `${date}T15:00:00Z`) {
  return { date, working: true, work_start: "09:00", work_end: "17:00", windows: [{ start, end }] };
}

test("image prints Eastern and Pacific times inside half-hour openings, without offset arithmetic", () => {
  const { labels, blocks } = render([day("2026-11-09", "2026-11-09T14:00:00Z", "2026-11-09T14:30:00Z")]);
  assert.ok(labels.some(({ text }) => text === "EST 9–9:30 AM"));
  assert.ok(labels.some(({ text }) => text === "PST 6–6:30 AM"));
  assert.ok(labels.every(({ text }) => !text.includes(" is ")));
  const block = blocks[0];
  for (const label of labels.filter(({ text }) => /^(EST|PST) \d/.test(text))) {
    assert.ok(label.y > block.y && label.y < block.y + block.height);
  }
});

test("image handles daylight-saving abbreviations and fractional-hour zones", () => {
  const { labels } = render([
    day("2026-10-31", "2026-10-31T13:00:00Z", "2026-10-31T14:00:00Z"), day("2026-11-02"),
  ], ["America/New_York", "America/Los_Angeles", "Asia/Kolkata"]);
  for (const value of ["EDT 9–10 AM", "PDT 6–7 AM", "EST 9–10 AM", "PST 6–7 AM", "GMT+5:30 7:30–8:30 PM"]) {
    assert.ok(labels.some(({ text }) => text === value), value);
  }
});

test("image names the converted date when the added zone is on the previous day", () => {
  const { labels } = render([day("2026-11-09", "2026-11-09T00:30:00Z", "2026-11-09T01:00:00Z")], ["UTC", "America/Los_Angeles"], "UTC");
  assert.ok(labels.some(({ text }) => text === "PST Sun, Nov 8: 4:30–5 PM"));
});

test("31-day ranges wrap into calendar rows of at most seven days", () => {
  const days = Array.from({ length: 31 }, (_, i) => day(new Date(Date.UTC(2026, 10, 9 + i)).toISOString().slice(0, 10)));
  const { labels, canvas } = render(days);
  const headings = labels.filter(({ text }) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/.test(text));
  assert.equal(headings.length, 31);
  const rows = new Map();
  for (const heading of headings) rows.set(heading.y, (rows.get(heading.y) ?? 0) + 1);
  assert.deepEqual([...rows.values()], [7, 7, 7, 7, 3]);
  assert.ok(canvas.height > render(days.slice(0, 7)).canvas.height * 4);
});

test("empty availability still produces a valid image", () => {
  const { canvas, labels, blocks } = render([{ ...day("2026-11-09"), windows: [] }]);
  assert.ok(canvas.width > 0 && canvas.height > 0);
  assert.ok(labels.some(({ text }) => text === "No openings"));
  assert.equal(blocks.length, 0);
});
