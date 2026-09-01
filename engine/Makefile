# plain makefile on purpose. cmake is not installed on this machine.

CXX      ?= g++
CXXFLAGS ?= -std=c++20 -O2 -Wall -Wextra -Wpedantic
BUILD    := build
BIN      := $(BUILD)/campus_engine
SRC      := $(wildcard src/*.cpp)

# windows needs winsock and a .exe suffix
ifeq ($(OS),Windows_NT)
	BIN  := $(BUILD)/campus_engine.exe
	LIBS := -lws2_32
else
	LIBS :=
endif

.PHONY: all clean run

all: $(BIN)

$(BIN): $(SRC) | $(BUILD)
	$(CXX) $(CXXFLAGS) $(SRC) -o $@ $(LIBS)

$(BUILD):
	mkdir $(BUILD)

run: $(BIN)
	./$(BIN)

clean:
	rm -rf $(BUILD)
