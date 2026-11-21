import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { ConsentForm } from "./consent-form";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getTranslations("oauth"))("metaTitle"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string | string[] }>;
}) {
  await auth.protect();
  const params = await searchParams;
  const request = typeof params.request === "string" && /^[A-Za-z0-9_-]{43}$/.test(params.request) ? params.request : "";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <ConsentForm request={request} />
    </main>
  );
}
