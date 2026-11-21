import { ClerkProvider } from "@clerk/nextjs";
import { deDE, esES, frFR } from "@clerk/localizations";
import { getLocale } from "next-intl/server";

// Locales without an entry fall back to Clerk's English.
const CLERK_LOCALIZATIONS: Record<string, typeof esES> = { es: esES, fr: frFR, de: deDE };

/** ClerkProvider with sign-in, sign-up and the user menu in the visitor's language. */
export async function LocalizedClerkProvider({ children }: { children: React.ReactNode }) {
  return <ClerkProvider localization={CLERK_LOCALIZATIONS[await getLocale()]}>{children}</ClerkProvider>;
}
