#pragma once

#include <string>

#include "campus/graph.hpp"

namespace campus {

// false means it did not load, and error says why
bool loadGraph(const std::string &path, Graph &graph, std::string &error);

}  // namespace campus
