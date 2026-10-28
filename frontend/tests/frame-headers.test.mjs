import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server.js";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server.js";

const require = createRequire(import.meta.url);

function load(path, mockRequire = require) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, require: mockRequire });
  return compiled.exports.default;
}

const nextConfig = load("../next.config.ts");

function middleware() {
  const calls = { clerk: 0, protected: 0 };
  const run = load("../src/middleware.ts", (name) => {
    if (name === "@clerk/nextjs/server") return {
      clerkMiddleware: (handler) => async (request) => {
        calls.clerk++;
        return await handler({ protect: async () => { calls.protected++; } }, request) || NextResponse.next();
      },
      createRouteMatcher: (patterns) => (request) => patterns.some((pattern) => new RegExp(`^${pattern}$`).test(request.nextUrl.pathname)),
    };
    return require(name);
  });
  return { run, calls };
}

async function response(path) {
  const url = `https://timeiq.example${path}`;
  const headers = (await unstable_getResponseFromNextConfig({ url, nextConfig: { headers: nextConfig.headers } })).headers;
  const m = middleware();
  const result = await m.run(new NextRequest(url), {});
  result.headers.forEach((value, name) => headers.set(name, value));
  return { headers, calls: m.calls };
}

test("embed query parameters cannot remove authenticated page framing protection", async () => {
  for (const path of ["/settings", "/settings?embed=1", "/calendars?embed=1", "/bookings?embed=1"]) {
    const { headers, calls } = await response(path);
    assert.equal(headers.get("Content-Security-Policy"), "frame-ancestors 'self'", path);
    assert.equal(headers.get("X-Frame-Options"), "SAMEORIGIN", path);
    assert.equal(calls.clerk, 1);
    if (!path.startsWith("/bookings")) assert.equal(calls.protected, 1);
  }
});

test("only a single exact embed flag on a booking page allows third-party frames and skips Clerk", async () => {
  for (const path of ["/book/host?embed=1", "/book/host/call?embed=1"]) {
    const { headers, calls } = await response(path);
    assert.equal(headers.get("Content-Security-Policy"), "frame-ancestors *", path);
    assert.equal(headers.get("X-Frame-Options"), null, path);
    assert.equal(calls.clerk, 0);
  }
  for (const query of ["", "?embed=0", "?embed=true", "?embed=1&embed=1", "?embed=1&embed=0"]) {
    const { headers, calls } = await response(`/book/host/call${query}`);
    assert.equal(headers.get("Content-Security-Policy"), "frame-ancestors 'self'", query);
    assert.equal(headers.get("X-Frame-Options"), "SAMEORIGIN", query);
    assert.equal(calls.clerk, 1);
  }
});

test("consent stays unframeable with an embed flag", async () => {
  const { headers, calls } = await response("/oauth/consent?embed=1");
  assert.equal(headers.get("Content-Security-Policy"), "frame-ancestors 'none'");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(calls.protected, 1);
});
