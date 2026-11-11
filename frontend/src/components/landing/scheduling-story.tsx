"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, CalendarCheck, Check, Clock, Mail, MousePointer2, Pause, Play, RotateCcw, Send } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { useDemoAutoplay } from "./use-demo-autoplay";

const PEOPLE = [
  { name: "Maya", email: "maya@example.com", color: "#e8ddf3" },
  { name: "Jordan", email: "jordan@example.com", color: "#dcebe5" },
  { name: "Alex", email: "alex@example.com", color: "#f3e0ce" },
  { name: "Sam", email: "sam@example.com", color: "#dce5f3" },
];
const CHAT_DELAYS = [3600, 3000, 1900, 3000, 1800, 7000];
const EMAIL_DELAYS = [4300, 1600, 1100, 1200, 1200, 1200, 2100, 3000, 1800, 7000];

function TypedText({ text, animate }: { text: string; animate: boolean }) {
  const [length, setLength] = useState(0);
  useEffect(() => {
    if (!animate) {
      const timer = window.setTimeout(() => setLength(text.length), 0);
      return () => window.clearTimeout(timer);
    }
    let position = 0;
    const timer = window.setInterval(() => {
      position = Math.min(position + 2, text.length);
      setLength(position);
      if (position >= text.length) window.clearInterval(timer);
    }, 42);
    return () => window.clearInterval(timer);
  }, [text, animate]);
  return <>{animate ? text.slice(0, length) : text}<span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-current motion-safe:animate-pulse" aria-hidden="true" /></>;
}

