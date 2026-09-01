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


def _post(path: str, payload: dict) -> dict:
    url = f"{settings.engine_base_url}{path}"
    try:
        reply = httpx.post(url, json=payload, timeout=settings.engine_timeout_s)
    except httpx.HTTPError as exc:
        raise EngineUnavailable(f"could not reach the engine, {exc}") from exc

    try:
        body = reply.json()
    except ValueError as exc:
        raise EngineUnavailable("engine sent back something that is not json") from exc

    if reply.status_code >= 500:
        raise EngineUnavailable(f"engine returned {reply.status_code}")
    if reply.status_code >= 400:
        raise EngineRejected(reply.status_code, body.get("error", "engine said no"))

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


def meta() -> dict:
    try:
        reply = httpx.get(
            f"{settings.engine_base_url}/graph/meta", timeout=settings.engine_timeout_s
        )
        reply.raise_for_status()
        return reply.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise EngineUnavailable(f"could not read engine meta, {exc}") from exc
