# Data pipeline

Builds `api/data/graph.json` from OpenStreetMap. Runs offline. The deployed app never
talks to Overpass, it just loads the file this produces.

## Running it

```
python -m pipeline.extract      # pull from overpass into pipeline/raw/
python -m pipeline.transform    # turn that into api/data/graph.json
python -m pipeline.validate     # check the result and print a report
```

`extract` caches every Overpass response, so rerunning it costs nothing. Use
`--refresh` when you actually want fresh data.

## How the area is decided

Campus is not a guessed bounding box. OpenStreetMap has both campuses mapped, east as
relation `19755400` and west as `17687555`, and `extract` asks Overpass for their bounds
at run time.

Two different areas are used on purpose:

- **Paths** come from the union of both campus boxes plus about 110 metres of slack.
  Sidewalks just off the edge still connect buildings, so cutting exactly at the boundary
  would strand them. The union also covers the corridor between the campuses, which is what
  keeps them in one connected graph.
- **Buildings** come from the campus polygons themselves, not a box. This is what keeps the
  Greyhound terminal, a supermarket and a Loop office tower out of the search box. An
  earlier version used a loose box and picked up 1075 buildings, most of them nowhere
  near campus.

Some UIC buildings sit in **neither** polygon, because south campus has no relation of its
own. `EXTRA_BUILDINGS` in `extract.py` names those explicitly, currently Thomas Beckham
Hall, Marie Robinson Hall, the Taylor Street Building and two uncoded ones. The UIC School
of Law is left out on purpose, it is downtown and would drag the Loop in with it.

## Local corrections

`patches.json` holds paths that exist on the ground but are not in OpenStreetMap yet. Each
entry joins two nodes that are **already in the dump**, so a patch declares a connection
rather than inventing geometry. A patch whose pair OpenStreetMap has since mapped is
skipped on its own, and one naming a node the dump does not have stops the build rather
than failing quietly.

## What comes out

```
schema_version
meta      counts, campus bounds, the query box used
nodes     id, lat, lon
edges     u, v, way_id, length_m, tags, class_key
buildings name, abbr, aliases, centroid, links into the network
classes   every class_key and how many edges use it
```

Ways are split into one edge per pair of consecutive nodes, so each edge carries its own
tags. Edges are undirected and stored once, with the lower node id first.

Only tags that are actually set get written. Writing the empty ones out doubled the file
size for no benefit.

### class_key

`highway|surface|tactile_paving`, for example `footway|concrete|tactile`.

This is the bucket used to look up a cost multiplier. Only tags with real coverage on
campus are in the key. `wheelchair`, `incline`, `lit` and `covered` are all measured at
under 2% and would just add empty buckets. There are 32 classes in total.

### Building links

Each building attaches to the walking network through up to four nearby nodes. Real
`entrance` nodes are preferred and 23 of the 113 buildings have one. The rest fall back
to the closest network nodes within 60 metres. Both cases are flagged on the building so
the difference is visible rather than hidden.

Doors tagged `entrance=emergency` or `entrance=exit` are never used as a link, since there
is no way in through them. They stay in the walking network. Before this rule, the Daley
Library and Lecture Center F both linked to the same alarmed exit, though no route was ever
short enough to end there.

Preferring entrances is not free. If the only nearby entrance sits somewhere the network
can barely reach, the building is attached there and a closer, better connected node is
never considered. That is exactly what stranded Student Center East, see `patches.json`.

**A building is reachable if any of its doors is.** So if every node we picked turns out to
sit behind steps, we add the nearest one that does not, and flag it as
`step_free_fallback`. Without that, a building inherits the accessibility of whichever
corner of it happened to be closest, which is not the same question.

That is not hypothetical. ETMSW was fine until somebody mapped the sunken courtyard beside
it in detail. The new path nodes were 1.9 m from the centre against 13.8 m for the old
link, so the rule preferred them, and the courtyard is reached by steps because it is a
sunken courtyard. The building did not become inaccessible, our idea of its front door did.

## Things worth knowing

- The graph is trimmed to its largest connected piece. Stray disconnected paths exist in
  OpenStreetMap and would only ever produce routes that fail.
- Blocking steps strands 86 of the 16149 network nodes, scattered over 47 small pockets cut
  off from the main step free piece. No building loses its route though. With steps blocked
  all 6328 building pairs still connect, and 1076 of them simply get longer. ETMSW used to be
  the one exception, and the step free fallback above is what fixed it.
- `wheelchair` is essentially unmapped on campus paths. It appears on building entrances
  instead.
- Building codes like SEO and BSB live in the `ref` tag, not `short_name`. Some buildings
  list several separated by semicolons, and the extras become search aliases.

## What comes out, and under what licence

`pipeline.transform` writes two files into `api/data/`:

| File | For |
|---|---|
| `graph.json` | the Python gateway, which needs the edge tags for directions |
| `graph.campus` | the C++ engine, a compact text format with no JSON library needed |

Both are **derived from OpenStreetMap and are a Derivative Database under the ODbL**, not
merely a rendering of it, because they restructure and re-tag OSM's own data. They ship
under the Open Database License with attribution to © OpenStreetMap contributors, while the
code in this repository is MIT. See `LICENSE-DATA` in the repository root.

`meta.extracted` in `graph.json` records how fresh the OpenStreetMap data is. It is read
from the `timestamp_osm_base` Overpass sends with every reply, taking the oldest of the
three downloads, and it is surfaced on the app's About page, so the date a visitor reads
is generated rather than typed and cannot drift. Reading it off the data rather than the
clock matters because `pipeline.extract` reuses its cache, so a rerun can build from data
weeks older than the day it ran. A dump pulled before that field existed falls back to the
file's own timestamp.
