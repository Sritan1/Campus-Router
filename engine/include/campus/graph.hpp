#pragma once

#include <span>
#include <string>
#include <unordered_map>
#include <vector>

#include "campus/geo.hpp"

namespace campus {

/// @brief One outgoing edge. Neighbours are stored by index, not by osm id,
///        so walking them costs no lookups.
struct Adjacency {
  int to = 0;
  double lengthM = 0.0;
  int classId = 0;
};

/// @brief The campus walking network.
///
/// The graph is loaded once and never changed, so edges live in one flat
/// array with an offset per node rather than a map of maps. Neighbours of a
/// node are then a contiguous slice, which is what the search loops want.
class Graph {
 public:
  /// @brief Add a node, or return the index of one already added.
  /// @param id openstreetmap id, negative for buildings
  /// @param at where it is
  /// @return the index this node will be known by
  int addNode(long long id, Coordinates at);

  /// @brief Record an undirected edge between two nodes.
  /// @param from index of one end
  /// @param to index of the other end
  /// @param lengthM real world length in metres
  /// @param classId which cost class this edge belongs to
  void addEdge(int from, int to, double lengthM, int classId);

  /// @brief Pack the edges into their final layout.
  ///        Must be called once, after every edge is added.
  void build();

  /// @brief Neighbours of a node, as a slice of the flat edge array.
  /// @param index node index
  std::span<const Adjacency> neighbors(int index) const;

  /// @brief Find a node by its openstreetmap id.
  /// @return the index, or -1 when we do not have it
  int indexOf(long long id) const;

  /// @brief The openstreetmap id of a node index.
  long long idAt(int index) const { return this->ids[index]; }

  /// @brief Where a node index sits.
  Coordinates coordinatesAt(int index) const { return this->points[index]; }

  size_t numNodes() const { return this->ids.size(); }

  /// @brief Number of undirected edges. Each one is stored twice internally.
  size_t numEdges() const { return this->edgeCount; }

  /// @brief How many cost classes the loaded graph refers to.
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

  // edges as added, before build packs them
  struct PendingEdge {
    int from = 0;
    int to = 0;
    double lengthM = 0.0;
    int classId = 0;
  };
  std::vector<PendingEdge> pending;

  // the packed layout. offsets has one entry per node plus a final total.
  std::vector<int> offsets;
  std::vector<Adjacency> adjacency;

  std::vector<std::string> classNames;
  size_t edgeCount = 0;
  bool built = false;
};

}  // namespace campus
