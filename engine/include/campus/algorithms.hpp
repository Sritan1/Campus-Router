#pragma once

#include <string>
#include <vector>

#include "campus/cost.hpp"
#include "campus/graph.hpp"

namespace campus {

enum class Algorithm {
  Dijkstra,
  AStar,
  Bfs,
  BidirectionalDijkstra,
};

std::string nameOf(Algorithm algorithm);

bool algorithmFromName(const std::string &name, Algorithm &out);

struct TraceEdge {
  int from = 0;
  int to = 0;
};

struct RouteResult {
  bool found = false;
  std::vector<int> path;
  double cost = 0.0;
  double distanceM = 0.0;
  long long nodesVisited = 0;
  long long edgesRelaxed = 0;
  long long runtimeUs = 0;

  // settle order, for the animation
  std::vector<int> visitOrder;

  // the explored network, not just the tree of best routes. drawing only the
  // tree left gaps where two branches ran down neighbouring paths
  std::vector<TraceEdge> visitEdges;
};

RouteResult runAlgorithm(Algorithm algorithm, const Graph &graph,
                         const CostModel &cost, int start, int target,
                         bool trace);

// real metres, multipliers ignored
double pathDistance(const Graph &graph, const std::vector<int> &path);

struct ReachResult {
  std::vector<int> nodes;
  std::vector<double> costs;
  std::vector<TraceEdge> edges;

  // the dearer of the two ends
  std::vector<double> edgeCosts;
  long long runtimeUs = 0;
};

// dijkstra with a cost ceiling instead of a target
ReachResult reachable(const Graph &graph, const CostModel &cost, int start,
                      double limit);

}  // namespace campus
