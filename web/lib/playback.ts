// Timing for the exploration animation.

import type { AlgorithmResult } from "./api";

// The engine answers in well under a millisecond, so this duration is
// presentation, not compute. It exists so the comparison is readable.
// The runtime column reports the real measured time.
export const PLAYBACK_MS = 1800;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/// How far through its own exploration an algorithm is at time p.
///
/// Everything plays on one shared clock so the panel really is showing
/// who explores less, not who happens to have a shorter list.
export function pointsShown(result: AlgorithmResult, progress: number): number {
  const total = result.trace?.points.length ?? 0;
  if (total === 0) {
    return 0;
  }
  return Math.max(1, Math.round(total * clamp(progress)));
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

/// Bar length is nodes explored against whoever explored the most, so
/// the shortest bar is the algorithm that did the least work.
export function barFraction(
  result: AlgorithmResult,
  results: AlgorithmResult[],
  progress: number,
): number {
  const busiest = Math.max(...results.map((r) => r.nodesVisited), 1);
  return clamp((result.nodesVisited * clamp(progress)) / busiest);
}
