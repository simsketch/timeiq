import { NextIntlClientProvider, type Messages } from "next-intl";
import { getMessages } from "next-intl/server";

/**
 * Sends only these namespaces (plus common) to the browser, so public pages
 * don't carry every page's copy. Server components read all messages anyway.
 * A client component whose namespace is missing here shows its raw keys.
 */
export async function ClientMessages({ namespaces, children }: { namespaces: (keyof Messages)[]; children: React.ReactNode }) {
  const messages = await getMessages();
  const picked = Object.fromEntries(["common", ...namespaces].map((ns) => [ns, messages[ns as keyof Messages]]));
  return <NextIntlClientProvider messages={picked}>{children}</NextIntlClientProvider>;
}
