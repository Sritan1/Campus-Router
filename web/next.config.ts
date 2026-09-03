import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,

  // dev and build both write to .next, and on windows they fight over it
  // and leave the dev server with a broken type cache. set NEXT_DIST_DIR
  // to check a build without disturbing a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // the floating dev badge sits in the bottom left corner, right on top
  // of the fourth race panel. it only ever shows in dev.
  devIndicators: false,
};

export default config;
