"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { LOCALES, setLocaleCookie, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/** Native select so it costs no extra JS on marketing pages; the URL never changes. */
export function LanguagePicker({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className={cn("inline-flex items-center gap-1.5 text-sm text-muted-foreground", className)}>
      <Languages className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          setLocaleCookie(e.target.value as Locale);
          startTransition(() => router.refresh());
        }}
        className="cursor-pointer rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {Object.entries(LOCALES).map(([code, name]) => (
          <option key={code} value={code} lang={code}>{name}</option>
        ))}
      </select>
    </label>
  );
}
