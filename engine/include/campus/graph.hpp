#pragma once

#include <span>
#include <string>
#include <unordered_map>
#include <vector>

#include "campus/geo.hpp"

namespace campus {

// neighbours by index, not osm id, so walking them needs no lookups
struct Adjacency {
  int to = 0;
  double lengthM = 0.0;
  int classId = 0;
};

// loaded once and never changed, so edges sit in one flat array with an
// offset per node, and the neighbours of a node are one contiguous slice
class Graph {
 public:
  // negative ids are buildings. adding the same id twice gives the same index
  int addNode(long long id, Coordinates at);

  void addEdge(int from, int to, double lengthM, int classId);

  // call once, after the last edge
  void build();

  std::span<const Adjacency> neighbors(int index) const;

  // minus one when the id is not in the graph
  int indexOf(long long id) const;

  long long idAt(int index) const { return this->ids[index]; }

  Coordinates coordinatesAt(int index) const { return this->points[index]; }

  size_t numNodes() const { return this->ids.size(); }

  // undirected, the packed array holds each one twice
  size_t numEdges() const { return this->edgeCount; }

  size_t numClasses() const { return this->classNames.size(); }

  const std::string &classNameAt(int classId) const {
    return this->classNames[classId];
  }

  void setClassNames(std::vector<std::string> names) {
    this->classNames = std::move(names);
  }

  bool isBuilt() const { return this->built; }

 private:
  std::vector<long long> ids;
  std::vector<Coordinates> points;
  std::unordered_map<long long, int> lookup;

  struct PendingEdge {
    int from = 0;
    int to = 0;
    double lengthM = 0.0;
    int classId = 0;
  };
  std::vector<PendingEdge> pending;

  // offsets has one entry per node and a final total
  std::vector<int> offsets;
  std::vector<Adjacency> adjacency;

  std::vector<std::string> classNames;
  size_t edgeCount = 0;
  bool built = false;
};

}  // namespace campus
