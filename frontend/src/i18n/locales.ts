/**
 * The languages the web app speaks. To add one, add messages/<code>.json
 * and its code and native name here (tests/messages.test.mjs checks both).
 */
export const LOCALES = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
} as const;

export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = "en";
/** Set by the language picker; wins over the browser's languages. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && Object.hasOwn(LOCALES, value);
}

/** The cookie if it names a known locale, else the best Accept-Language match, else English. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { base: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((entry) => entry.base && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.find((entry) => isLocale(entry.base))?.base as Locale | undefined ?? DEFAULT_LOCALE;
}

/** Stores the visitor's choice for a year; callers refresh to re-render. */
export function setLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
