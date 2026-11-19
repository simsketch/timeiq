import type { NextConfig } from "next";
import { CLERK_JS_VERSION } from "./src/lib/clerk-js";

const nextConfig: NextConfig = {
  // Read by @clerk/nextjs: load this exact clerk-js build instead of redirecting from @5.
  env: { NEXT_PUBLIC_CLERK_JS_VERSION: CLERK_JS_VERSION },
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
