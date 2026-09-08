"""Campus Router gateway.

Public API for the frontend. It also owns the C++ engine process.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
import time

from api.core.config import settings
from api.routes.routing import router as routing_router
from api.services.engine_process import engine
from api.services.graph_data import graph_data

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("gateway")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # load the graph before the engine so a bad data file fails fast
    graph_data.load()
    engine.start()
    try:
        yield
    finally:
        engine.stop()


app = FastAPI(title="Campus Router API", version="0.1.0", lifespan=lifespan)

# nothing we accept is bigger than a few hundred bytes, and starlette
# will happily read a body until it runs out of memory otherwise
MAX_BODY_BYTES = 64 * 1024


class BodySizeLimit:
    """Refuses a body over the cap, whether or not it says how big it is.

    Trusting content-length alone is not enough. A chunked request does
    not send one at all, and a first version of this let half a megabyte
    walk straight past because of it.
    """

    def __init__(self, app, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def _refuse(self, send, status: int, detail: str) -> None:
        await JSONResponse({"detail": detail}, status_code=status)(
            {"type": "http"}, None, send
        )

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        headers = dict(scope.get("headers") or [])
        declared = headers.get(b"content-length")
        if declared is not None:
            try:
                if int(declared) > self.max_bytes:
                    return await self._refuse(send, 413, "request body too large")
            except ValueError:
                return await self._refuse(send, 400, "bad content length")

        # read it ourselves so an undeclared body is counted too. ours are
        # a few hundred bytes, so holding one is not a problem.
        chunks: list[bytes] = []
        seen = 0
        while True:
            message = await receive()
            if message["type"] != "http.request":
                break
            piece = message.get("body", b"")
            seen += len(piece)
            if seen > self.max_bytes:
                return await self._refuse(send, 413, "request body too large")
            chunks.append(piece)
            if not message.get("more_body", False):
                break

        body = b"".join(chunks)
        replayed = False

        async def replay():
            nonlocal replayed
            if replayed:
                return {"type": "http.disconnect"}
            replayed = True
            return {"type": "http.request", "body": body, "more_body": False}

        return await self.app(scope, replay, send)

def parse_rate(text: str) -> tuple[int, float]:
    """Turns something like 60/minute into a count and a window."""
    windows = {"second": 1.0, "minute": 60.0, "hour": 3600.0, "day": 86400.0}
    count, _, unit = text.partition("/")
    unit = unit.strip().rstrip("s").lower()
    if unit not in windows or not count.strip().isdigit():
        raise ValueError(f"cannot read a rate limit out of {text!r}")
    return int(count.strip()), windows[unit]


def client_address(scope) -> str:
    """Who to count a request against.

    Behind railway every connection arrives from the proxy, so the socket
    address is the same for everybody and one caller could use up the
    allowance for the whole site.
    """
    if settings.trust_proxy_headers:
        for name, value in scope.get("headers") or []:
            if name == b"x-forwarded-for":
                parts = [p.strip() for p in value.decode("latin-1").split(",")]
                parts = [p for p in parts if p]
                # the LAST entry is the one our own proxy appended. the
                # first is whatever the caller typed, so keying on that
                # would hand a fresh allowance to anyone who sends it.
                if parts:
                    return parts[-1]
    client = scope.get("client")
    return client[0] if client else "unknown"


class RateLimit:
    """A fixed window limit per caller, counted here rather than by a library.

    slowapi did this until fastapi started wrapping included routers.
    Its middleware looks the route handler up in `app.routes`, finds a
    wrapper object with no endpoint on it, and treats the request as
    exempt, so every route added by `include_router` was unlimited and
    said nothing about it. Counting here needs no route lookup at all.

    One process holds its own counts, so several workers each allow the
    limit. That is fine for what this protects against.
    """

    def __init__(self, app, limit: int, window_s: float) -> None:
        self.app = app
        self.limit = limit
        self.window_s = window_s
        self.seen: dict[str, tuple[float, int]] = {}

    def allow(self, key: str, now: float) -> bool:
        started, count = self.seen.get(key, (now, 0))
        if now - started >= self.window_s:
            started, count = now, 0
        count += 1
        self.seen[key] = (started, count)

        # keep the table from growing forever on a long run
        if len(self.seen) > 10000:
            self.seen = {
                k: v for k, v in self.seen.items() if now - v[0] < self.window_s
            }
        return count <= self.limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        if not self.allow(client_address(scope), time.monotonic()):
            response = JSONResponse(
                {"detail": f"rate limit exceeded, {self.limit} per "
                           f"{int(self.window_s)} seconds"},
                status_code=429,
            )
            return await response(scope, receive, send)

        return await self.app(scope, receive, send)


_limit, _window = parse_rate(settings.rate_limit)

# the api is public and read only, so there is nothing to log in to.
# a per address limit is all the protection it needs.
app.add_middleware(RateLimit, limit=_limit, window_s=_window)

# outermost, so an oversized body is turned away before anything reads it
app.add_middleware(BodySizeLimit, max_bytes=MAX_BODY_BYTES)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# a race with traces is a few hundred kilobytes of coordinates, which
# is mostly repeated digits and squashes down a long way
app.add_middleware(GZipMiddleware, minimum_size=2000)

app.include_router(routing_router)


@app.get("/api/health")
def health():
    """Railway checks this, so it has to include the engine.

    A green container with a dead engine would be a lie.
    """
    engine_ok = engine.healthy()
    body = {
        "ok": engine_ok,
        "gateway": "up",
        "engine": "up" if engine_ok else "down",
        "engine_restarts": engine.restarts,
    }
    if engine.last_error:
        body["engine_error"] = engine.last_error

    return JSONResponse(body, status_code=200 if engine_ok else 503)
