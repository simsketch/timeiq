import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/book(.*)",
  "/invoice/(.*)",
  "/pricing",
  "/billing/checkout",
  "/billing/welcome",
  "/imports/undo",
  "/meet/(.*)",
  "/tools(.*)",
  "/blog(.*)",
  "/sitemap.xml",
  "/robots.txt",
  "/privacy",
  "/terms",
  "/api(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
  if (request.nextUrl.pathname.startsWith("/book/")) {
    const response = NextResponse.next();
    const embedded = request.nextUrl.searchParams.getAll("embed").length === 1
      && request.nextUrl.searchParams.get("embed") === "1";
    response.headers.set("Content-Security-Policy", `frame-ancestors ${embedded ? "*" : "'self'"}`);
    if (!embedded) response.headers.set("X-Frame-Options", "SAMEORIGIN");
    return response;
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
