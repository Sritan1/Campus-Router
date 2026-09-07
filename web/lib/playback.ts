// Timing for the exploration animation.

import type { AlgorithmResult } from "./api";

// The engine answers in well under a millisecond, so this duration is
// presentation, not compute. It exists so the search can be watched.
// The runtime column reports the real measured time.
export const PLAYBACK_MS = 4200;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/// How much of its own exploration an algorithm has drawn at time p.
///
/// Everything plays on one shared clock so the panel really is showing
/// who explores less, not who happens to have a shorter list.
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

/// Bar length is measured engine time against whoever took the longest,
/// so the shortest bar is the algorithm that finished first.
///
/// It used to be nodes explored, which hid the more interesting result.
/// On a cross campus race bfs settles the most nodes of anyone and is
/// still the fastest, because a plain queue is cheaper than a heap.
export function barFraction(
  result: AlgorithmResult,
  results: AlgorithmResult[],
  progress: number,
): number {
  const slowest = Math.max(...results.map((r) => r.runtimeUs), 1);
  return clamp((result.runtimeUs * clamp(progress)) / slowest);
}
