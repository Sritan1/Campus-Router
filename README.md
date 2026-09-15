# Campus Router

Walking routes across the University of Illinois Chicago campus footpath network, with
four pathfinding algorithms you can race against each other on the same start and end
pair.

The routing is real. The graph is 16,149 nodes and 19,392 edges built from a fresh
OpenStreetMap extract covering both campuses, and the engine is a from-scratch C++ service
that answers a cross campus route in about 2 ms.

> **Not affiliated with, endorsed by, or connected to the University of Illinois Chicago.**
> It is a personal project built on public map data.

## What it does

**Navigate** is the routing tool: pick two buildings, get a route, a distance, a walking
time and turn by turn directions. **Reach** answers how far you can walk from a building in
5, 10, 20 or 30 minutes, drawn as a polygon. **The lab** is the same engine with the
covers off, racing Dijkstra, A\*, BFS and bidirectional Dijkstra side by side and animating
how each one explored the graph.

Three routing modes: shortest distance, step free, and a winter mode that reprices snow and
ice.

## Layout

| Folder | What it is |
|---|---|
| `engine/` | C++ pathfinding engine. Own graph structure, own JSON parser, own HTTP server, no dependencies. |
| `api/` | Python FastAPI gateway. Public API, weather, the cost model, directions, and it owns the engine process. |
| `pipeline/` | Offline scripts that build the graph from the Overpass API. Never runs at request time. |
| `web/` | Next.js frontend with Leaflet. |

## Running it locally

Two terminals.

**Backend.** Builds the engine, sets up the virtual environment the first time, and starts
the gateway with hot reload.

```
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
```

**Frontend.**

```
cd web
npm install
npm run dev
```

Then open http://localhost:3000

You do not start the engine yourself. The gateway launches it as a child process, waits for
it to answer its health check, and restarts it if it dies.

### Doing it by hand

```
cd engine
make
cd ..
python -m venv .venv
.venv/Scripts/python -m pip install -r api/requirements.txt
.venv/Scripts/python -m uvicorn api.main:app --port 8000 --reload
```

On macOS or Linux use `.venv/bin/python` instead.

No API key is needed to run any of this. Without an OpenWeatherMap key, winter mode routes
by plain distance and says so on screen.

## How the pieces fit together

```
Browser ──► Next.js (Vercel) ──► FastAPI gateway ──http──► C++ engine
                                 owns secrets,     127.0.0.1   graph in memory
                                 weather cache,
                                 rate limit
```

The gateway owns the engine process. It starts it on loopback, blocks until it answers,
forwards its output into the gateway log, and restarts it with backoff if it exits.
`/api/health` reports engine state as well as its own, so a half dead service cannot report
itself as fine. The engine binds `127.0.0.1` only and is never reachable from outside.

Routing costs are class-keyed. Every edge gets a `class_key` at pipeline time, and the
engine applies a small `(class, weather) → multiplier` table in constant time rather than
scoring edges per request.

## Testing

| Suite | Covers |
|---|---|
| `engine/` C++ tests | the four algorithms, the JSON parser, the graph loader, and a property test asserting Dijkstra, A\* and bidirectional agree on cost over randomised graphs |
| `api/` pytest | the gateway API, the cost model, directions merging, the rate limiter, the weather cache |
| `pipeline/` pytest | extraction, the graph build, validation |
| `web/` vitest | the pure modules in `lib/`, mostly URL handling, formatting and geometry |
| `scripts/smoke.ps1` | end to end against a live stack, including the three way agreement invariant on real building pairs |
| `web/scripts/browser-check.mjs` | a real browser, layout at two widths and the states that only appear on screen |

**What is not covered: there are no unit tests for any React component or either page.**
The component layer is exercised only by the browser checks. That is a deliberate boundary
rather than an oversight, but it is worth knowing before reading a test count as coverage.

## What this cannot tell you

The app makes claims about a real campus from incomplete public data. The ones worth
stating plainly:

- **Step free routing reflects the map, not the ground.** OpenStreetMap has 27 stairways on
  this campus and exactly one wheelchair ramp and no lifts, so every level change in the
  graph is stairs by construction. That is a fact about map coverage, not about the
  university. Where the app says there is no step free route, it means none to the entrance
  it knows about.
- **A route may walk you through a building.** Buildings are single points linked to nearby
  path nodes, and nothing stops a route entering by one link and leaving by another. Nothing
  models opening hours, lifts or indoor corridors.
- **Reach measures the mapped network, not walking distance.** Near the edge of the extract
  the shape is clipped by where the download stopped rather than by the time budget.
- **Directions are as specific as the tags allow.** 421 of 947 crossings resolve to a street
  name; only 14 of 2,679 footpaths are named at all; there are no landmarks. So a step says
  a heading and a distance rather than prose.
- **Winter surface state is inferred, not observed.** The multipliers are measured and
  cited, but whether there is ice on a given path is a guess from a temperature and a
  condition word. See []().
