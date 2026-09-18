"""Loads the campus graph once and answers questions about buildings."""

import json
import logging
import re
import threading
import unicodedata
from typing import Optional

from api.core.config import settings

log = logging.getLogger("graph")


def _pair(a: int, b: int) -> tuple:
    return (a, b) if a < b else (b, a)


def _fold(text: str) -> str:
    # the web search folds the same way, so change both together
    stripped = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in stripped if not unicodedata.combining(c))
    stripped = stripped.lower().replace("&", "and").replace("-", " ")
    # any run of spaces, like the client, or names fold differently on each side
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

        # buildings are nodes with the negative osm id
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
        # for directions. edges are keyed by the node pair, in either order
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
                # two ways can share a segment, keep the first and log it
                if pair in self.edges:
                    log.warning("two edges join %s and %s, keeping the first", *pair)
                    continue
                self.edges[pair] = edge

            # links are not in the edge list, and without them every step list
            # came up short at both ends
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
                        # no highway on purpose, nobody is told to walk a link
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
        # either order works
        return self.edges.get(_pair(a, b))

    def resolve(self, key: str) -> Optional[Building]:
        # a building id, a node id or a building code
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
