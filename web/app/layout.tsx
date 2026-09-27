import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import Providers from "./providers";
import "./globals.css";

// self hosted at build time, so the site makes no third party font requests
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--brand-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--brand-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Campus Router", template: "%s · Campus Router" },
  description:
    "Walking routes across the UIC campus, with four pathfinding algorithms raced against each other",
};

// next adds no viewport tag of its own, and without one a phone lays the page
// out at about 660px and then shrinks the whole thing to fit
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
