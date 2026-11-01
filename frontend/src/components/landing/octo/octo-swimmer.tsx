"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Tiq, a claymation octopus who drifts around the homepage as if underwater,
// swims over to point at sections, and says something when pressed.
// Motion runs on transforms in one rAF loop (no React renders per frame);
// rAF stops in hidden tabs, and reduced motion parks him in the corner.

type Pose = "juggle" | "swim" | "point" | "wave" | "cheer";
type Mode = "wander" | "rest" | "point" | "cheer";

const POSES: Pose[] = ["juggle", "swim", "point", "wave", "cheer"];
const src = (p: Pose) => `/octo/${p}.webp`;
const HIDDEN_KEY = "tiq.hidden.v1";

// Sections he swims over to, with what he says there.
const SPOTS: { sel: string; say: string }[] = [
  { sel: "#try", say: "Forward any schedule here and I'll put it on your calendar." },
  { sel: "#assistants h2", say: "Your AI assistant can book through me too." },
  { sel: "#cc h2", say: "Cc TimeIQ on a thread and I'll find a time." },
  { sel: "#calendars h2", say: "All your calendars, one link. I juggle them so you don't." },
  { sel: "#share h2", say: "Send your free times as a picture or a list." },
  { sel: "#invoicing h2", say: "Hours in, invoice out. I even count the coins." },
  { sel: "#pricing h2", say: "Free for 7 days, then $19 a year." },
];

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
];

const SIZE_DESKTOP = 132;
const SIZE_MOBILE = 84;

