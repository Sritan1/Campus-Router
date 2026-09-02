#include "campus/algorithms.hpp"

#include <algorithm>
#include <chrono>
#include <deque>
#include <limits>
#include <queue>

namespace campus {

namespace {

constexpr double INF = std::numeric_limits<double>::infinity();

/// @brief Entry in the search frontier. Ordered by priority, smallest first.
struct Candidate {
  int node = 0;
  double priority = 0.0;
};

/// @brief Makes the priority queue hand back the cheapest instead of the
///        largest, and breaks ties on node index so runs are repeatable.
struct Prioritize {
  bool operator()(const Candidate &a, const Candidate &b) const {
    if (a.priority != b.priority) {
      return a.priority > b.priority;
    }
    return a.node > b.node;
  }
};

using Frontier = std::priority_queue<Candidate, std::vector<Candidate>, Prioritize>;

/// @brief Walk predecessors back from the target to build the path.
std::vector<int> unwind(const std::vector<int> &came, int start, int target) {
  std::vector<int> reversed;
  int current = target;
  while (current != -1) {
    reversed.push_back(current);
    if (current == start) {
      break;
    }
    current = came[current];
  }

  if (reversed.empty() || reversed.back() != start) {
    return {};
  }
  std::reverse(reversed.begin(), reversed.end());
  return reversed;
}

/// @brief Straight line distance, scaled so it can never overshoot.
double heuristic(const Graph &graph, int from, int target, double scale) {
  return distanceBetween(graph.coordinatesAt(from), graph.coordinatesAt(target)) *
         scale;
}

/// @brief Dijkstra, and A star when a heuristic scale is supplied.
///
/// The two differ only in what goes into the priority, so they share a body
/// rather than being copy pasted.
RouteResult searchWeighted(const Graph &graph, const CostModel &cost, int start,
                           int target, bool trace, bool useHeuristic) {
  RouteResult result;
  const size_t count = graph.numNodes();

  std::vector<double> best(count, INF);
  std::vector<int> came(count, -1);
  std::vector<char> settled(count, 0);

  const double scale = useHeuristic ? cost.smallestMultiplier() : 0.0;

  best[start] = 0.0;
  Frontier frontier;
  frontier.push({start, useHeuristic ? heuristic(graph, start, target, scale) : 0.0});

  while (!frontier.empty()) {
    const Candidate current = frontier.top();
    frontier.pop();

    // a node can sit in the queue more than once, keep only the first pop
    if (settled[current.node]) {
      continue;
    }
    settled[current.node] = 1;
    result.nodesVisited++;
    if (trace) {
      result.visitOrder.push_back(current.node);
      // every path from here to somewhere we have already been. each one
      // gets recorded once, when its second end is reached.
      for (const Adjacency &edge : graph.neighbors(current.node)) {
        if (!cost.isBlocked(edge.classId) && settled[edge.to]) {
          result.visitEdges.push_back({edge.to, current.node});
        }
      }
    }

    if (current.node == target) {
      break;
    }

    for (const Adjacency &edge : graph.neighbors(current.node)) {
      if (cost.isBlocked(edge.classId) || settled[edge.to]) {
        continue;
      }

      const double relaxed = best[current.node] + cost.weightOf(edge);
      result.edgesRelaxed++;
      if (relaxed < best[edge.to]) {
        best[edge.to] = relaxed;
        came[edge.to] = current.node;
        const double priority =
            useHeuristic ? relaxed + heuristic(graph, edge.to, target, scale) : relaxed;
        frontier.push({edge.to, priority});
      }
    }
  }

  if (best[target] == INF) {
    return result;
  }

  result.found = true;
  result.path = unwind(came, start, target);
  result.cost = best[target];
  return result;
}

/// @brief Breadth first search. Finds the fewest hops, not the shortest walk.
RouteResult searchBfs(const Graph &graph, const CostModel &cost, int start,
                      int target, bool trace) {
  RouteResult result;
  const size_t count = graph.numNodes();

  std::vector<int> came(count, -1);
  std::vector<char> seen(count, 0);

  // seen means queued, done means actually reached. an edge is only
  // real to draw once both of its ends have been reached.
  std::vector<char> done(count, 0);

  std::deque<int> queue;
  queue.push_back(start);
  seen[start] = 1;

  while (!queue.empty()) {
    const int current = queue.front();
    queue.pop_front();
    done[current] = 1;

    result.nodesVisited++;
    if (trace) {
      result.visitOrder.push_back(current);
      for (const Adjacency &edge : graph.neighbors(current)) {
        if (!cost.isBlocked(edge.classId) && done[edge.to]) {
          result.visitEdges.push_back({edge.to, current});
        }
      }
    }

    if (current == target) {
      break;
    }

    for (const Adjacency &edge : graph.neighbors(current)) {
      if (cost.isBlocked(edge.classId) || seen[edge.to]) {
        continue;
      }
      result.edgesRelaxed++;
      seen[edge.to] = 1;
      came[edge.to] = current;
      queue.push_back(edge.to);
    }
  }

  if (!seen[target]) {
    return result;
  }

  result.found = true;
  result.path = unwind(came, start, target);

  // bfs optimised hop count, so report what its path really costs
  for (size_t i = 0; i + 1 < result.path.size(); i++) {
    for (const Adjacency &edge : graph.neighbors(result.path[i])) {
      if (edge.to == result.path[i + 1]) {
        result.cost += cost.weightOf(edge);
        break;
      }
    }
  }
  return result;
}

/// @brief Dijkstra from both ends at once.
///
/// The searches meeting is not the finish line. A cheaper path can still
/// close later, so we keep going until the two frontiers can no longer
/// combine into anything better than the best we have.
RouteResult searchBidirectional(const Graph &graph, const CostModel &cost,
                                int start, int target, bool trace) {
  RouteResult result;
  const size_t count = graph.numNodes();

  std::vector<double> bestForward(count, INF);
  std::vector<double> bestBackward(count, INF);
  std::vector<int> cameForward(count, -1);
  std::vector<int> cameBackward(count, -1);
  std::vector<char> settledForward(count, 0);
  std::vector<char> settledBackward(count, 0);

  // a node can be reached by both searches, and for drawing we only
  // care that it was reached at all
  std::vector<char> reached(count, 0);

  bestForward[start] = 0.0;
  bestBackward[target] = 0.0;

  Frontier forward;
  Frontier backward;
  forward.push({start, 0.0});
  backward.push({target, 0.0});

  double bestTotal = INF;
  int meeting = -1;

  while (!forward.empty() && !backward.empty()) {
    // once the two cheapest remaining reaches sum past what we already
    // have, nothing left can beat it
    if (forward.top().priority + backward.top().priority >= bestTotal) {
      break;
    }

    const bool takeForward = forward.top().priority <= backward.top().priority;
    Frontier &active = takeForward ? forward : backward;
    std::vector<double> &near = takeForward ? bestForward : bestBackward;
    std::vector<double> &far = takeForward ? bestBackward : bestForward;
    std::vector<int> &came = takeForward ? cameForward : cameBackward;
    std::vector<char> &settled = takeForward ? settledForward : settledBackward;

    const Candidate current = active.top();
    active.pop();
    if (settled[current.node]) {
      continue;
    }
    settled[current.node] = 1;
    result.nodesVisited++;
    if (trace && !reached[current.node]) {
      result.visitOrder.push_back(current.node);
      for (const Adjacency &edge : graph.neighbors(current.node)) {
        if (!cost.isBlocked(edge.classId) && reached[edge.to]) {
          result.visitEdges.push_back({edge.to, current.node});
        }
      }
    }
    reached[current.node] = 1;

    for (const Adjacency &edge : graph.neighbors(current.node)) {
      if (cost.isBlocked(edge.classId)) {
        continue;
      }

      const double relaxed = near[current.node] + cost.weightOf(edge);
      result.edgesRelaxed++;
      if (relaxed < near[edge.to]) {
        near[edge.to] = relaxed;
        came[edge.to] = current.node;
        active.push({edge.to, relaxed});
      }

      // a node both sides have reached gives a complete path
      if (far[edge.to] != INF && relaxed + far[edge.to] < bestTotal) {
        bestTotal = relaxed + far[edge.to];
        meeting = edge.to;
      }
    }
  }

  if (meeting == -1) {
    // the ends may still touch directly at one node
    for (size_t i = 0; i < count; i++) {
      if (bestForward[i] != INF && bestBackward[i] != INF &&
          bestForward[i] + bestBackward[i] < bestTotal) {
        bestTotal = bestForward[i] + bestBackward[i];
        meeting = static_cast<int>(i);
      }
    }
  }

  if (meeting == -1 || bestTotal == INF) {
    return result;
  }

  std::vector<int> front = unwind(cameForward, start, meeting);
  std::vector<int> back = unwind(cameBackward, target, meeting);
  if (front.empty() || back.empty()) {
    return result;
  }

  // the backward half comes out target first, so it joins on reversed
  // and without repeating the meeting node
  std::reverse(back.begin(), back.end());
  front.insert(front.end(), back.begin() + 1, back.end());

  result.found = true;
  result.path = front;
  result.cost = bestTotal;
  return result;
}

}  // namespace

std::string nameOf(Algorithm algorithm) {
  switch (algorithm) {
    case Algorithm::Dijkstra:
      return "dijkstra";
    case Algorithm::AStar:
      return "astar";
    case Algorithm::Bfs:
      return "bfs";
    case Algorithm::BidirectionalDijkstra:
      return "bidirectional";
  }
  return "unknown";
}

bool algorithmFromName(const std::string &name, Algorithm &out) {
  if (name == "dijkstra") {
    out = Algorithm::Dijkstra;
  } else if (name == "astar") {
    out = Algorithm::AStar;
  } else if (name == "bfs") {
    out = Algorithm::Bfs;
  } else if (name == "bidirectional") {
    out = Algorithm::BidirectionalDijkstra;
  } else {
    return false;
  }
  return true;
}

double pathDistance(const Graph &graph, const std::vector<int> &path) {
  double total = 0.0;
  for (size_t i = 0; i + 1 < path.size(); i++) {
    for (const Adjacency &edge : graph.neighbors(path[i])) {
      if (edge.to == path[i + 1]) {
        total += edge.lengthM;
        break;
      }
    }
  }
  return total;
}

RouteResult runAlgorithm(Algorithm algorithm, const Graph &graph,
                         const CostModel &cost, int start, int target,
                         bool trace) {
  const auto began = std::chrono::steady_clock::now();

  RouteResult result;
  if (start < 0 || target < 0 || start >= static_cast<int>(graph.numNodes()) ||
      target >= static_cast<int>(graph.numNodes())) {
    return result;
  }

  if (start == target) {
    result.found = true;
    result.path = {start};
    return result;
  }

  switch (algorithm) {
    case Algorithm::Dijkstra:
      result = searchWeighted(graph, cost, start, target, trace, false);
      break;
    case Algorithm::AStar:
      result = searchWeighted(graph, cost, start, target, trace, true);
      break;
    case Algorithm::Bfs:
      result = searchBfs(graph, cost, start, target, trace);
      break;
    case Algorithm::BidirectionalDijkstra:
      result = searchBidirectional(graph, cost, start, target, trace);
      break;
  }

  if (result.found) {
    result.distanceM = pathDistance(graph, result.path);
  }

  const auto ended = std::chrono::steady_clock::now();
  result.runtimeUs =
      std::chrono::duration_cast<std::chrono::microseconds>(ended - began).count();
  return result;
}

}  // namespace campus
