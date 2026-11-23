"use client";

import { useState } from "react";

/** One split-flap tile: when its character changes, the top flap falls and the new one lands. */
function Flap({ ch, wide = false }: { ch: string; wide?: boolean }) {
  const [shown, setShown] = useState(ch);
  const [prev, setPrev] = useState(ch);
  // Adjusting state during render when the prop changes (React's "storing information from previous renders").
  if (ch !== shown) {
    setPrev(shown);
    setShown(ch);
  }
  return (
    <span className={`fc-tile${wide ? " fc-tile--wide" : ""}`}>
      <span className="fc-half fc-top"><span className="fc-g">{shown}</span></span>
      <span className="fc-half fc-bottom"><span className="fc-g">{prev}</span></span>
      {prev !== shown && (
        // Keyed by the new character so a second change mid-flip restarts the fall.
        <span key={shown}>
          <span className="fc-half fc-top fc-flap-top"><span className="fc-g">{prev}</span></span>
          <span className="fc-half fc-bottom fc-flap-bottom" onAnimationEnd={() => setPrev(shown)}><span className="fc-g">{shown}</span></span>
        </span>
      )}
    </span>
  );
}

/** A split-flap clock showing `minutes` past midnight on the hero's demo day, in the visitor's locale. */
export function FlipClock({ minutes, locale }: { minutes: number; locale: string }) {
  const parts = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" })
    .formatToParts(new Date(2026, 10, 2, Math.floor(minutes / 60), minutes % 60));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // Two hour tiles always, so 9:55 to 10:00 doesn't shift the clock sideways.
  const hour = get("hour").padStart(2, " ");
  const minute = get("minute");
  const period = get("dayPeriod").replace(/[\s.]/g, "").toUpperCase();
  return (
    <span className="fc" aria-hidden>
      <Flap ch={hour[0]} />
      <Flap ch={hour[1]} />
      <span className="fc-colon"><i /><i /></span>
      <Flap ch={minute[0]} />
      <Flap ch={minute[1]} />
      {period && <Flap ch={period} wide />}
    </span>
  );
}
