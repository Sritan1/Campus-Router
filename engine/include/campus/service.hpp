#pragma once

#include <string>

#include "campus/graph.hpp"

namespace campus {

/// @brief What the service decided to send back.
struct Reply {
  int status = 200;
  std::string body;
};

/// @brief Turns a request into a reply.
///
/// Deliberately knows nothing about sockets. Everything the service does
/// is a string in and a string out, so it can be tested without opening
/// a port.
class Service {
 public:
  explicit Service(const Graph &graph) : graph(graph) {}

  /// @brief Handle one request.
  /// @param method http method, for example GET
  /// @param path the path part of the url
  /// @param body request body, empty for a GET
  Reply handle(const std::string &method, const std::string &path,
               const std::string &body) const;

 private:
  const Graph &graph;

  Reply health() const;
  Reply meta() const;
  Reply route(const std::string &body) const;
};

/// @brief Build an error body in the same shape as every other reply.
std::string errorBody(const std::string &message);

/// @brief Which entries to keep when a trace is too long to send whole.
///
/// Returns positions into the original, spread evenly, so a thinned
/// trace still covers the entire search rather than just the start.
/// Returns everything when the trace already fits.
std::vector<size_t> thinIndices(size_t total, size_t limit);

}  // namespace campus
