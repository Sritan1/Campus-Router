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

Build the engine:

```
cd engine
make
```

Then start the gateway, which launches the engine itself:

```
python -m venv .venv
.venv/Scripts/python -m pip install -r api/requirements.txt
.venv/Scripts/python -m uvicorn api.main:app --port 8000
```

Check it:

```
curl http://127.0.0.1:8000/api/health
```

On macOS or Linux use `.venv/bin/python` instead.

## Deployment

One container holds the gateway and the engine. The gateway starts the engine as a
child process on loopback, waits for it to answer before serving traffic, and restarts
it if it dies. `/api/health` reports the engine state too, so a container with a dead
engine fails its health check instead of looking fine.

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
