"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { fetchGraphMeta } from "@/lib/api";
import { MODE_LABEL } from "@/lib/format";

// the four lane colours for the lab key
const LANES = ["#e0762f", "#3b7fc4", "#4c9d63", "#8fb2d4"];

export default function About() {
  // the date comes off the graph, and is left out if the request fails
  const meta = useQuery({ queryKey: ["graph-meta"], queryFn: fetchGraphMeta });
  const pulled = meta.data?.extracted ?? null;

  return (
    <div className="about-page">
      {/* the same header shell, so the brand sits in the same place on every page */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <b />
            <s />
          </span>
          <span className="brand-stack">
            <span className="brand-word">
              <span>Campus</span>
              <span> Router</span>
            </span>
            <span className="brand-links">
              <Link className="mode-link" href="/">
                Back to routing
              </Link>
            </span>
          </span>
        </div>
      </header>

      <div className="about-body">
        <div className="bento">
          {/* five of six columns, since full width runs far past the text */}
          <div className="c5 about-card about-hero">
            <div>
              <div className="about-eyebrow about-mono">ABOUT</div>
              <h1>Campus Router</h1>
              <p className="about-hero-lede">
                Walking routes and reachable areas across the UIC campus, and a
                lab that races four pathfinding algorithms.
              </p>
            </div>
            <div className="about-affil">
              <span className="about-mono">NO AFFILIATION</span>
              <span>
                A personal project, not affiliated with or endorsed by the
                University of Illinois Chicago.
              </span>
            </div>
          </div>

          <div className="c6 about-rule">
            <span className="about-rule-num about-mono">01</span>
            <h2>What it does</h2>
            <span className="about-rule-line" />
          </div>

          <div className="c3 about-card">
            <div className="about-card-head">
              <span className="about-card-title">Route</span>
            </div>

            <div className="about-mode">
              <span className="about-swatch" aria-hidden="true" />
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* named from MODE_LABEL, like the picker */}
                <div className="about-mode-key about-mono">{MODE_LABEL.shortest}</div>
                <p>
                  The quickest way between two buildings, with a walking time and
                  turn by turn directions.
                </p>
              </div>
            </div>

            <div className="about-mode">
              <span className="about-swatch is-stepfree" aria-hidden="true" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="about-mode-key about-mono">{MODE_LABEL.accessible}</div>
                <p>
                  Avoids stairs completely and favors smooth paths over rough
                  ground like gravel where possible. Relies on OpenStreetMap,
                  where stairs are mapped much more reliably than ramps, so
                  it&rsquo;s a strong guide rather than a guarantee.
                </p>
              </div>
            </div>

            <div className="about-mode">
              <span className="about-swatch is-winter" aria-hidden="true" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="about-mode-key about-mono">{MODE_LABEL.weather}</div>
                <p>
                  Factors in the current weather, avoiding paths slowed by ice
                  and snow. Based on walking speeds measured in a peer-reviewed
                  study of winter pedestrians (see Sources below).
                </p>
              </div>
            </div>
          </div>

          <div className="c3 about-stack">
            <div className="about-card">
              <div className="about-card-head">
                <span className="about-card-title">
                  <span className="about-key-reach" aria-hidden="true" />
                  Reach
                </span>
              </div>
              <p className="about-copy">
                Shades everywhere reachable on foot from one building within a
                chosen time, and lists every building inside that area. Follows
                the footpath network instead of a simple circle, so it stretches
                along paths and stops where they end.
              </p>
            </div>

            <div className="about-card">
              <div className="about-card-head">
                <span className="about-card-title">
                  <span className="about-key-lanes" aria-hidden="true">
                    {LANES.map((colour) => (
                      <span key={colour} style={{ background: colour }} />
                    ))}
                  </span>
                  The lab
                </span>
              </div>
              <p className="about-copy">
                A visual comparison of four pathfinding algorithms and how each
                one works. Dijkstra spreads outward evenly. A* aims for the
                destination using straight-line distance. Bidirectional search
                starts from both buildings and meets in the middle. BFS counts
                path segments rather than distance, so its route can be longer.
                The animation shows how much of the campus each one explores,
                and the results compare the time and work each search took.
              </p>
            </div>
          </div>

          <div className="c6 about-rule">
            <span className="about-rule-num about-mono">02</span>
            <h2>Credits and disclaimers</h2>
            <span className="about-rule-line" />
          </div>

          <div className="c3 about-card">
            <div className="about-label-head about-mono">SOURCES</div>
            <div className="about-rows">
              <div className="about-row">
                <span className="about-row-key about-mono">MAP DATA</span>
                <span className="about-row-value">
                  Paths, buildings and entrances from{" "}
                  <a href="https://www.openstreetmap.org/copyright">
                    OpenStreetMap
                  </a>
                  {pulled ? <>, as of {pulled}</> : null}.
                </span>
              </div>
              <div className="about-row">
                <span className="about-row-key about-mono">MAP TILES</span>
                <span className="about-row-value">
                  Rendered by{" "}
                  <a href="https://www.maptiler.com/">MapTiler</a> from the same
                  OpenStreetMap data.
                </span>
              </div>
              <div className="about-row">
                <span className="about-row-key about-mono">WEATHER</span>
                <span className="about-row-value">
                  Current conditions from{" "}
                  <a href="https://openweathermap.org/">OpenWeather</a>.
                </span>
              </div>
              <div className="about-row">
                <span className="about-row-key about-mono">RESEARCH</span>
                <span className="about-row-value">
                  Winter walking speeds from Fossum &amp; Ryeng (2021),{" "}
                  <a href="https://doi.org/10.1016/j.trd.2021.102934">
                    &ldquo;The walking speed of pedestrians on various pavement
                    surface conditions during winter,&rdquo;
                  </a>{" "}
                  in <em>Transportation Research Part D</em>.
                </span>
              </div>
            </div>
          </div>

          <div className="c3 about-stack">
            <div className="about-card">
              <div className="about-label-head about-mono">PRIVACY</div>
              <div className="about-privacy-body">
                <p>
                  No accounts, analytics or cookies. Map tiles come from
                  MapTiler.
                </p>
              </div>
            </div>

            <div className="about-card about-warranty">
              <div className="about-label-head about-mono">NO WARRANTY</div>
              <div className="about-warranty-body">
                Provided as is. Routes come from incomplete public map data and
                may be wrong. Check accessibility information against the
                university&rsquo;s own guidance.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
