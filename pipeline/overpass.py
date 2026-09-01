"""Talks to the Overpass API and caches whatever comes back.

Every query result is written to .cache so reruns cost nothing and so
we are not hammering a free public service.
"""

import hashlib
import json
import pathlib
import time

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# overpass turns away clients that do not identify themselves
HEADERS = {"User-Agent": "campus-router/0.1 (student project, contact via github Sritan1)"}

CACHE_DIR = pathlib.Path(__file__).resolve().parent / ".cache"

MAX_ATTEMPTS = 4


class OverpassError(RuntimeError):
    pass


def _cache_path(name: str, query: str) -> pathlib.Path:
    # the hash means editing a query gets you a fresh pull automatically
    digest = hashlib.sha256(query.encode("utf-8")).hexdigest()[:12]
    return CACHE_DIR / f"{name}.{digest}.json"


def run(name: str, query: str, refresh: bool = False) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = _cache_path(name, query)

    if cached.exists() and not refresh:
        print(f"  {name}: using cache")
        return json.loads(cached.read_text(encoding="utf-8"))

    last_error = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            print(f"  {name}: querying overpass (attempt {attempt})")
            reply = httpx.post(
                OVERPASS_URL, data={"data": query}, headers=HEADERS, timeout=300
            )

            # 429 and 504 are overpass telling us to slow down or come back
            if reply.status_code in (429, 504):
                raise OverpassError(f"overpass busy, status {reply.status_code}")
            reply.raise_for_status()

            # a non json 200 happens when overpass returns an error page
            try:
                payload = reply.json()
            except ValueError as exc:
                raise OverpassError("overpass returned something that is not json") from exc

            cached.write_text(json.dumps(payload), encoding="utf-8")
            return payload

        except (httpx.HTTPError, OverpassError) as exc:
            last_error = exc
            if attempt < MAX_ATTEMPTS:
                wait = 5 * attempt
                print(f"  {name}: {exc}, retrying in {wait}s")
                time.sleep(wait)

    raise OverpassError(f"{name} failed after {MAX_ATTEMPTS} attempts: {last_error}")
