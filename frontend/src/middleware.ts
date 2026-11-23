import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { variantForAd } from "@/components/landing/headlines";
import { LOCALE_COOKIE, pickLocale } from "@/i18n/locales";

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
  "/support",
  "/ios",
  "/android",
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

// Route handlers and metadata files live outside app/[locale].
function isUnlocalized(pathname: string) {
  return /^\/(api|trpc)(\/|$)/.test(pathname) || ["/ios", "/android", "/robots.txt", "/sitemap.xml"].includes(pathname);
}

/**
 * Every page renders under app/[locale]. The visitor's language (cookie, then
 * Accept-Language, then English) picks the internal path, so each language is
 * prerendered and cached separately while the address bar stays the same.
 */
function localized(request: NextRequest, pathname = request.nextUrl.pathname) {
  const locale = pickLocale(request.cookies.get(LOCALE_COOKIE)?.value, request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

const isAuthPage = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

const withClerk = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  } else if (isAuthPage(request) && (await auth()).userId) {
    // Already signed in: go where they were headed. Same-site paths only, so this can't redirect off TimeIQ.
    const target = new URL(request.nextUrl.searchParams.get("redirect_url") || "/dashboard", request.url);
    return NextResponse.redirect(target.origin === request.nextUrl.origin ? target : new URL("/dashboard", request.url));
  }
  if (isUnlocalized(request.nextUrl.pathname)) return;
  const response = localized(request);
  if (request.nextUrl.pathname.startsWith("/book/")) {
    response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  }
  return response;
});

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  // The homepage doesn't use Clerk. Ad visitors get the headline matching
  // their ad, served from a static page while the address bar keeps "/".
  if (request.nextUrl.pathname === "/") {
    const variant = variantForAd(request.nextUrl.searchParams.get("utm_content"));
    return localized(request, variant ? `/lp/${variant}` : "/");
  }
  // The clock hero started as a draft at /clock; it is the homepage now.
  if (request.nextUrl.pathname === "/clock") return NextResponse.redirect(new URL("/", request.url), 308);
  if (isEmbeddedBooking(request)) {
    const response = localized(request);
    response.headers.set("Content-Security-Policy", "frame-ancestors *");
    return response;
  }
  return withClerk(request, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|webm)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
