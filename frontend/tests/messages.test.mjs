import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

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

test("ICU arguments match across locales", () => {
  const en = load("en.json");
  // Argument names only ({name} or {count, plural, ...}); branch wording may differ.
  const args = (s) => [...new Set([...String(s).matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1]))].sort();
  for (const file of files.filter((f) => f !== "en.json")) {
    const other = load(file);
    for (const key of keys(en)) assert.deepEqual(args(get(other, key)), args(get(en, key)), `${file} ${key}`);
  }
});