- **Distances read in metres under a kilometre and miles above.** A cross campus route says
  miles while a same campus one says metres. That is deliberate, and it exists because
  two-decimal miles once hid a 6 m difference between two algorithms.

## The cost model

Winter multipliers come from Fossum & Ryeng (2021), *Transportation Research Part D*
97:102934, an OLS model of walking speed against surface and temperature (n = 2,498,
R² = 0.539), using their university-trip row. Two of their results are counter-intuitive
and both shaped the feature: **precipitation was not significant**, so this is a snow and
ice feature rather than a rain one, and **colder means slightly faster**.

Every multiplier is ≥ 1.0 by construction, which is what makes the A\* heuristic admissible
without clamping.

**There is no machine learning in this project.** A surface-imputation model was built and
measured against a held-out baseline and then cut, because rough surfaces reach the router
through one narrow door and the model repriced 0 m of 162,688 m of network. Accuracy was
the wrong bar; metres repriced was the real one. `requirements.txt` contains no
scikit-learn. The full write-up is in []().

## The exploration animation

Race playback runs about four seconds, and **that duration is presentation, not compute**.
The engine answers in well under a millisecond, so an honest real time animation would be a
single flash of colour and you would learn nothing from it.

Everything it draws is real. It draws **edges along actual footpaths** — every edge from a
settled node back to a node already reached — so what you see is the explored network
rather than the tree of best routes. Nothing is thinned on the way to the browser; only the
engine caps trace size, and it reports when it does. All four lanes play on one shared
clock, and the runtime column reports the engine's own measured microseconds separately
from the playback.

## One local correction to the map

`pipeline/patches.json` declares hand-checked corrections applied on top of the
OpenStreetMap download. Today it holds exactly one: a 15.8 m footway at Student Center East
Tower, joining an entrance node and a footpath node that both already exist upstream.
Without it the building could only be reached up a 1.5 m staircase and had no step free
route from anywhere on campus. It was confirmed on the ground, no geometry was traced, and
a patch removes itself automatically if OpenStreetMap ever gains the path.

The better fix is upstream in OpenStreetMap, at which point the patch can be deleted.

## Security

The public API is rate limited per caller, the request body is capped, and the engine is
unreachable from outside the container. Two things are worth being precise about, because
both were asserted for a long time before they were true:

- **The rate limiter is hand rolled** in `api/main.py`, not slowapi. slowapi's middleware
  looks the route handler up in `app.routes` and this FastAPI version wraps everything added
  by `include_router` in an object with no endpoint on it, so every router route was silently
  exempt. It is tested now by sending more requests than the limit and checking where the
  429 lands.
- **`TRUST_PROXY_HEADERS` must be set on the deployment, not in the image.** Whether an
  `X-Forwarded-For` header can be trusted is a fact about what is running in front of the
  container. See `api/README.md`.

## Deployment

Not deployed yet, and deliberately left until last. A `Dockerfile` and `railway.json`
describe the intended shape — one container holding the gateway and the engine, with Vercel
serving the frontend — but **neither has been built**, so treat them as unverified.

## Data and licensing

Map data is © OpenStreetMap contributors, licensed under the
[Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). The graph files
under `api/data/` are a **derivative database** and carry the same licence — see
[LICENSE-DATA](LICENSE-DATA).

Source code is MIT licensed — see [LICENSE](LICENSE).

Map tiles come from the OpenStreetMap Foundation's public tile server. Their
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/) asks that it not
be the basemap for production applications. This is a low traffic demo with attribution in
place, and the race grid softens its four-maps-at-once load by sharing bounds so most tiles
come from cache, but it is goodwill rather than an entitlement and it should be said out
loud rather than quietly relied on.

Weather comes from [OpenWeather](https://openweathermap.org/). Leaflet is BSD 2-Clause,
react-leaflet is Hippocratic 2.1, and the IBM Plex fonts are SIL OFL 1.1, self-hosted with the
site rather than loaded from Google. React, Next.js, React Query and the remaining
dependencies are MIT or BSD. No analytics, no cookies, no trackers — the only third-party
request the page makes is for map tiles.

## Relationship to prior coursework

This project revisits the problem domain of a UIC course assignment (`proj6-osm`) that
implemented Dijkstra's algorithm over a campus footpath graph. That assignment shipped with
instructor provided server and frontend scaffolding.

This is a separate build. The graph structure, the four algorithms, the HTTP service, the
JSON parser, the API, the data pipeline, the frontend, the tests and the tooling here are
written from scratch. What carries over is limited to public knowledge: the great circle
distance formula, general familiarity with Dijkstra's algorithm, and the idea of linking
building centres to nearby footpath nodes.

The engine vendors no third-party JSON or HTTP library; both are written for this project,
deliberately, because the coursework used off-the-shelf ones.

## License

Code: MIT, see [LICENSE](LICENSE).
Data: ODbL, see [LICENSE-DATA](LICENSE-DATA).
