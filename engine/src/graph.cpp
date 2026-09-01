#include "campus/graph.hpp"

#include <stdexcept>

namespace campus {

int Graph::addNode(long long id, Coordinates at) {
  auto found = this->lookup.find(id);
  if (found != this->lookup.end()) {
    return found->second;
  }

  const int index = static_cast<int>(this->ids.size());
  this->ids.push_back(id);
  this->points.push_back(at);
  this->lookup.emplace(id, index);
  return index;
}

void Graph::addEdge(int from, int to, double lengthM, int classId) {
  if (this->built) {
    throw std::logic_error("cannot add edges after build");
  }
  if (from == to) {
    return;
  }
  this->pending.push_back({from, to, lengthM, classId});
  this->edgeCount++;
}

void Graph::build() {
  const size_t nodeCount = this->ids.size();

  // count both directions first so we know how much room each node needs
  std::vector<int> degree(nodeCount, 0);
  for (const PendingEdge &edge : this->pending) {
    degree[edge.from]++;
    degree[edge.to]++;
  }

  this->offsets.assign(nodeCount + 1, 0);
  for (size_t i = 0; i < nodeCount; i++) {
    this->offsets[i + 1] = this->offsets[i] + degree[i];
  }

  this->adjacency.assign(this->offsets[nodeCount], Adjacency{});

  // cursor walks each node's slice as we fill it
  std::vector<int> cursor(this->offsets.begin(), this->offsets.end() - 1);
  for (const PendingEdge &edge : this->pending) {
    this->adjacency[cursor[edge.from]++] = {edge.to, edge.lengthM, edge.classId};
    this->adjacency[cursor[edge.to]++] = {edge.from, edge.lengthM, edge.classId};
  }

  this->pending.clear();
  this->pending.shrink_to_fit();
  this->built = true;
}

std::span<const Adjacency> Graph::neighbors(int index) const {
  const int start = this->offsets[index];
  const int stop = this->offsets[index + 1];
  return std::span<const Adjacency>(this->adjacency.data() + start,
                                    static_cast<size_t>(stop - start));
}

int Graph::indexOf(long long id) const {
  auto found = this->lookup.find(id);
  return found == this->lookup.end() ? -1 : found->second;
}

}  // namespace campus
