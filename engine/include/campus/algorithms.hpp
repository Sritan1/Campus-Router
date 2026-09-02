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

/// @brief Name used on the wire and in the cli.
std::string nameOf(Algorithm algorithm);

/// @brief Parse a name back. Returns false when it is not one of ours.
bool algorithmFromName(const std::string &name, Algorithm &out);

/// @brief One path the search walked down, by node index.
struct TraceEdge {
  int from = 0;
  int to = 0;
};

/// @brief What one run of one algorithm produced.
struct RouteResult {
  bool found = false;
  std::vector<int> path;
  double cost = 0.0;
  double distanceM = 0.0;
  long long nodesVisited = 0;
  long long edgesRelaxed = 0;
  long long runtimeUs = 0;

  // the order nodes were settled in, for the exploration animation
  std::vector<int> visitOrder;

  // every path between two settled nodes, in the order the second end
  // of each was reached.
  //
  // this is the explored network, not the tree of best routes. drawing
  // only the tree left visible gaps wherever two branches ran down
  // neighbouring paths, because the path joining them is one the search
  // really did look at but is not part of anyone's best route.
  std::vector<TraceEdge> visitEdges;
};

/// @brief Run one algorithm over the graph.
/// @param algorithm which one
/// @param graph the network
/// @param cost how edges are weighted and what is blocked
/// @param start starting node index
/// @param target ending node index
/// @param trace whether to record the visit order
/// @return the path and its statistics, with found false when there is none
RouteResult runAlgorithm(Algorithm algorithm, const Graph &graph,
                         const CostModel &cost, int start, int target,
                         bool trace);

/// @brief Add up the real world length of a path, ignoring multipliers.
double pathDistance(const Graph &graph, const std::vector<int> &path);

}  // namespace campus
