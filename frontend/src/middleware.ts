import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { variantForAd } from "@/components/landing/headlines";

const isPublicRoute = createRouteMatcher([
  "/",
  "/lp/(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/book(.*)",
  "/invoice/(.*)",
  "/pricing",
  "/mcp",
  "/billing/checkout",
  "/billing/welcome",
  "/imports/undo",
  "/email-addresses/confirm",
  "/meet/(.*)",
  "/tools(.*)",
  "/blog(.*)",
  "/sitemap.xml",
  "/robots.txt",
  "/privacy",
  "/terms",
  "/api(.*)",
]);

// An embedded booking page loads in a third-party iframe, where Clerk's
// handshake redirect can't be framed. Booking pages are public, so embeds
// skip Clerk entirely.
function isEmbeddedBooking(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return request.nextUrl.pathname.startsWith("/book/")
    && params.getAll("embed").length === 1
    && params.get("embed") === "1";
}

const withClerk = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
  if (request.nextUrl.pathname.startsWith("/book/")) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    return response;
  }
});

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  // The homepage doesn't use Clerk. Ad visitors get the headline matching
  // their ad, served from a static page while the address bar keeps "/".
  if (request.nextUrl.pathname === "/") {
    const variant = variantForAd(request.nextUrl.searchParams.get("utm_content"));
    if (!variant) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/lp/${variant}`;
    return NextResponse.rewrite(url);
  }
  if (isEmbeddedBooking(request)) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", "frame-ancestors *");
    return response;
  }
  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
