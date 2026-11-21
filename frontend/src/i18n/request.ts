import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, pickLocale } from "./locales";

// No locale in the URL: links, booking URLs and Clerk routes stay as they are.
export default getRequestConfig(async () => {
  const locale = pickLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
