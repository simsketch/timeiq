import { locale as rootLocale } from "next/root-params";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "./locales";

// The locale is the app/[locale] root param that middleware rewrote in, so
// reading it keeps pages static. Visitors never see it in the URL.
export default getRequestConfig(async () => {
  const param: string | undefined = await rootLocale();
  const locale = isLocale(param) ? param : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
