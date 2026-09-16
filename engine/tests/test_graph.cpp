#include "campus/geo.hpp"
#include "campus/graph.hpp"
#include "harness.hpp"

using campus::Adjacency;
using campus::Coordinates;
using campus::Graph;

TEST(sameNodeAddedTwiceKeepsOneIndex) {
  Graph graph;
  const int first = graph.addNode(10, Coordinates(41.87, -87.65));
  const int again = graph.addNode(10, Coordinates(41.87, -87.65));
  CHECK(first == again);
  CHECK(graph.numNodes() == 1);
}

TEST(unknownIdLooksUpAsMissing) {
  Graph graph;
  graph.addNode(10, Coordinates(41.87, -87.65));
  CHECK(graph.indexOf(10) == 0);
  CHECK(graph.indexOf(999) == -1);
}

TEST(edgesGoBothWays) {
  Graph graph;
  const int a = graph.addNode(1, Coordinates(41.870, -87.650));
  const int b = graph.addNode(2, Coordinates(41.871, -87.650));
  graph.addEdge(a, b, 100.0, 0);
  graph.build();

  CHECK(graph.neighbors(a).size() == 1);
  CHECK(graph.neighbors(b).size() == 1);
  CHECK(graph.neighbors(a)[0].to == b);
  CHECK(graph.neighbors(b)[0].to == a);
  CHECK(graph.numEdges() == 1);
}

TEST(selfLoopsAreIgnored) {
  Graph graph;
  const int a = graph.addNode(1, Coordinates(41.87, -87.65));
  graph.addEdge(a, a, 5.0, 0);
  graph.build();
  CHECK(graph.neighbors(a).empty());
  CHECK(graph.numEdges() == 0);
}

TEST(neighbourSlicesDoNotOverlap) {
  Graph graph;
  const int a = graph.addNode(1, Coordinates(41.870, -87.650));
  const int b = graph.addNode(2, Coordinates(41.871, -87.650));
  const int c = graph.addNode(3, Coordinates(41.872, -87.650));
  graph.addEdge(a, b, 10.0, 0);
  graph.addEdge(b, c, 20.0, 1);
  graph.build();

  CHECK(graph.neighbors(a).size() == 1);
  CHECK(graph.neighbors(b).size() == 2);
  CHECK(graph.neighbors(c).size() == 1);

  // the class travels with the edge in both directions
  CHECK(graph.neighbors(c)[0].classId == 1);
  CHECK_NEAR(graph.neighbors(c)[0].lengthM, 20.0, 1e-9);
}

TEST(nodeWithNoEdgesHasAnEmptySlice) {
  Graph graph;
  const int a = graph.addNode(1, Coordinates(41.870, -87.650));
  const int lonely = graph.addNode(2, Coordinates(41.999, -87.999));
  const int c = graph.addNode(3, Coordinates(41.871, -87.650));
  graph.addEdge(a, c, 10.0, 0);
  graph.build();
  CHECK(graph.neighbors(lonely).empty());
}

TEST(distanceIsZeroForThePoint) {
  CHECK_NEAR(campus::distanceBetween(Coordinates(41.87, -87.65),
                                     Coordinates(41.87, -87.65)),
             0.0, 1e-9);
}

TEST(distanceMatchesOneDegreeOfLatitude) {
  // one degree of latitude is the same everywhere on the globe
  const double expected = campus::EARTH_RADIUS_M * campus::DEGREES_TO_RADIANS;
  CHECK_NEAR(campus::distanceBetween(Coordinates(0.0, 0.0), Coordinates(1.0, 0.0)),
             expected, 1e-3);
}

TEST(distanceDoesNotCareAboutOrder) {
  const double there = campus::distanceBetween(Coordinates(41.87, -87.65),
                                               Coordinates(41.88, -87.64));
  const double back = campus::distanceBetween(Coordinates(41.88, -87.64),
                                              Coordinates(41.87, -87.65));
  CHECK_NEAR(there, back, 1e-9);
}

TEST(distanceOnCampusLooksRight) {
  const double metres = campus::distanceBetween(Coordinates(41.8708, -87.6505),
                                                Coordinates(41.8717, -87.6505));
  CHECK(metres > 95.0);
  CHECK(metres < 105.0);
}
