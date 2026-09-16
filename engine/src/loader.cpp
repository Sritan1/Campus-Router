#include "campus/loader.hpp"

#include <fstream>
#include <sstream>

namespace campus {

namespace {

// section headers are a label then a count, like nodes 16149
bool readSection(std::istream &in, const std::string &expected, long long &count,
                 std::string &error) {
  std::string label;
  if (!(in >> label >> count) || label != expected) {
    error = "expected a " + expected + " section";
    return false;
  }
  if (count < 0) {
    error = expected + " count is negative";
    return false;
  }
  return true;
}

}  // namespace

bool loadGraph(const std::string &path, Graph &graph, std::string &error) {
  std::ifstream in(path);
  if (!in) {
    error = "cannot open " + path;
    return false;
  }

  std::string magic;
  int version = 0;
  if (!(in >> magic >> version) || magic != "campus-graph") {
    error = "not a campus graph file";
    return false;
  }
  if (version != 1) {
    error = "unsupported graph version " + std::to_string(version);
    return false;
  }

  long long classCount = 0;
  if (!readSection(in, "classes", classCount, error)) {
    return false;
  }
  std::vector<std::string> classNames(static_cast<size_t>(classCount));
  for (long long i = 0; i < classCount; i++) {
    int id = 0;
    std::string name;
    if (!(in >> id >> name) || id < 0 || id >= classCount) {
      error = "bad class entry";
      return false;
    }
    classNames[static_cast<size_t>(id)] = name;
  }
  graph.setClassNames(std::move(classNames));

  long long nodeCount = 0;
  if (!readSection(in, "nodes", nodeCount, error)) {
    return false;
  }
  for (long long i = 0; i < nodeCount; i++) {
    long long id = 0;
    double lat = 0.0;
    double lon = 0.0;
    if (!(in >> id >> lat >> lon)) {
      error = "bad node entry";
      return false;
    }
    graph.addNode(id, Coordinates(lat, lon));
  }

  long long edgeCount = 0;
  if (!readSection(in, "edges", edgeCount, error)) {
    return false;
  }
  for (long long i = 0; i < edgeCount; i++) {
    long long from = 0;
    long long to = 0;
    double lengthM = 0.0;
    int classId = 0;
    if (!(in >> from >> to >> lengthM >> classId)) {
      error = "bad edge entry";
      return false;
    }

    const int fromIndex = graph.indexOf(from);
    const int toIndex = graph.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) {
      error = "edge points at a node that was never declared";
      return false;
    }
    if (lengthM <= 0.0) {
      error = "edge length must be above zero";
      return false;
    }
    graph.addEdge(fromIndex, toIndex, lengthM, classId);
  }

  graph.build();
  return true;
}

}  // namespace campus
