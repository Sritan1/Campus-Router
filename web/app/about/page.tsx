"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import BrandMark from "@/components/BrandMark";
import { fetchGraphMeta } from "@/lib/api";
import { MODE_LABEL } from "@/lib/format";

import openWeatherLogo from "./openweather-logo.png";

// the four lane colours for the lab key
const LANES = ["#e0762f", "#3b7fc4", "#4c9d63", "#8fb2d4"];

export default function About() {
  // the date comes off the graph, and is left out if the request fails
  const meta = useQuery({ queryKey: ["graphMeta"], queryFn: fetchGraphMeta, staleTime: Infinity });
  const pulled = meta.data?.extracted ?? null;

  return (
    <div className="about-page">
      {/* the same header shell, so the brand sits in the same place on every page */}
      <header className="topbar">
        <div className="brand">
          <BrandMark />
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

      <main className="about-body">
        <div className="bento">
          {/* five of six columns, since full width runs far past the text */}
          <div className="c5 about-card about-hero">
            <div>
              <div className="about-eyebrow about-mono">ABOUT</div>
              <h1>
                <BrandMark />
                <span className="brand-word">
                  <span>Campus</span>
                  <span> Router</span>
                </span>
              </h1>
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
                destination using straight line distance. Bidirectional search
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
                  <a
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    OpenStreetMap
                  </a>
                  {pulled ? <>, as of {pulled}</> : null}.
                </span>
              </div>
              <div className="about-row">
                <span className="about-row-key about-mono">MAP TILES</span>
                <span className="about-row-value">
                  Rendered by{" "}
                  <a href="https://www.maptiler.com/" target="_blank" rel="noopener noreferrer">
                    MapTiler
                  </a>{" "}
                  from the same
                  OpenStreetMap data.
                </span>
              </div>
              <div className="about-row">
                <span className="about-row-key about-mono">WEATHER</span>
                <span className="about-row-value">
                  {/* wording and logo are what the openweather free plan asks for */}
                  Weather data provided by{" "}
                  <a href="https://openweathermap.org/" target="_blank" rel="noopener noreferrer">
                    OpenWeather
                  </a>
                  .
                  <a
                    className="about-credit-logo"
                    href="https://openweathermap.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img src={openWeatherLogo.src} alt="OpenWeather" width={56} height={24} />
                  </a>
                </span>
              </div>
              <div className="about-row">
                <span className="about-row-key about-mono">RESEARCH</span>
                <span className="about-row-value">
                  Winter walking speeds from Fossum &amp; Ryeng (2021),{" "}
                  <a
                    href="https://doi.org/10.1016/j.trd.2021.102934"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    &ldquo;The walking speed of pedestrians on various pavement
                    surface conditions during winter,&rdquo;
                  </a>{" "}
                  in <em>Transportation Research Part D</em>.
                </span>
              </div>
              <div className="about-row">
                <span className="about-row-key about-mono">SOFTWARE</span>
                <span className="about-row-value">
                  Built with open source packages, listed with their{" "}
                  <a href="/third-party-licenses.txt" target="_blank" rel="noopener noreferrer">
                    licences
                  </a>
                  .
                </span>
              </div>
            </div>
          </div>

          <div className="c3 about-stack">
            <div className="about-card">
              <div className="about-label-head about-mono">PRIVACY</div>
              <div className="about-privacy-body">
                <p>
                  No accounts or cookies. Anonymous visit counts through Vercel
                  Web Analytics. Map tiles come from MapTiler.
                </p>
              </div>
            </div>

            <div className="about-card">
              <div className="about-label-head about-mono">NO WARRANTY</div>
              <div className="about-warranty-body">
                Provided as is. Routes come from incomplete public map data and
                may be wrong. Check accessibility information against the
                university&rsquo;s own guidance.
              </div>
            </div>

            <div className="about-card">
              <div className="about-label-head about-mono">DOCUMENTATION</div>
              <div className="about-docs-body">
                <p>More on how Campus Router works is on GitHub.</p>
                <a
                  className="about-github"
                  href="https://github.com/Sritan1/Campus-Router"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Campus Router on GitHub"
                >
                  <svg viewBox="0 0 16 16" width={26} height={26} aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
