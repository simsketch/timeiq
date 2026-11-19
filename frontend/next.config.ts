import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Read by @clerk/nextjs: load this exact clerk-js build instead of redirecting from @5.
  // shortcut: pinned by hand; when upgrading Clerk, bump this and CLERK_CHUNK_HASH in src/lib/clerk-js.ts.
  env: { NEXT_PUBLIC_CLERK_JS_VERSION: "5.128.3" },
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

export default nextConfig;
