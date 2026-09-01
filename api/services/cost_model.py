"""Turns weather and routing mode into per class cost multipliers.

The numbers here are measured, not invented. They come from Fossum and
Ryeng 2021, who timed 2498 pedestrians on winter pavement. See
 for the full write up.

What is measured and what is assumed is marked below, because the two
are not the same and the docs should not blur them.
"""

from typing import Optional

# MEASURED. Fossum and Ryeng 2021, table 3, the row that isolates work
# trips and trips to and from the university. Speeds in metres a second,
# and the multiplier is just asphalt speed divided by that speed.
SURFACE_STATE_SPEED = {
    "bare": 1.607,
    "compact_snow": 1.499,
    "loose_snow": 1.476,
    "gritted_ice": 1.467,
    "clean_ice": 1.351,
}

BARE_SPEED = SURFACE_STATE_SPEED["bare"]

# MEASURED. Each degree warmer costs this much speed, and the study only
# observed between minus twelve and plus eight, so we do not use it
# outside that range.
SPEED_PER_DEGREE = -0.013
TEMP_RANGE_C = (-12.0, 8.0)

# ASSUMED, not measured. The study recorded what state the ground was in.
# We have to guess that from a weather feed instead, and we have to guess
# which paths end up in which state. These two tables are that guess and
# they are the weakest link in the chain.
#
# Steps get the worse state because they are harder to clear and grit.
ROUGH_SURFACES = {"sett", "paving_stones", "gravel", "unpaved", "ground", "dirt"}

# Below this we treat any moisture as freezing onto the ground.
FREEZING_C = 1.0


def multiplier_for_state(state: str) -> float:
    """How much longer a walk takes on this surface state."""
    speed = SURFACE_STATE_SPEED.get(state, BARE_SPEED)
    return BARE_SPEED / speed


def walking_speed(temp_c: Optional[float]) -> float:
    """Speed on bare ground at this temperature, for time estimates.

    Outside the range the study observed we just use the bare speed
    rather than extrapolating a number nobody measured.
    """
    if temp_c is None:
        return BARE_SPEED
    if temp_c < TEMP_RANGE_C[0] or temp_c > TEMP_RANGE_C[1]:
        return BARE_SPEED

    # the study's baseline sits at the middle of its own range
    reference = sum(TEMP_RANGE_C) / 2
    return BARE_SPEED + SPEED_PER_DEGREE * (temp_c - reference)


def infer_states(weather: Optional[dict]) -> dict:
    """Guess what the ground is like from the weather.

    Returns a state for ordinary paths, for steps, and for rough
    surfaces. This is the assumed half of the model.
    """
    everything_bare = {"flat": "bare", "steps": "bare", "rough": "bare"}
    if not weather:
        return everything_bare

    temp = weather.get("tempC")
    if temp is None or temp > FREEZING_C:
        return everything_bare

    condition = (weather.get("condition") or "").lower()
    snowing = "snow" in condition
    wet = snowing or "rain" in condition or "drizzle" in condition

    if snowing:
        # fresh snow sits on everything, and lies deeper where nobody clears
        return {"flat": "compact_snow", "steps": "loose_snow", "rough": "loose_snow"}
    if wet:
        # water on frozen ground is the worst case
        return {"flat": "gritted_ice", "steps": "clean_ice", "rough": "clean_ice"}

    # cold and dry, main paths stay walkable but steps hold frost
    return {"flat": "bare", "steps": "gritted_ice", "rough": "compact_snow"}


def _parts(class_key: str) -> tuple:
    pieces = class_key.split("|")
    while len(pieces) < 3:
        pieces.append("unknown")
    return pieces[0], pieces[1], pieces[2]


def build(mode: str, classes: list[str], weather: Optional[dict] = None) -> dict:
    """Build the multipliers and blocks for one routing mode.

    Multipliers are never below one, which is what keeps the engine's A
    star heuristic valid.
    """
    multipliers: dict[str, float] = {}
    blocked: list[str] = []
    notes: list[str] = []

    if mode == "accessible":
        for class_key in classes:
            highway, surface, _ = _parts(class_key)
            if highway == "steps":
                blocked.append(class_key)
            elif surface in ROUGH_SURFACES:
                # not blocked, just discouraged. rough is passable, steps are not.
                multipliers[class_key] = 1.5
        notes.append("steps blocked, rough surfaces discouraged")

    elif mode == "weather":
        states = infer_states(weather)
        if all(state == "bare" for state in states.values()):
            # with no reading at all the caller says so instead, otherwise
            # we would claim the ground is clear without knowing
            if weather:
                notes.append("nothing frozen underfoot, weather is not changing the route")
        else:
            for class_key in classes:
                highway, surface, _ = _parts(class_key)
                if highway == "steps":
                    state = states["steps"]
                elif surface in ROUGH_SURFACES:
                    state = states["rough"]
                else:
                    state = states["flat"]

                value = multiplier_for_state(state)
                if value > 1.0:
                    multipliers[class_key] = round(value, 4)
            notes.append(
                "surface state guessed from the weather, "
                f"paths {states['flat']}, steps {states['steps']}"
            )

    elif mode != "shortest":
        raise ValueError(f"unknown mode {mode}")

    return {
        "mode": mode,
        "default": 1.0,
        "multipliers": multipliers,
        "blocked": blocked,
        "notes": notes,
        "walkingSpeedMps": round(walking_speed((weather or {}).get("tempC")), 4),
        "source": "Fossum and Ryeng 2021",
    }
