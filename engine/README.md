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
