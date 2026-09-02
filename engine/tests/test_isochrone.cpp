#include "campus/algorithms.hpp"
#include "campus/json.hpp"
#include "campus/service.hpp"
#include "harness.hpp"

using campus::Coordinates;
using campus::CostModel;
using campus::Graph;
using campus::Json;
using campus::Service;

namespace {

/// @brief A line of five nodes, ten metres apart.
Graph line() {
  Graph graph;
  for (int i = 0; i < 5; i++) {
    graph.addNode(100 + i, Coordinates(41.8700 + 0.0001 * i, -87.6500));
  }
  for (int i = 0; i + 1 < 5; i++) {
    graph.addEdge(i, i + 1, 10.0, 0);
  }
  graph.build();
  graph.setClassNames({"footway|concrete|none"});
  return graph;
}

Json replyJson(const campus::Reply &reply) {
  Json out;
  std::string error;
  CHECK(Json::parse(reply.body, out, error));
  return out;
}

}  // namespace

TEST(reachStopsAtTheLimit) {
  Graph graph = line();
  CostModel cost = CostModel::plain(1);

  // twenty five metres reaches the nodes at 0, 10 and 20
  campus::ReachResult reach = campus::reachable(graph, cost, 0, 25.0);
  CHECK(reach.nodes.size() == 3);
  for (double value : reach.costs) {
    CHECK(value <= 25.0);
  }
}

TEST(reachGrowsWithTheLimit) {
  Graph graph = line();
  CostModel cost = CostModel::plain(1);

  CHECK(campus::reachable(graph, cost, 0, 5.0).nodes.size() == 1);
  CHECK(campus::reachable(graph, cost, 0, 100.0).nodes.size() == 5);
}

TEST(reachHandsBackCostsInOrder) {
  Graph graph = line();
  CostModel cost = CostModel::plain(1);
  campus::ReachResult reach = campus::reachable(graph, cost, 0, 100.0);

  // dijkstra settles cheapest first, so the client can colour by band
  // without sorting anything
  for (size_t i = 1; i < reach.costs.size(); i++) {
    CHECK(reach.costs[i] >= reach.costs[i - 1]);
  }
  CHECK(reach.costs.front() == 0.0);
}

TEST(reachEdgesJoinTwoPlacesItGotTo) {
  Graph graph = line();
  CostModel cost = CostModel::plain(1);
  campus::ReachResult reach = campus::reachable(graph, cost, 0, 100.0);

  // four gaps between five nodes
  CHECK(reach.edges.size() == 4);
  CHECK(reach.edgeCosts.size() == reach.edges.size());

  // a path only counts once both of its ends are walkable, so its cost
  // is whichever end was dearer
  for (double value : reach.edgeCosts) {
    CHECK(value <= 100.0);
  }
}

TEST(reachRespectsBlockedClasses) {
  Graph graph = line();
  CostModel cost = CostModel::plain(1);
  cost.blocked[0] = 1;

  // nothing is walkable, so only where we started
  campus::ReachResult reach = campus::reachable(graph, cost, 0, 100.0);
  CHECK(reach.nodes.size() == 1);
  CHECK(reach.edges.empty());
}

TEST(reachRejectsNonsense) {
  Graph graph = line();
  CostModel cost = CostModel::plain(1);
  CHECK(campus::reachable(graph, cost, -1, 100.0).nodes.empty());
  CHECK(campus::reachable(graph, cost, 0, 0.0).nodes.empty());
  CHECK(campus::reachable(graph, cost, 0, -5.0).nodes.empty());
}

TEST(isochroneEndpointAnswers) {
  Graph graph = line();
  Service service(graph);

  Json body = replyJson(
      service.handle("POST", "/isochrone", R"({"start":100,"limit":25})"));

  CHECK(body.at("ok").asBool());
  CHECK(body.at("points").items().size() == 3);
  CHECK(body.at("costs").items().size() == 3);
  CHECK(body.at("edges").items().size() == body.at("edgeCosts").items().size());
}

TEST(isochroneRejectsBadRequests) {
  Graph graph = line();
  Service service(graph);

  CHECK(service.handle("POST", "/isochrone", "{}").status == 400);
  CHECK(service.handle("POST", "/isochrone", R"({"start":100})").status == 400);
  CHECK(service.handle("POST", "/isochrone", R"({"start":100,"limit":0})").status == 400);
  CHECK(service.handle("POST", "/isochrone", R"({"start":999,"limit":25})").status == 404);
  CHECK(service.handle("GET", "/isochrone", "").status == 405);
}
