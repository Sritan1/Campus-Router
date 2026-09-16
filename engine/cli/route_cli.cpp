// runs routes straight off the graph file with no server, for checking by hand

#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>

#include "campus/algorithms.hpp"
#include "campus/loader.hpp"

namespace {

void usage() {
  std::cout << "usage: route_cli <graph file> <start osm id> <target osm id>"
            << " [--block <class name>]\n"
            << "       route_cli <graph file> --info\n"
            << "       route_cli <graph file> --scan <class name>\n";
}

// every building pair, with and without the class blocked.
// buildings are the negative ids
int scan(const campus::Graph &graph, const std::string &wanted) {
  campus::CostModel open = campus::CostModel::plain(graph.numClasses());
  campus::CostModel closed = open;
  for (size_t c = 0; c < graph.numClasses(); c++) {
    if (graph.classNameAt(static_cast<int>(c)).find(wanted) != std::string::npos) {
      closed.blocked[c] = 1;
    }
  }

  std::vector<int> buildings;
  for (size_t i = 0; i < graph.numNodes(); i++) {
    if (graph.idAt(static_cast<int>(i)) < 0) {
      buildings.push_back(static_cast<int>(i));
    }
  }
  std::cout << "scanning " << buildings.size() << " buildings\n";

  int differed = 0;
  int unreachable = 0;
  int pairs = 0;

  for (size_t a = 0; a < buildings.size(); a++) {
    for (size_t b = a + 1; b < buildings.size(); b++) {
      pairs++;
      const campus::RouteResult normal = campus::runAlgorithm(
          campus::Algorithm::Dijkstra, graph, open, buildings[a], buildings[b], false);
      const campus::RouteResult limited = campus::runAlgorithm(
          campus::Algorithm::Dijkstra, graph, closed, buildings[a], buildings[b], false);

      if (normal.found && !limited.found) {
        unreachable++;
        continue;
      }
      if (!normal.found || !limited.found) {
        continue;
      }
      if (limited.cost > normal.cost + 0.5) {
        differed++;
        if (differed <= 10) {
          std::cout << "  " << -graph.idAt(buildings[a]) << " to "
                    << -graph.idAt(buildings[b]) << "  " << std::fixed
                    << std::setprecision(1) << normal.cost << " m becomes "
                    << limited.cost << " m  (+"
                    << (limited.cost - normal.cost) << ")\n";
        }
      }
    }
  }

  std::cout << "\npairs checked        " << pairs << "\n"
            << "route got longer     " << differed << "\n"
            << "no longer reachable  " << unreachable << "\n";
  return 0;
}

}  // namespace

int main(int argc, char **argv) {
  if (argc < 3) {
    usage();
    return 1;
  }

  const std::string path = argv[1];
  campus::Graph graph;
  std::string error;
  if (!campus::loadGraph(path, graph, error)) {
    std::cerr << "could not load graph: " << error << "\n";
    return 1;
  }

  std::cout << "loaded " << graph.numNodes() << " nodes, " << graph.numEdges()
            << " edges, " << graph.numClasses() << " classes\n";

  if (std::string(argv[2]) == "--info") {
    for (size_t i = 0; i < graph.numClasses(); i++) {
      std::cout << "  " << i << " " << graph.classNameAt(static_cast<int>(i)) << "\n";
    }
    return 0;
  }

  if (std::string(argv[2]) == "--scan") {
    if (argc < 4) {
      usage();
      return 1;
    }
    return scan(graph, argv[3]);
  }

  if (argc < 4) {
    usage();
    return 1;
  }

  const long long startId = std::atoll(argv[2]);
  const long long targetId = std::atoll(argv[3]);
  const int start = graph.indexOf(startId);
  const int target = graph.indexOf(targetId);
  if (start < 0 || target < 0) {
    std::cerr << "start or target is not in the graph\n";
    return 1;
  }

  campus::CostModel cost = campus::CostModel::plain(graph.numClasses());

  // optional blocking, so accessible routing can be tried by hand
  for (int i = 4; i + 1 < argc; i += 2) {
    if (std::string(argv[i]) != "--block") {
      continue;
    }
    const std::string wanted = argv[i + 1];
    for (size_t c = 0; c < graph.numClasses(); c++) {
      if (graph.classNameAt(static_cast<int>(c)).find(wanted) != std::string::npos) {
        cost.blocked[c] = 1;
        std::cout << "blocking class " << graph.classNameAt(static_cast<int>(c)) << "\n";
      }
    }
  }

  const campus::Algorithm order[] = {
      campus::Algorithm::Dijkstra,
      campus::Algorithm::AStar,
      campus::Algorithm::Bfs,
      campus::Algorithm::BidirectionalDijkstra,
  };

  std::cout << "\n"
            << std::left << std::setw(16) << "algorithm" << std::right
            << std::setw(12) << "cost" << std::setw(12) << "metres"
            << std::setw(10) << "visited" << std::setw(10) << "hops"
            << std::setw(12) << "micros" << "\n";

  for (campus::Algorithm algorithm : order) {
    const campus::RouteResult result =
        campus::runAlgorithm(algorithm, graph, cost, start, target, false);

    std::cout << std::left << std::setw(16) << campus::nameOf(algorithm);
    if (!result.found) {
      std::cout << std::right << std::setw(12) << "no path" << "\n";
      continue;
    }
    std::cout << std::right << std::fixed << std::setprecision(1) << std::setw(12)
              << result.cost << std::setw(12) << result.distanceM << std::setw(10)
              << result.nodesVisited << std::setw(10) << (result.path.size() - 1)
              << std::setw(12) << result.runtimeUs << "\n";
  }

  return 0;
}
