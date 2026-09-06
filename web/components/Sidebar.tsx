"use client";

import type {
  AlgorithmName,
  AlgorithmResult,
  RouteMode,
  RouteReply,
} from "@/lib/api";
import {
  ALGORITHM_COLORS,
  ALGORITHM_LABELS,
  ALGORITHM_NOTES,
  MODE_LABEL,
  count,
  distance,
  duration,
  runtime,
} from "@/lib/format";
import { barFraction } from "@/lib/playback";
import type { AppState } from "@/lib/state";

const ALL: AlgorithmName[] = ["dijkstra", "astar", "bfs", "bidirectional"];

// the same three modes navigate offers, named for what they mean here.
// in the lab this is not how you would like to get somewhere, it is
// which number the four algorithms are minimising.
// names come from MODE_LABEL so the lab and navigate cannot drift apart.
// only the notes are the lab's own, since it explains the cost model
// rather than how you would like to get there.
const COST_MODELS: { id: RouteMode; note: string }[] = [
  { id: "shortest", note: "Plain distance, nothing weighted up or down." },
  { id: "accessible", note: "Steps removed from the graph, rough surfaces penalised." },
  {
    id: "weather",
    note: "Measured winter penalties, applied only when the ground is likely frozen.",
  },
];

function CostModelPicker({
  mode,
  onMode,
}: {
  mode: RouteMode;
  onMode: (mode: RouteMode) => void;
}) {
  const active = COST_MODELS.find((m) => m.id === mode) ?? COST_MODELS[0];
  return (
    <div className="cost-model">
      <div className="cost-model-head">Cost model</div>
      <div className="segmented" role="group" aria-label="cost model">
        {COST_MODELS.map((m) => (
          <button
            type="button"
            key={m.id}
            className={mode === m.id ? "is-active" : ""}
            aria-pressed={mode === m.id}
            onClick={() => onMode(m.id)}
          >
            {MODE_LABEL[m.id]}
          </button>
        ))}
      </div>
      <p className="panel-hint">{active.note}</p>
    </div>
  );
}

type Props = {
  state: AppState;
  progress: number;
  onPickAlgorithm: (algorithm: AlgorithmName) => void;
  onToggleRace: () => void;
  onRaceAll: () => void;
  onSelectLane: (algorithm: AlgorithmName) => void;
  onRun: () => void;
  onReset: () => void;
  onShowShortest: () => void;
  onSkip: () => void;
  onReplay: () => void;
  onToggleTable: () => void;
  onMode: (mode: RouteMode) => void;
  canRun: boolean;
};

