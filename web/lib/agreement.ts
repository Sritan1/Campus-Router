// Working out what the invite into the lab is allowed to claim.
//
// Navigate runs all four algorithms, so it can say something true about
// whether they agreed rather than a generic line.

import { ALGORITHM_LABELS } from "./format";
import type { RouteReply } from "./api";

export type Agreement = {
  headline: string;
  invite: string;
};

export function agreementFor(reply: RouteReply): Agreement | null {
  const found = reply.results.filter((r) => r.status === "ok");
  if (found.length === 0) {
    return null;
  }

  // the engine groups algorithms that landed on the same path
  const groups = reply.pathGroups;
  const biggest = groups.reduce(
    (best, group) => (group.algorithms.length > best ? group.algorithms.length : best),
    0,
  );

  if (groups.length <= 1) {
    return {
      headline: `All ${found.length} algorithms agree on this route`,
      invite: "See how they found it",
    };
  }

  // name the odd one out when exactly one algorithm went its own way
  const loners = groups.filter((g) => g.algorithms.length === 1);
  if (loners.length === 1) {
    const name = ALGORITHM_LABELS[loners[0].algorithms[0]] ?? loners[0].algorithms[0];
    return {
      headline: `${biggest} of ${found.length} agree. ${name} found a different route`,
      invite: "Compare them",
    };
  }

  return {
    headline: `These ${found.length} algorithms found ${groups.length} different routes`,
    invite: "Compare them",
  };
}
