import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LogoIcon } from "@/components/logo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

const CONTACT = "hello@timeiq.app";

export default async function SupportPage() {
  const t = await getTranslations("support");
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="aurora-bg aurora-bg-soft" aria-hidden />
      <div className="grain" aria-hidden />
      <header className="relative container mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoIcon />
          <span className="text-xl font-semibold tracking-tight">TimeIQ</span>
        </Link>
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          {t("home")}
        </Link>
      </header>
      <main className="relative container mx-auto px-6 lg:px-10 pb-24 max-w-3xl">
        <div className="pt-8 pb-10">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-4">{t("eyebrow")}</div>
          <h1 className="font-display text-4xl lg:text-5xl tracking-[-0.025em]">{t("title")}</h1>
        </div>

        <div className="glass rounded-[1.5rem] p-7 sm:p-10 space-y-8 text-[15px] leading-relaxed">
          <Section title={t("contactTitle")}>
            {t.rich("contactBody", {
              email: CONTACT,
              link: (chunks) => <a className="underline underline-offset-4" href={`mailto:${CONTACT}`}>{chunks}</a>,
            })}
          </Section>
          <Section title={t("syncTitle")}>{t("syncBody")}</Section>
          <Section title={t("importTitle")}>{t("importBody", { email: CONTACT })}</Section>
          <Section title={t("dataTitle")}>
            {t.rich("dataBody", {
              link: (chunks) => <Link className="underline underline-offset-4" href="/privacy">{chunks}</Link>,
            })}
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold text-lg mb-2">{title}</h2>
      <div className="text-foreground/80 text-pretty">{children}</div>
    </section>
  );
}
