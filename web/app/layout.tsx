import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Cormorant_Garamond, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { shareCard, siteUrl } from "@/lib/share";

import Providers from "./providers";
import "./globals.css";

// self hosted at build time, so the site makes no third party font requests
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--brand-sans",
  display: "swap",
});

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["600"],
  style: ["italic"],
  variable: "--brand-display",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--brand-mono",
  display: "swap",
});

const DESCRIPTION =
  "Walking routes across the UIC campus, with four pathfinding algorithms raced against each other";

export const metadata: Metadata = {
  // shared links need absolute urls
  metadataBase: siteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  title: { default: "Campus Router", template: "%s · Campus Router" },
  ...shareCard("Campus Router", DESCRIPTION, "/"),
};

// next adds none of its own, and a phone would lay out at about 660px
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
