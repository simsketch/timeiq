import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/embed.js", import.meta.url), "utf8");

function widget(path = "host/call", mode) {
  const inserted = [];
  const messages = [];
  const listeners = {};
  const elements = [];
  const script = {
    src: "https://timeiq.example/embed.js",
    dataset: { timeiq: path, mode },
    after: (...nodes) => inserted.push(...nodes),
  };
  const document = {
    currentScript: script,
    createElement(tagName) {
      const node = {
        tagName, style: {}, children: [], events: {}, attributes: {},
        contentWindow: { postMessage: (...args) => messages.push(args) },
        addEventListener(type, callback) { this.events[type] = callback; },
        setAttribute(key, value) { this.attributes[key] = value; },
        append(...nodes) { this.children.push(...nodes); },
        showModal() { this.open = true; },
        close() { this.open = false; },
      };
      elements.push(node);
      return node;
    },
  };
  vm.runInNewContext(source, {
    document, URL,
    window: { addEventListener: (type, callback) => { listeners[type] = callback; } },
  });
  const iframe = elements.find((element) => element.tagName === "iframe");
  return {
    inserted, messages, iframe,
    message(data, overrides = {}) {
      listeners.message({ origin: "https://timeiq.example", source: iframe.contentWindow, data, ...overrides });
    },
  };
}

test("widget embeds profiles and Unicode event slugs from the script origin", () => {
  const profile = widget("host");
  assert.equal(profile.iframe.src, "https://timeiq.example/book/host?embed=1");
  assert.equal(profile.inserted[0], profile.iframe);
  assert.match(profile.iframe.style.cssText, /width:100%/);
  const event = widget("host/caf%C3%A9");
  assert.equal(event.iframe.src, "https://timeiq.example/book/host/caf%C3%A9?embed=1");
});

test("widget rejects paths that escape booking routes", () => {
  for (const path of ["host/../admin", "host/%2e%2e", "host/%2fadmin", "host/call?embed=0", "host/%ZZ"]) {
    assert.equal(widget(path).inserted.length, 0);
  }
});

test("resize messages must match both the iframe origin and window", () => {
  const w = widget();
  for (const overrides of [{ origin: "https://attacker.example" }, { source: {} }]) {
    w.message({ type: "timeiq:resize", height: 900 }, overrides);
    assert.equal(w.iframe.style.height, undefined);
  }
  for (const height of [NaN, Infinity, -10, "900"]) {
    w.message({ type: "timeiq:resize", height });
    assert.equal(w.iframe.style.height, undefined);
  }
  w.message({ type: "timeiq:resize", height: 899.2 });
  assert.equal(w.iframe.style.height, "900px");
  w.message({ type: "timeiq:resize", height: 450 });
  assert.equal(w.iframe.style.height, "450px");
});

test("resize channel initializes after load and after late hydration", () => {
  const w = widget();
  w.iframe.events.load();
  w.message({ type: "timeiq:ready" });
  assert.equal(w.messages.length, 2);
  for (const [data, origin] of w.messages) {
    assert.equal(data.type, "timeiq:init");
    assert.equal(origin, "https://timeiq.example");
  }
  w.message({ type: "timeiq:ready" }, { origin: "https://attacker.example" });
  assert.equal(w.messages.length, 2);
});

test("popup button opens and closes the booking dialog without submitting a form", () => {
  const w = widget("host/call", "popup");
  const [button, dialog] = w.inserted;
  assert.equal(button.type, "button");
  assert.equal(dialog.children[1], w.iframe);
  button.events.click();
  assert.equal(dialog.open, true);
  const close = dialog.children[0];
  assert.equal(close.type, "button");
  close.events.click();
  assert.equal(dialog.open, false);
});
