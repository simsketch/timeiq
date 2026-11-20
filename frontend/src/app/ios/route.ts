import { NextResponse } from "next/server";
import { appStoreUrl } from "@/lib/app-store";

/** timeiq.app/ios: a short link to the App Store; ?ct=… overrides the campaign (default "ios-link"). */
export function GET(request: Request) {
  const ct = new URL(request.url).searchParams.get("ct")?.slice(0, 40) || "ios-link";
  return NextResponse.redirect(appStoreUrl(ct), 302);
}
