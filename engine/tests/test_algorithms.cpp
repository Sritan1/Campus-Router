#include <random>
#include <vector>

#include "campus/algorithms.hpp"
#include "harness.hpp"

using campus::Adjacency;
using campus::Algorithm;
using campus::Coordinates;
using campus::CostModel;
using campus::Graph;
using campus::RouteResult;

namespace {

const Algorithm ALL[] = {
    Algorithm::Dijkstra,
    Algorithm::AStar,
    Algorithm::Bfs,
    Algorithm::BidirectionalDijkstra,
};

// the three that are supposed to agree. bfs is left out because it
// counts hops rather than distance.
const Algorithm EXACT[] = {
    Algorithm::Dijkstra,
    Algorithm::AStar,
    Algorithm::BidirectionalDijkstra,
};

/// @brief A diamond where the short way round is also the fewest hops.
///
///   0 --100-- 1 --100-- 3
///   0 --10--- 2 --10--- 3
Graph diamond() {
  Graph graph;
  graph.addNode(0, Coordinates(41.8700, -87.6500));
  graph.addNode(1, Coordinates(41.8705, -87.6510));
  graph.addNode(2, Coordinates(41.8705, -87.6490));
  graph.addNode(3, Coordinates(41.8710, -87.6500));
  graph.addEdge(0, 1, 100.0, 0);
  graph.addEdge(1, 3, 100.0, 0);
  graph.addEdge(0, 2, 10.0, 1);
  graph.addEdge(2, 3, 10.0, 1);
  graph.build();
  return graph;
}

/// @brief A long cheap way round against a single expensive hop.
///
/// One hop from 0 to 4 costs 500. Going the long way is four hops of 10.
Graph shortcutTrap() {
  Graph graph;
  for (int i = 0; i < 5; i++) {
    graph.addNode(i, Coordinates(41.8700 + 0.0002 * i, -87.6500));
  }
  for (int i = 0; i + 1 < 5; i++) {
    graph.addEdge(i, i + 1, 10.0, 0);
  }
  graph.addEdge(0, 4, 500.0, 0);
  graph.build();
  return graph;
}

}  // namespace

TEST(everyAlgorithmFindsTheCheapSideOfTheDiamond) {
  Graph graph = diamond();
  CostModel cost = CostModel::plain(2);

  for (Algorithm algorithm : EXACT) {
    RouteResult result = runAlgorithm(algorithm, graph, cost, 0, 3, false);
    CHECK(result.found);
    CHECK_NEAR(result.cost, 20.0, 1e-6);
    CHECK(result.path.size() == 3);
    CHECK(result.path[1] == 2);
  }
}

TEST(bfsTakesTheFewestHopsEvenWhenItCostsMore) {
  Graph graph = shortcutTrap();
  CostModel cost = CostModel::plain(1);

  RouteResult bfs = runAlgorithm(Algorithm::Bfs, graph, cost, 0, 4, false);
  CHECK(bfs.found);
  // one hop, the expensive way
  CHECK(bfs.path.size() == 2);
  CHECK_NEAR(bfs.cost, 500.0, 1e-6);

  RouteResult dijkstra = runAlgorithm(Algorithm::Dijkstra, graph, cost, 0, 4, false);
  CHECK(dijkstra.found);
  CHECK_NEAR(dijkstra.cost, 40.0, 1e-6);
  CHECK(dijkstra.path.size() == 5);
}

TEST(bfsReportsWhatItsOwnPathReallyCosts) {
  Graph graph = shortcutTrap();
  CostModel cost = CostModel::plain(1);
  RouteResult bfs = runAlgorithm(Algorithm::Bfs, graph, cost, 0, 4, false);

  // the cost has to describe the path bfs returned, not the best one
  CHECK_NEAR(bfs.cost, 500.0, 1e-6);
  CHECK_NEAR(bfs.distanceM, 500.0, 1e-6);
}

TEST(startAndTargetTheSameIsATrivialPath) {
  Graph graph = diamond();
  CostModel cost = CostModel::plain(2);

  for (Algorithm algorithm : ALL) {
    RouteResult result = runAlgorithm(algorithm, graph, cost, 2, 2, false);
    CHECK(result.found);
    CHECK(result.path.size() == 1);
    CHECK_NEAR(result.cost, 0.0, 1e-9);
  }
}

