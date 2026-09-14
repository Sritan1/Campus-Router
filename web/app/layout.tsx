import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import Providers from "./providers";
import "./globals.css";

// self hosted at build time rather than fetched from google, so the about
// page can still say the site makes no third party requests and mean it.
// the brand and the about page use these, the rest of the app does not.
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
  title: "Campus Router",
  description:
    "Walking routes across the UIC campus, with four pathfinding algorithms raced against each other",
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
