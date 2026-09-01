# Gateway

The public API, and the process that owns the C++ engine. FastAPI.

## Endpoints

| | |
|---|---|
| `GET /api/health` | gateway and engine state. Reports 503 when the engine is down |
| `GET /api/buildings?q=` | building search for the box at the top of the page |
| `GET /api/graph/meta` | real node and edge counts for the map chip |
| `GET /api/weather` | current conditions, or why they are missing |
| `POST /api/route` | the main one |

### Routing

```json
{
  "start": "SEO",
  "target": "LCC",
  "mode": "shortest",
  "algorithms": ["dijkstra", "astar", "bfs", "bidirectional"],
  "trace": true
}
```

`start` and `target` accept a building code, a building id, or a node id. Modes are
`shortest`, `accessible` and `weather`.

The reply carries one entry per algorithm with the path, the stats, and an `estSeconds`
worked out from the walking speed below. `pathGroups` says which algorithms landed on
the same path so the map can draw two lines rather than four on top of each other.

**A route that does not exist is not an error.** Blocking steps genuinely strands parts
of campus, so those come back as `"status": "no_path"` inside a normal 200.

## Search

Matching is forgiving. An exact building code wins, then anything starting with what you
typed, then anything containing it. Ampersands, hyphens and accents are folded, because
OpenStreetMap writes `Science & Engineering Offices` while people type "and".

## The cost model

Multipliers are measured, not invented. They come from Fossum and Ryeng 2021, who timed
2498 pedestrians walking on winter pavement.

| Surface state | Multiplier |
|---|---|
| bare | 1.000 |
| compact snow | 1.072 |
| loose snow | 1.090 |
| gritted ice | 1.097 |
| clean ice | 1.190 |

Walking speed on bare ground is 1.607 m/s, from the same study's row for trips to and
from a university. Temperature shifts it by 0.013 m/s per degree, and colder is faster,
which is the opposite of what you would guess. That term is only used between minus
twelve and plus eight degrees, because that is all the study observed. Outside it we use
the bare speed rather than extrapolating a number nobody measured.

**Where the honesty line sits.** The multipliers and the speed are measured. What is
*not* measured is which paths end up in which state. The study recorded the ground it
saw; we have to guess it from a weather feed. That guess is in `infer_states` and it is
the weakest link in the chain, so the UI should say the surface state is inferred rather
than known.

Two consequences worth knowing:

- **Rain does not slow walking.** Precipitation was not significant and the authors
  dropped it from their models. Weather mode is a snow, ice and cold feature.
- **Every multiplier is at least 1.0.** That is not a coincidence, it is what keeps the
  engine's A star heuristic admissible.

## Owning the engine

The gateway starts the engine as a child process on loopback, waits for its health check
before serving traffic, forwards its output into the gateway log, and restarts it with
backoff if it dies. `/api/health` reports the engine too, so a container with a dead
engine fails its health check instead of looking fine.

## Configuration

Copy `.env.example` to `.env`. Nothing in it is required to run locally. Without an
OpenWeatherMap key, weather mode routes as shortest distance and says so in the reply.
