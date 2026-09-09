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
        # all three of these hold a connection pool for the life of the
        # process, so shutting down without letting go leaves sockets open
        engine_client.close()
        engine_process.close()
        weather.close()


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
                    return await self._refuse(send, 413, "That request was too big.")
            except ValueError:
                return await self._refuse(send, 400, "We could not read that request.")

        # read it ourselves so an undeclared body is counted too. ours are
        # a few hundred bytes, so holding one is not a problem.
        chunks: list[bytes] = []
        seen = 0
        gone = False
        while True:
            message = await receive()
            # a caller that hung up halfway has to stay hung up. replaying
            # what arrived as a whole body would send us off doing a search
            # for somebody who is not there any more.
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

DEFAULT_RATE = (60, 60.0)


def parse_rate(text: str) -> tuple[int, float]:
    """Turns something like 60/minute into a count and a window.

    A value we cannot read falls back instead of raising, because this
    runs at import and a typo in an env var would otherwise be a crash
    loop rather than a bad setting.
    """
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
    """Who to count a request against.

    Behind railway every connection arrives from the proxy, so the socket
    address is the same for everybody and one caller could use up the
    allowance for the whole site.
    """
    if settings.trust_proxy_headers:
        # a caller can send this header too, and anything they wrote lands
        # in front of what our proxy appended, so read every line of it
        # and take the last entry rather than the first one we come across.
        parts: list[str] = []
        for name, value in scope.get("headers") or []:
            if name == b"x-forwarded-for":
                parts.extend(p.strip() for p in value.decode("latin-1").split(","))
        parts = [p for p in parts if p]
        if parts:
            return parts[-1]
    client = scope.get("client")
    return client[0] if client else "unknown"


# how many callers we hold counts for, and what a sweep leaves behind.
# expiring old entries alone cannot shrink a table where everybody is
# current, so there has to be a ceiling as well.
MAX_TRACKED = 20000
KEEP_AFTER_SWEEP = 15000


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
        self._swept_at = 0.0

    def _sweep(self, now: float) -> None:
        """Drops callers we no longer need to count.

        Expiring the old ones is usually enough, but a burst of addresses
        can all be current at once, so there is a hard ceiling too.
        """
        self.seen = {k: v for k, v in self.seen.items() if now - v[0] < self.window_s}
        if len(self.seen) > MAX_TRACKED:
            # oldest windows go first, and it drops well under the ceiling
            # so the next sweep is a long way off and this stays cheap
            newest = sorted(self.seen.items(), key=lambda kv: kv[1][0], reverse=True)
            self.seen = dict(newest[:KEEP_AFTER_SWEEP])

    def allow(self, key: str, now: float) -> bool:
        started, count = self.seen.get(key, (now, 0))
        if now - started >= self.window_s:
            started, count = now, 0
        count += 1
        self.seen[key] = (started, count)

        # sweeping walks the whole table, so it runs on a timer or when the
        # table is too big, never on every request
        if len(self.seen) > MAX_TRACKED or now - self._swept_at >= self.window_s:
            self._swept_at = now
            self._sweep(now)
        return count <= self.limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        if not self.allow(client_address(scope), time.monotonic()):
            # says what to do about it, since a count and a window is not
            # something anyone reading it can act on
            response = JSONResponse(
                {"detail": "Too many requests. Wait a moment and try again."},
                status_code=429,
            )
            return await response(scope, receive, send)

        return await self.app(scope, receive, send)


_limit, _window = parse_rate(settings.rate_limit)

# these are added inside out, because add_middleware puts each new one in
# front of the last. so the order below is back to front and the stack
# ends up cors, then the limit, then the body cap, then gzip and routes.

# a race with traces is a few hundred kilobytes of coordinates, which
# is mostly repeated digits and squashes down a long way
app.add_middleware(GZipMiddleware, minimum_size=2000)

app.add_middleware(BodySizeLimit, max_bytes=MAX_BODY_BYTES)

# the api is public and read only, so there is nothing to log in to.
# a per address limit is all the protection it needs. it sits outside the
# body cap so a throttled caller is turned away before we read anything.
app.add_middleware(RateLimit, limit=_limit, window_s=_window)

# outermost on purpose. a 429 or a 413 with no cors headers on it is
# unreadable to the browser, which then reports a network error instead
# of the reason we went to the trouble of sending.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

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
