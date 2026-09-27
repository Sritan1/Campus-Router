"""Keeps the engine running as a child, since Railway only watches the container."""

import logging
import subprocess
import threading
import time
from typing import Optional

import httpx

from api.core.config import settings

log = logging.getLogger("engine")

# health is asked often, so hold one client like engine_client does
_client = httpx.Client(timeout=settings.engine_timeout_s)

# railway only restarts on exit
HEALTH_EVERY_S = 5.0
MISSES_BEFORE_RESTART = 3


def close() -> None:
    # see engine_client.close
    global _client
    _client.close()
    _client = httpx.Client(timeout=settings.engine_timeout_s)


class EngineProcess:
    def __init__(self) -> None:
        self._proc: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()
        self._stopping = False
        self._monitor: Optional[threading.Thread] = None
        self.last_error: Optional[str] = None
        self.restarts = 0

    def is_running(self) -> bool:
        proc = self._proc
        return proc is not None and proc.poll() is None

    def healthy(self) -> bool:
        if not self.is_running():
            return False
        return self._ping()

    def _ping(self) -> bool:
        try:
            reply = _client.get(f"{settings.engine_base_url}/healthz")
            return reply.status_code == 200
        except (httpx.HTTPError, ValueError):
            return False

    def _spawn(self) -> None:
        env_note = f"{settings.engine_bind_host}:{settings.engine_port}"
        log.info("starting engine on %s", env_note)

        self._proc = subprocess.Popen(
            [settings.engine_binary],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=self._child_env(),
        )
        pump = threading.Thread(target=self._pump_output, daemon=True)
        pump.start()

    def _child_env(self) -> dict:
        import os

        child = os.environ.copy()
        child["ENGINE_BIND_HOST"] = settings.engine_bind_host
        child["ENGINE_PORT"] = str(settings.engine_port)
        child["GRAPH_PATH"] = settings.graph_path
        return child

    def _pump_output(self) -> None:
        proc = self._proc
        if proc is None or proc.stdout is None:
            return
        for line in proc.stdout:
            log.info("engine says: %s", line.rstrip())

    def _wait_until_healthy(self, timeout_s: float) -> bool:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            if not self.is_running():
                return False
            if self._ping():
                return True
            time.sleep(0.2)
        return False

    def start(self) -> None:
        with self._lock:
            self._stopping = False
            self._spawn()

        if not self._wait_until_healthy(settings.engine_startup_timeout_s):
            self.last_error = "engine did not become healthy in time"
            log.error(self.last_error)
            self.stop()
            raise RuntimeError(self.last_error)

        self.last_error = None
        log.info("engine is up")

        self._monitor = threading.Thread(target=self._watch, daemon=True)
        self._monitor.start()

    def _kill(self) -> None:
        with self._lock:
            proc = self._proc
            if proc is None or proc.poll() is not None:
                return
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    def _watch(self) -> None:
        backoff = 0.5
        misses = 0
        pinged_at = time.monotonic()
        while not self._stopping:
            time.sleep(0.5)
            if self._stopping:
                return

            if self.is_running():
                now = time.monotonic()
                if now - pinged_at < HEALTH_EVERY_S:
                    continue
                pinged_at = now
                if self._ping():
                    misses = 0
                    backoff = 0.5
                    continue
                misses += 1
                if misses < MISSES_BEFORE_RESTART:
                    continue
                log.warning("engine stopped answering, replacing it")
                self._kill()

            misses = 0
            self.restarts += 1
            log.warning("engine died, restarting in %.1fs", backoff)
            time.sleep(backoff)
            backoff = min(backoff * 2, settings.engine_restart_backoff_s)

            try:
                with self._lock:
                    if self._stopping:
                        return
                    self._spawn()
                if self._wait_until_healthy(settings.engine_startup_timeout_s):
                    self.last_error = None
                    log.info("engine is back up")
                else:
                    self.last_error = "engine restarted but never answered"
            except OSError as exc:
                # health is public and an OSError carries the path, so keep it in the log
                self.last_error = "could not restart the engine"
                log.error("could not restart engine: %s", exc)

    def stop(self) -> None:
        self._stopping = True
        if self.is_running():
            log.info("stopping engine")
        self._kill()


engine = EngineProcess()
