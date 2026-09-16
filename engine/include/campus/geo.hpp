#pragma once

#include <cmath>
#include <numbers>

namespace campus {

// M_PI is not portable, so this uses the standard library pi
inline constexpr double DEGREES_TO_RADIANS = std::numbers::pi / 180.0;

// in degrees
struct Coordinates {
  double lat = 0.0;
  double lon = 0.0;

  Coordinates() = default;
  Coordinates(double lat, double lon) : lat(lat), lon(lon) {}
};

// mean earth radius
inline constexpr double EARTH_RADIUS_M = 6371008.8;

// haversine, in metres
inline double distanceBetween(Coordinates a, Coordinates b) {
  const double lat1 = a.lat * DEGREES_TO_RADIANS;
  const double lat2 = b.lat * DEGREES_TO_RADIANS;
  const double dLat = (b.lat - a.lat) * DEGREES_TO_RADIANS;
  const double dLon = (b.lon - a.lon) * DEGREES_TO_RADIANS;

  const double h = std::sin(dLat / 2) * std::sin(dLat / 2) +
                   std::cos(lat1) * std::cos(lat2) * std::sin(dLon / 2) *
                       std::sin(dLon / 2);
  return 2.0 * EARTH_RADIUS_M * std::asin(std::sqrt(h));
}

}  // namespace campus
