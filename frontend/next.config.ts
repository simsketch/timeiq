import { createHash } from "node:crypto";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Read by @clerk/nextjs: load this exact clerk-js build instead of redirecting from @5.
  // shortcut: pinned by hand; when upgrading Clerk, bump this and CLERK_CHUNK_HASH in src/lib/clerk-js.ts.
  env: {
    NEXT_PUBLIC_CLERK_JS_VERSION: "5.128.3",
    // Clerk suffixes its cookies per instance; public pages read only the live instance's cookie.
    NEXT_PUBLIC_CLERK_COOKIE_SUFFIX: createHash("sha1").update(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "").digest("base64url").slice(0, 8),
  },
  async headers() {
    return [{
      // Only embedded booking pages (?embed=1, handled in middleware) may be framed elsewhere.
      source: "/((?!book/|oauth/consent).*)",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ],
    }, {
      source: "/oauth/consent",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    }];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
