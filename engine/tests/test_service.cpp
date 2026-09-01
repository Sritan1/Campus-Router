#include "campus/service.hpp"

#include "campus/json.hpp"
#include "harness.hpp"

using campus::Coordinates;
using campus::Graph;
using campus::Json;
using campus::Reply;
using campus::Service;

namespace {

/// @brief A small graph with a cheap side and an expensive side, plus a
///        stray node nothing connects to.
Graph testGraph() {
  Graph graph;
  graph.addNode(10, Coordinates(41.8700, -87.6500));
  graph.addNode(11, Coordinates(41.8705, -87.6510));
  graph.addNode(12, Coordinates(41.8705, -87.6490));
  graph.addNode(13, Coordinates(41.8710, -87.6500));
  graph.addNode(99, Coordinates(41.9000, -87.7000));

  graph.addEdge(0, 1, 100.0, 0);
  graph.addEdge(1, 3, 100.0, 0);
  graph.addEdge(0, 2, 10.0, 1);
  graph.addEdge(2, 3, 10.0, 1);
  graph.build();
  graph.setClassNames({"footway|concrete|none", "steps|unknown|none"});
  return graph;
}

Json replyJson(const Reply &reply) {
  Json out;
  std::string error;
  CHECK(Json::parse(reply.body, out, error));
  return out;
}

}  // namespace

TEST(healthReportsThatItIsUp) {
  Graph graph = testGraph();
  Service service(graph);
  Reply reply = service.handle("GET", "/healthz", "");

  CHECK(reply.status == 200);
  CHECK(replyJson(reply).at("ok").asBool());
}

TEST(metaDescribesTheLoadedGraph) {
  Graph graph = testGraph();
  Service service(graph);
  Json body = replyJson(service.handle("GET", "/graph/meta", ""));

  CHECK(body.at("nodes").asInteger() == 5);
  CHECK(body.at("edges").asInteger() == 4);
  CHECK(body.at("classes").items().size() == 2);
}

TEST(unknownPathsAreNotFound) {
  Graph graph = testGraph();
  Service service(graph);
  CHECK(service.handle("GET", "/nope", "").status == 404);
}

TEST(rightPathWrongMethodSaysSo) {
  Graph graph = testGraph();
  Service service(graph);
  CHECK(service.handle("GET", "/route", "").status == 405);
  CHECK(service.handle("POST", "/healthz", "").status == 405);
}

TEST(queryStringsDoNotBreakRouting) {
  Graph graph = testGraph();
  Service service(graph);
  // the server strips these before we see them, so a bare path is fine
  CHECK(service.handle("GET", "/healthz", "").status == 200);
}

TEST(brokenJsonIsRejectedNotCrashed) {
  Graph graph = testGraph();
  Service service(graph);

  Reply reply = service.handle("POST", "/route", "{not json");
  CHECK(reply.status == 400);
  CHECK(!replyJson(reply).at("ok").asBool());
}

TEST(missingStartAndTargetIsRejected) {
  Graph graph = testGraph();
  Service service(graph);
  CHECK(service.handle("POST", "/route", "{}").status == 400);
  CHECK(service.handle("POST", "/route", R"({"start":10})").status == 400);
  // a json array is not a request
  CHECK(service.handle("POST", "/route", "[1,2]").status == 400);
}

TEST(unknownNodeIdsAreNotFound) {
  Graph graph = testGraph();
  Service service(graph);
  CHECK(service.handle("POST", "/route", R"({"start":555,"target":13})").status == 404);
  CHECK(service.handle("POST", "/route", R"({"start":10,"target":555})").status == 404);
}

TEST(unknownAlgorithmNamesAreRejected) {
  Graph graph = testGraph();
  Service service(graph);
  Reply reply = service.handle(
      "POST", "/route", R"({"start":10,"target":13,"algorithms":["astar","magic"]})");
  CHECK(reply.status == 400);
}

