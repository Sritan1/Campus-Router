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

## Layout

The screen follows the prototype. A header with the two ends, the mode switch and the
run button, a map filling the left, and a 400 pixel panel down the right. Below 900
pixels the panel moves under the map instead of beside it.

The visual language is deliberately not the prototype's hand drawn look. That was a
wireframing convention rather than a design decision, so the structure was kept and the
sketch styling was not.

## How state works

One reducer in `lib/state.ts` holds the whole machine: `idle`, `running`, `results`,
plus the mode, whether race is on, which algorithm is selected, and which end is being
searched. It is a plain function with no react in it, which is why it can be tested
directly.

The rule that matters is that **anything which would change the answer throws the old
answer away**. Changing mode, swapping the ends, picking a different building or a
different algorithm all clear the result and drop back to idle. The prototype let you
change the mode while a route stayed on screen, so the map showed the answer to a
question you were no longer asking.

Server state is React Query. Buildings and graph counts are fetched once and never go
stale, weather refetches every ten minutes.

## Search

The prototype listed every building no matter what you typed. This is a real input.
Matching happens on the client because the list is only 59 buildings and typing should
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

The search is drawn as **edges, not dots**. Every settled node knows the node it was
reached from, so each step of the animation is a line down a real footpath. Because the
pipeline splits ways into one edge per pair of nodes, and those are only about seven
metres apart, the drawing follows the actual path network.

That is what makes the four algorithms look different rather than just differently sized.
BFS spreads outward in every direction like a flood, A star reaches toward the target in
a narrow band, and bidirectional grows two fronts that meet in the middle.

It all goes on a **canvas** over the map, not Leaflet markers. A real campus pair comes
to about 9900 segments across the four searches, which as dom elements would be hopeless.

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

All four lanes share one clock, so the bars are comparable. Bar length is nodes explored
against whoever explored the most, which means the shortest bar is the algorithm that did
the least work. That is the whole point of the panel.

### Playback length is presentation

Playback lasts about 1.8 seconds. The engine answers in under a millisecond, so a real
time animation would be one frame. Everything shown is real, the points and their order
and the counts, but the pacing is chosen so it can be watched. The runtime column reports
the engine's own measured time separately. This is said out loud in the root README and
under the comparison table.

`prefers-reduced-motion` skips straight to the finished state.
