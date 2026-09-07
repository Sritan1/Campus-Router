# Routing engine

C++ engine that holds the campus graph and runs the pathfinding. It knows nothing about
weather, the internet, or buildings by name. You hand it two node ids and a cost model,
it hands back paths and numbers.

## Building

```
make            # the service binary
make cli        # the offline harness
make test       # build and run the tests
```

No cmake, no package manager, no vendored libraries. Plain g++ and a Makefile.

## The service

Binds `127.0.0.1` by default and is never reachable from outside the container. The
python gateway starts it, waits for `/healthz`, and restarts it if it dies.

`GET /healthz` and `GET /graph/meta` describe what is loaded.

`POST /route` does the work:

```json
{
  "start": -151960667,
  "target": -151672202,
  "algorithms": ["dijkstra", "astar", "bfs", "bidirectional"],
  "trace": true,
  "maxTraceSamples": 1500,
  "cost": {
    "default": 1.0,
    "multipliers": { "footway|concrete|none": 1.07 },
    "blocked": ["steps|unknown|none"]
  }
}
```

`algorithms` defaults to all four. Cost classes arrive by name because the gateway
thinks in names, and the engine maps them to its own integer ids.

The reply carries one entry per algorithm with `status`, `cost`, `distanceM`, `hops`,
`nodesVisited`, `edgesRelaxed`, `runtimeUs`, the `path` as node ids, and `points` as
coordinates ready to draw.

Two things worth knowing about the reply:

- **A route that does not exist is not an error.** The request succeeds and the
  algorithm entry says `"status": "no_path"`. Blocking steps really does strand parts of
  campus, so this is a normal answer, not a failure.
- **`pathGroups` says which algorithms landed on the same path.** Dijkstra, A star and
  bidirectional usually agree, so the client can draw two lines instead of four on top
  of each other.

### Traces

A trace is the search itself, not just a list of places it went. Each settled node comes
with `parents`, the position in the same list of the node it was reached from, so the
client can draw the edge that got there instead of a loose dot. A `-1` means a starting
node, which has no edge behind it. Bidirectional has two of those, one per direction.

Parents always point backwards, so a client drawing in order never needs a point it has
not seen yet.

Traces can be thinned if they get huge, evenly across the whole run so the shape survives.
The cap defaults to 20000, above the node count of the whole graph, so in practice nothing
is dropped. If it ever does thin, a segment whose parent was dropped comes back with `-1`
rather than a wrong line.

It was 8000 until round 18. That cleared the old east-campus graph easily, but adding west
campus doubled the node count and a cross-campus search settles about 13000, so BFS was
silently losing three quarters of its edges while A\* stayed complete. A cap only has to be
wrong once for the race to look like an algorithm bug.

### JSON

There is no json library here. The engine has its own small parser and writer in
`json.cpp`, about two hundred lines, because the request and reply shapes are fixed and
the only client is our own gateway on loopback. It is covered by its own tests.

## Trying a route by hand

```
./build/route_cli ../api/data/graph.campus -151960667 -151672202
```

Negative ids are buildings. `--info` lists the cost classes, `--block steps` blocks
every class whose name contains "steps", and `--scan steps` tries every building pair
and reports where blocking actually changes the answer.

## How the graph is stored

Nodes and edges are loaded once and never change, so the layout is compressed adjacency
rather than a map of maps. Every edge lives in one flat array, and each node keeps an
offset into it. Walking a node's neighbours is then a contiguous slice with no lookups.

Cost classes are small integers. The pipeline buckets each edge into one, so the cost
model is a short array indexed by class rather than a per edge value.

## The four algorithms

| | Finds | Notes |
|---|---|---|
| Dijkstra | cheapest path | the reference the others are checked against |
| A star | cheapest path | straight line estimate, explores far fewer nodes |
| BFS | fewest hops | usually a longer walk, and that is the point |
| Bidirectional Dijkstra | cheapest path | searches from both ends |

Dijkstra, A star and bidirectional must always agree on cost. BFS is allowed to differ
because it is optimising something else, but it still reports what its own path really
costs rather than the best cost.

### Two things that are easy to get wrong

**A star needs its estimate scaled.** Cost is length times a class multiplier. A plain
straight line distance would be an overestimate as soon as any multiplier is below one,
and then A star can return a path that is not the cheapest. The estimate is multiplied
by the smallest multiplier any open class has, which keeps it honest.

**Bidirectional does not stop when the searches meet.** The first shared node is not
necessarily on the best path. The search keeps going until the two cheapest remaining
reaches add up to more than the best complete path found so far.

Both mistakes produce routes that look fine. The test that catches them runs all three
against each other on 200 random graphs with random multipliers and blocked classes,
around a thousand start and target pairs, and requires the costs to match.

## Numbers on the real graph

8162 nodes, 9830 edges. SEO to Lecture Center C:

| algorithm | cost | nodes visited | microseconds |
|---|---|---|---|
| dijkstra | 367.6 m | 852 | 219 |
| astar | 367.6 m | 185 | 187 |
| bfs | 373.8 m | 421 | 52 |
| bidirectional | 367.6 m | 316 | 214 |

A star explores about a fifth of what Dijkstra does, and BFS finds a 15 hop path that is
6 metres longer than the 28 hop shortest one.
