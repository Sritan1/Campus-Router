#pragma once

#include <algorithm>
#include <vector>

#include "campus/graph.hpp"

namespace campus {

/// @brief Turns an edge into the number the search actually minimises.
///
/// Cost is length times a multiplier picked by the edge class. Multipliers
/// are never below one, which is what keeps the A star heuristic honest.
struct CostModel {
  std::vector<double> multipliers;
  std::vector<char> blocked;
  double defaultMultiplier = 1.0;

  /// @brief Sized to a graph, everything open and unweighted.
  static CostModel plain(size_t classCount) {
    CostModel model;
    model.multipliers.assign(classCount, 1.0);
    model.blocked.assign(classCount, 0);
    return model;
  }

  double multiplierFor(int classId) const {
    if (classId < 0 || classId >= static_cast<int>(this->multipliers.size())) {
      return this->defaultMultiplier;
    }
    return this->multipliers[classId];
  }

  bool isBlocked(int classId) const {
    if (classId < 0 || classId >= static_cast<int>(this->blocked.size())) {
      return false;
    }
    return this->blocked[classId] != 0;
  }

  /// @brief What one edge costs to walk.
  double weightOf(const Adjacency &edge) const {
    return edge.lengthM * this->multiplierFor(edge.classId);
  }

  /// @brief The smallest multiplier any open class can have.
  ///
  /// A star scales its straight line estimate by this. Without it a
  /// multiplier below one would let the estimate overshoot and the search
  /// could return a path that is not the cheapest.
  double smallestMultiplier() const {
    double smallest = this->defaultMultiplier;
    for (size_t i = 0; i < this->multipliers.size(); i++) {
      if (this->blocked[i] == 0) {
        smallest = std::min(smallest, this->multipliers[i]);
      }
    }
    return smallest > 0.0 ? smallest : 1.0;
  }
};

}  // namespace campus