function Person({ name, color }: { name: string; color: string }) {
  return <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-[#35352f]" style={{ background: color }} aria-hidden="true">{name[0]}</span>;
}

function ChatMessage({ children, you = false }: { children: React.ReactNode; you?: boolean }) {
  return <div className={`demo-pop max-w-[94%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${you ? "ml-auto rounded-br-sm bg-[#20201e] text-white" : "rounded-tl-sm border border-[#e6e1d7] bg-white text-[#35352f]"}`}>
    <div className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold ${you ? "text-white/65" : "text-[#98410d]"}`}>{you ? "You" : <><LogoMark className="h-4 w-4" />TimeIQ</>}</div>
    {children}
  </div>;
}

/** Auth-page illustration: all people, replies, and bookings are local sample data. */
export function SchedulingStory({ mode = "chat" }: { mode?: "chat" | "email" }) {
  const email = mode === "email";
  const delays = email ? EMAIL_DELAYS : CHAT_DELAYS;
  const [beat, setBeat] = useState(0);
  const [paused, setPaused] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const { ref, playing, active, restart } = useDemoAutoplay(() => {
    const next = (beat + 1) % delays.length;
    setBeat(next);
    return delays[next];
  }, { firstDelay: delays[0], stopOnInteraction: false, paused });
  const animate = playing && !paused;
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTo({ top: beat === 0 ? 0 : el.scrollHeight, behavior: playing ? "smooth" : "instant" });
  }, [beat, playing]);
  const done = beat === delays.length - 1;
  const count = email ? Math.min(4, Math.max(0, beat - 2)) : 1;
  const prompt = "Find 30 minutes with Maya next week. Thursday afternoon would be great.";

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl border border-[#dfd9cc] bg-[#f3f1ec] shadow-[0_12px_35px_-22px_#34302050]">
      <div className="flex items-center justify-between gap-2 border-b border-[#e2dcd1] bg-white px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">{email ? <Mail className="h-4 w-4 text-[#98410d]" /> : <LogoMark className="h-5 w-5" />}{email ? "Your email → TimeIQ" : "Schedule with TimeIQ"}</div>
        <span className="rounded-full bg-[#f3f1ec] px-2 py-1 text-[10px] text-[#6b655c]">Animated example</span>
      </div>

      <div ref={body} className="flex h-[340px] flex-col gap-3 overflow-y-auto p-3 sm:p-4 [&>*]:shrink-0" aria-live={animate ? "off" : "polite"}>
        {email ? (
          <>
            <div className="rounded-xl border border-[#e6e1d7] bg-white p-3.5 text-xs">
              <div className="flex items-start gap-2 border-b border-[#eeebe5] pb-2"><span className="pt-1 text-[#767064]">To</span><div className="flex flex-wrap gap-1.5">{PEOPLE.map(p => <span key={p.name} title={p.email} className="inline-flex items-center gap-1 rounded-full bg-[#f3f1ec] py-0.5 pl-1 pr-2"><Person {...p} />{p.name}</span>)}</div></div>
              <div className="flex min-h-10 items-center gap-2 border-b border-[#eeebe5] py-2"><span className="text-[#767064]">Cc</span><span className="min-w-0 break-all rounded-md bg-[#fff0df] px-2 py-1 font-medium text-[#8e3c0b]">{beat === 0 ? <TypedText text="agent@timeiq.app" animate={animate} /> : "agent@timeiq.app"}</span></div>
              <div className="mt-3 font-semibold">Subject: Team kickoff next week</div>
              <p className="my-3 text-sm leading-relaxed">Can you find 30 minutes for the five of us next week? Thursday afternoon would be great.</p>
              <div className="flex justify-end"><span className={`relative inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold ${beat === 0 ? "bg-[#20201e] text-white" : "bg-[#e8f1e9] text-[#285d3e]"}`}>
                {beat === 0 ? <><Send className="h-3.5 w-3.5" />Send</> : <><Check className="h-3.5 w-3.5" />Sent</>}
                {beat === 1 && <MousePointer2 className="absolute -bottom-3 right-1 h-6 w-6 fill-[#20201e] text-white" aria-hidden="true" />}
              </span></div>
            </div>
            {beat >= 2 && <div className="demo-pop rounded-xl border border-[#e6e1d7] bg-white p-3.5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold">Collecting availability</span><span className="text-[#69695f]">{count} of 4 guests replied</span></div>
              <div className="grid grid-cols-2 gap-2">{PEOPLE.map((p, i) => <div key={p.name} className={`flex items-center gap-2 rounded-lg border p-2 transition-colors duration-500 ${i < count ? "border-[#cddfcf] bg-[#eef5ef]" : "border-[#e7e3da] bg-[#faf9f6]"}`}><Person {...p} /><div className="min-w-0"><div className="text-xs font-semibold">{p.name}</div><div className="mt-0.5 flex items-center gap-1 text-[10px] text-[#65655b]">{i < count ? <><Check className="h-3 w-3 text-[#285d3e]" />Thu 2 pm works</> : <><Clock className="h-3 w-3" />Waiting on reply</>}</div></div></div>)}</div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[#65655b]"><CalendarCheck className="h-3.5 w-3.5 text-[#285d3e]" />Your connected calendars checked</p>
            </div>}
            {beat >= 7 && <ChatMessage>All four guests can make <strong>Thursday, 2:00–2:30 pm ET</strong>. Ready for me to book the kickoff?</ChatMessage>}
            {beat >= 8 && <ChatMessage you>{beat === 8 ? <TypedText text="Book it." animate={animate} /> : "Book it."}</ChatMessage>}
          </>
        ) : (
          <>
            {beat === 0 ? <div className="grid min-h-[190px] place-content-center justify-items-center gap-2 text-center"><LogoMark className="h-9 w-9 text-[#98410d]" /><div className="text-lg font-semibold tracking-tight">What should we schedule?</div><p className="max-w-[28ch] text-sm leading-relaxed text-[#69695f]">Ask in plain words. TimeIQ checks your calendars and coordinates the replies.</p><div className="mt-1 flex gap-2 text-[10px]"><span className="rounded-full border bg-white px-3 py-1.5">Work calendar</span><span className="rounded-full border bg-white px-3 py-1.5">Personal calendar</span></div></div> : <ChatMessage you>{prompt}</ChatMessage>}
            {beat >= 1 && <ChatMessage>You’re free Thursday at <strong>2:00 pm ET</strong>. Shall I email Maya to check if that works?<div className="mt-3 flex items-center gap-1.5 text-xs text-[#69695f]"><CalendarCheck className="h-4 w-4 text-[#285d3e]" />Work + personal calendars checked</div></ChatMessage>}
            {beat >= 3 && <ChatMessage you>Yes, send it.</ChatMessage>}
            {beat >= 3 && <ChatMessage><div className="mb-2 flex items-center gap-2 rounded-lg bg-[#eef5ef] p-2 text-xs text-[#285d3e]"><Person name="Maya" color="#e8ddf3" />Maya replied: “Thursday at 2 works!”</div>Ready to book <strong>Thursday, 2:00–2:30 pm ET</strong>?</ChatMessage>}
            {beat >= 5 && <ChatMessage you>Book it.</ChatMessage>}
          </>
        )}
        {done && <div className="demo-pop overflow-hidden rounded-xl border border-[#b9d6bf] bg-white">
          <div className="flex items-center gap-2 bg-[#e8f1e9] px-4 py-2.5 text-xs font-semibold text-[#285d3e]"><CalendarCheck className="h-4 w-4" />Booked · invitations sent to {email ? "all five people" : "you and Maya"}</div>
          <div className="flex gap-3 p-4"><div className="rounded-lg border border-[#e4ded2] bg-[#f7f5f0] px-3 py-2 text-center"><div className="text-[10px] font-semibold text-[#98410d]">THU</div><div className="mt-1 text-lg font-semibold">2 pm</div></div><div><div className="text-sm font-semibold">{email ? "Team kickoff" : "Intro with Maya"}</div><div className="mt-1 text-xs text-[#69695f]">2:00–2:30 pm ET · 30 minutes</div><div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#f3f1ec] px-2 py-1 text-[10px]"><Mail className="h-3 w-3" />invite.ics</div></div></div>
        </div>}
        {!email && <div className="mt-auto flex min-h-14 items-center justify-between gap-3 rounded-xl border border-[#dedacf] bg-white px-3 py-3 text-sm text-[#35352f]"><span>{[0, 2, 4].includes(beat) ? <TypedText key={beat} text={beat === 0 ? prompt : beat === 2 ? "Yes, send it." : "Book it."} animate={animate} /> : <span className="text-xs text-[#767064]">Ask TimeIQ to schedule something…</span>}</span><span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#20201e] text-white"><ArrowUp className="h-4 w-4" />{[1,3,5].includes(beat) && <MousePointer2 className="absolute -bottom-3 -right-1 h-6 w-6 fill-[#20201e] text-white" aria-hidden="true" />}</span></div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e2dcd1] bg-white px-4 py-3 text-[11px] text-[#69695f]">
        <span>Sample data · no real emails or bookings</span>
        <div className="flex items-center gap-3">
          {active && <button type="button" onClick={() => setPaused(v => !v)} className="inline-flex min-h-8 items-center gap-1" aria-label={paused ? "Play animation" : "Pause animation"}>{paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{paused ? "Play" : "Pause"}</button>}
          <button type="button" onClick={() => { setPaused(true); setBeat(n => (n + 1) % delays.length); }} className="min-h-8 font-medium">Next step →</button>
          <button type="button" onClick={() => { setBeat(0); setPaused(false); restart(); }} aria-label="Replay example" className="min-h-8"><RotateCcw className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}
