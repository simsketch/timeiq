import { cache } from "react";
import type { PublicProfile } from "@/components/booking/booking-profile";

// Share one lookup between the page and its branding metadata in each request.
export const getPublicBookingProfile = cache(async (username: string): Promise<PublicProfile | null> => {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL || "https://api.timeiq.app";
    const response = await fetch(`${base}/api/public/${encodeURIComponent(username)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
});