function IdlePanel(props: Props) {
  const { state, onPickAlgorithm, onToggleRace, onRun, canRun } = props;
  return (
    <div className="panel panel-stack">
      <div className="panel-scroll">
        <h2 className="panel-title">Pick an algorithm</h2>
        <p className="panel-hint">Pick one, or race all four</p>

        <div className="cards">
          {ALL.map((name) => {
            // racing means no single algorithm is the chosen one
            const active = !state.race && state.algorithm === name;
            return (
              <button
                type="button"
                key={name}
                className={`card${active ? " is-active" : ""}`}
                onClick={() => onPickAlgorithm(name)}
                aria-pressed={active}
              >
                <span className="card-text">
                  <span className="card-name">{ALGORITHM_LABELS[name]}</span>
                  <span className="card-note">{ALGORITHM_NOTES[name]}</span>
                </span>
                {active ? (
                  <span className="card-tick" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}

          <button
            type="button"
            className={`card race-toggle${state.race ? " is-active" : ""}`}
            onClick={onToggleRace}
            aria-pressed={state.race}
          >
            <span className="card-text">
              <span className="card-name">Race mode</span>
              <span className="card-note">Run all four on the same pair</span>
            </span>
            <span className={`switch${state.race ? " is-on" : ""}`} />
          </button>
        </div>

        <CostModelPicker mode={state.mode} onMode={props.onMode} />
      </div>

      <div className="panel-foot">
        <button
          type="button"
          className="primary"
          onClick={onRun}
          disabled={!canRun}
        >
          {state.race ? "Race all four" : "Find route"}
        </button>
        {!canRun ? (
          <p className="panel-hint centered">Pick a start and a destination</p>
        ) : null}
      </div>
    </div>
  );
}

function RunningPanel({ state, progress, onSkip }: Props) {
  const reply = state.reply;

  // before the reply lands there is nothing to measure, so show the
  // plain waiting state rather than empty bars pretending to move
  if (!reply) {
    return (
      <div className="panel">
        <h2 className="panel-title">Running…</h2>
        <div className="skeletons">
          {ALL.map((name) => (
            <div className="skeleton-lane" key={name}>
              <span className="skeleton-name">{ALGORITHM_LABELS[name]}</span>
              <span className="skeleton-bar" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2 className="panel-title">Exploring…</h2>
      <div className="skeletons">
        {reply.results.map((result) => (
          <div className="race-lane" key={result.algorithm}>
            <span className="race-name">{ALGORITHM_LABELS[result.algorithm]}</span>
            <span className="race-track">
              <span
                className="race-fill"
                style={{
                  width: `${barFraction(result, reply.results, progress) * 100}%`,
                  background: ALGORITHM_COLORS[result.algorithm],
                }}
              />
            </span>
            <span className="race-count">
              {count(Math.round(result.nodesVisited * progress))}
            </span>
          </div>
        ))}
      </div>
      <p className="panel-hint">Bars show how much of the graph each one searched</p>

      <button type="button" className="secondary run-button" onClick={onSkip}>
        Skip to results ▸
      </button>
    </div>
  );
}

function NoPathPanel({ onShowShortest }: { onShowShortest: () => void }) {
  return (
    <div className="panel">
      <h2 className="panel-title">Could not find a step free route</h2>
      <p className="empty-body">
        The mapped footpaths offer no way between these buildings without steps.
      </p>
      <button type="button" className="secondary" onClick={onShowShortest}>
        Show the shortest route instead
      </button>
    </div>
  );
}

/// Who won, on the two things worth winning.
///
/// Only shown when there is more than one lane, since a single result
/// is not the fastest of anything.
function Winners({ results }: { results: AlgorithmResult[] }) {
  const ran = results.filter((r) => r.status === "ok");
  if (ran.length < 2) {
    return null;
  }

  const fastest = ran.reduce((best, r) => (r.runtimeUs < best.runtimeUs ? r : best));
  const leanest = ran.reduce((best, r) =>
    r.nodesVisited < best.nodesVisited ? r : best,
  );

  const cards: { label: string; result: AlgorithmResult; value: string }[] = [
    { label: "Fastest", result: fastest, value: runtime(fastest.runtimeUs) },
    {
      label: "Leanest search",
      result: leanest,
      value: `${count(leanest.nodesVisited)} nodes`,
    },
  ];

  return (
    <div className="winners">
      {cards.map((card) => (
        <div className="winner" key={card.label}>
          <span className="section-label">{card.label}</span>
          <span className="winner-who">
            <span
              className="lane-swatch"
              style={{ background: ALGORITHM_COLORS[card.result.algorithm] }}
            />
            {ALGORITHM_LABELS[card.result.algorithm]}
          </span>
          <span className="winner-value">{card.value}</span>
        </div>
      ))}
    </div>
  );
}

function ResultsPanel(props: Props) {
  const { state, onSelectLane, onReset, onShowShortest } = props;
  const reply = state.reply as RouteReply;
  const anyRoute = reply.results.some((result) => result.status === "ok");

  if (!anyRoute) {
    return state.mode === "accessible" ? (
      <NoPathPanel onShowShortest={onShowShortest} />
    ) : (
      <div className="panel">
        <h2 className="panel-title">No route found</h2>
        <p className="empty-body">
          These two buildings are not connected by the mapped path network.
        </p>
        <button type="button" className="secondary" onClick={onReset}>
          New route
        </button>
      </div>
    );
  }

  // bars are scaled against the busiest search, so the widest one fills
  // the track and the rest are read against it
  const busiest = Math.max(
    1,
    ...reply.results.map((r) => (r.status === "ok" ? r.nodesVisited : 0)),
  );

  return (
    <div className="panel panel-results">
      <div className="results-head">
        <h2 className="panel-title">{state.race ? "Race results" : "Result"}</h2>
        {state.race ? <span className="panel-hint">Click a lane</span> : null}
      </div>

      {/* one scroll for the whole lot. giving the lanes their own made
          a stubby inner scrollbar that hid the last card by a sliver. */}
      <div className="results-body">
        <Winners results={reply.results} />

        {state.race ? (
          <p className="section-label lanes-head">All four lanes</p>
        ) : null}

        <div className="lanes">
        {reply.results.map((result) => {
          const active = result.algorithm === state.selected;
          return (
            <button
              type="button"
              key={result.algorithm}
              className={`lane${active ? " is-active" : ""}`}
              onClick={() => onSelectLane(result.algorithm)}
              disabled={result.status !== "ok"}
            >
              <span className="lane-top">
                <span className="lane-name">
                  <span
                    className="lane-swatch"
                    style={{ background: ALGORITHM_COLORS[result.algorithm] }}
                  />
                  {ALGORITHM_LABELS[result.algorithm]}
                </span>
                <span className="lane-runtime">{runtime(result.runtimeUs)}</span>
              </span>
              <span className="lane-stats">
                {result.status === "ok"
                  ? `${distance(result.distanceM)} · ${duration(result.estSeconds)} · ${count(result.nodesVisited)} nodes`
                  : "No route with these settings"}
              </span>
              {result.status === "ok" ? (
                <span className="lane-track">
                  <span
                    className="lane-fill"
                    style={{
                      width: `${(result.nodesVisited / busiest) * 100}%`,
                      background: ALGORITHM_COLORS[result.algorithm],
                    }}
                  />
                </span>
              ) : null}
            </button>
          );
        })}
        </div>
      </div>

      <div className="results-foot">
        {reply.cost.notes.map((note) => (
          <p className="foot-note" key={note}>
            {note}
          </p>
        ))}

        <div className="foot-buttons">
          {/* one algorithm has nothing to compare against, so the useful
              offer there is to race the other three */}
          {state.race ? (
            <button type="button" className="secondary" onClick={props.onToggleTable}>
              {state.showTable ? "Show Maps" : "Compare table"}
            </button>
          ) : (
            <button type="button" className="secondary" onClick={props.onRaceAll}>
              Race all four
            </button>
          )}
          <button type="button" className="primary" onClick={props.onReplay}>
            Replay
          </button>
        </div>
        <button type="button" className="secondary" onClick={onReset}>
          New route
        </button>
      </div>
    </div>
  );
}

export default function Sidebar(props: Props) {
  if (props.state.error) {
    return (
      <div className="panel">
        <h2 className="panel-title">Something went wrong</h2>
        <p className="empty-body">{props.state.error}</p>
        <button type="button" className="primary" onClick={props.onRun}>
          Try again
        </button>
      </div>
    );
  }

  if (props.state.phase === "running") {
    return <RunningPanel {...props} />;
  }
  if (props.state.phase === "results" && props.state.reply) {
    return <ResultsPanel {...props} />;
  }
  return <IdlePanel {...props} />;
}
