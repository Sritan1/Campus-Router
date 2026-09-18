"""Current conditions from OpenWeatherMap, cached. Routing works without it."""

import logging
import threading
import time
from typing import Optional

import httpx

from api.core.config import settings

log = logging.getLogger("weather")

CAMPUS_LAT = 41.8708
CAMPUS_LON = -87.6505

URL = "https://api.openweathermap.org/data/2.5/weather"

# one client for the process, a fresh one per call costs hundreds of ms
_client = httpx.Client()

class WeatherUnavailable(RuntimeError):
    pass


def close() -> None:
    # a closed client is dead for good, and tests start the app twice in one process
    global _client
    _client.close()
    _client = httpx.Client()


def redact(text: str) -> str:
    # httpx error messages include the url, and the url carries the key
    key = settings.openweather_api_key
    return text.replace(key, "REDACTED") if key else text


def public_reason(exc: Exception) -> str:
    # fixed strings only, since the exception text can carry the key
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
            # a 200 that is not json still counts as a failure
            payload = reply.json()
        except (httpx.HTTPError, ValueError) as exc:
            # redacted detail for the log, a fixed string for the caller
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
        # callers hold the lock. None means go and ask, and it raises when the
        # service is down with no old reading to fall back on
        if self._value is not None and now - self._fetched_at < settings.weather_ttl_s:
            return dict(self._value, cached=True)

        # after a failure, sit still so an outage costs one timeout a minute, not one
        # per visitor. it lets go by itself once retry_after passes
        if now - self._failed_at < settings.weather_retry_after_s:
            if self._value is not None:
                # a stale reading beats no reading, but say that it is stale
                return dict(self._value, cached=True, stale=True)
            raise WeatherUnavailable(self._last_error or "weather is unavailable")

        return None

    def get(self) -> dict:
        with self._lock:
            answer = self._answer_now(time.time())
        if answer is not None:
            return answer

        # one caller goes out and the rest wait here, so a burst is a single call
        with self._fetching:
            with self._lock:
                answer = self._answer_now(time.time())
            if answer is not None:
                return answer

            try:
                value = self._fetch()
            except WeatherUnavailable as exc:
                # always a fixed string today, redacted anyway in case that changes
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
        try:
            return self.get()
        except WeatherUnavailable:
            return None

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error


weather_cache = WeatherCache()
