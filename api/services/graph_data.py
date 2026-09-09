"""Loads the campus graph once and answers questions about buildings.

The engine routes between node ids. Buildings are nodes too, with the
negative of their openstreetmap id, so resolving a search result to a
routing target is just a sign flip.
"""

import json
import logging
import re
import threading
import unicodedata
from typing import Optional

from api.core.config import settings

log = logging.getLogger("graph")


def _pair(a: int, b: int) -> tuple:
    """Two node ids in a fixed order, so either way round finds the edge."""
    return (a, b) if a < b else (b, a)


def _fold(text: str) -> str:
    """Lowercases and flattens text so search is forgiving.

    Openstreetmap writes both and and ampersand, and accents show up in
    a few names. web/lib/search.ts does the same thing for the client,
    so a change here belongs there too.
    """
    stripped = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in stripped if not unicodedata.combining(c))
    stripped = stripped.lower().replace("&", "and").replace("-", " ")
    # any run of spaces, not just a pair of them. the client collapsed all
    # of them and this collapsed two, so the same name folded differently
    # on either side.
    return re.sub(r"\s+", " ", stripped).strip()


class Building:
    def __init__(self, raw: dict) -> None:
        self.id = raw["id"]
        self.name = raw["name"]
        self.abbr = raw.get("abbr")
        self.aliases = raw.get("aliases") or []
        self.wheelchair = raw.get("wheelchair")
        self.lat = raw["centroid"]["lat"]
        self.lon = raw["centroid"]["lon"]
        self.linked_via_entrance = raw.get("linked_via_entrance", False)

        # what the engine calls this building
        self.node_id = -int(self.id)

        terms = [self.name] + list(self.aliases)
        if self.abbr:
            terms.append(self.abbr)
        self.search_terms = [_fold(t) for t in terms]

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "nodeId": self.node_id,
            "name": self.name,
            "abbr": self.abbr,
            "aliases": self.aliases,
            "wheelchair": self.wheelchair,
            "lat": self.lat,
            "lon": self.lon,
        }


class GraphData:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded = False
        self.buildings: list[Building] = []
        self.by_id: dict[str, Building] = {}
        self.by_node: dict[int, Building] = {}
        self.meta: dict = {}
        self.classes: list[str] = []
        # directions walk the route edge by edge, so both of these are
        # keyed by the pair of node ids in either order
        self.edges: dict[tuple, dict] = {}
        self.nodes: dict[int, tuple] = {}

    def load(self) -> None:
        with self._lock:
            if self._loaded:
                return

            log.info("loading graph from %s", settings.graph_json_path)
            with open(settings.graph_json_path, encoding="utf-8") as handle:
                raw = json.load(handle)

            self.buildings = [Building(b) for b in raw["buildings"]]
            self.by_id = {b.id: b for b in self.buildings}
            self.by_node = {b.node_id: b for b in self.buildings}
            self.classes = [c["class_key"] for c in raw["classes"]]
            self.meta = raw["meta"]

            self.nodes = {n["id"]: (n["lat"], n["lon"]) for n in raw["nodes"]}
            self.edges = {}
            for edge in raw["edges"]:
                pair = _pair(edge["u"], edge["v"])
                # two ways can share a segment, so keep the first and say
                # so rather than letting the second quietly replace it
                if pair in self.edges:
                    log.warning("two edges join %s and %s, keeping the first", *pair)
                    continue
                self.edges[pair] = edge

            # the engine walks these too, but they hang off the building
            # rather than sitting in the edge list, so directions never saw
            # them and every step list came up short by both of its ends
            links = 0
            for building in raw["buildings"]:
                node_id = -int(building["id"])
                for link in building["links"]:
                    pair = _pair(node_id, link["node_id"])
                    if pair in self.edges:
                        continue
                    self.edges[pair] = {
                        "u": pair[0],
                        "v": pair[1],
                        "length_m": link["distance_m"],
                        # no highway on purpose. a link is how you get on
                        # the network, not a path anyone is told to walk.
                        "tags": {},
                    }
                    links += 1

            self._loaded = True

            log.info(
                "graph ready, %d buildings and %d classes and %d edges plus %d links",
                len(self.buildings),
                len(self.classes),
                len(self.edges) - links,
                links,
            )

    def edge_between(self, a: int, b: int) -> Optional[dict]:
        """The edge joining two nodes, whichever way round they came."""
        return self.edges.get(_pair(a, b))

    def search(self, query: str, limit: int = 10) -> list[Building]:
        """Finds buildings by name, code or alias.

        An exact code match wins, then anything starting with the query,
        then anything containing it.
        """
        wanted = _fold(query)
        if not wanted:
            return self.buildings[:limit]

        exact, starts, contains = [], [], []
        for building in self.buildings:
            if building.abbr and _fold(building.abbr) == wanted:
                exact.append(building)
            elif any(term.startswith(wanted) for term in building.search_terms):
                starts.append(building)
            elif any(wanted in term for term in building.search_terms):
                contains.append(building)

        return (exact + starts + contains)[:limit]

    def resolve(self, key: str) -> Optional[Building]:
        """Turns whatever the client sent into a building.

        Accepts a building id, a node id, or a building code.
        """
        if key in self.by_id:
            return self.by_id[key]

        try:
            as_number = int(key)
        except (TypeError, ValueError):
            as_number = None

        if as_number is not None:
            if as_number in self.by_node:
                return self.by_node[as_number]
            if str(abs(as_number)) in self.by_id:
                return self.by_id[str(abs(as_number))]

        folded = _fold(key)
        for building in self.buildings:
            if building.abbr and _fold(building.abbr) == folded:
                return building
        return None


graph_data = GraphData()
