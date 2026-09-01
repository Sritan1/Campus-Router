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


class WeatherUnavailable(RuntimeError):
    pass


class WeatherCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._value: Optional[dict] = None
        self._fetched_at = 0.0
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
            reply = httpx.get(URL, params=params, timeout=settings.weather_timeout_s)
            reply.raise_for_status()
            # a non json 200 is a real failure mode, not something to swallow
            payload = reply.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise WeatherUnavailable(str(exc)) from exc

        weather_list = payload.get("weather") or [{}]
        return {
            "tempC": payload.get("main", {}).get("temp"),
            "feelsLikeC": payload.get("main", {}).get("feels_like"),
            "windMps": payload.get("wind", {}).get("speed"),
            "condition": weather_list[0].get("main"),
            "description": weather_list[0].get("description"),
            "observedAt": payload.get("dt"),
        }

    def get(self) -> dict:
        """Current weather, from cache when it is fresh enough."""
        with self._lock:
            fresh = time.time() - self._fetched_at < settings.weather_ttl_s
            if self._value is not None and fresh:
                return dict(self._value, cached=True)

        try:
            value = self._fetch()
        except WeatherUnavailable as exc:
            with self._lock:
                self._last_error = str(exc)
                if self._value is not None:
                    # a stale reading beats no reading, but say that it is stale
                    log.warning("weather fetch failed, serving stale value: %s", exc)
                    return dict(self._value, cached=True, stale=True)
            log.warning("weather unavailable: %s", exc)
            raise

        with self._lock:
            self._value = value
            self._fetched_at = time.time()
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
