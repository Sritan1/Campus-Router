import pytest

from api.services import cost_model

CLASSES = [
    "footway|concrete|none",
    "footway|sett|none",
    "steps|unknown|none",
    "steps|concrete|none",
    "service|asphalt|none",
]


def test_shortest_mode_changes_nothing():
    table = cost_model.build("shortest", CLASSES)
    assert table["multipliers"] == {}
    assert table["blocked"] == []


def test_unknown_mode_is_rejected():
    with pytest.raises(ValueError):
        cost_model.build("teleport", CLASSES)


def test_accessible_blocks_every_kind_of_steps():
    table = cost_model.build("accessible", CLASSES)
    assert set(table["blocked"]) == {"steps|unknown|none", "steps|concrete|none"}


def test_accessible_discourages_rough_without_blocking_it():
    table = cost_model.build("accessible", CLASSES)
    assert "footway|sett|none" in table["multipliers"]
    assert "footway|sett|none" not in table["blocked"]
    assert table["multipliers"]["footway|sett|none"] > 1.0


def test_multipliers_are_never_below_one():
    """The engine's A star heuristic depends on this."""
    for mode in ("shortest", "accessible", "weather"):
        for weather in (None, {"tempC": -5, "condition": "Snow"},
                        {"tempC": -5, "condition": "Rain"},
                        {"tempC": -5, "condition": "Clear"},
                        {"tempC": 20, "condition": "Clear"}):
            table = cost_model.build(mode, CLASSES, weather)
            for value in table["multipliers"].values():
                assert value >= 1.0


def test_warm_weather_leaves_the_route_alone():
    table = cost_model.build("weather", CLASSES, {"tempC": 18, "condition": "Clear"})
    assert table["multipliers"] == {}
    assert any("not changing the route" in note for note in table["notes"])


def test_missing_weather_is_treated_as_nothing_frozen():
    table = cost_model.build("weather", CLASSES, None)
    assert table["multipliers"] == {}


def test_freezing_and_wet_is_worse_than_freezing_and_dry():
    dry = cost_model.build("weather", CLASSES, {"tempC": -5, "condition": "Clear"})
    wet = cost_model.build("weather", CLASSES, {"tempC": -5, "condition": "Rain"})

    steps = "steps|concrete|none"
    assert wet["multipliers"][steps] > dry["multipliers"][steps]


def test_steps_are_never_cheaper_than_flat_ground_in_winter():
    table = cost_model.build("weather", CLASSES, {"tempC": -5, "condition": "Snow"})
    steps = table["multipliers"]["steps|concrete|none"]
    flat = table["multipliers"].get("footway|concrete|none", 1.0)
    assert steps >= flat


def test_state_multipliers_match_the_published_speeds():
    # asphalt is the base case, so it must come out at exactly one
    assert cost_model.multiplier_for_state("bare") == pytest.approx(1.0)

    # clean ice is the worst, and the paper puts it around twenty percent
    assert cost_model.multiplier_for_state("clean_ice") == pytest.approx(1.19, abs=0.005)
    assert cost_model.multiplier_for_state("compact_snow") == pytest.approx(1.072, abs=0.005)


def test_state_multipliers_get_worse_in_the_published_order():
    order = ["bare", "compact_snow", "loose_snow", "gritted_ice", "clean_ice"]
    values = [cost_model.multiplier_for_state(s) for s in order]
    assert values == sorted(values)


def test_walking_speed_only_bends_inside_the_observed_range():
    baseline = cost_model.BARE_SPEED

    # outside the range we refuse to extrapolate
    assert cost_model.walking_speed(30.0) == baseline
    assert cost_model.walking_speed(-40.0) == baseline
    assert cost_model.walking_speed(None) == baseline

    # inside it, colder is faster, which is what the study found
    assert cost_model.walking_speed(-10.0) > cost_model.walking_speed(5.0)


def test_walking_speed_stays_plausible():
    for temp in range(-12, 9):
        speed = cost_model.walking_speed(float(temp))
        assert 1.0 < speed < 2.2


def test_unknown_class_shapes_do_not_crash_the_builder():
    table = cost_model.build("accessible", ["weird", "a|b", ""], None)
    assert isinstance(table["multipliers"], dict)
