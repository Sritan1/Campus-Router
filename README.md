# Campus Router

Walking routes across the UIC campus footpath network, with four pathfinding
algorithms you can race against each other on the same start and end pair.

Early stage. The engine currently answers a health check and nothing else.

## Layout

| Folder | What it is |
|---|---|
| `engine/` | C++ pathfinding engine. Own graph structure and algorithms. |
| `api/` | Python gateway. Public API, weather, ML weighting, and it owns the engine process. |
| `pipeline/` | Offline scripts that pull campus data from the Overpass API. |
| `web/` | Next.js frontend. |

## Running it locally

Two terminals.

**Backend.** Builds the engine, sets up the virtual environment the first time, and
starts the gateway with hot reload.

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

You do not start the engine yourself. The gateway launches it as a child process, waits
for it to answer, and restarts it if it dies.

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

## How the two backend pieces fit together

The gateway owns the engine process. It starts it on loopback, blocks until it answers
its health check, forwards its output into the gateway log, and restarts it with backoff
if it exits. `/api/health` reports engine state as well as its own, so a half dead
service cannot report itself as fine.

The engine binds to `127.0.0.1` only, so it is never reachable from outside.

## Deployment

Not set up yet, and deliberately left until the end. A `Dockerfile` and `railway.json`
exist and describe the intended shape, one container holding both backend pieces, but
neither has been built or deployed yet. Everything runs locally for now.


## Relationship to prior coursework

This project revisits the problem domain of a UIC course assignment (`proj6-osm`) that
implemented Dijkstra's algorithm over a campus footpath graph. That assignment shipped
with instructor provided server and frontend scaffolding.

This is a separate build. The graph structure, algorithms, API, data pipeline, frontend,
tests and tooling here are written from scratch. What carries over is limited to public
knowledge: the great circle distance formula, general familiarity with Dijkstra's
algorithm, and the idea of linking building centers to nearby footpath nodes.

A fuller disclosure section lands with the finished project.

## License

Not yet chosen.
