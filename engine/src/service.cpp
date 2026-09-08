#include "campus/service.hpp"

#include <algorithm>
#include <map>
#include <set>
#include <unordered_map>

#include "campus/algorithms.hpp"
#include "campus/json.hpp"

namespace campus {

namespace {

// no search can settle more nodes than the graph has, about 16k across
// both campuses, so this sits above that and nothing is ever thinned.
// eight thousand used to clear it and stopped when west campus doubled
// the graph, which quietly cost bfs three quarters of its edges.
constexpr size_t DEFAULT_TRACE_LIMIT = 20000;
constexpr size_t MAX_TRACE_LIMIT = 50000;

const Algorithm DEFAULT_ORDER[] = {
    Algorithm::Dijkstra,
    Algorithm::AStar,
    Algorithm::Bfs,
    Algorithm::BidirectionalDijkstra,
};

// there are only four, so a longer list is either a mistake or somebody
// trying to buy a lot of graph searches with one small request
constexpr size_t MAX_ALGORITHMS = sizeof(DEFAULT_ORDER) / sizeof(DEFAULT_ORDER[0]);

/// @brief Read the cost model out of the request.
///
/// Multipliers arrive keyed by class name because the gateway thinks in
/// names, while the engine works with the small integer ids.
CostModel readCostModel(const Graph &graph, const Json &spec) {
  CostModel cost = CostModel::plain(graph.numClasses());

  // names to ids, once, so the loops below stay cheap
  std::map<std::string, int> byName;
  for (size_t i = 0; i < graph.numClasses(); i++) {
    byName[graph.classNameAt(static_cast<int>(i))] = static_cast<int>(i);
  }

  if (spec.has("default")) {
    cost.defaultMultiplier = spec.at("default").asNumber(1.0);
    for (size_t i = 0; i < cost.multipliers.size(); i++) {
      cost.multipliers[i] = cost.defaultMultiplier;
    }
  }

  for (const auto &entry : spec.at("multipliers").fields()) {
    auto found = byName.find(entry.first);
    if (found != byName.end()) {
      cost.multipliers[found->second] = entry.second.asNumber(1.0);
    }
  }

  for (const Json &blocked : spec.at("blocked").items()) {
    const std::string name = blocked.asString();
    auto found = byName.find(name);
    if (found != byName.end()) {
      cost.blocked[found->second] = 1;
    }
  }

  return cost;
}

/// @brief Turn a path of node indices into the ids the gateway knows.
Json pathIds(const Graph &graph, const std::vector<int> &path) {
  Json out = Json::array();
  for (int index : path) {
    out.push(Json::of(graph.idAt(index)));
  }
  return out;
}

/// @brief Coordinates for drawing, so the client does not have to look
///        every node up itself.
Json pathPoints(const Graph &graph, const std::vector<int> &path) {
  Json out = Json::array();
  for (int index : path) {
    const Coordinates at = graph.coordinatesAt(index);
    Json pair = Json::array();
    pair.push(Json::of(at.lat));
    pair.push(Json::of(at.lon));
    out.push(std::move(pair));
  }
  return out;
}

/// @brief A signature so identical paths can be grouped.
std::string signatureOf(const std::vector<int> &path) {
  std::string key;
  key.reserve(path.size() * 7);
  for (int index : path) {
    key += std::to_string(index);
    key.push_back(',');
  }
  return key;
}

}  // namespace

std::string errorBody(const std::string &message) {
  Json body = Json::object();
  body.set("ok", Json::of(false));
  body.set("error", Json::of(message));
  return body.dump();
}

std::vector<size_t> thinIndices(size_t total, size_t limit) {
  std::vector<size_t> out;
  if (limit == 0 || total <= limit) {
    out.reserve(total);
    for (size_t i = 0; i < total; i++) {
      out.push_back(i);
    }
    return out;
  }

  // step through evenly so the thinned trace still covers the whole search
  out.reserve(limit);
  for (size_t i = 0; i < limit; i++) {
    out.push_back((i * total) / limit);
  }
  return out;
}

Reply Service::health() const {
  Json body = Json::object();
  body.set("ok", Json::of(true));
  body.set("service", Json::of("engine"));
  body.set("nodes", Json::of(static_cast<long long>(this->graph.numNodes())));
  return {200, body.dump()};
}

Reply Service::meta() const {
  Json body = Json::object();
  body.set("ok", Json::of(true));
  body.set("nodes", Json::of(static_cast<long long>(this->graph.numNodes())));
  body.set("edges", Json::of(static_cast<long long>(this->graph.numEdges())));

  Json classes = Json::array();
  for (size_t i = 0; i < this->graph.numClasses(); i++) {
    classes.push(Json::of(this->graph.classNameAt(static_cast<int>(i))));
  }
  body.set("classes", std::move(classes));
  return {200, body.dump()};
}

Reply Service::route(const std::string &body) const {
  Json request;
  std::string error;
  if (!Json::parse(body, request, error)) {
    return {400, errorBody("request is not valid json, " + error)};
  }
  if (!request.isObject()) {
    return {400, errorBody("request must be an object")};
  }
  if (!request.at("start").isNumber() || !request.at("target").isNumber()) {
    return {400, errorBody("start and target must be node ids")};
  }

  const long long startId = request.at("start").asInteger();
  const long long targetId = request.at("target").asInteger();
  const int start = this->graph.indexOf(startId);
  const int target = this->graph.indexOf(targetId);
  if (start < 0) {
    return {404, errorBody("start node is not in the graph")};
  }
  if (target < 0) {
    return {404, errorBody("target node is not in the graph")};
  }

  // which algorithms to run, all four unless asked otherwise.
  //
  // the gateway caps and dedupes this too, but the engine answers one
  // request at a time and must not take a long list on trust from it.
  std::vector<Algorithm> wanted;
  if (request.at("algorithms").isArray() &&
      !request.at("algorithms").items().empty()) {
    const std::vector<Json> &asked = request.at("algorithms").items();
    if (asked.size() > MAX_ALGORITHMS) {
      return {400, errorBody("too many algorithms")};
    }
    for (const Json &entry : asked) {
      Algorithm algorithm;
      if (!algorithmFromName(entry.asString(), algorithm)) {
        return {400, errorBody("unknown algorithm " + entry.asString())};
      }
      // asking for the same one twice is the same search twice
      if (std::find(wanted.begin(), wanted.end(), algorithm) == wanted.end()) {
        wanted.push_back(algorithm);
      }
    }
  } else {
    for (Algorithm algorithm : DEFAULT_ORDER) {
      wanted.push_back(algorithm);
    }
  }

  const CostModel cost = readCostModel(this->graph, request.at("cost"));
  const bool trace = request.at("trace").asBool(false);

  size_t traceLimit = DEFAULT_TRACE_LIMIT;
  if (request.at("maxTraceSamples").isNumber()) {
    const long long asked = request.at("maxTraceSamples").asInteger(DEFAULT_TRACE_LIMIT);
    if (asked < 0) {
      return {400, errorBody("maxTraceSamples cannot be negative")};
    }
    traceLimit = static_cast<size_t>(asked) > MAX_TRACE_LIMIT
                     ? MAX_TRACE_LIMIT
                     : static_cast<size_t>(asked);
  }

  Json results = Json::array();
  std::map<std::string, std::vector<std::string>> groups;

  for (Algorithm algorithm : wanted) {
    const RouteResult result =
        runAlgorithm(algorithm, this->graph, cost, start, target, trace);

    Json entry = Json::object();
    entry.set("algorithm", Json::of(nameOf(algorithm)));
    entry.set("status", Json::of(result.found ? "ok" : "no_path"));
    entry.set("nodesVisited", Json::of(result.nodesVisited));
    entry.set("edgesRelaxed", Json::of(result.edgesRelaxed));
    entry.set("runtimeUs", Json::of(result.runtimeUs));

    if (result.found) {
      entry.set("cost", Json::of(result.cost));
      entry.set("distanceM", Json::of(result.distanceM));
      entry.set("hops", Json::of(static_cast<long long>(result.path.size() - 1)));
      entry.set("path", pathIds(this->graph, result.path));
      entry.set("points", pathPoints(this->graph, result.path));
      groups[signatureOf(result.path)].push_back(nameOf(algorithm));
    }

    if (trace) {
      const std::vector<size_t> keep =
          thinIndices(result.visitOrder.size(), traceLimit);

      // where each settled node ended up in what we are sending, so a
      // parent can be named by its position rather than repeating coords
      std::unordered_map<int, int> placeOf;
      placeOf.reserve(keep.size() * 2);
      for (size_t out = 0; out < keep.size(); out++) {
        placeOf[result.visitOrder[keep[out]]] = static_cast<int>(out);
      }

      Json order = Json::array();
      for (size_t out = 0; out < keep.size(); out++) {
        const Coordinates where =
            this->graph.coordinatesAt(result.visitOrder[keep[out]]);
        Json pair = Json::array();
        pair.push(Json::of(where.lat));
        pair.push(Json::of(where.lon));
        order.push(std::move(pair));
      }

      // paths between two points we are sending, by position.
      //
      // when a trace is thinned this loses more than it looks like it
      // should. a path needs both of its ends to survive, so keeping
      // half the points keeps only about a quarter of the paths and the
      // search arrives in pieces. the count is reported below so a
      // caller can tell that happened.
      Json edges = Json::array();
      long long dropped = 0;
      for (const TraceEdge &edge : result.visitEdges) {
        auto from = placeOf.find(edge.from);
        auto to = placeOf.find(edge.to);
        if (from == placeOf.end() || to == placeOf.end()) {
          dropped++;
          continue;
        }
        Json pair = Json::array();
        pair.push(Json::of(from->second));
        pair.push(Json::of(to->second));
        edges.push(std::move(pair));
      }

      Json traceOut = Json::object();
      traceOut.set("points", std::move(order));
      traceOut.set("edges", std::move(edges));
      traceOut.set("sampled", Json::of(keep.size() < result.visitOrder.size()));
      traceOut.set("total", Json::of(static_cast<long long>(result.visitOrder.size())));
      traceOut.set("droppedEdges", Json::of(dropped));
      entry.set("trace", std::move(traceOut));
    }

    results.push(std::move(entry));
  }

  // algorithms that landed on the same path, so the client can draw one
  // line instead of four on top of each other
  Json pathGroups = Json::array();
  for (const auto &group : groups) {
    Json names = Json::array();
    for (const std::string &name : group.second) {
      names.push(Json::of(name));
    }
    Json entry = Json::object();
    entry.set("algorithms", std::move(names));
    pathGroups.push(std::move(entry));
  }

  Json reply = Json::object();
  reply.set("ok", Json::of(true));
  reply.set("start", Json::of(startId));
  reply.set("target", Json::of(targetId));
  reply.set("results", std::move(results));
  reply.set("pathGroups", std::move(pathGroups));
  return {200, reply.dump()};
}

Reply Service::isochrone(const std::string &body) const {
  Json request;
  std::string error;
  if (!Json::parse(body, request, error)) {
    return {400, errorBody("request is not valid json, " + error)};
  }
  if (!request.at("start").isNumber()) {
    return {400, errorBody("start must be a node id")};
  }

  const long long startId = request.at("start").asInteger();
  const int start = this->graph.indexOf(startId);
  if (start < 0) {
    return {404, errorBody("start node is not in the graph")};
  }

  const double limit = request.at("limit").asNumber(0.0);
  if (limit <= 0.0) {
    return {400, errorBody("limit must be above zero")};
  }

  const CostModel cost = readCostModel(this->graph, request.at("cost"));
  const ReachResult reach = reachable(this->graph, cost, start, limit);

  Json points = Json::array();
  Json ids = Json::array();
  for (int index : reach.nodes) {
    const Coordinates where = this->graph.coordinatesAt(index);
    Json pair = Json::array();
    pair.push(Json::of(where.lat));
    pair.push(Json::of(where.lon));
    points.push(std::move(pair));

    // the gateway needs these to tell which buildings got covered,
    // since buildings are nodes too
    ids.push(Json::of(this->graph.idAt(index)));
  }

  std::unordered_map<int, int> placeOf;
  placeOf.reserve(reach.nodes.size() * 2);
  for (size_t i = 0; i < reach.nodes.size(); i++) {
    placeOf[reach.nodes[i]] = static_cast<int>(i);
  }

  Json costs = Json::array();
  for (double value : reach.costs) {
    costs.push(Json::of(value));
  }

  // the walkable paths, each with the cost of reaching it. drawing the
  // network itself is the honest picture. a filled shape would claim
  // you can cut through buildings.
  Json edges = Json::array();
  Json edgeCosts = Json::array();
  for (size_t i = 0; i < reach.edges.size(); i++) {
    auto from = placeOf.find(reach.edges[i].from);
    auto to = placeOf.find(reach.edges[i].to);
    if (from == placeOf.end() || to == placeOf.end()) {
      continue;
    }
    Json pair = Json::array();
    pair.push(Json::of(from->second));
    pair.push(Json::of(to->second));
    edges.push(std::move(pair));
    edgeCosts.push(Json::of(reach.edgeCosts[i]));
  }

  Json reply = Json::object();
  reply.set("ok", Json::of(true));
  reply.set("start", Json::of(startId));
  reply.set("limit", Json::of(limit));
  reply.set("points", std::move(points));
  reply.set("ids", std::move(ids));
  reply.set("costs", std::move(costs));
  reply.set("edges", std::move(edges));
  reply.set("edgeCosts", std::move(edgeCosts));
  reply.set("runtimeUs", Json::of(reach.runtimeUs));
  return {200, reply.dump()};
}

Reply Service::handle(const std::string &method, const std::string &path,
                      const std::string &body) const {
  if (method == "GET" && path == "/healthz") {
    return this->health();
  }
  if (method == "GET" && path == "/graph/meta") {
    return this->meta();
  }
  if (method == "POST" && path == "/route") {
    return this->route(body);
  }
  if (method == "POST" && path == "/isochrone") {
    return this->isochrone(body);
  }
  if (path == "/route" || path == "/healthz" || path == "/graph/meta" ||
      path == "/isochrone") {
    return {405, errorBody("wrong method for " + path)};
  }
  return {404, errorBody("no such endpoint " + path)};
}

}  // namespace campus
