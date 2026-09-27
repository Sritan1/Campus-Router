import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "About",
  description:
    "What Campus Router does, where its map and weather data come from, and what it does not promise",
};

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}
