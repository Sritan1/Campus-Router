from pipeline import transform


def raw_bundle():
    """A tiny stand in for the overpass dump.

    Two joined footways, one stray path off on its own, and a building.
    """
    return {
        "campus_relation": 1,
        "campus_bounds": {},
        "query_box": [],
        "ways": {
            "elements": [
                {"type": "node", "id": 1, "lat": 41.8700, "lon": -87.6500},
                {"type": "node", "id": 2, "lat": 41.8701, "lon": -87.6500},
                {"type": "node", "id": 3, "lat": 41.8702, "lon": -87.6500},
                {"type": "node", "id": 90, "lat": 41.8800, "lon": -87.6600},
                {"type": "node", "id": 91, "lat": 41.8801, "lon": -87.6600},
                {
                    "type": "way",
                    "id": 100,
                    "nodes": [1, 2, 3],
                    "tags": {"highway": "footway", "surface": "concrete"},
                },
                {
                    "type": "way",
                    "id": 101,
                    "nodes": [90, 91],
                    "tags": {"highway": "footway"},
                },
                {
                    "type": "way",
                    "id": 102,
                    "nodes": [1, 2],
                    "tags": {"highway": "motorway"},
                },
            ]
        },
        "buildings": {
            "elements": [
                {
                    "type": "way",
                    "id": 500,
                    "center": {"lat": 41.8701, "lon": -87.65005},
                    "tags": {"building": "yes", "name": "Test Hall", "ref": "TH;THX"},
                },
                {
                    "type": "way",
                    "id": 501,
                    "center": {"lat": 41.8701, "lon": -87.65005},
                    "tags": {"building": "yes"},
                },
            ]
        },
        "entrances": {"elements": [{"type": "node", "id": 2}]},
    }


def test_surface_normalising():
    assert transform.normalise_surface(None) == "unknown"
    assert transform.normalise_surface("") == "unknown"
    assert transform.normalise_surface(" Concrete ") == "concrete"
    # subtypes collapse onto the parent surface
    assert transform.normalise_surface("concrete:plates") == "concrete"


def test_class_key_uses_only_the_tags_we_trust():
    key = transform.class_key(
        {"highway": "footway", "surface": "asphalt", "tactile_paving": "yes",
         "lit": "yes", "covered": "no", "wheelchair": "yes"}
    )
    # lit, covered and wheelchair are too sparse to key on, so they stay out
    assert key == "footway|asphalt|tactile"


def test_class_key_handles_missing_tags():
    assert transform.class_key({"highway": "steps"}) == "steps|unknown|none"


def test_refs_split_into_abbr_and_aliases():
    abbr, aliases = transform.pick_refs({"ref": "SEL;SELE;SELW"})
    assert abbr == "SEL"
    assert aliases == ["SELE", "SELW"]


def test_refs_when_there_are_none():
    assert transform.pick_refs({}) == (None, [])


def test_ways_split_into_one_edge_per_segment():
    raw = raw_bundle()
    nodes = transform.build_nodes(raw)
    edges = transform.build_edges(raw, nodes)

    # way 100 has three nodes so it makes two edges, way 101 makes one
    assert len(edges) == 3
    assert all(e["length_m"] > 0 for e in edges)


def test_non_walkable_ways_are_skipped():
    raw = raw_bundle()
    nodes = transform.build_nodes(raw)
    edges = transform.build_edges(raw, nodes)
    # the motorway shares nodes 1 and 2 but must not appear
    assert all(e["way_id"] != 102 for e in edges)


def test_edges_are_stored_once_per_pair():
    raw = raw_bundle()
    nodes = transform.build_nodes(raw)
    edges = transform.build_edges(raw, nodes)
    pairs = [(e["u"], e["v"]) for e in edges]
    assert len(pairs) == len(set(pairs))
    # stored low id first so the pair is stable
    assert all(u < v for u, v in pairs)


def test_largest_component_drops_the_stray_path():
    raw = raw_bundle()
    nodes = transform.build_nodes(raw)
    edges = transform.build_edges(raw, nodes)

    biggest = transform.largest_component(edges)
    assert biggest == {1, 2, 3}
    assert 90 not in biggest


def test_building_links_prefer_a_real_entrance():
    raw = raw_bundle()
    nodes = transform.build_nodes(raw)
    edges = transform.build_edges(raw, nodes)
    network = {e["u"] for e in edges} | {e["v"] for e in edges}

    buildings = transform.build_buildings(raw, nodes, network, {2})
    assert len(buildings) == 1

    hall = buildings[0]
    assert hall["name"] == "Test Hall"
    assert hall["abbr"] == "TH"
    assert hall["aliases"] == ["THX"]
    assert hall["linked_via_entrance"] is True
    assert hall["links"][0]["node_id"] == 2


def test_unnamed_buildings_are_dropped():
    raw = raw_bundle()
    nodes = transform.build_nodes(raw)
    edges = transform.build_edges(raw, nodes)
    network = {e["u"] for e in edges} | {e["v"] for e in edges}

    buildings = transform.build_buildings(raw, nodes, network, set())
    # building 501 has no name so it cannot be searched for
    assert [b["id"] for b in buildings] == ["500"]


def test_entrances_off_any_way_still_get_a_position():
    raw = raw_bundle()
    raw["entrances"]["elements"].append(
        {"type": "node", "id": 700, "lat": 41.8703, "lon": -87.6500}
    )
    nodes = transform.build_nodes(raw)
    # node 700 sits on no way at all, which is the case a patch needs
    assert nodes[700] == (41.8703, -87.6500)


def test_a_patch_joins_two_known_nodes():
    raw = raw_bundle()
    raw["entrances"]["elements"].append(
        {"type": "node", "id": 700, "lat": 41.8703, "lon": -87.6500}
    )
    nodes = transform.build_nodes(raw)
    edges = transform.build_edges(raw, nodes)
    before = len(edges)

    added = transform.apply_patches(
        edges, nodes, [{"u": 3, "v": 700, "tags": {"highway": "footway"}}]
    )
    assert added == 1
    assert len(edges) == before + 1

    patch = edges[-1]
    assert patch["way_id"] == transform.PATCH_WAY_ID
    assert patch["class_key"] == "footway|unknown|none"
    assert patch["length_m"] > 0
    # the patched node is now part of the network
    assert 700 in transform.largest_component(edges)


def test_a_patch_openstreetmap_already_has_is_skipped():
    raw = raw_bundle()
    nodes = transform.build_nodes(raw)
    edges = transform.build_edges(raw, nodes)
    before = len(edges)

    # nodes 1 and 2 are already joined by way 100
    added = transform.apply_patches(
        edges, nodes, [{"u": 1, "v": 2, "tags": {"highway": "footway"}}]
    )
    assert added == 0
    assert len(edges) == before


def test_a_patch_naming_an_unknown_node_stops_the_build():
    raw = raw_bundle()
    nodes = transform.build_nodes(raw)
    edges = transform.build_edges(raw, nodes)

    try:
        transform.apply_patches(
            edges, nodes, [{"u": 1, "v": 999999, "tags": {"highway": "footway"}}]
        )
    except SystemExit:
        return
    raise AssertionError("a patch pointing at a missing node should fail loudly")
