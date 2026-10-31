"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";

/** One autoplay step. Return a number to wait that many ms before the next one. */
type Step = () => number | void;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

const reducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const pageVisible = () => !document.hidden;
// The server never autoplays; the client decides after hydration.
const serverReducedMotion = () => true;
const serverPageVisible = () => false;

/** True when a wheel or touch gesture would scroll something inside the demo, not the page. */
function scrollsInside(target: EventTarget | null, root: HTMLElement) {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const overflow = getComputedStyle(el).overflowY;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    if (el === root) break;
  }
  return false;
}

/**
 * Plays a demo by itself: calls `onStep` every `interval` ms while the demo is on
 * screen and the tab is visible. The first real interaction inside the demo
 * (click, tap, key, focus, scrolling an inner panel) stops it for the page view.
 * Off under prefers-reduced-motion. State changes made by `onStep` fire no DOM
 * events, so they never count as interaction.
 */
export function useDemoAutoplay<T extends HTMLElement = HTMLDivElement>(
  onStep: Step,
  { interval = 3200, firstDelay = interval }: { interval?: number; firstDelay?: number } = {},
) {
  const ref = useRef<T>(null);
  const [stopped, setStopped] = useState(false);
  const [inView, setInView] = useState(false);
  const reduced = useSyncExternalStore(subscribeReducedMotion, reducedMotion, serverReducedMotion);
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible, serverPageVisible);
  const started = useRef(false);
  const step = useEffectEvent(onStep);

  const active = !stopped && !reduced;
  const playing = active && inView && visible;

  // Any real interaction hands the demo to the visitor for good.
  useEffect(() => {
    const node = ref.current;
    if (!node || !active) return;
    const stop = () => setStopped(true);
    // Touch pointerdown also starts page scrolls, so a touch only counts once it becomes a tap (click).
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "touch") stop();
    };
    const onScroll = (e: Event) => {
      if (scrollsInside(e.target, node)) stop();
    };
    const capture = { capture: true };
    const passive = { capture: true, passive: true };
    node.addEventListener("pointerdown", onPointer, capture);
    node.addEventListener("click", stop, capture);
    node.addEventListener("keydown", stop, capture);
    node.addEventListener("focusin", stop, capture);
    node.addEventListener("wheel", onScroll, passive);
    node.addEventListener("touchmove", onScroll, passive);
    return () => {
      node.removeEventListener("pointerdown", onPointer, capture);
      node.removeEventListener("click", stop, capture);
      node.removeEventListener("keydown", stop, capture);
      node.removeEventListener("focusin", stop, capture);
      node.removeEventListener("wheel", onScroll, passive);
      node.removeEventListener("touchmove", onScroll, passive);
    };
  }, [active]);

  useEffect(() => {
    const node = ref.current;
    if (!node || !active || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (!playing) return;
    let timer = 0;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        const next = step();
        schedule(typeof next === "number" ? next : interval);
      }, delay);
    };
    schedule(started.current ? interval : firstDelay);
    started.current = true;
    return () => clearTimeout(timer);
  }, [playing, interval, firstDelay]);

  return { ref, active, playing };
}
