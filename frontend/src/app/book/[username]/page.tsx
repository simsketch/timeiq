import { BookingProfile, type PublicProfile } from "@/components/booking/booking-profile";
import { resolveSceneChoice } from "@/components/booking/scenes";
import { EmbedFrame } from "@/components/booking/embed-frame";
import { getPublicBookingProfile } from "@/lib/public-booking-profile";

export default async function BookingProfilePage({ params, searchParams }: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ scene?: string; embed?: string }>;
}) {
  const { username } = await params;
  // ?scene= previews another scene on any page (used by the Booking page picker).
  const { scene, embed } = await searchParams;
  let profile: PublicProfile | null = await getPublicBookingProfile(username);
  if (profile && scene) profile = { ...profile, booking_scene: scene };
  // Random resolves here, per request, so the loader backdrop, painted still
  // and scene all agree from the first paint.
  if (profile) profile = { ...profile, booking_scene: resolveSceneChoice(profile.booking_scene) };
  const embedded = embed === "1";
  const content = <BookingProfile profile={profile} embed={embedded} />;
  return embedded ? <EmbedFrame enabled>{content}</EmbedFrame> : content;
}
