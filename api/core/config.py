"""Settings for the gateway. Everything comes from the environment."""

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]

# a local convenience only. real deployments set real environment
# variables, and those win because this does not override them.
load_dotenv(REPO_ROOT / "api" / ".env")


def _env(key: str, fallback: str) -> str:
    value = os.getenv(key, "").strip()
    return value or fallback


def _engine_binary_default() -> str:
    name = "campus_engine.exe" if os.name == "nt" else "campus_engine"
    return str(REPO_ROOT / "engine" / "build" / name)


class Settings:
    def __init__(self) -> None:
        self.log_level = _env("LOG_LEVEL", "INFO").upper()

        # the engine listens on loopback only so it is never reachable
        # from outside the container
        self.engine_bind_host = _env("ENGINE_BIND_HOST", "127.0.0.1")
        self.engine_port = int(_env("ENGINE_PORT", "8081"))
        self.engine_binary = _env("ENGINE_BINARY", _engine_binary_default())
        self.engine_timeout_s = float(_env("ENGINE_TIMEOUT_S", "5"))

        # the compact graph the engine reads, not the json one
        self.graph_path = _env("GRAPH_PATH", str(REPO_ROOT / "api" / "data" / "graph.campus"))
        self.graph_json_path = _env(
            "GRAPH_JSON_PATH", str(REPO_ROOT / "api" / "data" / "graph.json")
        )

        # how long we wait for a freshly spawned engine to answer healthz
        self.engine_startup_timeout_s = float(_env("ENGINE_STARTUP_TIMEOUT_S", "20"))
        self.engine_restart_backoff_s = float(_env("ENGINE_RESTART_BACKOFF_S", "10"))

        self.openweather_api_key = _env("OPENWEATHER_API_KEY", "")
        self.weather_ttl_s = float(_env("WEATHER_TTL_S", "600"))
        self.weather_timeout_s = float(_env("WEATHER_TIMEOUT_S", "6"))

        self.rate_limit = _env("RATE_LIMIT", "60/minute")

        # comma separated, or a star while developing
        self.allowed_origins = [
            origin.strip()
            for origin in _env("ALLOWED_ORIGINS", "*").split(",")
            if origin.strip()
        ]

    @property
    def engine_base_url(self) -> str:
        return f"http://{self.engine_bind_host}:{self.engine_port}"


settings = Settings()

