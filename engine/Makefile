# plain makefile on purpose, so nothing beyond make and a compiler is needed

CXX      ?= g++
CXXFLAGS ?= -std=c++20 -O2 -Wall -Wextra -Wpedantic -Iinclude
BUILD    := build

# everything the three binaries share
CORE := src/graph.cpp src/algorithms.cpp src/loader.cpp src/json.cpp src/service.cpp

SERVER_SRC := src/main.cpp $(CORE)
CLI_SRC    := cli/route_cli.cpp $(CORE)
TEST_SRC   := $(wildcard tests/*.cpp) $(CORE)

SUFFIX :=
LIBS   :=
ifeq ($(OS),Windows_NT)
	SUFFIX := .exe
	LIBS   := -lws2_32
endif

SERVER := $(BUILD)/campus_engine$(SUFFIX)
CLI    := $(BUILD)/route_cli$(SUFFIX)
TESTS  := $(BUILD)/campus_tests$(SUFFIX)

.PHONY: all cli test run clean

all: $(SERVER)

cli: $(CLI)

$(SERVER): $(SERVER_SRC) | $(BUILD)
	$(CXX) $(CXXFLAGS) $(SERVER_SRC) -o $@ $(LIBS)

$(CLI): $(CLI_SRC) | $(BUILD)
	$(CXX) $(CXXFLAGS) $(CLI_SRC) -o $@

$(TESTS): $(TEST_SRC) | $(BUILD)
	$(CXX) $(CXXFLAGS) -Itests $(TEST_SRC) -o $@

test: $(TESTS)
	./$(TESTS)

$(BUILD):
	mkdir $(BUILD)

run: $(SERVER)
	./$(SERVER)

clean:
	rm -rf $(BUILD)
