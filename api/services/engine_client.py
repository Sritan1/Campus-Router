"""Talks to the engine over loopback."""

import logging
from typing import Optional

import httpx

from api.core.config import settings

log = logging.getLogger("engine_client")


class EngineUnavailable(RuntimeError):
    """The engine could not be reached or did not answer properly."""


class EngineRejected(RuntimeError):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


class EngineOutOfDate(RuntimeError):
    """The engine binary is older than this code and lacks the endpoint."""

    def __init__(self, path: str) -> None:
        super().__init__(f"engine has no {path}, its binary is older than this code")
        self.path = path


# one client for the process. a fresh one per call measured 577 ms against 4 ms
_client = httpx.Client(timeout=settings.engine_timeout_s)


def close() -> None:
    # closing is permanent and tests start the app more than once
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
        # an old binary that lacks the path. a build problem, not a visitor one
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
