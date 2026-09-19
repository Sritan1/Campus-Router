"""Cost multipliers per mode. Measured numbers and guesses are marked apart."""

from typing import Optional

# measured, Fossum and Ryeng 2021 table 3, the university trips row. metres a second
SURFACE_STATE_SPEED = {
    "bare": 1.607,
    "compact_snow": 1.499,
    "loose_snow": 1.476,
    "gritted_ice": 1.467,
    "clean_ice": 1.351,
}

BARE_SPEED = SURFACE_STATE_SPEED["bare"]

# measured, but only observed from 12 below zero to 8 above
SPEED_PER_DEGREE = -0.013
TEMP_RANGE_C = (-12.0, 8.0)

# assumed, not measured. the study saw the ground, this guesses it from a
# weather feed, and that guess is the weakest part of the model
ROUGH_SURFACES = {"sett", "paving_stones", "gravel", "unpaved", "ground", "dirt"}

# at or below this, any moisture counts as freezing
FREEZING_C = 1.0


def multiplier_for_state(state: str) -> float:
    speed = SURFACE_STATE_SPEED.get(state, BARE_SPEED)
    return BARE_SPEED / speed


def walking_speed(temp_c: Optional[float]) -> float:
    if temp_c is None:
        return BARE_SPEED
    # outside the studied range, fall back rather than extrapolate
    if temp_c < TEMP_RANGE_C[0] or temp_c > TEMP_RANGE_C[1]:
        return BARE_SPEED

    # the baseline speed sits at the middle of the studied range
    reference = sum(TEMP_RANGE_C) / 2
    return BARE_SPEED + SPEED_PER_DEGREE * (temp_c - reference)


def infer_states(weather: Optional[dict]) -> dict:
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
    # multipliers must never go below one or the a star guess stops being safe
    multipliers: dict[str, float] = {}
    blocked: list[str] = []
    notes: list[str] = []

    if mode == "accessible":
        for class_key in classes:
            highway, surface, _ = _parts(class_key)
            if highway == "steps":
                blocked.append(class_key)
            elif surface in ROUGH_SURFACES:
                # discouraged, not blocked
                multipliers[class_key] = 1.5
        notes.append("Route avoids all steps and prefers smooth ground.")

    elif mode == "weather":
        states = infer_states(weather)
        if all(state == "bare" for state in states.values()):
            # no reading means the caller explains, so do not claim clear ground
            if weather:
                notes.append("Mild conditions. Routes match Shortest.")
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

    elif mode != "shortest":
        raise ValueError(f"unknown mode {mode}")

    return {
        "mode": mode,
        "default": 1.0,
        "multipliers": multipliers,
        "blocked": blocked,
        "notes": notes,
        "walkingSpeedMps": round(walking_speed((weather or {}).get("tempC")), 4),
        # weather multipliers are measured slowdowns, so times can use them.
        # the 1.5 for rough ground is only a preference and would inflate times
        "speedDerived": mode == "weather",
        "source": "Fossum and Ryeng 2021",
    }
