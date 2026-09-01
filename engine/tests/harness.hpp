#pragma once

// A very small test runner. We only need registration, a couple of
// assertions and a count at the end.

#include <cmath>
#include <functional>
#include <iostream>
#include <string>
#include <vector>

namespace harness {

struct Test {
  std::string name;
  std::function<void()> body;
};

inline std::vector<Test> &registry() {
  static std::vector<Test> tests;
  return tests;
}

inline int &failureCount() {
  static int count = 0;
  return count;
}

inline std::string &currentTest() {
  static std::string name;
  return name;
}

struct Registrar {
  Registrar(const std::string &name, std::function<void()> body) {
    registry().push_back({name, std::move(body)});
  }
};

inline void report(const std::string &what, const char *file, int line) {
  failureCount()++;
  std::cout << "  FAIL " << currentTest() << "\n"
            << "       " << what << "\n"
            << "       " << file << ":" << line << "\n";
}

inline int runAll() {
  int passed = 0;
  for (const Test &test : registry()) {
    currentTest() = test.name;
    const int before = failureCount();
    test.body();
    if (failureCount() == before) {
      passed++;
    }
  }

  std::cout << passed << " passed";
  if (failureCount() > 0) {
    std::cout << ", " << failureCount() << " failed";
  }
  std::cout << ", out of " << registry().size() << " tests\n";
  return failureCount() == 0 ? 0 : 1;
}

}  // namespace harness

#define TEST(name)                                                       \
  static void name();                                                    \
  static harness::Registrar harnessRegistrar_##name(#name, name);        \
  static void name()

#define CHECK(condition)                                                 \
  do {                                                                   \
    if (!(condition)) {                                                  \
      harness::report("expected " #condition, __FILE__, __LINE__);       \
    }                                                                    \
  } while (false)

#define CHECK_NEAR(actual, expected, tolerance)                          \
  do {                                                                   \
    const double lhs = (actual);                                         \
    const double rhs = (expected);                                       \
    if (std::fabs(lhs - rhs) > (tolerance)) {                            \
      harness::report(std::string(#actual) + " was " +                   \
                          std::to_string(lhs) + ", expected " +          \
                          std::to_string(rhs),                           \
                      __FILE__, __LINE__);                               \
    }                                                                    \
  } while (false)
