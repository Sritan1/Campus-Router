#pragma once

#include <string>

#include "campus/graph.hpp"

namespace campus {

struct Reply {
  int status = 200;
  std::string body;
};

// knows nothing about sockets, so it can be tested without opening a port
class Service {
 public:
  explicit Service(const Graph &graph) : graph(graph) {}

  Reply handle(const std::string &method, const std::string &path,
               const std::string &body) const;

 private:
  const Graph &graph;

  Reply health() const;
  Reply meta() const;
  Reply route(const std::string &body) const;
  Reply isochrone(const std::string &body) const;
};

std::string errorBody(const std::string &message);

// evenly spaced positions to keep, or all of them when the trace fits
std::vector<size_t> thinIndices(size_t total, size_t limit);

}  // namespace campus
