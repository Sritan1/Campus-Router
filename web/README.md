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

## What is not here yet

The running phase currently shows a plain loading panel. The exploration animation, the
race lanes with their bars, and the comparison table are Round 6.
