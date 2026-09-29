<h1 align="center"><img src="web/app/icon.svg" width="36" height="36" align="absmiddle" alt=""> Campus Router <img src="web/app/icon.svg" width="36" height="0" alt=""></h1>

**Live demo:** [campusrouter.com](https://campusrouter.com)

Campus Router is a walking map for the University of Illinois Chicago. Pick two buildings and it shows you the quickest way to walk between them, along with how long it takes and directions to follow. Two additional modes adapt the route to the person and the season: Accessible avoids every staircase on the map, for anyone using a wheelchair or otherwise unable to take stairs, and Weather adjusts for snow and ice based on current conditions. A separate Reach view outlines the area you can cover on foot within 5 to 30 minutes.

Alongside the routing tool is a lab for comparing pathfinding algorithms. It runs Dijkstra, A\*, BFS and bidirectional Dijkstra on the same trip, then replays each search on its own map with its measured runtime.

![A route from SEO to Lecture Center C with walking directions](docs/screenshots/navigate.png)

## Features

### Accessible

<img align="right" width="56%" hspace="16" src="docs/screenshots/accessible.png" alt="The trip from ERF to SES taking a longer step free route">

<br>

Routes around every staircase and penalizes rough ground such as gravel and cobbles. About one building pair in six ends up with a longer walk, usually by around 15 m.

<br>
OpenStreetMap maps stairs much better than ramps, so a route can be longer than it needs to be when a real ramp is missing from the map. Check anything important with the university.

<br clear="all">

### Weather

Factors in snow and ice that slow walking down. The figures come from a research paper by Fossum and Ryeng (2021), who timed pedestrians walking on winter pavement. The paper found no measurable effect from rain, so the mode accounts for snow and ice rather than bad weather in general. Steps and rough ground slow down more than paved paths, so in bad conditions the route can change as well as the time.

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

Shades everywhere you can walk to from a building within 5, 10, 20 or 30 minutes.
The area is worked out along real footpaths, so it stretches along streets and stops at barriers instead of forming a circle.

<br>
It runs Dijkstra, the search behind the main routing view, but stops at the chosen walking time instead of at a destination.

<br clear="all">

### Algorithm lab

Shows how differently four pathfinding algorithms search for the same route. You can watch all four side by side and replay any of them.

Here is how the four compare on the walk from ARC to SES:

| Algorithm | How it searches | How much of the map it explored |
|---|---|---|
| Dijkstra | The shortest route, spreading out evenly | 2,991 nodes (18%) |
| A\* | The shortest route, aiming at the destination | 839 nodes (5%) |
| BFS | The route with the fewest segments, regardless of length | 4,992 nodes (31%) |
| Bidirectional Dijkstra | The shortest route, searching from both ends | 1,790 nodes (11%) |

Three of them agree on an 816 m walk. BFS finds one 258 m longer, because it counts path segments rather than distance.

![The lab racing four algorithms on one trip, each search drawn on its own map with the runtimes beside them](docs/screenshots/lab.png)

On this trip BFS explores 4,992 nodes against Dijkstra's 2,991 and still finishes in about half the time, a median of 0.36 ms against 0.65 ms over 101 runs, because a plain queue costs less per node than a priority queue.

## Tech stack

| Layer | Built with |
|---|---|
| Engine | C++20, g++, Make |
| Gateway | Python, FastAPI, httpx |
| Frontend | TypeScript, Next.js, React, React Query, Leaflet |
| Map data | OpenStreetMap, through the Overpass API |
| Weather | OpenWeather |
| Testing | A C++ test harness, pytest, Vitest, Playwright, GitHub Actions |
| Hosting | Vercel for the frontend, Railway for the backend |

## Architecture

```
┌──────────────────────────────────────────┐
│  Website · Next.js (web/), on Vercel     │
│  Navigate · Algorithm lab · About        │
└──────────────────────────────────────────┘
                     │ route requests · HTTPS
                     ▼
┌──────────────────────────────────────────┐
│  Gateway · FastAPI (api/), on Railway    │
│  buildings · weather (OpenWeather)       │
└──────────────────────────────────────────┘
                     │ same container
                     ▼
┌──────────────────────────────────────────┐
│  C++ engine (engine/)                    │
│  four searches · map held in memory      │
└──────────────────────────────────────────┘
```

Python scripts build the map ahead of time. They download UIC's east and west campuses from OpenStreetMap, split the paths into short edges, and link each building to the network through its entrances. The finished map has about 16,000 nodes, 19,000 edges and 113 buildings.

When you ask for a route, the gateway looks up the two buildings, checks the weather if the mode needs it, and hands the search to the engine. The engine is written in C++ with its own JSON parser and HTTP server, and even the longest route on the map, about 2.5 miles, takes around 3 ms. Both run in one container.

The work is split so that the engine knows nothing about building names, weather or modes. Every edge is labeled with the kind of path it is, such as a paved footway, gravel or steps, and the gateway turns the chosen mode into a small table of multipliers for those labels. The engine only applies that table while it searches, multiplying each edge's length by its label's value or skipping the edge when the mode blocks it, as Accessible does with steps.

## Accuracy and testing

Routes for a sample of 40 building pairs across both campuses were compared by length against OSRM, an independent router that reads the same OpenStreetMap data. On a typical route the two agree to within 1%, across trips from just over 200 m to nearly 2 miles.

Because both routers read the same data, the comparison cannot catch mistakes in the map itself, so the two places with the biggest effect on step free routes were inspected in person. The underpass beneath Science and Engineering South, the largest barrier left on the map, was confirmed to have no ramp or lift, so the long detours around it are correct. At Student Center East Tower, the map showed only a staircase, but a level approach was found beside it. That missing path was added by hand, and the number of building pairs with no step free route at all dropped from 48 to 0.

Each part has its own tests, and CI runs them on every push to `main`. A\* and bidirectional Dijkstra are easy to get subtly wrong while still producing believable routes, so a property test runs all three shortest route searches on 200 random maps and fails if their route costs ever disagree.

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
├── pipeline/               # Offline map build
│   ├── extract.py          #   Pulls both campuses from Overpass
│   ├── transform.py        #   Splits ways into tagged edges, links buildings
│   ├── validate.py         #   Checks the result before it ships
│   └── patches.json        #   The one hand verified map fix
├── web/                    # Next.js site
│   ├── app/                #   Navigate, Algorithm lab, About
│   ├── components/         #   Map panes, canvas renderer, panels
│   ├── lib/                #   URL state, formatting, geometry, search
│   └── scripts/            #   Browser checks and the license list
└── scripts/                # Dev server, smoke checks, OSRM comparison, step free sweep
```

## Running locally

Campus Router is live at [campusrouter.com](https://campusrouter.com). To run it locally instead, follow the steps below.

You'll need Python 3.12 or newer, Node.js 22 or newer, and g++ with C++20 support, which on Windows means MinGW-w64. macOS and Linux also need `make`.

Set up two keys before starting anything:

- **[MapTiler](https://www.maptiler.com/), free, for the background map.** Copy `web/.env.example` to `web/.env.local` and set `NEXT_PUBLIC_MAPTILER_KEY`. Without it, routing works but the map stays blank.
- **[OpenWeather](https://openweathermap.org/), optional, for Weather mode.** Copy `api/.env.example` to `api/.env` and set `OPENWEATHER_API_KEY`. Without it, Weather mode routes by distance.

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

Then start the frontend in a second terminal and open http://localhost:3000:

```bash
cd web
npm install
npm run dev
```

To run the tests (use `mingw32-make` in place of `make` on Windows):

```bash
make -C engine test
pip install -r api/requirements-dev.txt
python -m pytest api/tests pipeline/tests -q
cd web && npm run typecheck && npm test
```

The browser check clicks through the real site with Playwright, so it needs both servers running:

```bash
cd web
npx playwright install chromium
node scripts/browser-check.mjs
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
- The code is under the [MIT License](LICENSE).

Campus Router is a personal project and isn't affiliated with or endorsed by the University of Illinois Chicago. There are no accounts and no cookies. Visits are counted anonymously with Vercel Web Analytics.
