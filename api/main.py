"""Campus Router gateway.

Public API for the frontend. It also owns the C++ engine process.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from api.core.config import settings
from api.services.engine_process import engine

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("gateway")


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine.start()
    try:
        yield
    finally:
        engine.stop()


app = FastAPI(title="Campus Router API", version="0.0.1", lifespan=lifespan)


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
