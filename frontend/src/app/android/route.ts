import { NextResponse } from "next/server";
import { playStoreUrl } from "@/lib/app-store";

/** timeiq.app/android: a short link to Google Play; ?ct=… overrides the campaign (default "android-link"). */
export function GET(request: Request) {
  const ct = new URL(request.url).searchParams.get("ct")?.slice(0, 40) || "android-link";
  return NextResponse.redirect(playStoreUrl(ct), 302);
}
