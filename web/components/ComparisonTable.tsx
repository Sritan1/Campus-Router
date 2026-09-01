"use client";

import type { RouteReply } from "@/lib/api";
import {
  ALGORITHM_COLORS,
  ALGORITHM_LABELS,
  count,
  distance,
  duration,
  runtime,
} from "@/lib/format";

type Props = {
  reply: RouteReply;
  selected: string;
  onClose: () => void;
};

export default function ComparisonTable({ reply, selected, onClose }: Props) {
  return (
    <section className="table-wrap">
      <div className="table-head">
        <h3 className="table-title">Route comparison</h3>
        <button type="button" className="link-button" onClick={onClose}>
          close ▾
        </button>
      </div>

      <div className="table-scroll">
        <table className="compare">
          <thead>
            <tr>
              <th>Algorithm</th>
              <th>Path length</th>
              <th>Est. time</th>
              <th>Nodes visited</th>
              <th>Runtime</th>
            </tr>
          </thead>
          <tbody>
            {reply.results.map((result) => (
              <tr
                key={result.algorithm}
                className={result.algorithm === selected ? "is-active" : ""}
              >
                <td>
                  <span
                    className="lane-swatch"
                    style={{ background: ALGORITHM_COLORS[result.algorithm] }}
                  />
                  {ALGORITHM_LABELS[result.algorithm]}
                </td>
                {result.status === "ok" ? (
                  <>
                    <td>{distance(result.distanceM)}</td>
                    <td>{duration(result.estSeconds)}</td>
                    <td>{count(result.nodesVisited)}</td>
                    <td>{runtime(result.runtimeUs)}</td>
                  </>
                ) : (
                  <td colSpan={4} className="table-empty">
                    no route with these settings
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="table-foot">
        Runtime is the engine's own measured time. The exploration animation runs
        longer than that on purpose so it can be watched.
      </p>
    </section>
  );
}
