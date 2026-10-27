"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ClockLoader } from "@/components/ui/clock-loader";
import type { MeetingType } from "./booking-profile";

const DesertScene = dynamic(() => import("./desert-scene"), { ssr: false });

// How long the clock may spin before the painted still takes over. A slow
// scene keeps loading underneath and crossfades in when it's ready.
const SCENE_TIMEOUT_MS = 8000;

type Phase = "loading" | "scene" | "still";

const layer = { position: "absolute", inset: 0, transition: "opacity 900ms ease" } as const;

// A painted render of the same scene, shown when WebGL is missing, fails, is
// too slow, or the visitor prefers reduced motion.
function PaintedStill({ shown }: { shown: boolean }) {
  return (
    <img
      src="/booking/desert-still.webp"
      srcSet="/booking/desert-still-640.webp 640w, /booking/desert-still.webp 1024w"
      sizes="(max-width: 767px) 100vw, 55vw"
      alt=""
      decoding="async"
      style={{ ...layer, width: "100%", height: "100%", objectFit: "cover", opacity: shown ? 1 : 0 }}
    />
  );
}

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function BookingScene({ active }: { active: MeetingType | null }) {
  const container = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [small, setSmall] = useState(false);

  const showStill = useCallback(() => setPhase((p) => (p === "scene" ? p : "still")), []);
  const showScene = useCallback(() => setPhase("scene"), []);
  const fail = useCallback(() => { setFailed(true); setPhase("still"); }, []);

  useEffect(() => {
    const mobile = matchMedia("(max-width: 767px)");
    const visibility = () => setTabVisible(!document.hidden);
    const size = () => setSmall(mobile.matches);
    size();
    visibility();
    mobile.addEventListener("change", size);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.01 });
    if (container.current) observer.observe(container.current);

    // Reduced motion or no WebGL: go straight to the painting, no spinner.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("WebGL2RenderingContext" in window)) {
      setPhase("still");
      return () => {
        observer.disconnect();
        mobile.removeEventListener("change", size);
        document.removeEventListener("visibilitychange", visibility);
      };
    }

    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Let the host's text paint first. Phones wait for the page's load event
    // so WebGL start-up doesn't compete with the first tap on a meeting.
    const start = () => {
      setMounted(true);
      timer = setTimeout(showStill, SCENE_TIMEOUT_MS);
    };
    const onLoad = () => { timer = setTimeout(start, 1200); };
    if (mobile.matches) {
      if (document.readyState === "complete") onLoad();
      else window.addEventListener("load", onLoad, { once: true });
    } else if ("requestIdleCallback" in window) {
      idle = window.requestIdleCallback(start, { timeout: 1500 });
    } else {
      timer = setTimeout(start, 180);
    }
    return () => {
      window.removeEventListener("load", onLoad);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
      observer.disconnect();
      mobile.removeEventListener("change", size);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [showStill]);

  return (
    <div
      ref={container}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, background: "linear-gradient(#d6d3ed, #eed6c7 60%, #e8b98d)" }}
    >
      <div
        style={{ ...layer, display: "grid", placeItems: "center", opacity: phase === "loading" ? 1 : 0, pointerEvents: "none" }}
      >
        <ClockLoader size="md" label="Loading scene" />
      </div>
      <PaintedStill shown={phase === "still"} />
      {mounted && !failed && (
        <div style={{ ...layer, opacity: phase === "scene" ? 1 : 0 }}>
          <SceneBoundary onError={fail}>
            <DesertScene
              active={active}
              running={visible && tabVisible}
              reduced={false}
              small={small}
              onReady={showScene}
            />
          </SceneBoundary>
        </div>
      )}
    </div>
  );
}
