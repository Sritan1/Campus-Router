import type { AlgorithmResult } from "./api";

// presentation, not compute. the engine answers in under a millisecond, and the
// runtime column shows the real time
export const PLAYBACK_MS = 4200;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// scaled per algorithm, so all four finish together. speed is the bars, not this
export function edgesShown(result: AlgorithmResult, progress: number): number {
  const total = result.trace?.edges.length ?? 0;
  if (total === 0) {
    return 0;
  }
  return Math.round(total * clamp(progress));
}

export function clamp(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

// engine time, not nodes. bfs settles the most nodes yet finishes first, since a
// plain queue is cheaper than a heap
export function barFraction(
  result: AlgorithmResult,
  results: AlgorithmResult[],
  progress: number,
): number {
  const slowest = Math.max(...results.map((r) => r.runtimeUs), 1);
  return clamp((result.runtimeUs * clamp(progress)) / slowest);
}
