"""Walking directions. Most of the trouble is in the merging."""

from api.services import directions


class FakeGraph:
    def __init__(self, edges):
        self.store = {}
        for u, v, length, tags in edges:
            self.store[(u, v) if u < v else (v, u)] = {
                "length_m": length,
                "tags": tags,
            }

    def edge_between(self, a, b):
        return self.store.get((a, b) if a < b else (b, a))


class FakeBuilding:
    def __init__(self, abbr, lat, lon):
        self.abbr = abbr
        self.name = abbr
        self.lat = lat
        self.lon = lon


# each step is about eleven metres, so these stay campus sized
def north(base, steps):
    return [(base + 0.0001 * i, 0.0) for i in range(steps)]


def test_compass_names_the_eight_directions():
    assert directions.compass(0) == "north"
    assert directions.compass(90) == "east"
    assert directions.compass(180) == "south"
    assert directions.compass(270) == "west"
    assert directions.compass(45) == "northeast"
    # just past north still reads as north
    assert directions.compass(359) == "north"


def test_turn_size_takes_the_short_way_round():
    assert directions.turn_size(350, 10) == 20
    assert directions.turn_size(10, 350) == 20
    assert directions.turn_size(0, 180) == 180


def test_a_route_too_short_to_describe_gives_nothing():
    graph = FakeGraph([])
    start = FakeBuilding("A", 0.0, 0.0)
    assert directions.build([], [], graph, start, start) is None
    assert directions.build([1], [(0.0, 0.0)], graph, start, start) is None


def test_points_and_path_must_line_up():
    graph = FakeGraph([(1, 2, 10.0, {"highway": "footway"})])
    start = FakeBuilding("A", 0.0, 0.0)
    # a mismatch means we would be reading the wrong coordinates
    assert directions.build([1, 2], [(0.0, 0.0)], graph, start, start) is None


def test_one_road_crossing_is_one_instruction():
    # openstreetmap splits this crossing into four little pieces
    edges = [
        (1, 2, 40.0, {"highway": "footway"}),
        (2, 3, 2.0, {"highway": "footway", "footway": "crossing", "crosses": "South Morgan Street"}),
        (3, 4, 3.0, {"highway": "footway", "footway": "crossing"}),
        (4, 5, 2.0, {"highway": "footway", "footway": "crossing"}),
        (5, 6, 40.0, {"highway": "footway"}),
    ]
    graph = FakeGraph(edges)
    points = north(0.0, 6)
    start = FakeBuilding("A", -0.001, 0.0)
    target = FakeBuilding("B", 0.001, 0.0)

    guide = directions.build([1, 2, 3, 4, 5, 6], points, graph, start, target)

    crossings = [s for s in guide["steps"] if s["kind"] == "crossing"]
    assert len(crossings) == 1
    assert guide["crossings"] == 1
    # the name comes from whichever piece had one
    assert crossings[0]["text"] == "Cross South Morgan Street"
    assert crossings[0]["metres"] == 7


def test_a_crossing_with_no_name_says_so_plainly():
    edges = [
        (1, 2, 40.0, {"highway": "footway"}),
        (2, 3, 6.0, {"highway": "footway", "footway": "crossing"}),
        (3, 4, 40.0, {"highway": "footway"}),
    ]
    graph = FakeGraph(edges)
    guide = directions.build(
        [1, 2, 3, 4],
        north(0.0, 4),
        graph,
        FakeBuilding("A", -0.001, 0.0),
        FakeBuilding("B", 0.001, 0.0),
    )
    assert any(s["text"] == "Cross the road" for s in guide["steps"])


def test_a_straight_path_is_one_step_not_many():
    # ten short edges in a line, which is what the graph really looks like
    edges = [(i, i + 1, 12.0, {"highway": "footway"}) for i in range(1, 11)]
    graph = FakeGraph(edges)
    guide = directions.build(
        list(range(1, 12)),
        north(0.0, 11),
        graph,
        FakeBuilding("A", -0.001, 0.0),
        FakeBuilding("B", 0.002, 0.0),
    )

    walks = [s for s in guide["steps"] if s["kind"] == "walk"]
    assert len(walks) == 1
    assert walks[0]["text"] == "Head north"
    assert guide["turns"] == 0


