#pragma once

#include <string>

#include "campus/graph.hpp"

namespace campus {

/// @brief Read a graph in the campus-graph format.
/// @param path file written by the data pipeline
/// @param graph filled in, by reference
/// @param error set to what went wrong when this returns false
/// @return true when the graph loaded and is ready to search
bool loadGraph(const std::string &path, Graph &graph, std::string &error);

}  // namespace campus
