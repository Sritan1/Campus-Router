#pragma once

#include <algorithm>
#include <vector>

#include "campus/graph.hpp"

namespace campus {

// cost is length times the class multiplier, which is never below one
struct CostModel {
  std::vector<double> multipliers;
  std::vector<char> blocked;
  double defaultMultiplier = 1.0;

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

  double weightOf(const Adjacency &edge) const {
    return edge.lengthM * this->multiplierFor(edge.classId);
  }

  // a star scales its straight line guess by this so it never overshoots
  double smallestMultiplier() const {
    double smallest = this->defaultMultiplier;
    // bounded by the shorter list, the same way the lookups above check
    const size_t count = std::min(this->multipliers.size(), this->blocked.size());
    for (size_t i = 0; i < count; i++) {
      if (this->blocked[i] == 0) {
        smallest = std::min(smallest, this->multipliers[i]);
      }
    }
    return smallest > 0.0 ? smallest : 1.0;
  }
};

}  // namespace campus
