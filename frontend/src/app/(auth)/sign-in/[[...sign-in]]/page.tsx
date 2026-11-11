import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { LogoIcon } from "@/components/logo";
import { AuthFeatureShowcase } from "@/components/auth-feature-showcase";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#20201e]">
      <header className="mx-auto max-w-7xl px-5 py-5 sm:px-8 lg:px-12">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="TimeIQ home"><LogoIcon className="h-11 w-11" /><span className="text-[23px] font-semibold tracking-tight">TimeIQ</span></Link>
      </header>
      <main className="mx-auto grid max-w-7xl items-start gap-8 px-5 pb-12 pt-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16 lg:px-12 lg:pt-5">
        <section className="min-w-0">
          <h1 className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-[1.15] tracking-[-0.03em]">Chat. Forward. Get booked.</h1>
          <p className="mt-4 text-base leading-relaxed text-[#595950]">Chat with your schedule, import forwarded emails, and share a booking page with your own logo.</p>
          <a href="#sign-in" className="mt-4 inline-block rounded-full border border-[#d8d3c8] bg-white px-4 py-2 text-sm font-semibold lg:hidden">Go to sign in ↓</a>
          <AuthFeatureShowcase />
        </section>
        <section id="sign-in" aria-label="Sign in to TimeIQ" className="min-w-0 scroll-mt-5 rounded-[1.6rem] border border-[#e4dfd4] bg-white p-5 shadow-[0_20px_60px_-35px_rgba(49,37,18,0.35)] sm:p-8">
          <SignIn appearance={{ elements: {
            rootBox: { width: "100%" },
            cardBox: { width: "100%", maxWidth: "none", boxShadow: "none" },
            card: { width: "100%", border: "none", background: "transparent", padding: 0, boxShadow: "none" },
            footer: { background: "transparent" },
          } }} />
          <p className="mt-5 border-t border-[#eeece6] pt-5 text-center text-xs leading-relaxed text-[#69695f]">New to TimeIQ? Every feature is free to try for your first 7 meetings. No card needed.</p>
          <div className="mt-4 flex justify-center gap-5 text-xs text-[#69695f]"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
        </section>
      </main>
    </div>
  );
}
