import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
// next-intl's own ICU parser (installed with it), so the check matches what renders.
import { parse } from "@formatjs/icu-messageformat-parser";

const dir = new URL("../messages/", import.meta.url);
const load = (file) => JSON.parse(readFileSync(new URL(file, dir), "utf8"));
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const get = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);

/** "a.b.c" paths of every string leaf. */
function keys(node, prefix = "") {
  return Object.entries(node).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}

test("every locale has exactly the keys en.json has", () => {
  const en = new Set(keys(load("en.json")));
  for (const file of files.filter((f) => f !== "en.json")) {
    const other = new Set(keys(load(file)));
    assert.deepEqual([...en].filter((k) => !other.has(k)), [], `missing from ${file}`);
    assert.deepEqual([...other].filter((k) => !en.has(k)), [], `in ${file} but not en.json`);
  }
});

test("every messages file is listed in src/i18n/locales.ts and vice versa", () => {
  const source = readFileSync(new URL("../src/i18n/locales.ts", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("LOCALES = {"), source.indexOf("} as const"));
  const listed = [...block.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(files.map((f) => f.replace(".json", "")).sort(), listed);
});

/** Argument names used anywhere in an ICU message, including inside plural/select branches. */
function args(message) {
  const names = new Set();
  const walk = (nodes) => nodes.forEach((n) => {
    if (n.value && typeof n.value === "string" && n.type !== 0) names.add(n.value);
    if (n.options) Object.values(n.options).forEach((o) => walk(o.value));
    if (n.children) walk(n.children);
  });
  walk(parse(String(message), { ignoreTag: false }));
  return [...names].sort();
}

test("every message is valid ICU and uses the same arguments as English", () => {
  const en = load("en.json");
  for (const file of files) {
    const other = load(file);
    for (const key of keys(en)) assert.deepEqual(args(get(other, key)), args(get(en, key)), `${file} ${key}`);
  }
});
