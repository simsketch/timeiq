import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../src/lib/analytics-url.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(source, { module: mod, exports: mod.exports, URL, URLSearchParams });
const { carriesCredentials, redactUrl } = mod.exports;

test("private links load no trackers", () => {
  for (const href of [
    "https://timeiq.app/invoice/abc123",
    "https://timeiq.app/meet/tok",
    "https://timeiq.app/bookings/1/cancel?token=secret",
    "https://timeiq.app/imports/undo?token=t",
    "https://timeiq.app/email-addresses/confirm?token=t",
    "https://timeiq.app/sign-in?redirect_url=%2Fmeet%2Ftok",
  ]) assert.equal(carriesCredentials(new URL(href)), true, href);
  for (const href of ["https://timeiq.app/", "https://timeiq.app/book/sam?utm_source=x", "https://timeiq.app/billing/success?session_id=cs_1"])
    assert.equal(carriesCredentials(new URL(href)), false, href);
});

test("redacted URLs keep attribution only", () => {
  assert.equal(redactUrl("https://timeiq.app/invoice/abc?token=x&utm_source=mail#top"), "https://timeiq.app/invoice/[token]?utm_source=mail");
  assert.equal(redactUrl("https://timeiq.app/billing/success?session_id=cs_1&guest=1"), "https://timeiq.app/billing/success");
  assert.equal(redactUrl("https://timeiq.app/meet/t/x?gclid=g"), "https://timeiq.app/meet/[token]/x?gclid=g");
});
