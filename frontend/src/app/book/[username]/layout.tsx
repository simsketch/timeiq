import type { Metadata } from "next";
import { getPublicBookingProfile } from "@/lib/public-booking-profile";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicBookingProfile(username);
  if (!profile?.booking_white_label) return {};
  const name = profile.name || username;
  const title = `Book time with ${name}`;
  const description = `Choose a meeting and book a time with ${name}.`;
  return {
    title, description,
    icons: { icon: profile.booking_logo || "data:,", apple: [] },
    openGraph: { title, description, siteName: name, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
