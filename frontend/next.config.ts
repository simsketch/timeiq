import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{
      // Only embedded booking pages (?embed=1, handled in middleware) may be framed elsewhere.
      source: "/((?!oauth/consent).*)",
      missing: [{ type: "query", key: "embed", value: "1" }],
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
