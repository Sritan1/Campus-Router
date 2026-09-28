<h1 align="center"><img src="web/app/icon.svg" width="36" height="0" alt=""> Campus Router <img src="web/app/icon.svg" width="36" height="36" align="absmiddle" alt=""></h1>

**Live demo:** [campusrouter.com](https://campusrouter.com)

Campus Router is a walking map for the University of Illinois Chicago. Pick two buildings and it shows you the quickest way to walk between them, along with how long it takes and directions to follow. Two additional modes adapt the route to the person and the season: Accessible avoids every staircase on the map, for anyone using a wheelchair or otherwise unable to take stairs, and Weather adjusts for snow and ice based on current conditions. A separate Reach view outlines the area you can cover on foot within 5 to 30 minutes.

Alongside the routing tool is a lab for comparing pathfinding algorithms. It runs Dijkstra, A\*, BFS and bidirectional Dijkstra on the same trip, then replays each search on its own map with its measured runtime.

![A route from SEO to Lecture Center C with walking directions](docs/screenshots/navigate.png)

## Features

### Accessible

<img align="right" width="56%" hspace="16" src="docs/screenshots/accessible.png" alt="The trip from ERF to SES taking a longer step free route">

<br>
<br>

Routes around every staircase and penalizes rough ground such as gravel and cobbles. About one building pair in ten ends up with a longer walk.

<br>
OpenStreetMap maps stairs much better than ramps. A missing step free route can simply mean a missing path, so check anything important with the university.

<br clear="all">

### Weather

Factors in snow and ice that slow walking down. The figures come from a research paper by Fossum and Ryeng (2021), who timed pedestrians walking on winter pavement. The paper found no measurable effect from rain, so the mode accounts for snow and ice rather than bad weather in general.

<img align="right" width="56%" hspace="16" src="docs/screenshots/weather.png" alt="Weather mode on a snowy reading, timing the walk from ARC to SES at nine minutes">

| Surface | Walking time |
|---|---|
| Bare pavement | Baseline, 1.607 m/s |
| Compact snow | 7% longer |
| Loose snow | 9% longer |
| Gritted ice | 10% longer |
| Clean ice | 19% longer |

On a snowy reading the 816 m walk from ARC to SES is timed at nine minutes instead of eight.

<br clear="all">

### Reach

<img align="right" width="56%" hspace="16" src="docs/screenshots/reach.png" alt="Everywhere within a 10 minute walk of SES">

<br>
<br>

Shades everywhere you can walk to from a building within 5, 10, 20 or 30 minutes.
The outline follows real footpaths instead of drawing a circle.

<br>
It uses the same algorithm that the routing modes use, but stops at the chosen walking time instead of at a destination.

<br clear="all">

### The lab

Shows how differently four pathfinding algorithms search for the same route. You can watch all four side by side and replay any of them.

Here is how the four compare on the walk from ARC to SES:

| Algorithm | What it finds | How much of the map it explored |
|---|---|---|
| Dijkstra | the shortest route, spreading out evenly | 2,991 nodes |
| A\* | the shortest route, aiming at the destination | 839 nodes |
| BFS | the route with the fewest segments, regardless of length | 4,992 nodes |
| Bidirectional Dijkstra | the shortest route, searching from both ends | 1,790 nodes |

Three of them agree on an 816 m walk. BFS finds one 258 m longer, because it counts path segments rather than distance.

![The lab racing four algorithms on one trip, each search drawn on its own map with the runtimes beside them](docs/screenshots/lab.png)

On a longer trip across both campuses, BFS explores more of the map than Dijkstra, 13,316 nodes against 12,898, and still finishes about three times faster, because a plain queue costs less per node than a priority queue.

## Tech stack

| Layer | Built with |
|---|---|
| Engine | C++20, compiled with g++ through a plain Makefile |
| Gateway | Python, FastAPI, httpx |
| Frontend | TypeScript, Next.js, React, React Query, Leaflet |
| Map data | OpenStreetMap, pulled through the Overpass API and processed offline in Python |
| Weather | OpenWeatherMap |
| Testing | A hand written C++ test harness, pytest, Vitest, Playwright, GitHub Actions |
| Hosting | Vercel for the frontend and a single Railway container for the backend |

## Architecture

```mermaid
flowchart LR
  browser["Browser"] --> web["Next.js frontend<br/>(Vercel)"]
  web -->|"JSON over HTTPS"| gateway
  subgraph container["One container (Railway)"]
    gateway["FastAPI gateway<br/>cost model, weather cache,<br/>directions, rate limit"] -->|"HTTP on 127.0.0.1"| engine["C++ engine<br/>graph held in memory"]
  end
  gateway --> owm["OpenWeatherMap"]
  overpass["Overpass API"] -.->|"offline pipeline"| data[("api/data<br/>graph.json, graph.campus")]
  data -.->|"loaded at startup"| gateway
  data -.->|"loaded at startup"| engine
```

Python scripts build the map ahead of time. They download both campuses from OpenStreetMap, split the paths into short edges, and link each building to the network through its entrances.

When you ask for a route, the gateway looks up the two buildings, checks the weather if the mode needs it, and hands the search to the engine. The engine is written in C++ with its own JSON parser and HTTP server, and a route across both campuses takes about 2 ms. Both run in one container, and the gateway restarts the engine if it ever crashes.

## Validation

Routes for 40 building pairs were compared against OSRM, an independent router that reads the same OpenStreetMap data. The median difference is under 1%, and 31 of the 40 pairs agree within 5%.

Because both routers read the same data, mistakes in the map itself had to be checked in person. That confirmed the underpass beneath Science and Engineering South has no step free way through, and turned up a step free entrance at Student Center East Tower that the map was missing, which has since been added.

Each part has its own tests, and CI runs them on every push to `main`. A\* and bidirectional Dijkstra are easy to get subtly wrong while still producing believable routes, so a property test runs all three shortest route searches on 200 random maps and fails if they ever disagree.

## Project structure

```
.
├── engine/                 # C++ routing engine, no dependencies
│   ├── include/campus/     #   Headers: graph, algorithms, cost model, JSON, service
│   ├── src/                #   Graph storage, four algorithms, JSON parser, HTTP server
│   ├── cli/                #   Offline harness for routing by hand
│   ├── tests/              #   Hand written test harness and suites
│   └── Makefile
├── api/                    # FastAPI gateway, owns the engine process
│   ├── core/               #   Settings, read from api/.env
│   ├── routes/             #   The public endpoints
│   ├── services/           #   Cost model, weather cache, directions, engine client
│   ├── data/               #   graph.json for the gateway, graph.campus for the engine
│   └── tests/
├── pipeline/               # Offline map build, never runs at request time
│   ├── extract.py          #   Pulls both campuses from Overpass
│   ├── transform.py        #   Splits ways into tagged edges, links buildings
│   ├── validate.py         #   Checks the result before it ships
│   └── patches.json        #   The one hand verified map fix
├── web/                    # Next.js site
│   ├── app/                #   Navigate, the lab, the about page
│   ├── components/         #   Map panes, canvas renderer, panels
│   ├── lib/                #   URL state, formatting, geometry, the logic the tests cover
│   └── scripts/            #   Browser checks and screenshot capture
└── scripts/                # Dev server, smoke checks, OSRM comparison, step free sweep
```

The first four each have their own README with more detail: [engine](engine/README.md), [gateway](api/README.md), [pipeline](pipeline/README.md), [web](web/README.md).

## Running locally

You'll need Python 3.12 or newer, Node.js 22 or newer, a C++20 compiler, and `make` on macOS or Linux. A weather key is optional, and without one, weather mode routes by distance and says so.

On Windows, this builds the engine and starts the backend:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
```

On macOS or Linux:

```bash
make -C engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements-dev.txt
python -m uvicorn api.main:app --port 8000 --reload
```

The background map needs a free [MapTiler](https://www.maptiler.com/) key. Copy `web/.env.example` to `web/.env.local` and add it as `NEXT_PUBLIC_MAPTILER_KEY`. Without it, routing still works, but the map behind it stays blank.

Then start the frontend in a second terminal and open http://localhost:3000:

```bash
cd web
npm install
npm run dev
```

To turn on weather mode, copy `api/.env.example` to `api/.env` and add an `OPENWEATHER_API_KEY`. To run the tests:

```bash
make -C engine test
python -m pytest api/tests pipeline/tests -q
cd web && npm run typecheck && npm test
```

To rebuild the map from a fresh OpenStreetMap download:

```bash
python -m pipeline.extract --refresh
python -m pipeline.transform
python -m pipeline.validate
```

## Credits and license

- The map is built from [OpenStreetMap](https://www.openstreetmap.org/). Map data © OpenStreetMap contributors, under the [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). The files in `api/data/` are built from it and carry the same license. See [LICENSE-DATA](LICENSE-DATA).
- Map tiles are rendered by [MapTiler](https://www.maptiler.com/) from that same OpenStreetMap data. Weather comes from [OpenWeather](https://openweathermap.org/).
- Winter walking speeds are from Fossum and Ryeng (2021), [The walking speed of pedestrians on various pavement surface conditions during winter](https://doi.org/10.1016/j.trd.2021.102934), *Transportation Research Part D*.
- Built with Leaflet (BSD 2-Clause), react-leaflet (Hippocratic 2.1), and IBM Plex (SIL Open Font License 1.1). The other runtime dependencies are MIT, and the build and test tools add Apache 2.0, including TypeScript and Playwright.
- The code is under the [MIT License](LICENSE).

Campus Router is a personal project and isn't affiliated with or endorsed by the University of Illinois Chicago. There are no accounts and no cookies. Visits are counted anonymously with Vercel Web Analytics, and apart from the site's own backend the only outside requests are for the map tiles.
