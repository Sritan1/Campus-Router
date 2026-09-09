"""Talks to the C++ engine over loopback."""

import logging
from typing import Optional

import httpx

from api.core.config import settings

log = logging.getLogger("engine_client")


class EngineUnavailable(RuntimeError):
    """The engine could not be reached or did not answer properly."""


class EngineRejected(RuntimeError):
    """The engine understood us and said no."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


class EngineOutOfDate(RuntimeError):
    """The engine is running but does not know this endpoint.

    The engine is compiled once when the gateway starts and never
    rebuilds itself, so an old binary can be answering happily while the
    source has moved on. Only ever a local build problem.
    """

    def __init__(self, path: str) -> None:
        super().__init__(f"engine has no {path}, its binary is older than this code")
        self.path = path


# One client for the life of the process. Building a fresh one per call
# costs about half a second, which dwarfed the engine answering in under
# a millisecond. Measured at 577 ms against 4 ms reusing this.
_client = httpx.Client(timeout=settings.engine_timeout_s)


def close() -> None:
    """Let go of the connection pool on shutdown.

    Puts a fresh client back, because closing one is permanent and the
    tests start the app more than once in a single process.
    """
    global _client
    _client.close()
    _client = httpx.Client(timeout=settings.engine_timeout_s)


def _post(path: str, payload: dict) -> dict:
    url = f"{settings.engine_base_url}{path}"
    try:
        reply = _client.post(url, json=payload)
    except httpx.HTTPError as exc:
        raise EngineUnavailable(f"could not reach the engine, {exc}") from exc

    try:
        body = reply.json()
    except ValueError as exc:
        raise EngineUnavailable("engine sent back something that is not json") from exc

    if reply.status_code >= 500:
        raise EngineUnavailable(f"engine returned {reply.status_code}")

    if reply.status_code >= 400:
        message = body.get("error", "engine said no")
        # the engine says this when it has never heard of the path, which
        # means the binary is older than the code asking. that is a build
        # problem, not something a visitor can act on, so it goes to the
        # log and they get the plain unavailable answer.
        if "no such endpoint" in message:
            raise EngineOutOfDate(path)
        raise EngineRejected(reply.status_code, message)

    return body


def route(
    start_node: int,
    target_node: int,
    algorithms: list[str],
    cost: dict,
    trace: bool = False,
    max_trace_samples: Optional[int] = None,
) -> dict:
    """Ask the engine for one or more routes."""
    payload = {
        "start": start_node,
        "target": target_node,
        "algorithms": algorithms,
        "trace": trace,
        "cost": {
            "default": cost.get("default", 1.0),
            "multipliers": cost.get("multipliers", {}),
            "blocked": cost.get("blocked", []),
        },
    }
    if max_trace_samples is not None:
        payload["maxTraceSamples"] = max_trace_samples

    return _post("/route", payload)


def isochrone(start_node: int, limit_m: float, cost: dict) -> dict:
    """Ask what is reachable from a node within a cost ceiling."""
    payload = {
        "start": start_node,
        "limit": limit_m,
        "cost": {
            "default": cost.get("default", 1.0),
            "multipliers": cost.get("multipliers", {}),
            "blocked": cost.get("blocked", []),
        },
    }
    return _post("/isochrone", payload)


def meta() -> dict:
    try:
        reply = _client.get(f"{settings.engine_base_url}/graph/meta")
        reply.raise_for_status()
        return reply.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise EngineUnavailable(f"could not read engine meta, {exc}") from exc
