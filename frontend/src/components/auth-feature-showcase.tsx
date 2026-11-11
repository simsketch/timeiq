"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { CalendarDays, MessageCircle, Paintbrush } from "lucide-react";
import { McpDemoContent } from "@/components/landing/mcp-demo-content";

const EmailDemo = dynamic(() => import("@/components/landing/email-schedule-demo").then(m => m.EmailScheduleDemo));
const BookingDemo = dynamic(() => import("@/components/booking/booking-profile").then(m => m.BookingProfile));
const features = [
  { label: "AI chatbot", icon: MessageCircle, title: "Ask a question. Get your time back.", description: "Ask about your day, find a free slot, or paste in a schedule. TimeIQ checks your connected calendars." },
  { label: "Email imports", icon: CalendarDays, title: "Forward a schedule. See the events appear.", description: "Try forwarding a sample PDF, email, or screenshot below. TimeIQ extracts the dates and adds them to your TimeIQ calendar." },
  { label: "Your brand", icon: Paintbrush, title: "Your logo. Your booking page.", description: "Upload your logo and hide TimeIQ branding. Your booking link checks your connected calendars before offering a time." },
];
const sampleLogo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="48"><rect width="48" height="48" rx="12" fill="#20584c"/><path d="M14 34V14l20 20V14" fill="none" stroke="white" stroke-width="4"/><text x="61" y="31" font-family="sans-serif" font-weight="700" font-size="20" fill="#20584c">NORTH STUDIO</text></svg>')}`;

export function AuthFeatureShowcase() {
  const [selected, setSelected] = useState(0);
  const feature = features[selected];
  return (
    <section className="mt-6 min-w-0" aria-label="Explore TimeIQ features">
      <div className="mb-5 flex gap-1 rounded-xl border border-[#dedacf] bg-[#eeebe3] p-1" role="group" aria-label="Feature examples">
        {features.map(({ label, icon: Icon }, index) => (
          <button key={label} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)} className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#98410d] ${selected === index ? "bg-white text-[#20201e] shadow-sm" : "text-[#69695f] hover:text-black"}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{label}
          </button>
        ))}
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{feature.title}</h2>
      <p className="mb-4 mt-1.5 text-sm leading-relaxed text-[#65655b]">{feature.description}</p>
      {selected === 0 ? <McpDemoContent compact title="TimeIQ chatbot" announce={false} /> : selected === 1 ? <EmailDemo /> : (
        <figure className="overflow-hidden rounded-2xl border border-[#dedacf] bg-white">
          <figcaption className="border-b border-[#eeebe3] px-5 py-3 text-xs text-[#65655b]">Example booking page · your logo, no TimeIQ branding</figcaption>
          <div inert aria-hidden="true" className="pointer-events-none">
            <BookingDemo embed profile={{ username: "north-studio-example", name: "North Studio", image_url: null, booking_logo: sampleLogo, booking_white_label: true, event_types: [
              { id: "example-1", name: "Discovery call", slug: "discovery", duration_minutes: 30, description: "Let’s talk about your next project.", location: "Google Meet", color: "#20584c" },
              { id: "example-2", name: "Quick check-in", slug: "check-in", duration_minutes: 15, description: null, location: null, color: "#20584c" },
            ] }} />
          </div>
        </figure>
      )}
    </section>
  );
}
