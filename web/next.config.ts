import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,

  // dev and build fight over .next on windows, so NEXT_DIST_DIR lets a build
  // check run beside a dev server
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // the dev badge sits on top of a race panel, and only ever shows in dev
  devIndicators: false,
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
