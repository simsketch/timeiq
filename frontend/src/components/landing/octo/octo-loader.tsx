"use client";

import { useEffect, useState, type ComponentType } from "react";

// The octopus is decoration, so nothing about him loads until the page has
// finished loading and the browser is idle.
export function OctoLoader() {
  const [Octo, setOcto] = useState<ComponentType | null>(null);

  useEffect(() => {
    let active = true;
    const ric = typeof window.requestIdleCallback === "function";
    let idle: ReturnType<typeof setTimeout> | number = 0;
    const mount = () =>
      import("./octo-swimmer")
        .then((m) => active && setOcto(() => m.OctoSwimmer))
        .catch(() => {
          // He stays away if the chunk fails; the page doesn't need him.
        });
    const schedule = () => {
      idle = ric ? window.requestIdleCallback(mount, { timeout: 4000 }) : globalThis.setTimeout(mount, 1500);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      active = false;
      window.removeEventListener("load", schedule);
      if (ric) window.cancelIdleCallback(idle as number);
      else globalThis.clearTimeout(idle);
    };
  }, []);

  return Octo ? <Octo /> : null;
}
