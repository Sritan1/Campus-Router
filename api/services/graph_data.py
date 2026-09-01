"""Loads the campus graph once and answers questions about buildings.

The engine routes between node ids. Buildings are nodes too, with the
negative of their openstreetmap id, so resolving a search result to a
routing target is just a sign flip.
"""

import json
import logging
import threading
import unicodedata
from typing import Optional

from api.core.config import settings

log = logging.getLogger("graph")


def _fold(text: str) -> str:
    """Lowercases and flattens text so search is forgiving.

    Openstreetmap writes both and and ampersand, and accents show up in
    a few names.
    """
    stripped = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in stripped if not unicodedata.combining(c))
    return stripped.lower().replace("&", "and").replace("-", " ").replace("  ", " ").strip()


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
            self._loaded = True

            log.info(
                "graph ready, %d buildings and %d classes",
                len(self.buildings),
                len(self.classes),
            )

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