TEST(routingReturnsAllFourByDefault) {
  Graph graph = testGraph();
  Service service(graph);
  Json body = replyJson(service.handle("POST", "/route", R"({"start":10,"target":13})"));

  CHECK(body.at("ok").asBool());
  CHECK(body.at("results").items().size() == 4);
  CHECK(body.at("start").asInteger() == 10);
  CHECK(body.at("target").asInteger() == 13);

  for (const Json &entry : body.at("results").items()) {
    CHECK(entry.at("status").asString() == "ok");
    CHECK(entry.at("path").items().front().asInteger() == 10);
    CHECK(entry.at("path").items().back().asInteger() == 13);
    // points come back for drawing, one per path node
    CHECK(entry.at("points").items().size() == entry.at("path").items().size());
  }
}

TEST(askingForOneAlgorithmRunsOnlyThatOne) {
  Graph graph = testGraph();
  Service service(graph);
  Json body = replyJson(service.handle(
      "POST", "/route", R"({"start":10,"target":13,"algorithms":["astar"]})"));

  CHECK(body.at("results").items().size() == 1);
  CHECK(body.at("results").items()[0].at("algorithm").asString() == "astar");
}

TEST(identicalPathsGetGroupedTogether) {
  Graph graph = testGraph();
  Service service(graph);
  Json body = replyJson(service.handle("POST", "/route", R"({"start":10,"target":13})"));

  // both sides of the diamond are two hops, so bfs takes the expensive
  // one while the other three take the cheap one. that is two groups.
  CHECK(body.at("pathGroups").items().size() == 2);

  size_t total = 0;
  size_t largest = 0;
  for (const Json &group : body.at("pathGroups").items()) {
    const size_t members = group.at("algorithms").items().size();
    total += members;
    largest = members > largest ? members : largest;
  }
  CHECK(total == 4);
  CHECK(largest == 3);
}

TEST(oneAlgorithmMakesOneGroup) {
  Graph graph = testGraph();
  Service service(graph);
  Json body = replyJson(service.handle(
      "POST", "/route", R"({"start":10,"target":13,"algorithms":["dijkstra"]})"));

  CHECK(body.at("pathGroups").items().size() == 1);
  CHECK(body.at("pathGroups").items()[0].at("algorithms").items().size() == 1);
}

TEST(theThreeExactOnesShareAGroupWhenTheTieIsBroken) {
  // give the cheap side a clear hop advantage so bfs agrees too
  Graph graph;
  graph.addNode(10, Coordinates(41.8700, -87.6500));
  graph.addNode(11, Coordinates(41.8702, -87.6510));
  graph.addNode(12, Coordinates(41.8704, -87.6510));
  graph.addNode(13, Coordinates(41.8706, -87.6500));
  graph.addEdge(0, 1, 10.0, 0);
  graph.addEdge(1, 2, 10.0, 0);
  graph.addEdge(2, 3, 10.0, 0);
  graph.addEdge(0, 3, 25.0, 0);
  graph.build();
  graph.setClassNames({"footway|concrete|none"});

  Service service(graph);
  Json body = replyJson(service.handle("POST", "/route", R"({"start":10,"target":13})"));

  // the direct hop is both cheapest and fewest hops, so all four agree
  CHECK(body.at("pathGroups").items().size() == 1);
  CHECK(body.at("pathGroups").items()[0].at("algorithms").items().size() == 4);
}

TEST(blockingAClassChangesTheRoute) {
  Graph graph = testGraph();
  Service service(graph);

  Json open = replyJson(service.handle(
      "POST", "/route", R"({"start":10,"target":13,"algorithms":["dijkstra"]})"));
  CHECK_NEAR(open.at("results").items()[0].at("cost").asNumber(), 20.0, 1e-6);

  Json blocked = replyJson(service.handle(
      "POST", "/route",
      R"({"start":10,"target":13,"algorithms":["dijkstra"],
          "cost":{"blocked":["steps|unknown|none"]}})"));
  CHECK_NEAR(blocked.at("results").items()[0].at("cost").asNumber(), 200.0, 1e-6);
}

