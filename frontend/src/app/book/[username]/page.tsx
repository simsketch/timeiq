import { BookingProfile, type PublicProfile } from "@/components/booking/booking-profile";
import { resolveSceneChoice } from "@/components/booking/scenes";
import { EmbedFrame } from "@/components/booking/embed-frame";

export default async function BookingProfilePage({ params, searchParams }: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ scene?: string; embed?: string }>;
}) {
  const { username } = await params;
  // ?scene= previews another scene on any page (used by the Settings picker).
  const { scene, embed } = await searchParams;
  let profile: PublicProfile | null = null;
  try {
    const base = process.env.NEXT_PUBLIC_API_URL || "https://api.timeiq.app";
    const response = await fetch(`${base}/api/public/${encodeURIComponent(username)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) profile = await response.json();
    if (profile && scene) profile = { ...profile, booking_scene: scene };
    // Random resolves here, per request, so the loader backdrop, painted still
    // and scene all agree from the first paint.
    if (profile) profile = { ...profile, booking_scene: resolveSceneChoice(profile.booking_scene) };
  } catch {
    // An unavailable or missing profile keeps the public page usable.
  }
  const embedded = embed === "1";
  const content = <BookingProfile profile={profile} embed={embedded} />;
  return embedded ? <EmbedFrame enabled>{content}</EmbedFrame> : content;
}
