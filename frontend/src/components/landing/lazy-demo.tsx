"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";

// The demos are interactive extras, so their code stays out of the first
// load. Each placeholder holds the demo's measured height so nothing shifts.
const DEMOS = {
  email: {
    load: () => import("./email-schedule-demo").then((m) => m.EmailScheduleDemo),
    minHeight: "min-h-[684px] md:min-h-[662px] lg:min-h-[696px] xl:min-h-[662px]",
    afterPaint: true,
  },
  cc: {
    load: () => import("./cc-timeiq-demo").then((m) => m.CcTimeiqDemo),
    minHeight: "min-h-[626px] md:min-h-[614px]",
  },
  merge: {
    load: () => import("./calendar-merge-demo").then((m) => m.CalendarMergeDemo),
    minHeight: "min-h-[1024px] sm:min-h-[918px] md:min-h-[884px] lg:min-h-[508px] xl:min-h-[474px]",
  },
  share: {
    load: () => import("./availability-share-demo").then((m) => m.AvailabilityShareDemo),
    minHeight: "min-h-[536px] sm:min-h-[518px] md:min-h-[462px] lg:min-h-[518px] xl:min-h-[462px]",
  },
} satisfies Record<string, { load: () => Promise<ComponentType>; minHeight: string; afterPaint?: boolean }>;

export function LazyDemo({ name }: { name: keyof typeof DEMOS }) {
  const demo: { load: () => Promise<ComponentType>; minHeight: string; afterPaint?: boolean } = DEMOS[name];
  const ref = useRef<HTMLDivElement>(null);
  const [Demo, setDemo] = useState<ComponentType | null>(null);

  useEffect(() => {
    let active = true;
    const mount = () =>
      demo.load().then((C) => active && setDemo(() => C)).catch(() => {
        // The placeholder stays if the optional chunk fails to load.
      });

    if (demo.afterPaint) {
      // Above the fold: wait for the headline to paint first.
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => void mount());
      });
      return () => {
        active = false;
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }

    const node = ref.current;
    if (!node || !("IntersectionObserver" in window)) {
      mount();
      return () => void (active = false);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          mount();
        }
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(node);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [demo]);

  if (Demo) return <Demo />;
  return <div ref={ref} className={`glass rounded-[1.75rem] ${demo.minHeight}`} aria-hidden />;
}
