"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { CalendarDays, MessageCircle, Paintbrush, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { SchedulingStory } from "@/components/landing/scheduling-story";

const EmailDemo = dynamic(() => import("@/components/landing/email-schedule-demo").then(m => m.EmailScheduleDemo));
const BookingDemo = dynamic(() => import("@/components/booking/booking-profile").then(m => m.BookingProfile));
const features = [
  { key: "chat", icon: MessageCircle },
  { key: "cc", icon: Mail },
  { key: "imports", icon: CalendarDays },
  { key: "brand", icon: Paintbrush },
] as const;
const sampleLogo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="48"><rect width="48" height="48" rx="12" fill="#20584c"/><path d="M14 34V14l20 20V14" fill="none" stroke="white" stroke-width="4"/><text x="61" y="31" font-family="sans-serif" font-weight="700" font-size="20" fill="#20584c">NORTH STUDIO</text></svg>')}`;

export function AuthFeatureShowcase() {
  const t = useTranslations("auth.showcase");
  const [selected, setSelected] = useState(0);
  const feature = { title: t(`${features[selected].key}.title`), description: t(`${features[selected].key}.body`) };
  return (
    <section className="mt-4 min-w-0" aria-label={t("label")}>
      <div className="mb-3 grid grid-cols-2 gap-1 sm:flex rounded-xl border border-[#dedacf] bg-[#eeebe3] p-1" role="group" aria-label={t("examples")}>
        {features.map(({ key, icon: Icon }, index) => (
          <button key={key} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)} className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#98410d] ${selected === index ? "bg-white text-[#20201e] shadow-sm" : "text-[#69695f] hover:text-black"}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{t(`${key}.label`)}
          </button>
        ))}
      </div>
      <h2 className="mb-2 text-base font-semibold tracking-tight">{feature.title}</h2>
      {selected === 0 ? <SchedulingStory key="chat" /> : selected === 1 ? <SchedulingStory key="email" mode="email" /> : selected === 2 ? <EmailDemo /> : (
        <figure className="overflow-hidden rounded-2xl border border-[#dedacf] bg-white">
          <figcaption className="border-b border-[#eeebe3] px-5 py-3 text-xs text-[#65655b]">{t("brandCaption")}</figcaption>
          <div inert aria-hidden="true" className="pointer-events-none">
            <BookingDemo embed profile={{ username: "north-studio-example", name: "North Studio", image_url: null, booking_logo: sampleLogo, booking_white_label: true, event_types: [
              { id: "example-1", name: t("sampleDiscovery"), slug: "discovery", duration_minutes: 30, description: t("sampleDiscoveryBody"), location: "Google Meet", color: "#20584c" },
              { id: "example-2", name: t("sampleCheckIn"), slug: "check-in", duration_minutes: 15, description: null, location: null, color: "#20584c" },
            ] }} />
          </div>
        </figure>
      )}
      <p className="mt-2 text-xs leading-relaxed text-[#65655b]">{feature.description}</p>
    </section>
  );
}