export function OctoSwimmer() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pose, setPose] = useState<Pose>("juggle");
  const [say, setSay] = useState<string | null>(null);
  const [face, setFace] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bubblesRef = useRef<HTMLDivElement>(null);
  const cheerUntil = useRef(0);
  const hovering = useRef(false);
  const lineBag = useRef<string[]>([]);

  const nextLine = useCallback(() => {
    if (lineBag.current.length === 0) {
      lineBag.current = [...LINES].sort(() => Math.random() - 0.5);
    }
    return lineBag.current.pop()!;
  }, []);

  // Warm the pose images so swapping never flashes.
  useEffect(() => {
    if (hidden) return;
    for (const p of POSES) {
      const img = new Image();
      img.src = src(p);
    }
  }, [hidden]);

  useEffect(() => {
    if (hidden) return;
    const root = rootRef.current;
    const body = bodyRef.current;
    if (!root || !body) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const vw = () => window.innerWidth;
    const vh = () => window.innerHeight;
    const size = () => (vw() < 768 ? SIZE_MOBILE : SIZE_DESKTOP);
    const roams = () => vw() >= 1024;
    const home = () => ({ x: vw() - size() - 16, y: vh() - size() - 24 });

    const pos = home();
    const vel = { x: 0, y: 0 };
    let target = { ...home() };
    let mode: Mode = "rest";
    let modeUntil = performance.now() + 2500;
    let nextPointAt = performance.now() + 9000;
    let nextBubbleAt = 0;
    let spot: { el: Element; say: string } | null = null;
    const recent: string[] = [];
    let curPose: Pose = "juggle";
    let curFace = 1;
    let raf = 0;
    let last = performance.now();

    const show = (p: Pose, f: number) => {
      if (p !== curPose) setPose((curPose = p));
      if (f !== curFace) setFace((curFace = f));
    };

    const place = (x: number, y: number, rot = 0, sx = 1, sy = 1) => {
      root.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      body.style.transform = `rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    };

    if (reduced) {
      const h = home();
      place(h.x, h.y);
      return;
    }

    // Wander points stay in the side margins beside the content column. When a
    // margin is narrower than he is, he peeks in from the edge of the screen.
    const wanderPoint = () => {
      const s = size();
      if (!roams()) {
        const h = home();
        return { x: h.x - Math.random() * 40, y: h.y - Math.random() * 60 };
      }
      const column = document.querySelector("main .container");
      const gutter = column
        ? Math.max(0, column.getBoundingClientRect().left + parseFloat(getComputedStyle(column).paddingLeft))
        : 0;
      const peek = s * 0.3;
      const x = Math.random() < 0.5
        ? -peek + Math.random() * Math.max(0, gutter - s - 8 + peek)
        : vw() - s + peek - Math.random() * Math.max(0, gutter - s - 8 + peek);
      const y = vh() * 0.16 + Math.random() * (vh() * 0.68 - s);
      return { x, y };
    };

    // A heading on screen he hasn't pointed at lately, and where to float beside it.
    const pickSpot = () => {
      const s = size();
      const options = SPOTS.flatMap(({ sel, say }) => {
        if (recent.includes(sel)) return [];
        const el = document.querySelector(sel);
        if (!el) return [];
        const r = el.getBoundingClientRect();
        if (r.top < vh() * 0.12 || r.bottom > vh() * 0.8 || r.height === 0) return [];
        return [{ el, say, sel }];
      });
      if (options.length === 0) return null;
      const pick = options[Math.floor(Math.random() * options.length)];
      recent.push(pick.sel);
      if (recent.length > 3) recent.shift();
      return { el: pick.el, say: pick.say, size: s };
    };

    const spotTarget = (el: Element) => {
      const s = size();
      const r = el.getBoundingClientRect();
      const y = Math.min(Math.max(r.top + Math.min(r.height, 80) / 2 - s / 2, 8), vh() - s - 8);
      if (r.left - s - 20 >= 8) return { x: r.left - s - 20, y, face: 1 };
      if (r.right + s + 20 <= vw() - 8) return { x: r.right + 20, y, face: -1 };
      return null;
    };

    const bubble = () => {
      const box = bubblesRef.current;
      if (!box) return;
      const b = document.createElement("span");
      const d = 6 + Math.random() * 8;
      b.className = "tiq-bubble";
      b.style.cssText = `left:${(pos.x + size() * (0.35 + Math.random() * 0.3)).toFixed(0)}px;top:${(pos.y + size() * 0.15).toFixed(0)}px;width:${d}px;height:${d}px;animation-duration:${(2.6 + Math.random() * 1.6).toFixed(2)}s`;
      box.appendChild(b);
      b.addEventListener("animationend", () => b.remove(), { once: true });
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;
      const t = now / 1000;

      if (now < cheerUntil.current) mode = "cheer";
      else if (mode === "cheer") {
        mode = "rest";
        modeUntil = now + 1500;
      }

      if (mode === "rest" && now > modeUntil) {
        if (roams() && now > nextPointAt && (spot = pickSpot())) {
          mode = "point";
          modeUntil = now + 9000; // give up if he can't get there
          setSay(null);
        } else {
          mode = "wander";
          target = wanderPoint();
        }
      }

      let pointing = false;
      if (mode === "point" && spot) {
        const st = spotTarget(spot.el);
        if (!st || now > modeUntil) {
          mode = "rest";
          modeUntil = now + 2000;
          nextPointAt = now + 14000 + Math.random() * 8000;
          spot = null;
          setSay(null);
        } else {
          target = st;
          const close = Math.hypot(st.x - pos.x, st.y - pos.y) < 24;
          if (close) {
            pointing = true;
            if (modeUntil - now > 5000) {
              modeUntil = now + 5000; // hold the point for 5s
              setSay(spot.say);
            }
          }
          if (pointing) curFace !== st.face && show(curPose, st.face);
        }
      }

      // Steer toward the target, slowing as he arrives; water drag keeps it floaty.
      const dx = target.x - pos.x, dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);
      const max = mode === "point" ? 3.2 : 1.6;
      const speed = Math.min(max, dist / 40);
      const want = dist > 0.5 ? { x: (dx / dist) * speed, y: (dy / dist) * speed } : { x: 0, y: 0 };
      vel.x += (want.x - vel.x) * 0.035 * dt;
      vel.y += (want.y - vel.y) * 0.035 * dt;
      pos.x += vel.x * dt + Math.sin(t * 0.7) * 0.15 * dt;
      pos.y += vel.y * dt;

      if (mode === "wander" && dist < 12) {
        mode = "rest";
        modeUntil = now + 2500 + Math.random() * 3500;
      }

      const moving = Math.hypot(vel.x, vel.y);
      const f = Math.abs(vel.x) > 0.25 && !pointing ? Math.sign(vel.x) : curFace;
      const p: Pose = mode === "cheer" ? "cheer" : pointing ? "point" : hovering.current ? "wave" : moving > 1.1 ? "swim" : "juggle";
      show(p, f);

      // Bob, sway and a soft jet-pulse squash while swimming.
      const bob = Math.sin(t * 1.6) * 6;
      const sway = Math.sin(t * 1.1) * 3 + Math.max(-10, Math.min(10, vel.x * 4));
      const pulse = moving > 1.1 ? Math.sin(t * 6) * 0.035 : Math.sin(t * 2.2) * 0.015;
      place(pos.x, pos.y + bob, sway, 1 - pulse, 1 + pulse);

      if (now > nextBubbleAt) {
        bubble();
        nextBubbleAt = now + 900 + Math.random() * 2200;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      pos.x = Math.min(pos.x, vw() - size() - 8);
      pos.y = Math.min(pos.y, vh() - size() - 8);
      if (!roams()) target = home();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [hidden]);

  useEffect(() => {
    if (!say) return;
    const id = window.setTimeout(() => setSay(null), 5000);
    return () => window.clearTimeout(id);
  }, [say]);

  if (hidden) return null;

  const press = () => {
    cheerUntil.current = performance.now() + 1600;
    setSay(nextLine());
  };
  const tuckAway = () => {
    try {
      localStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // Private mode: he still leaves for this visit.
    }
    setHidden(true);
  };

  return (
    <>
      <style>{`
        .tiq-bubble{position:fixed;border-radius:9999px;pointer-events:none;
          background:radial-gradient(circle at 30% 30%,rgba(255,255,255,.95),rgba(180,220,255,.35) 45%,rgba(120,170,255,.15) 70%);
          box-shadow:inset 0 0 0 1px rgba(110,92,240,.25);animation:tiq-rise 3s ease-in forwards}
        @keyframes tiq-rise{0%{transform:translate(0,0) scale(.6);opacity:0}
          15%{opacity:.9}50%{transform:translate(6px,-60px) scale(1)}
          100%{transform:translate(-4px,-130px) scale(1.1);opacity:0}}
        .tiq-x{opacity:0;transition:opacity .15s}
        .tiq:hover .tiq-x,.tiq:focus-within .tiq-x{opacity:1}
        @media (prefers-reduced-motion:reduce){.tiq-bubble{display:none}}
      `}</style>
      <div ref={bubblesRef} aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden" />
      <div
        ref={rootRef}
        className="tiq fixed left-0 top-0 z-30 w-[84px] md:w-[132px] will-change-transform"
        style={{ transform: "translate3d(-200px,-200px,0)" }}
      >
        {say && (
          <div
            role="status"
            className={`absolute bottom-[92%] w-56 rounded-2xl border border-foreground/10 bg-background/95 px-3.5 py-2.5 text-sm leading-snug shadow-lg backdrop-blur ${
              face > 0 ? "left-1/2" : "right-1/2"
            }`}
          >
            {say}
          </div>
        )}
        <div ref={bodyRef} className="origin-center">
          <button
            type="button"
            onClick={press}
            onPointerEnter={() => (hovering.current = true)}
            onPointerLeave={() => (hovering.current = false)}
            aria-label="Tiq the octopus. Press for a tip."
            className="block w-full cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative sprite swapped every few seconds */}
            <img
              src={src(pose)}
              alt=""
              width={264}
              height={264}
              draggable={false}
              className="w-full select-none drop-shadow-[0_10px_18px_rgba(40,30,120,0.25)]"
              style={{ transform: `scaleX(${face})` }}
            />
          </button>
        </div>
        <button
          type="button"
          onClick={tuckAway}
          aria-label="Hide the octopus"
          className="tiq-x absolute -right-1 top-0 grid h-7 w-7 place-items-center rounded-full border border-foreground/10 bg-background text-sm text-muted-foreground shadow hover:text-foreground"
        >
          ×
        </button>
      </div>
    </>
  );
}
