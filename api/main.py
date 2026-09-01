"""Campus Router gateway.

Public API for the frontend. It also owns the C++ engine process.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

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

# the api is public and read only, so there is nothing to log in to.
# a per address limit is all the protection it needs.
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

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
