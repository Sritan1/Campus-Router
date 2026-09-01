#pragma once

#include <cmath>
#include <numbers>

namespace campus {

/// @brief Degrees to radians. M_PI is not standard c++, so we use the
///        one from the standard library instead.
inline constexpr double DEGREES_TO_RADIANS = std::numbers::pi / 180.0;

/// @brief A point on the globe, in degrees.
struct Coordinates {
  double lat = 0.0;
  double lon = 0.0;

  Coordinates() = default;
  Coordinates(double lat, double lon) : lat(lat), lon(lon) {}
};

/// @brief Mean earth radius in metres, the usual value for this kind of work.
inline constexpr double EARTH_RADIUS_M = 6371008.8;

/// @brief Great circle distance in metres between two points.
/// @param a first point
/// @param b second point
/// @return distance in metres, always zero or more
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