TEST(multipliersArriveByClassName) {
  Graph graph = testGraph();
  Service service(graph);

  Json body = replyJson(service.handle(
      "POST", "/route",
      R"({"start":10,"target":13,"algorithms":["dijkstra"],
          "cost":{"multipliers":{"steps|unknown|none":20}}})"));
  // the cheap side costs twenty times more now, so the long way wins
  CHECK_NEAR(body.at("results").items()[0].at("cost").asNumber(), 200.0, 1e-6);
}

TEST(unknownClassNamesInTheCostModelAreIgnored) {
  Graph graph = testGraph();
  Service service(graph);
  Reply reply = service.handle(
      "POST", "/route",
      R"({"start":10,"target":13,"cost":{"multipliers":{"not|a|class":9}}})");
  CHECK(reply.status == 200);
}

TEST(noPathIsReportedPerAlgorithmNotAsAnError) {
  Graph graph = testGraph();
  Service service(graph);

  // node 99 is connected to nothing
  Reply reply = service.handle("POST", "/route", R"({"start":10,"target":99})");
  CHECK(reply.status == 200);

  Json body = replyJson(reply);
  CHECK(body.at("ok").asBool());
  for (const Json &entry : body.at("results").items()) {
    CHECK(entry.at("status").asString() == "no_path");
    CHECK(entry.at("path").isNull());
  }
  CHECK(body.at("pathGroups").items().empty());
}

TEST(traceOnlyComesBackWhenAskedFor) {
  Graph graph = testGraph();
  Service service(graph);

  Json without = replyJson(service.handle("POST", "/route", R"({"start":10,"target":13})"));
  CHECK(without.at("results").items()[0].at("trace").isNull());

  Json with = replyJson(
      service.handle("POST", "/route", R"({"start":10,"target":13,"trace":true})"));
  CHECK(!with.at("results").items()[0].at("trace").isNull());
  CHECK(!with.at("results").items()[0].at("trace").at("points").items().empty());
}

TEST(negativeTraceLimitIsRejected) {
  Graph graph = testGraph();
  Service service(graph);
  Reply reply = service.handle(
      "POST", "/route", R"({"start":10,"target":13,"maxTraceSamples":-5})");
  CHECK(reply.status == 400);
}

TEST(thinningKeepsTheEndsAndTheCount) {
  std::vector<size_t> few = campus::thinIndices(1000, 10);
  CHECK(few.size() == 10);
  CHECK(few.front() == 0);
  // evenly spread, so it still covers the whole search
  CHECK(few[5] == 500);

  // a limit above the input leaves it alone
  CHECK(campus::thinIndices(1000, 5000).size() == 1000);
  CHECK(campus::thinIndices(1000, 0).size() == 1000);
  CHECK(campus::thinIndices(0, 10).empty());
}

TEST(traceCarriesTheEdgeThatReachedEachNode) {
  Graph graph = testGraph();
  Service service(graph);

  Json body = replyJson(service.handle(
      "POST", "/route",
      R"({"start":10,"target":13,"algorithms":["dijkstra"],"trace":true})"));

  const Json &trace = body.at("results").items()[0].at("trace");
  const size_t points = trace.at("points").items().size();

  CHECK(points > 0);
  // one parent per point, so every step can be drawn as a segment
  CHECK(trace.at("parents").items().size() == points);

  // the first settled node is the start, which came from nowhere
  CHECK(trace.at("parents").items()[0].asInteger() == -1);

  // every other parent points at something already in the trace
  for (size_t i = 1; i < points; i++) {
    const long long parent = trace.at("parents").items()[i].asInteger();
    CHECK(parent >= -1);
    CHECK(parent < static_cast<long long>(points));
  }
}

TEST(everyParentComesBeforeItsChild) {
  Graph graph = testGraph();
  Service service(graph);

  Json body = replyJson(service.handle(
      "POST", "/route", R"({"start":10,"target":13,"trace":true})"));

  // the animation draws in order, so a parent arriving later would
  // mean drawing a segment from a point that is not on screen yet
  for (const Json &entry : body.at("results").items()) {
    const Json &parents = entry.at("trace").at("parents");
    for (size_t i = 0; i < parents.items().size(); i++) {
      const long long parent = parents.items()[i].asInteger();
      CHECK(parent < static_cast<long long>(i));
    }
  }
}
