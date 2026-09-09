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

**Which distance `estSeconds` is timed on depends on the mode**, and `cost.speedDerived`
says which one was used. In weather mode the multipliers are measured speed ratios, so a
weighted metre really does take longer and the estimate is timed on the weighted cost.
Anywhere else it is timed on the real distance. That matters because accessible mode
discourages rough ground with a flat 1.5, which is a routing preference rather than a
speed, and timing it would invent a slower walk out of a nudge. Until this was fixed every
mode timed the plain distance, so weather mode would route you around ice and then promise
the same time as bare pavement.

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

### Deploying: set `TRUST_PROXY_HEADERS=true` on the service

This one is not in the Dockerfile on purpose, and both directions of getting it wrong are
real, so it is worth a minute.

The rate limiter counts requests per caller. Behind a proxy every connection arrives from
the proxy, so the socket address is the same for everybody and one visitor could use up the
allowance for the whole site. `X-Forwarded-For` carries the real caller, but anyone can send
that header themselves, so it is only worth reading when something trustworthy is in front
rewriting it. `TRUST_PROXY_HEADERS` is that switch, and it defaults to off.

Whether a proxy is in front is a fact about **where the container runs**, not about the
image, which is why baking it in was wrong: the same image run locally or on a plain host
would trust a header nobody was rewriting, and a caller could rotate the value for a fresh
allowance every request.

So **set `TRUST_PROXY_HEADERS=true` in the Railway service variables**, alongside
`OPENWEATHER_API_KEY` and `ALLOWED_ORIGINS`. Forgetting it is not a security hole but it is
not harmless either: every request keys to the proxy and the whole site shares one bucket,
which shows up as visitors getting 429s for no reason. To check it is on, send two requests
with different `X-Forwarded-For` values and confirm they are counted separately.

Note that uvicorn is deliberately **not** given `--proxy-headers`. It would rewrite the
client address from the leftmost entry of that header, which is the part the caller writes,
and that is the end we do not trust. The gateway parses the header itself and takes the
entry the proxy appended.
