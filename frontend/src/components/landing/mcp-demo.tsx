"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";

export function McpDemo({ fallback }: { fallback: ReactNode }) {
  const [Demo, setDemo] = useState<ComponentType | null>(null);

  useEffect(() => {
    let active = true;
    let secondFrame = 0;
    // Leave the server-rendered example visible while the first paint completes.
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        import("./mcp-demo-interactive").then((module) => {
          if (active) setDemo(() => module.default);
        }).catch(() => {
          // The static example remains useful if the optional chunk fails to load.
        });
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);

  return Demo ? <Demo /> : fallback;
}