TEST(noPathWhenTheGraphIsInTwoPieces) {
  Graph graph;
  graph.addNode(0, Coordinates(41.870, -87.650));
  graph.addNode(1, Coordinates(41.871, -87.650));
  graph.addNode(2, Coordinates(41.880, -87.660));
  graph.addNode(3, Coordinates(41.881, -87.660));
  graph.addEdge(0, 1, 10.0, 0);
  graph.addEdge(2, 3, 10.0, 0);
  graph.build();

  CostModel cost = CostModel::plain(1);
  for (Algorithm algorithm : ALL) {
    RouteResult result = runAlgorithm(algorithm, graph, cost, 0, 3, false);
    CHECK(!result.found);
    CHECK(result.path.empty());
  }
}

TEST(blockedClassesAreNeverWalked) {
  Graph graph = diamond();

  // block the cheap side, everyone should take the long way
  CostModel cost = CostModel::plain(2);
  cost.blocked[1] = 1;

  for (Algorithm algorithm : ALL) {
    RouteResult result = runAlgorithm(algorithm, graph, cost, 0, 3, false);
    CHECK(result.found);
    CHECK(result.path.size() == 3);
    CHECK(result.path[1] == 1);
  }
}

TEST(blockingEverythingLeavesNoRoute) {
  Graph graph = diamond();
  CostModel cost = CostModel::plain(2);
  cost.blocked[0] = 1;
  cost.blocked[1] = 1;

  for (Algorithm algorithm : ALL) {
    RouteResult result = runAlgorithm(algorithm, graph, cost, 0, 3, false);
    CHECK(!result.found);
  }
}

TEST(multipliersChangeWhichWayIsCheapest) {
  Graph graph = diamond();
  CostModel cost = CostModel::plain(2);

  // make the short side twenty times more expensive to walk
  cost.multipliers[1] = 20.0;

  RouteResult result = runAlgorithm(Algorithm::Dijkstra, graph, cost, 0, 3, false);
  CHECK(result.found);
  // 20 metres at twenty times is worse than 200 metres at one
  CHECK(result.path[1] == 1);
  CHECK_NEAR(result.cost, 200.0, 1e-6);
}

TEST(traceRecordsTheOrderNodesWereSettled) {
  Graph graph = diamond();
  CostModel cost = CostModel::plain(2);

  RouteResult result = runAlgorithm(Algorithm::Dijkstra, graph, cost, 0, 3, true);
  CHECK(result.found);
  CHECK(!result.visitOrder.empty());
  CHECK(result.visitOrder[0] == 0);
  CHECK(static_cast<long long>(result.visitOrder.size()) == result.nodesVisited);
}

TEST(traceIsEmptyWhenNotAskedFor) {
  Graph graph = diamond();
  CostModel cost = CostModel::plain(2);
  RouteResult result = runAlgorithm(Algorithm::Dijkstra, graph, cost, 0, 3, false);
  CHECK(result.visitOrder.empty());
}

TEST(sameQuestionGivesTheSameAnswerEveryTime) {
  Graph graph = diamond();
  CostModel cost = CostModel::plain(2);

  RouteResult first = runAlgorithm(Algorithm::Dijkstra, graph, cost, 0, 3, false);
  for (int i = 0; i < 20; i++) {
    RouteResult again = runAlgorithm(Algorithm::Dijkstra, graph, cost, 0, 3, false);
    CHECK(again.path == first.path);
  }
}

TEST(outOfRangeNodesAreRejected) {
  Graph graph = diamond();
  CostModel cost = CostModel::plain(2);
  CHECK(!runAlgorithm(Algorithm::Dijkstra, graph, cost, -1, 3, false).found);
  CHECK(!runAlgorithm(Algorithm::Dijkstra, graph, cost, 0, 99, false).found);
}

