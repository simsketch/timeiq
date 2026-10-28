"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, LocateFixed, Minus, Plus } from "lucide-react";
import { ClockLoader } from "@/components/ui/clock-loader";
import type { MeetingType } from "./booking-profile";
import { sceneFor } from "./scenes";
import type { CameraRig } from "./scenes/scene-canvas";
import type { SceneContentProps } from "./scenes/types";
import styles from "./booking-profile.module.css";

// Three.js stays out of the page's first bundle.
const SceneCanvas = dynamic(() => import("./scenes/scene-canvas").then((m) => m.SceneCanvas), { ssr: false });

// How long the clock may spin before the painted still takes over. A slow
// scene keeps loading underneath and crossfades in when it's ready.
const SCENE_TIMEOUT_MS = 8000;

type Phase = "loading" | "scene" | "still";

const layer = { position: "absolute", inset: 0, transition: "opacity 900ms ease" } as const;

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function BookingScene({ active, sceneId }: { active: MeetingType | null; sceneId?: string | null }) {
  const definition = sceneFor(sceneId);
  const container = useRef<HTMLDivElement>(null);
  const rig = useRef<CameraRig | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [Content, setContent] = useState<ComponentType<SceneContentProps> | null>(null);
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
    const cleanup = () => {
      observer.disconnect();
      mobile.removeEventListener("change", size);
      document.removeEventListener("visibilitychange", visibility);
    };

    // Reduced motion or no WebGL: go straight to the painting, no spinner.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("WebGL2RenderingContext" in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- these browser capabilities don't exist during SSR
      setPhase("still");
      return cleanup;
    }

    let cancelled = false;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Let the host's text paint first. Phones wait for the page's load event
    // so WebGL start-up doesn't compete with the first tap on a meeting.
    const start = () => {
      timer = setTimeout(showStill, SCENE_TIMEOUT_MS);
      definition.load()
        .then((m) => { if (!cancelled) setContent(() => m.default); })
        .catch(() => { if (!cancelled) fail(); });
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
      cancelled = true;
      window.removeEventListener("load", onLoad);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
      cleanup();
    };
  }, [definition, showStill, fail]);

  return (
    <>
      <div ref={container} aria-hidden="true" style={{ position: "absolute", inset: 0, background: definition.backdrop }}>
        <div style={{ ...layer, display: "grid", placeItems: "center", opacity: phase === "loading" ? 1 : 0, pointerEvents: "none" }}>
          <ClockLoader size="md" label="Loading scene" />
        </div>
        {/* A painted render of the same scene, for missing WebGL, failures, slow loads and reduced motion. */}
        <img
          src={definition.still}
          srcSet={`${definition.still640} 640w, ${definition.still} 1024w`}
          sizes="(max-width: 767px) 100vw, 55vw"
          alt=""
          decoding="async"
          loading={phase === "still" ? "eager" : "lazy"}
          style={{ ...layer, width: "100%", height: "100%", objectFit: "cover", opacity: phase === "still" ? 1 : 0 }}
        />
        {Content && !failed && (
          <div style={{ ...layer, opacity: phase === "scene" ? 1 : 0 }}>
            <SceneBoundary onError={fail}>
              <SceneCanvas
                definition={definition}
                Content={Content}
                active={active}
                running={visible && tabVisible}
                small={small}
                rigRef={rig}
                onReady={showScene}
              />
            </SceneBoundary>
          </div>
        )}
      </div>
      {phase === "scene" && (
        <div className={styles.cameraControls} role="group" aria-label="Scene camera">
          <button type="button" onClick={() => rig.current?.orbit(-1)} aria-label="Turn the view left"><ChevronLeft /></button>
          <button type="button" onClick={() => rig.current?.zoom(1)} aria-label="Zoom in"><Plus /></button>
          <button type="button" onClick={() => rig.current?.zoom(-1)} aria-label="Zoom out"><Minus /></button>
          <button type="button" onClick={() => rig.current?.orbit(1)} aria-label="Turn the view right"><ChevronRight /></button>
          <button type="button" onClick={() => rig.current?.reset()} aria-label="Reset the view"><LocateFixed /></button>
        </div>
      )}
    </>
  );
}
