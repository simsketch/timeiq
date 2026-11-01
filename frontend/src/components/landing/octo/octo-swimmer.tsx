"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Tiq, a claymation octopus who swims back and forth in the footer's lane.
// Drag him anywhere; drop him outside the lane and he floats there until his
// × sends him home. In the lane he lives inside #tiq-lane (absolute, so he
// scrolls with the page); out of it he's fixed to the viewport. Motion runs
// on transforms in one rAF loop that sleeps while the lane is offscreen.

type Pose = "juggle" | "swim" | "point" | "wave" | "cheer";
type Where = "lane" | "out";

const POSES: Pose[] = ["juggle", "swim", "point", "wave", "cheer"];
const src = (p: Pose) => `/octo/${p}.webp`;
const EDGE = 8; // keep him and his speech bubble this far inside the edges

const LINES = [
  "Eight arms and I still use one calendar.",
  "An octopus has three hearts. All of them hate double-booking.",
  "Tip: forward a team schedule to your TimeIQ address and it lands on your calendar.",
  "I log my hours. Mostly naps.",
  "Your booking link checks every calendar before anyone grabs a slot.",
  "Invoices from your timesheet in one click. Even I can't juggle faster.",
  "Meetings that could have been an email? I read the email.",
  "Octopuses can taste with their arms. Your free time tastes great.",
  "Blub. That's octopus for \"see you at 3\".",
  "I sync your calendars before every booking. Old events, begone.",
  "Group meetings: everyone picks times, I find the overlap.",
  "Fun fact: I'm boneless, and so is a good schedule.",
  "Drag me anywhere. I'm a great swimmer.",
];

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export function OctoSwimmer() {
  const [where, setWhere] = useState<Where>("lane");
  // Only ever mounted in the browser (the loader imports it after load), so document is safe here.
  const [lane] = useState<HTMLElement | null>(() => document.getElementById("tiq-lane"));
  const [pose, setPose] = useState<Pose>("juggle");
  const [face, setFace] = useState(1);
  const [say, setSay] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const sayRef = useRef<HTMLDivElement | null>(null);
  const whereRef = useRef<Where>("lane");
  const pos = useRef({ x: 24, y: 24 });
  const drag = useRef<{ id: number; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const cheerUntil = useRef(0);
  const hovering = useRef(false);
  const wake = useRef<() => void>(() => {});
  const lineBag = useRef<string[]>([]);

  const nextLine = useCallback(() => {
    if (lineBag.current.length === 0) lineBag.current = [...LINES].sort(() => Math.random() - 0.5);
    return lineBag.current.pop()!;
  }, []);

  const size = () => (window.innerWidth < 768 ? 84 : 120);

  // The box he lives in, in its own coordinates: the lane, or the viewport.
  const box = useCallback(() => {
    if (whereRef.current === "lane") {
      const el = document.getElementById("tiq-lane");
      return { w: el?.clientWidth ?? window.innerWidth, h: el?.clientHeight ?? 160 };
    }
    return { w: document.documentElement.clientWidth, h: window.innerHeight };
  }, []);

  const go = useCallback((w: Where) => {
    whereRef.current = w;
    setWhere(w);
  }, []);

  useEffect(() => {
    for (const p of POSES) new Image().src = src(p);
  }, []);

  useEffect(() => {
    if (!lane) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const vel = { x: 0, y: 0 };
    let target = { x: 0, y: 0 };
    let resting = true;
    let restUntil = performance.now() + 1500;
    let heading = Math.random() < 0.5 ? -1 : 1;
    let nextBubbleAt = 0;
    let curPose: Pose = "juggle";
    let curFace = 1;
    let raf = 0;
    let last = performance.now();
    let laneVisible = false;

    {
      const s = size(), b = box();
      pos.current = { x: b.w * (0.2 + Math.random() * 0.6) - s / 2, y: Math.max(4, (b.h - s) / 2) };
      target = { ...pos.current };
    }

    const show = (p: Pose, f: number) => {
      if (p !== curPose) setPose((curPose = p));
      if (f !== curFace) setFace((curFace = f));
    };

    // Swim to the far end of the lane, alternating sides, so he goes back and forth.
    const laneTarget = () => {
      const s = size(), b = box();
      heading = -heading;
      const span = Math.max(0, b.w - s - EDGE * 2);
      const x = heading > 0 ? EDGE + span * (0.7 + Math.random() * 0.3) : EDGE + span * Math.random() * 0.3;
      const y = 4 + Math.random() * Math.max(0, b.h - s * 0.9 - 4);
      return { x, y };
    };

    const bubble = (s: number) => {
      const root = rootRef.current;
      if (!root?.parentElement || reduced) return;
      const el = document.createElement("span");
      const d = 6 + Math.random() * 8;
      el.className = "tiq-bubble";
      el.style.cssText = `position:${whereRef.current === "lane" ? "absolute" : "fixed"};left:${(pos.current.x + s * (0.35 + Math.random() * 0.3)).toFixed(0)}px;top:${(pos.current.y + s * 0.15).toFixed(0)}px;width:${d}px;height:${d}px;animation-duration:${(2.6 + Math.random() * 1.6).toFixed(2)}s`;
      root.parentElement.appendChild(el);
      el.addEventListener("animationend", () => el.remove(), { once: true });
    };

    const tick = (now: number) => {
      raf = 0;
      const root = rootRef.current, body = bodyRef.current;
      const dragging = drag.current?.moved;
      if (!root || !body || (whereRef.current === "lane" && !laneVisible && !dragging)) return;

      const dt = Math.min((now - last) / 16.67, 3);
      last = now;
      const t = now / 1000;
      const s = size(), b = box();
      const p = pos.current;

      if (!dragging && !reduced) {
        if (whereRef.current === "lane") {
          if (resting && now > restUntil) {
            resting = false;
            target = laneTarget();
          }
          const dx = target.x - p.x, dy = target.y - p.y;
          const dist = Math.hypot(dx, dy);
          const speed = Math.min(1.8, dist / 40);
          const want = dist > 0.5 ? { x: (dx / dist) * speed, y: (dy / dist) * speed } : { x: 0, y: 0 };
          vel.x += (want.x - vel.x) * 0.035 * dt;
          vel.y += (want.y - vel.y) * 0.035 * dt;
          if (!resting && dist < 12) {
            resting = true;
            restUntil = now + 2000 + Math.random() * 4000;
          }
        } else {
          vel.x *= 0.9;
          vel.y *= 0.9;
        }
        p.x += vel.x * dt;
        p.y += vel.y * dt;
      }
      // Never let him (or the bubble below) leave the box.
      p.x = clamp(p.x, EDGE, b.w - s - EDGE);
      p.y = clamp(p.y, whereRef.current === "lane" ? 0 : EDGE, b.h - s - (whereRef.current === "lane" ? 0 : EDGE));

      const moving = Math.hypot(vel.x, vel.y);
      const f = !dragging && Math.abs(vel.x) > 0.25 ? Math.sign(vel.x) : curFace;
      const pz: Pose =
        now < cheerUntil.current ? "cheer" : dragging || hovering.current ? "wave" : moving > 1.1 ? "swim" : "juggle";
      show(pz, f);

      const calm = reduced || dragging;
      const bob = calm ? 0 : Math.sin(t * 1.6) * 5;
      const sway = calm ? 0 : Math.sin(t * 1.1) * 3 + clamp(vel.x * 4, -10, 10);
      const pulse = calm ? 0 : moving > 1.1 ? Math.sin(t * 6) * 0.035 : Math.sin(t * 2.2) * 0.015;
      root.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y + bob).toFixed(1)}px, 0)`;
      body.style.transform = `rotate(${sway.toFixed(2)}deg) scale(${(1 - pulse).toFixed(3)}, ${(1 + pulse).toFixed(3)})`;

      // Speech bubble: centred over him but clamped inside the box; below him if there's no room above.
      const bub = sayRef.current;
      if (bub) {
        const bw = bub.offsetWidth, bh = bub.offsetHeight;
        const left = clamp(p.x + s / 2 - bw / 2, EDGE, b.w - bw - EDGE);
        const above = p.y + bob - bh - 6;
        const top = whereRef.current === "out" && above < EDGE ? p.y + bob + s + 6 : above;
        bub.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
      }

      if (now > nextBubbleAt && !dragging) {
        bubble(s);
        nextBubbleAt = now + 900 + Math.random() * 2200;
      }
      if (!reduced || dragging) raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    // Place him right away (before paint) when his element is new, then keep animating.
    wake.current = () => {
      const root = rootRef.current;
      if (root) root.style.transform = `translate3d(${pos.current.x.toFixed(1)}px, ${pos.current.y.toFixed(1)}px, 0)`;
      start();
    };

    const io = new IntersectionObserver(
      (entries) => {
        laneVisible = entries.some((e) => e.isIntersecting);
        if (laneVisible || whereRef.current === "out") start();
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(lane);
    const onResize = () => start();
    wake.current();
    window.addEventListener("resize", onResize);
    start();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [lane, box]);

  // A new container means a new element: place it before the browser paints.
  useLayoutEffect(() => {
    wake.current();
  }, [where, say]);

  useEffect(() => {
    if (!say) return;
    const id = window.setTimeout(() => setSay(null), 5000);
    return () => window.clearTimeout(id);
  }, [say]);

  // Drag: window listeners so he can move between containers mid-drag.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const r = rootRef.current!.getBoundingClientRect();
    drag.current = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.id) return;
      if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 5) return;
      if (!d.moved) {
        d.moved = true;
        if (whereRef.current === "lane") go("out");
        setSay(null);
      }
      const s = size();
      pos.current = {
        x: clamp(ev.clientX - d.dx, EDGE, document.documentElement.clientWidth - s - EDGE),
        y: clamp(ev.clientY - d.dy, EDGE, window.innerHeight - s - EDGE),
      };
      wake.current();
    };
    const up = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.id) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      drag.current = null;
      if (!d.moved) {
        cheerUntil.current = performance.now() + 1600;
        setSay(nextLine());
        wake.current();
        return;
      }
      // Dropped over the lane: he moves back in, at the same spot.
      const laneEl = document.getElementById("tiq-lane");
      const lr = laneEl?.getBoundingClientRect();
      if (lr && ev.clientY >= lr.top - 20 && ev.clientY <= lr.bottom + 20) {
        pos.current = { x: pos.current.x - lr.left, y: pos.current.y - lr.top };
        go("lane");
      }
      wake.current();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const sendHome = () => {
    const s = size();
    const laneEl = document.getElementById("tiq-lane");
    const w = laneEl?.clientWidth ?? window.innerWidth;
    pos.current = { x: clamp(w / 2 - s / 2, EDGE, w - s - EDGE), y: 4 };
    go("lane");
    setSay(null);
  };

  if (!lane) return null;

  const fixed = where === "out";
  const octo = (
    <>
      <div
        ref={rootRef}
        className={`tiq ${fixed ? "fixed" : "absolute"} left-0 top-0 z-30 w-[84px] md:w-[120px] will-change-transform`}
        style={{ transform: "translate3d(-9999px, 0, 0)" }}
      >
        <div ref={bodyRef} className="origin-center">
          <button
            type="button"
            onPointerDown={onPointerDown}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                cheerUntil.current = performance.now() + 1600;
                setSay(nextLine());
              }
            }}
            onPointerEnter={() => (hovering.current = true)}
            onPointerLeave={() => (hovering.current = false)}
            aria-label="Tiq the octopus. Press for a tip, or drag him anywhere."
            className="block w-full cursor-grab touch-none select-none rounded-full active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative sprite swapped every few seconds */}
            <img
              src={src(pose)}
              alt=""
              width={240}
              height={240}
              draggable={false}
              className="pointer-events-none w-full drop-shadow-[0_10px_18px_rgba(40,30,120,0.25)]"
              style={{ transform: `scaleX(${face})` }}
            />
          </button>
        </div>
        {fixed && (
          <button
            type="button"
            onClick={sendHome}
            aria-label="Send the octopus back to the footer"
            className="absolute -right-1 top-0 grid h-7 w-7 place-items-center rounded-full border border-foreground/10 bg-background text-sm text-muted-foreground shadow hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>
      {say && (
        <div
          ref={sayRef}
          role="status"
          className={`${fixed ? "fixed" : "absolute"} left-0 top-0 z-30 w-56 max-w-[calc(100vw-16px)] rounded-2xl border border-foreground/10 bg-background/95 px-3.5 py-2.5 text-sm leading-snug shadow-lg backdrop-blur`}
          style={{ transform: "translate3d(-9999px, 0, 0)" }}
        >
          {say}
        </div>
      )}
    </>
  );

  return (
    <>
      <style>{`
        .tiq-bubble{border-radius:9999px;pointer-events:none;z-index:29;
          background:radial-gradient(circle at 30% 30%,rgba(255,255,255,.95),rgba(180,220,255,.35) 45%,rgba(120,170,255,.15) 70%);
          box-shadow:inset 0 0 0 1px rgba(110,92,240,.25);animation:tiq-rise 3s ease-in forwards}
        @keyframes tiq-rise{0%{transform:translate(0,0) scale(.6);opacity:0}
          15%{opacity:.9}50%{transform:translate(6px,-50px) scale(1)}
          100%{transform:translate(-4px,-110px) scale(1.1);opacity:0}}
      `}</style>
      {createPortal(octo, fixed ? document.body : lane)}
    </>
  );
}