def test_steps_get_their_own_line():
    edges = [
        (1, 2, 40.0, {"highway": "footway"}),
        (2, 3, 5.0, {"highway": "steps"}),
        (3, 4, 6.0, {"highway": "steps"}),
        (4, 5, 40.0, {"highway": "footway"}),
    ]
    graph = FakeGraph(edges)
    guide = directions.build(
        [1, 2, 3, 4, 5],
        north(0.0, 5),
        graph,
        FakeBuilding("A", -0.001, 0.0),
        FakeBuilding("B", 0.001, 0.0),
    )

    stairs = [s for s in guide["steps"] if s["kind"] == "steps"]
    assert len(stairs) == 1
    assert stairs[0]["text"] == "Take the steps"
    assert stairs[0]["metres"] == 11


def test_the_walk_starts_and_ends_at_the_buildings():
    edges = [
        (1, 2, 20.0, {}),
        (2, 3, 60.0, {"highway": "footway"}),
        (3, 4, 20.0, {}),
    ]
    graph = FakeGraph(edges)
    guide = directions.build(
        [1, 2, 3, 4],
        north(0.0, 4),
        graph,
        FakeBuilding("ARC", -0.002, 0.0),
        FakeBuilding("SES", 0.004, 0.0),
    )

    first, last = guide["steps"][0], guide["steps"][-1]
    assert first["kind"] == "start"
    assert first["text"].startswith("Leave ARC on the")
    assert last["kind"] == "end"
    assert last["text"].startswith("Arrive at SES,")


def test_share_on_footpath_ignores_the_building_links():
    # the link edges carry no highway tag and are not really walking
    edges = [
        (1, 2, 20.0, {}),
        (2, 3, 75.0, {"highway": "footway"}),
        (3, 4, 25.0, {"highway": "service"}),
        (4, 5, 20.0, {}),
    ]
    graph = FakeGraph(edges)
    guide = directions.build(
        [1, 2, 3, 4, 5],
        north(0.0, 5),
        graph,
        FakeBuilding("A", -0.002, 0.0),
        FakeBuilding("B", 0.005, 0.0),
    )
    assert guide["onFootpath"] == 75


def test_short_zigzags_still_count_as_turns():
    """Short legs fold out of the list but used to fold out of the turn count too."""
    # four hard corners, each leg too short to earn its own line
    points = [
        (0.0, 0.0),
        (0.0002, 0.0),
        (0.0002, 0.0002),
        (0.0004, 0.0002),
        (0.0004, 0.0004),
        (0.0006, 0.0004),
    ]
    edges = [(i, i + 1, 22.0, {"highway": "footway"}) for i in range(1, 6)]
    graph = FakeGraph(edges)

    guide = directions.build(
        list(range(1, 7)),
        points,
        graph,
        FakeBuilding("A", -0.001, 0.0),
        FakeBuilding("B", 0.001, 0.0004),
    )

    # every leg is under the thirty metre fold, so the list is short
    walks = [s for s in guide["steps"] if s["kind"] == "walk"]
    assert len(walks) < 4
    # but the corners are still real and still counted
    assert guide["turns"] >= 4


def test_turning_a_corner_counts_once():
    # north for a while, then a hard right and east for a while
    points = [(0.0, 0.0), (0.0006, 0.0), (0.0012, 0.0), (0.0012, 0.0008), (0.0012, 0.0016)]
    edges = [
        (1, 2, 66.0, {"highway": "footway"}),
        (2, 3, 66.0, {"highway": "footway"}),
        (3, 4, 66.0, {"highway": "footway"}),
        (4, 5, 66.0, {"highway": "footway"}),
    ]
    graph = FakeGraph(edges)
    guide = directions.build(
        [1, 2, 3, 4, 5],
        points,
        graph,
        FakeBuilding("A", -0.001, 0.0),
        FakeBuilding("B", 0.0012, 0.002),
    )

    assert guide["turns"] == 1
    walks = [s["text"] for s in guide["steps"] if s["kind"] == "walk"]
    assert walks == ["Head north", "Continue east"]
