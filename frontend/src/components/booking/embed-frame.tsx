"use client";

import { useEffect, useRef } from "react";

export function EmbedFrame({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || window.parent === window || !content.current) return;
    let parentOrigin: string | null = null;
    try {
      parentOrigin = document.referrer ? new URL(document.referrer).origin : null;
    } catch { /* The parent can still initialize the resize channel. */ }
    let frame = 0;
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (parentOrigin && content.current) {
          window.parent.postMessage({ type: "timeiq:resize", height: Math.ceil(content.current.getBoundingClientRect().height) }, parentOrigin);
        }
      });
    };
    const initialize = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== "timeiq:init") return;
      if (parentOrigin && event.origin !== parentOrigin) return;
      if (!/^https?:\/\//.test(event.origin)) return;
      parentOrigin = event.origin;
      report();
    };
    const observer = new ResizeObserver(report);
    observer.observe(content.current);
    window.addEventListener("message", initialize);
    // Ready carries no booking data and lets parents with no referrer initialize.
    window.parent.postMessage({ type: "timeiq:ready" }, "*");
    report();
    return () => {
      observer.disconnect();
      window.removeEventListener("message", initialize);
      cancelAnimationFrame(frame);
    };
  }, [enabled]);

  if (!enabled) return children;
  return (
    <div ref={content} className="timeiq-embed">
      <style>{`
        html, body { background: transparent !important; }
        .timeiq-embed { display: flow-root; }
        .timeiq-embed .min-h-screen { min-height: 0; }
        .timeiq-embed .aurora-bg, .timeiq-embed .grain { display: none; }
        .timeiq-embed .reveal { animation: none; opacity: 1; transform: none; }
      `}</style>
      {children}
    </div>
  );
}
