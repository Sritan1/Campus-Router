"use client";

import type { AlgorithmName, RouteReply } from "@/lib/api";
import {
  ALGORITHM_COLORS,
  ALGORITHM_LABELS,
  ALGORITHM_NOTES,
  count,
  distance,
  duration,
  runtime,
} from "@/lib/format";
import { barFraction } from "@/lib/playback";
import type { AppState } from "@/lib/state";

const ALL: AlgorithmName[] = ["dijkstra", "astar", "bfs", "bidirectional"];

type Props = {
  state: AppState;
  progress: number;
  onPickAlgorithm: (algorithm: AlgorithmName) => void;
  onToggleRace: () => void;
  onSelectLane: (algorithm: AlgorithmName) => void;
  onRun: () => void;
  onReset: () => void;
  onShowShortest: () => void;
  onSkip: () => void;
  onReplay: () => void;
  onToggleTable: () => void;
  canRun: boolean;
};

function IdlePanel({
  state,
  onPickAlgorithm,
  onToggleRace,
  onRun,
  canRun,
}: Props) {
  return (
    <div className="panel">
      <h2 className="panel-title">Pick an algorithm</h2>
      <p className="panel-hint">click a card, or race all four</p>

      <div className="cards">
        {ALL.map((name) => {
          const active = !state.race && state.algorithm === name;
          return (
            <button
              type="button"
              key={name}
              className={`card${active ? " is-active" : ""}`}
              onClick={() => onPickAlgorithm(name)}
            >
              <span className="card-name">{ALGORITHM_LABELS[name]}</span>
              <span className="card-note">{ALGORITHM_NOTES[name]}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={`race-toggle${state.race ? " is-active" : ""}`}
        onClick={onToggleRace}
        aria-pressed={state.race}
      >
        <span>
          <span className="card-name">Race mode</span>
          <span className="card-note">run all four on the same pair</span>
        </span>
        <span className={`checkbox${state.race ? " is-on" : ""}`} />
      </button>

      <button
        type="button"
        className="primary run-button"
        onClick={onRun}
        disabled={!canRun}
      >
        {state.race ? "Race" : "Find route"} ▶
      </button>
      {!canRun ? (
        <p className="panel-hint centered">pick a start and a destination</p>
      ) : null}
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
        <p className="panel-hint">asking the engine</p>
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
      <p className="panel-hint">bar length is nodes explored</p>

      <button type="button" className="secondary run-button" onClick={onSkip}>
        Skip to results ▸
      </button>
    </div>
  );
}

function NoPathPanel({ onShowShortest }: { onShowShortest: () => void }) {
  return (
    <div className="panel">
      <h2 className="panel-title">No step free route</h2>
      <p className="empty-body">
        There is no way between these two buildings that avoids steps, going by
        the paths OpenStreetMap has mapped around campus.
      </p>
      <p className="empty-body">
        Accessibility tagging on campus is incomplete, so a route may exist even
        though the data does not show one.
      </p>
      <button type="button" className="secondary" onClick={onShowShortest}>
        Show the shortest route instead
      </button>
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

  return (
    <div className="panel panel-results">
      <div className="results-head">
        <h2 className="panel-title">{state.race ? "Race results" : "Result"}</h2>
        {state.race ? <span className="panel-hint">click a lane</span> : null}
      </div>

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
                  : "no route with these settings"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="results-foot">
        <p className="foot-note">cost model: {reply.cost.source}</p>
        {reply.cost.notes.map((note) => (
          <p className="foot-note" key={note}>
            {note}
          </p>
        ))}

        {/* the race toggle lives here too, otherwise there is no way back
            to racing without starting over */}
        <button
          type="button"
          className="foot-race"
          onClick={props.onToggleRace}
          aria-pressed={state.race}
        >
          <span className={`checkbox${state.race ? " is-on" : ""}`} />
          Race all four
        </button>

        <div className="foot-buttons">
          <button type="button" className="secondary" onClick={props.onToggleTable}>
            {state.showTable ? "Hide table ▾" : "Compare table ▸"}
          </button>
          <button type="button" className="primary" onClick={props.onReplay}>
            ▶ Replay
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