// This is the important one. A star and bidirectional are both easy to get
// subtly wrong in ways that still look plausible, so they are checked
// against plain dijkstra on a lot of random graphs.
TEST(theThreeExactAlgorithmsAlwaysAgree) {
  std::mt19937 rng(12345);
  std::uniform_real_distribution<double> jitter(-0.004, 0.004);
  std::uniform_real_distribution<double> multiplier(1.0, 3.0);
  std::uniform_int_distribution<int> extraEdges(0, 3);

  int checkedPairs = 0;

  for (int round = 0; round < 200; round++) {
    const int nodeCount = 12 + static_cast<int>(rng() % 20);

    Graph graph;
    for (int i = 0; i < nodeCount; i++) {
      graph.addNode(i, Coordinates(41.87 + jitter(rng), -87.65 + jitter(rng)));
    }

    // a spine keeps it connected, then random chords make it interesting
    for (int i = 0; i + 1 < nodeCount; i++) {
      const double length = campus::distanceBetween(graph.coordinatesAt(i),
                                                    graph.coordinatesAt(i + 1));
      graph.addEdge(i, i + 1, length + 1.0, static_cast<int>(rng() % 4));
    }
    for (int i = 0; i < nodeCount; i++) {
      for (int k = extraEdges(rng); k > 0; k--) {
        const int other = static_cast<int>(rng() % nodeCount);
        if (other == i) {
          continue;
        }
        const double length = campus::distanceBetween(graph.coordinatesAt(i),
                                                      graph.coordinatesAt(other));
        graph.addEdge(i, other, length + 1.0, static_cast<int>(rng() % 4));
      }
    }
    graph.build();

    CostModel cost = CostModel::plain(4);
    for (int c = 0; c < 4; c++) {
      cost.multipliers[c] = multiplier(rng);
    }
    // sometimes shut a class off entirely
    if (rng() % 4 == 0) {
      cost.blocked[rng() % 4] = 1;
    }

    for (int attempt = 0; attempt < 5; attempt++) {
      const int start = static_cast<int>(rng() % nodeCount);
      const int target = static_cast<int>(rng() % nodeCount);
      if (start == target) {
        continue;
      }

      RouteResult reference =
          runAlgorithm(Algorithm::Dijkstra, graph, cost, start, target, false);

      for (Algorithm algorithm : EXACT) {
        RouteResult result =
            runAlgorithm(algorithm, graph, cost, start, target, false);

        CHECK(result.found == reference.found);
        if (!reference.found) {
          continue;
        }

        // the paths may differ when there is a tie, the cost may not
        CHECK_NEAR(result.cost, reference.cost, 1e-6);
        CHECK(result.path.front() == start);
        CHECK(result.path.back() == target);
      }
      checkedPairs++;
    }
  }

  // make sure the loop above actually did something
  CHECK(checkedPairs > 500);
}

TEST(bfsIsNeverLongerInHopsThanDijkstra) {
  std::mt19937 rng(999);
  std::uniform_real_distribution<double> jitter(-0.003, 0.003);

  for (int round = 0; round < 60; round++) {
    const int nodeCount = 10 + static_cast<int>(rng() % 12);
    Graph graph;
    for (int i = 0; i < nodeCount; i++) {
      graph.addNode(i, Coordinates(41.87 + jitter(rng), -87.65 + jitter(rng)));
    }
    for (int i = 0; i + 1 < nodeCount; i++) {
      graph.addEdge(i, i + 1, 10.0 + (rng() % 100), 0);
    }
    for (int i = 0; i < nodeCount; i += 3) {
      const int other = static_cast<int>(rng() % nodeCount);
      if (other != i) {
        graph.addEdge(i, other, 10.0 + (rng() % 100), 0);
      }
    }
    graph.build();

    CostModel cost = CostModel::plain(1);
    const int start = 0;
    const int target = nodeCount - 1;

    RouteResult bfs = runAlgorithm(Algorithm::Bfs, graph, cost, start, target, false);
    RouteResult dijkstra =
        runAlgorithm(Algorithm::Dijkstra, graph, cost, start, target, false);

    CHECK(bfs.found == dijkstra.found);
    if (bfs.found) {
      CHECK(bfs.path.size() <= dijkstra.path.size());
      // and dijkstra can never be beaten on cost
      CHECK(dijkstra.cost <= bfs.cost + 1e-6);
    }
  }
}
