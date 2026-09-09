"""Current conditions from OpenWeatherMap, cached for a while.

Weather is optional. If it is missing or the key is not set, routing
still works, it just cannot do the weather mode properly.
"""

import logging
import threading
import time
from typing import Optional

import httpx

from api.core.config import settings

log = logging.getLogger("weather")

# roughly the middle of campus
CAMPUS_LAT = 41.8708
CAMPUS_LON = -87.6505

URL = "https://api.openweathermap.org/data/2.5/weather"

# One client for the life of the process. Building a fresh one per call
# costs hundreds of milliseconds, which is the same thing that made every
# route slow before engine_client started holding onto one.
_client = httpx.Client()

# How long to sit still after a failure. Without this, every request in
# weather mode waits out the whole timeout again while the service is
# down, and each one of those is a request we already know will fail.
RETRY_AFTER_S = 60.0


class WeatherUnavailable(RuntimeError):
    pass


def close() -> None:
    """Let go of the connection pool on shutdown.

    Puts a fresh client back, because closing one is permanent and the
    tests start the app more than once in a single process.
    """
    global _client
    _client.close()
    _client = httpx.Client()


def redact(text: str) -> str:
    """Takes the api key out of anything before it is written down.

    httpx puts the whole request url in its error messages and ours
    carries the key as a query parameter, so raw text is never safe.
    """
    key = settings.openweather_api_key
    return text.replace(key, "REDACTED") if key else text


def public_reason(exc: Exception) -> str:
    """What a stranger is allowed to be told about a failure.

    Fixed strings only. Never the exception text, which is how the key
    would get out through the weather endpoint.
    """
    if isinstance(exc, httpx.HTTPStatusError):
        return f"weather service returned {exc.response.status_code}"
    if isinstance(exc, httpx.TimeoutException):
        return "weather service timed out"
    if isinstance(exc, httpx.HTTPError):
        return "could not reach the weather service"
    return "weather is unavailable"


class WeatherCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        # held across the network call so only one caller goes out to ask
        self._fetching = threading.Lock()
        self._value: Optional[dict] = None
        self._fetched_at = 0.0
        self._failed_at = 0.0
        self._last_error: Optional[str] = None

    def _fetch(self) -> dict:
        if not settings.openweather_api_key:
            raise WeatherUnavailable("no api key set")

        params = {
            "lat": CAMPUS_LAT,
            "lon": CAMPUS_LON,
            "appid": settings.openweather_api_key,
            "units": "metric",
        }
        try:
            reply = _client.get(URL, params=params, timeout=settings.weather_timeout_s)
            reply.raise_for_status()
            # a non json 200 is a real failure mode, not something to swallow
            payload = reply.json()
        except (httpx.HTTPError, ValueError) as exc:
            # the detail goes to the log with the key taken out, and the
            # caller only ever gets a fixed string
            log.warning("weather fetch failed: %s", redact(str(exc)))
            raise WeatherUnavailable(public_reason(exc)) from exc

        weather_list = payload.get("weather") or [{}]
        return {
            "tempC": payload.get("main", {}).get("temp"),
            "feelsLikeC": payload.get("main", {}).get("feels_like"),
            "windMps": payload.get("wind", {}).get("speed"),
            "condition": weather_list[0].get("main"),
            "description": weather_list[0].get("description"),
            "observedAt": payload.get("dt"),
        }

    def _answer_now(self, now: float) -> Optional[dict]:
        """What we can say without asking, or nothing if we have to go out.

        Callers hold the lock. Raises when the service is known to be down
        and we have never had a reading to fall back on.
        """
        if self._value is not None and now - self._fetched_at < settings.weather_ttl_s:
            return dict(self._value, cached=True)

        if now - self._failed_at < RETRY_AFTER_S:
            if self._value is not None:
                # a stale reading beats no reading, but say that it is stale
                return dict(self._value, cached=True, stale=True)
            raise WeatherUnavailable(self._last_error or "weather is unavailable")

        return None

    def get(self) -> dict:
        """Current weather, from cache when it is fresh enough."""
        with self._lock:
            answer = self._answer_now(time.time())
        if answer is not None:
            return answer

        # one caller goes out to the network and the rest wait here, so a
        # burst of requests after the cache expires is one call and not one
        # each. whoever gets through leaves the answer behind for them.
        with self._fetching:
            with self._lock:
                answer = self._answer_now(time.time())
            if answer is not None:
                return answer

            try:
                value = self._fetch()
            except WeatherUnavailable as exc:
                # safe by construction, WeatherUnavailable only ever carries a
                # fixed string, but redact anyway so a future raiser cannot
                # quietly put the key back in
                reason = redact(str(exc))
                with self._lock:
                    self._last_error = reason
                    self._failed_at = time.time()
                    if self._value is not None:
                        log.warning("weather failed, serving stale value: %s", reason)
                        return dict(self._value, cached=True, stale=True)
                log.warning("weather unavailable: %s", reason)
                raise

            with self._lock:
                self._value = value
                self._fetched_at = time.time()
                self._failed_at = 0.0
                self._last_error = None
            return dict(value, cached=False)

    def get_or_none(self) -> Optional[dict]:
        """Same, but for callers that can carry on without weather."""
        try:
            return self.get()
        except WeatherUnavailable:
            return None

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error


weather_cache = WeatherCache()
