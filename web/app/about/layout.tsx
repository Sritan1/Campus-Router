import type { Metadata } from "next";
import type { ReactNode } from "react";

import { shareCard } from "@/lib/share";

export const metadata: Metadata = {
  title: "About",
  ...shareCard(
    "About · Campus Router",
    "What Campus Router does, where its map and weather data come from, and what it does not promise",
    "/about",
  ),
};

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}
