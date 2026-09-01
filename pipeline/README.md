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

Campus is not a guessed bounding box. OpenStreetMap has the campus mapped as relation
`19755400`, and `extract` asks Overpass for its bounds at run time.

Two different areas are used on purpose:

- **Paths** come from the campus box plus about 110 metres of slack. Sidewalks just off
  the edge still connect buildings, so cutting exactly at the boundary would strand them.
- **Buildings** come from the campus polygon itself, not a box. This is what keeps the
  Greyhound terminal, a supermarket and a Loop office tower out of the search box. An
  earlier version used a loose box and picked up 1075 buildings, most of them nowhere
  near campus.

Only the east campus is included. West campus is a separate relation across a gap, and
including it would produce a graph in two disconnected halves.

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
under 2% and would just add empty buckets. There are 26 classes in total.

### Building links

Each building attaches to the walking network through up to four nearby nodes. Real
`entrance` nodes are preferred and 20 of the 59 buildings have one. The rest fall back
to the closest network nodes within 60 metres. Both cases are flagged on the building so
the difference is visible rather than hidden.

## Things worth knowing

- The graph is trimmed to its largest connected piece. Stray disconnected paths exist in
  OpenStreetMap and would only ever produce routes that fail.
- Blocking steps strands 58 nodes, so accessible routing genuinely needs a no path state.
  That is real, not a bug.
- `wheelchair` is essentially unmapped on campus paths. It appears on building entrances
  instead.
- Building codes like SEO and BSB live in the `ref` tag, not `short_name`. Some buildings
  list several separated by semicolons, and the extras become search aliases.
