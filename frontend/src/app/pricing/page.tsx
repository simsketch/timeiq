import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoIcon } from "@/components/logo";
import { PricingCards } from "@/components/billing/pricing-card";

export const metadata = {
  title: "Pricing - TimeIQ",
  description: "Free for your first 7 meetings, then scheduling for $19 a year for the first 100 founding members.",
};

const FAQ = [
  {
    q: "What's free?",
    a: "All of TimeIQ until 7 meetings are booked with you, with no card. After that your booking link pauses for new bookings until you pick a plan, and every meeting already booked stays put.",
  },
  {
    q: "What do I get?",
    a: "Everything. Booking pages, calendar sync across Google, Outlook and iCloud, schedules you forward by email, group meetings, and your open times to share in any time zone.",
  },
  {
    q: "Why so cheap?",
    a: "TimeIQ is new and we'd rather have a hundred people using it every week than a handful paying a lot. Founding members keep their price for as long as they stay subscribed.",
  },
  {
    q: "What happens after the first 100?",
    a: "The price goes to $29 a year for new subscribers. Founders are unaffected.",
  },
  {
    q: "Can I cancel?",
    a: "Anytime, from Settings. You keep access until the end of the year you paid for.",
  },
];

export default function PricingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <header className="relative container mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoIcon />
          <span className="text-xl font-semibold tracking-tight">TimeIQ</span>
        </Link>
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>
      </header>
      <main className="relative container mx-auto px-6 lg:px-10 pb-24">
        <div className="text-center max-w-2xl mx-auto pt-10 pb-12">
          <div className="text-sm font-medium text-muted-foreground mb-5">Pricing</div>
          <h1 className="text-5xl lg:text-7xl leading-[0.98] tracking-[-0.03em] text-balance">
            <span className="font-display">Free to start.</span>{" "}
            <span className="font-display text-muted-foreground">Stupid cheap after.</span>
          </h1>
          <p className="text-lg text-muted-foreground mt-6 text-pretty">
            Your first 7 meetings are free, with no card. After that, it costs less than a coffee a year while founder spots last.
          </p>
        </div>
        <PricingCards />
        <div className="max-w-2xl mx-auto mt-20 grid sm:grid-cols-2 gap-8">
          {FAQ.map((item) => (
            <div key={item.q}>
              <h3 className="font-semibold mb-1.5">{item.q}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed text-pretty">{item.a}</p>
            </div>
          ))}
        </div>
        <p className="mt-16 text-center text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          {" · "}
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
        </p>
      </main>
    </div>
  );
}
