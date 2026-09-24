# Frontend

Next.js and React. Talks to the gateway, draws the map, runs the search box.

```
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm test
```

Point it somewhere else with `NEXT_PUBLIC_API_BASE_URL`. It defaults to
`http://127.0.0.1:8000`, which is where `scripts/dev.ps1` puts the gateway.

## Three pages

| Route | Page | What it is |
|---|---|---|
| `/` | Navigate | The routing tool. Search, map, one route with directions, distance and time, and the reach view |
| `/lab` | Lab | The algorithm work. Four algorithms, race, exploration animation, comparison table |
| `/about` | About | What it does, where the data comes from, and the disclaimers |

One screen was serving two different people badly. Someone who just wanted directions
was met with four algorithm cards before picking a destination, and someone judging the
engineering had the interesting part buried under a form.

Both are real routes rather than a toggle, so either can be linked directly, and the
start, destination and mode carry across when you move between them.

**Navigate still runs all four algorithms**, it just does not ask for traces. That costs
about a millisecond and it lets the link across to the lab say something true. On most
campus pairs it reads "3 of 4 agree, BFS found a different route", because BFS optimises
hops rather than distance. A generic invitation would have been easier and worth less.

That link is the only thing telling a visitor the algorithm work exists, so it matters
more than its size suggests.

## Layout

The screen follows the prototype. A header with the brand and the two ends, a map filling
the left, and a 420 pixel panel down the right. `browser-check.mjs` asserts that width, so
the CSS variable and the check have to move together. Below 900 pixels the panel moves
under the map instead of beside it.

The mode switch is **not** in the header. It sits inside the route panel, in both the idle
and the results state, because a picker that disappeared once a route appeared would leave
no way to change your mind.

The visual language is deliberately not the prototype's hand drawn look. That was a
wireframing convention rather than a design decision, so the structure was kept and the
sketch styling was not.

## How state works

One reducer in `lib/state.ts` holds the lab's machine: `idle`, `running`, `results`, plus
the mode, whether race is on, which algorithm is selected, and which end is being searched.
It is a plain function with no react in it, which is why it can be tested directly. Navigate
is simpler and just uses `useState`.

The rule that matters in the lab is that **anything which would change the answer throws the
old answer away**. Changing mode, swapping the ends, picking a different building or a
different algorithm all clear the result and drop back to idle. The prototype let you change
the mode while a route stayed on screen, so the map showed the answer to a question you were
no longer asking.

**Navigate handles a mode change differently, on purpose.** If a route is already on screen
it re-runs it in the new mode rather than clearing, because clearing hid the very thing the
switch was for: you could not see what accessible actually changed. With nothing on screen
it only changes the mode, since firing a search nobody asked for is worse.

Server state is React Query. Buildings and graph counts are fetched once and never go
stale, weather refetches every ten minutes.

## Search

The prototype listed every building no matter what you typed. This is a real input.
Matching happens on the client because the list is only 113 buildings and typing should
not wait on the network. An exact building code wins, then names starting with what you
typed, then names containing it. Ampersands, hyphens and accents are folded, so "science
and engineering" finds "Science & Engineering Offices". Arrow keys move, enter picks,
escape closes.

## The map

Leaflet, loaded without server rendering because it reaches for `window` on import.

When several algorithms return the same path the map draws one line, not four stacked on
the same pixels. The selected algorithm is drawn solid in its own colour and any
genuinely different path is drawn dashed and grey behind it.

## Race mode

Four algorithms on the same pair, then a playback of how each one searched.

The search is drawn as **edges, not dots**. The engine sends the trace as `points` in the
order they were settled plus `edges`, pairs of positions into that list, so each step of the
animation is a line down a real footpath. Because the pipeline splits ways into one edge per
pair of nodes, and those are only about seven metres apart, the drawing follows the actual
path network.

Every edge back to an already settled node is included, not just the one a node was reached
from, so what you watch is the **explored network rather than the tree of best routes**.
Drawing only the tree left gaps wherever two branches ran down neighbouring paths.

That is what makes the four algorithms look different rather than just differently sized.
BFS spreads outward in every direction like a flood, A star reaches toward the target in
a narrow band, and bidirectional grows two fronts that meet in the middle.

It all goes on a **canvas** over the map, not Leaflet markers. A same campus pair like ARC
to SES comes to about 12800 segments across the four searches and a cross campus one to
about 50000, which as dom elements would be hopeless.

While the playback runs the map dims and the finished route is hidden, because drawing
the answer next to the search gives the game away. Both come back when it finishes.

### Painting incrementally

The canvas is never cleared during playback. Each frame strokes only the segments
revealed since the last one, batched into a single path per algorithm. Total work across
the whole animation is therefore proportional to the number of segments, not segments
times frames, which is the difference between about ten thousand strokes and about six
hundred thousand.

A full wipe and repaint only happens when the map pans or zooms, since that invalidates
every pixel already painted.

### Two clocks

The canvas runs its own `requestAnimationFrame` loop off a shared start timestamp, so it
stays smooth at sixty frames without React re-rendering the map. React only ticks twenty
times a second, and only to move the sidebar bars, which is plenty for a bar.

All four lanes share one clock, so the bars are comparable. Bar length is **measured engine
time** against whoever took the longest, so the shortest bar is the algorithm that finished
first. That is the whole point of the panel.

It used to be nodes explored, and switching it revealed something the old bar hid. On a
cross campus race BFS settles **more** nodes than Dijkstra, 13316 against 12898, and is
still about three times **faster**, because a plain queue costs less per node than a heap.
Sizing the bar by work made BFS look like the loser of a race it wins. The node count is
still printed beside each bar, so both numbers are there, they just are not the same number.

### Playback length is presentation

Playback lasts about four seconds. The engine answers in under a millisecond, so a real
time animation would be one frame. Everything shown is real, the points and their order
and the counts, but the pacing is chosen so it can be watched. The runtime column reports
the engine's own measured time separately. This is said out loud in the root README and
under the comparison table.

`prefers-reduced-motion` skips straight to the finished state.
