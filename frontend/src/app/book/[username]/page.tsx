import { BookingProfile, type PublicProfile } from "@/components/booking/booking-profile";

export default async function BookingProfilePage({ params, searchParams }: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ scene?: string }>;
}) {
  const { username } = await params;
  // ?scene= previews another scene on any page (used by the Settings picker).
  const { scene } = await searchParams;
  let profile: PublicProfile | null = null;
  try {
    const base = process.env.NEXT_PUBLIC_API_URL || "https://api.timeiq.app";
    const response = await fetch(`${base}/api/public/${encodeURIComponent(username)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) profile = await response.json();
    if (profile && scene) profile = { ...profile, booking_scene: scene };
  } catch {
    // An unavailable or missing profile keeps the public page usable.
  }
  return <BookingProfile profile={profile} />;
}
