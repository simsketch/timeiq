(function () {
  "use strict";
  var script = document.currentScript;
  if (!script || !script.dataset.timeiq) return;
  var origin = new URL(script.src).origin;
  var parts = script.dataset.timeiq.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length > 2) return;
  try {
    parts = parts.map(function (part) { return decodeURIComponent(part); });
  } catch { return; }
  if (parts.some(function (part) { return !part || part === "." || part === ".." || /[/\\?#]/.test(part); })) return;
  var path = parts.map(encodeURIComponent).join("/");
  var url = origin + "/book/" + path + "?embed=1";
  var iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.title = "Book a meeting with TimeIQ";
  iframe.style.cssText = "display:block;width:100%;height:720px;border:0;background:transparent;";
  iframe.loading = "lazy";
  iframe.addEventListener("load", function () {
    iframe.contentWindow.postMessage({ type: "timeiq:init" }, origin);
  });
  window.addEventListener("message", function (event) {
    if (event.origin !== origin || event.source !== iframe.contentWindow) return;
    if (event.data && event.data.type === "timeiq:ready") {
      iframe.contentWindow.postMessage({ type: "timeiq:init" }, origin);
      return;
    }
    if (!event.data || event.data.type !== "timeiq:resize") return;
    var height = event.data.height;
    if (typeof height !== "number" || !Number.isFinite(height) || height < 0) return;
    iframe.style.height = Math.max(240, Math.min(10000, Math.ceil(height))) + "px";
  });
  if (script.dataset.mode === "popup") {
    var dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "Book a meeting");
    dialog.style.cssText = "width:min(960px,94vw);max-height:90vh;overflow:auto;padding:16px;border:0;border-radius:16px;margin:auto;";
    var close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.style.cssText = "display:block;margin:0 0 12px auto;cursor:pointer;";
    close.addEventListener("click", function () { dialog.close(); });
    dialog.append(close, iframe);
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = script.dataset.label || "Book a meeting";
    button.addEventListener("click", function () { dialog.showModal(); });
    script.after(button, dialog);
  } else {
    script.after(iframe);
  }
})();
