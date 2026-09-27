"""Campus Router gateway. The public api for the frontend, and owner of the engine process."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
import time

from api.core.config import settings
from api.routes.routing import router as routing_router
from api.services import engine_client, engine_process, weather
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
        # each holds a connection pool, so let go of them on the way out
        engine_client.close()
        engine_process.close()
        weather.close()


app = FastAPI(title="Campus Router API", version="0.1.0", lifespan=lifespan)

# real bodies are a few hundred bytes, and starlette reads until memory runs out
MAX_BODY_BYTES = 64 * 1024


# counts the bytes itself, since a chunked request sends no content length
class BodySizeLimit:
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
                    return await self._refuse(send, 413, "That request was too big.")
            except ValueError:
                return await self._refuse(send, 400, "We could not read that request.")

        chunks: list[bytes] = []
        seen = 0
        gone = False
        while True:
            message = await receive()
            # a caller that hung up halfway stays hung up, or we search for nobody
            if message["type"] == "http.disconnect":
                gone = True
                break
            if message["type"] != "http.request":
                break
            piece = message.get("body", b"")
            seen += len(piece)
            if seen > self.max_bytes:
                return await self._refuse(send, 413, "That request was too big.")
            chunks.append(piece)
            if not message.get("more_body", False):
                break

        body = b"".join(chunks)
        replayed = False

        async def replay():
            nonlocal replayed
            if replayed or gone:
                return {"type": "http.disconnect"}
            replayed = True
            return {"type": "http.request", "body": body, "more_body": False}

        return await self.app(scope, replay, send)

# starlette answers a crash outside cors, so catch it in here
class CatchErrors:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        started = False

        async def watch(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, watch)
        except Exception:
            log.exception("request failed")
            if started:
                raise
            response = JSONResponse(
                {"detail": "Something went wrong on our side."}, status_code=500
            )
            await response(scope, receive, send)


DEFAULT_RATE = (60, 60.0)


def parse_rate(text: str) -> tuple[int, float]:
    # runs at import, so a bad value falls back rather than crash looping the app
    windows = {"second": 1.0, "minute": 60.0, "hour": 3600.0, "day": 86400.0}

    # only the first rule counts, and the word per reads the same as a slash
    first = text.split(";")[0].strip().replace(" per ", "/")
    count, _, unit = first.partition("/")

    # accepts minute, minutes, and the 1minute form slowapi allowed
    unit = unit.strip().lower().lstrip("0123456789").rstrip("s")
    if unit not in windows or not count.strip().isdigit():
        log.warning("cannot read a rate limit out of %r, using 60 a minute", text)
        return DEFAULT_RATE
    return int(count.strip()), windows[unit]


def client_address(scope) -> str:
    # behind railway the socket address is always the proxy
    if settings.trust_proxy_headers:
        # callers can send this header too and our proxy appends to it, so read
        # every line and take the last entry
        parts: list[str] = []
        for name, value in scope.get("headers") or []:
            if name == b"x-forwarded-for":
                parts.extend(p.strip() for p in value.decode("latin-1").split(","))
        parts = [p for p in parts if p]
        if parts:
            return parts[-1]
    client = scope.get("client")
    return client[0] if client else "unknown"


# expiring alone cannot shrink a table where everyone is current, so cap it too
MAX_TRACKED = 20000
KEEP_AFTER_SWEEP = 15000


# hand rolled because slowapi called every include_router route exempt, since
# fastapi wraps those in objects with no endpoint
class RateLimit:
    def __init__(self, app, limit: int, window_s: float) -> None:
        self.app = app
        self.limit = limit
        self.window_s = window_s
        self.seen: dict[str, tuple[float, int]] = {}
        self._swept_at = 0.0

    def _sweep(self, now: float) -> None:
        self.seen = {k: v for k, v in self.seen.items() if now - v[0] < self.window_s}
        if len(self.seen) > MAX_TRACKED:
            # drop well under the ceiling so the next sweep is a long way off
            newest = sorted(self.seen.items(), key=lambda kv: kv[1][0], reverse=True)
            self.seen = dict(newest[:KEEP_AFTER_SWEEP])

    def allow(self, key: str, now: float) -> bool:
        started, count = self.seen.get(key, (now, 0))
        if now - started >= self.window_s:
            started, count = now, 0
        count += 1
        self.seen[key] = (started, count)

        # sweeping walks the whole table, so not on every request
        if len(self.seen) > MAX_TRACKED or now - self._swept_at >= self.window_s:
            self._swept_at = now
            self._sweep(now)
        return count <= self.limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        if not self.allow(client_address(scope), time.monotonic()):
            response = JSONResponse(
                {"detail": "Too many requests. Wait a moment and try again."},
                status_code=429,
            )
            return await response(scope, receive, send)

        return await self.app(scope, receive, send)


_limit, _window = parse_rate(settings.rate_limit)

# add_middleware puts each new one in front, so this reads back to front.
# the real order is cors, errors, the limit, the body cap, then gzip and routes

# race traces are mostly repeated digits and compress well
app.add_middleware(GZipMiddleware, minimum_size=2000)

app.add_middleware(BodySizeLimit, max_bytes=MAX_BODY_BYTES)

# outside the body cap so a throttled caller is turned away before any reading
app.add_middleware(RateLimit, limit=_limit, window_s=_window)

app.add_middleware(CatchErrors)

# outermost, since a 429 or 413 without cors headers reads as a network error
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(routing_router)


@app.get("/api/health")
def health():
    """Railway checks this, so a dead engine has to fail it."""
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
