import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPublicBookingProfile } from "@/lib/public-booking-profile";
import { ClientMessages } from "@/i18n/client-messages";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicBookingProfile(username);
  if (!profile?.booking_white_label) return {};
  const name = profile.name || username;
  const t = await getTranslations("booking.meta");
  const title = t("title", { name });
  const description = t("description", { name });
  return {
    title, description,
    icons: { icon: profile.booking_logo || "data:,", apple: [] },
    openGraph: { title, description, siteName: name, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return <ClientMessages namespaces={["booking"]}>{children}</ClientMessages>;
}
