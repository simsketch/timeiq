"use client";

import { useEffect, useState, type ComponentType } from "react";

// The octopus is decoration, so nothing about him loads until the page has
// finished loading, the browser is idle, and the footer is getting close.
export function OctoLoader() {
  const [Octo, setOcto] = useState<ComponentType | null>(null);

  useEffect(() => {
    let active = true;
    let observer: IntersectionObserver | null = null;
    const ric = typeof window.requestIdleCallback === "function";
    let idle: ReturnType<typeof setTimeout> | number = 0;
    const mount = () =>
      import("./octo-swimmer")
        .then((m) => active && setOcto(() => m.OctoSwimmer))
        .catch(() => {
          // He stays away if the chunk fails; the page doesn't need him.
        });
    const whenNear = () => {
      const lane = document.getElementById("tiq-lane");
      if (!lane || !("IntersectionObserver" in window)) return void mount();
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            mount();
          }
        },
        { rootMargin: "1200px 0px" },
      );
      observer.observe(lane);
    };
    const schedule = () => {
      idle = ric ? window.requestIdleCallback(whenNear, { timeout: 4000 }) : globalThis.setTimeout(whenNear, 1500);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("load", schedule);
      if (ric) window.cancelIdleCallback(idle as number);
      else globalThis.clearTimeout(idle);
    };
  }, []);

  return Octo ? <Octo /> : null;
}
