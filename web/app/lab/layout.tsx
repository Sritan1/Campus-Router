import type { Metadata } from "next";
import type { ReactNode } from "react";

import { shareCard } from "@/lib/share";

export const metadata: Metadata = {
  title: "Algorithm lab",
  ...shareCard(
    "Algorithm lab · Campus Router",
    "Race Dijkstra, A*, BFS and bidirectional Dijkstra on the same campus trip, and watch each search explore",
    "/lab",
  ),
};

export default function LabLayout({ children }: { children: ReactNode }) {
  return children;
}
