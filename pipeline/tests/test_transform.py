from pipeline import transform


def raw_bundle():
    """A tiny stand in for the overpass dump.

    Two joined footways, one stray path off on its own, and a building.
    """
    return {
        "campus_relations": [1],
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


def stepped_bundle():
    """A building whose closest paths are only reachable up steps.

    Three nodes right at the door in their own little pocket, a bigger
    network further off, and steps as the only thing joining them.
    """
    return {
        "campus_relations": [1],
        "campus_bounds": {},
        "query_box": [],
        "ways": {
            "elements": [
                {"type": "node", "id": 10, "lat": 41.87000, "lon": -87.65000},
                {"type": "node", "id": 11, "lat": 41.87001, "lon": -87.65000},
                {"type": "node", "id": 12, "lat": 41.87002, "lon": -87.65000},
                {"type": "node", "id": 20, "lat": 41.87030, "lon": -87.65000},
                {"type": "node", "id": 21, "lat": 41.87040, "lon": -87.65000},
                {"type": "node", "id": 22, "lat": 41.87050, "lon": -87.65000},
                {"type": "node", "id": 23, "lat": 41.87060, "lon": -87.65000},
                {"type": "way", "id": 100, "nodes": [10, 11, 12],
                 "tags": {"highway": "footway"}},
                {"type": "way", "id": 101, "nodes": [20, 21, 22, 23],
                 "tags": {"highway": "footway"}},
                {"type": "way", "id": 102, "nodes": [12, 20],
                 "tags": {"highway": "steps"}},
            ]
        },
        "buildings": {
            "elements": [
                {"type": "way", "id": 500,
                 "center": {"lat": 41.870005, "lon": -87.65000},
                 "tags": {"building": "yes", "name": "Stranded Hall", "ref": "SH"}},
            ]
        },
        "entrances": {"elements": []},
    }


def stepped_parts():
    raw = stepped_bundle()
    nodes = transform.build_nodes(raw)
    edges = transform.build_edges(raw, nodes)
    network = {e["u"] for e in edges} | {e["v"] for e in edges}
    return raw, nodes, edges, network


def test_the_step_free_component_leaves_out_what_only_steps_reach():
    _, _, edges, _ = stepped_parts()
    free = transform.step_free_component(edges)
    # the bigger side wins, so the pocket by the door is the stranded one
    assert free == {20, 21, 22, 23}


def test_a_building_walled_in_by_steps_gets_a_step_free_link():
    raw, nodes, edges, network = stepped_parts()
    free = transform.step_free_component(edges)

    building = transform.build_buildings(raw, nodes, network, set(), free)[0]
    picked = [l["node_id"] for l in building["links"]]

    # the three nodes at the door are still there, they are the closest
    assert {10, 11, 12}.issubset(set(picked))
    # and one that can actually be reached without steps came with them
    assert 20 in picked
    assert building["step_free_fallback"] is True


def test_a_building_that_is_already_reachable_gains_nothing():
    raw, nodes, edges, network = stepped_parts()
    free = transform.step_free_component(edges)
    # move the building next to the main network instead
    raw["buildings"]["elements"][0]["center"] = {"lat": 41.87045, "lon": -87.65000}

    building = transform.build_buildings(raw, nodes, network, set(), free)[0]
    assert building["step_free_fallback"] is False
    assert all(n in free for n in [l["node_id"] for l in building["links"]])


def test_without_a_step_free_set_the_rescue_stays_out_of_the_way():
    raw, nodes, edges, network = stepped_parts()
    building = transform.build_buildings(raw, nodes, network, set())[0]
    assert building["step_free_fallback"] is False
    assert [l["node_id"] for l in building["links"]] == [10, 11, 12]


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
