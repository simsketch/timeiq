import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { ArrowDown, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LogoIcon } from "@/components/logo";
import { variantForAd } from "@/components/landing/headlines";
import { AuthFeatureShowcase } from "@/components/auth-feature-showcase";
import { SignupOffer } from "@/components/signup-offer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp.meta");
  return { title: t("title"), description: t("description"), alternates: { canonical: "/sign-up" } };
}


export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const t = await getTranslations("auth");
  const shell = await getTranslations("shell");
  const signInHref = typeof query.redirect_url === "string" ? `/sign-in?redirect_url=${encodeURIComponent(query.redirect_url)}` : "/sign-in";
  const content = typeof query.utm_content === "string" ? query.utm_content : null;
  const variant = variantForAd(content);
  // Each ad angle keeps its own accent line; untrusted utm text is never shown.
  const accent = t(`accent.${variant ?? "default"}`);

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#20201e]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8 lg:px-12">
        <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b84705]" aria-label={t("home")}>
          <LogoIcon className="h-9 w-9" />
          <span className="text-[23px] font-semibold tracking-tight">TimeIQ</span>
        </Link>
        <Link href={signInHref} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-[#494943] transition hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b84705]">
          {shell("signIn")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-12 pt-2 sm:px-8 lg:px-12">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10 xl:gap-16">
          <section aria-labelledby="signup-heading" className="min-w-0">
            <h1 id="signup-heading" className="max-w-xl text-[clamp(1.5rem,2.5vw,2rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-balance">
              {t("lead")}{" "}
              <span className="block text-[#98410d] sm:inline">{accent}</span>
            </h1>
            <p className="mt-2 max-w-[38rem] text-sm leading-relaxed text-[#595950]">
              {t("intro")}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#595950]">
              <p className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#b84705]" aria-hidden="true" />{t("signUp.free")}</p>
              <a href="#create-account" className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[#d8d3c8] bg-white/70 px-3 font-semibold lg:hidden">
                {shell("startFree")} <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>

            <AuthFeatureShowcase />
          </section>

          <section id="create-account" aria-labelledby="create-account-heading" className="min-w-0 scroll-mt-5 rounded-[1.6rem] border border-[#e4dfd4] bg-white p-5 shadow-[0_20px_60px_-35px_rgba(49,37,18,0.35)] sm:p-6">
            <h2 id="create-account-heading" className="sr-only">{t("signUp.createAccount")}</h2>
            <p className="mb-4 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a34410]">{t("signUp.tryEverything")}</p>
            <SignUp appearance={{ elements: {
              rootBox: { width: "100%" },
              cardBox: { width: "100%", maxWidth: "none", boxShadow: "none" },
              card: { width: "100%", border: "none", background: "transparent", padding: 0, boxShadow: "none" },
              footer: { background: "transparent" },
            } }} />
            <div className="mt-3 border-t border-[#eeece6] pt-3">
              <SignupOffer />
            </div>
          </section>
        </div>

        <section aria-labelledby="next-steps-heading" className="mt-12 rounded-2xl border border-[#e4dfd4] bg-[#eeebe3] px-6 py-7 sm:mt-16 sm:px-8">
          <h2 id="next-steps-heading" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6c6559]">{t("signUp.stepsTitle")}</h2>
          <ol className="mt-5 grid gap-5 text-sm sm:grid-cols-3 sm:gap-8">
            {(["connect", "customize", "relax"] as const).map((key, i) => [`0${i + 1}`, t(`signUp.steps.${key}.title`), t(`signUp.steps.${key}.body`)]).map(([number, title, description]) => (
              <li key={number} className="flex gap-3"><span className="pt-0.5 font-mono text-xs text-[#9a5b32]">{number}</span><div><h3 className="font-semibold">{title}</h3><p className="mt-1 leading-relaxed text-[#65655b]">{description}</p></div></li>
            ))}
          </ol>
        </section>

        <footer className="mt-8 flex flex-col justify-between gap-4 text-xs text-[#69695f] sm:flex-row sm:items-center">
          <p className="inline-flex items-start gap-2 leading-relaxed"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />{t("signUp.readOnly")}</p>
          <nav aria-label={t("signUp.navLabel")} className="flex gap-5">
            <Link href="/pricing" className="underline-offset-4 hover:underline">{shell("pricing")}</Link>
            <Link href="/privacy" className="underline-offset-4 hover:underline">{shell("privacy")}</Link>
            <Link href="/terms" className="underline-offset-4 hover:underline">{shell("terms")}</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
