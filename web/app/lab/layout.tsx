import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Algorithm lab",
  description:
    "Race Dijkstra, A*, BFS and bidirectional Dijkstra on the same campus trip, and watch each search explore",
};

export default function LabLayout({ children }: { children: ReactNode }) {
  return children;
}
