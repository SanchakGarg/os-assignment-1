CC = gcc
CFLAGS = -Wall -Wextra -O2 -Isrc
LDLIBS = -lm

# The simulator: scheduling, memory, metrics, input and output
CORE = src/sim.c src/sched.c src/memory.c src/metrics.c src/input.c \
       src/input_parser.c src/cli_args.c src/csv_writer.c src/gantt.c
HEADERS = $(wildcard src/*.h)
CXX = c++
CXXFLAGS = -Wall -Wextra -O2 -std=c++17 -pthread -Isrc
SERVER_SRC = $(wildcard server/*.cpp)
CORE_OBJ = $(patsubst src/%.c,build/%.o,$(CORE))
UNIT_TESTS = tests/bin/test_memory tests/bin/test_parser tests/bin/test_csv tests/bin/test_cli

all: restaurant gantt_chart check_input

restaurant: src/main.c $(CORE) $(HEADERS)
	$(CC) $(CFLAGS) -o $@ src/main.c $(CORE) $(LDLIBS)

gantt_chart: tools/gantt_chart.c src/gantt.c src/gantt.h
	$(CC) $(CFLAGS) -o $@ tools/gantt_chart.c src/gantt.c

check_input: tools/check_input.c src/input_parser.c $(HEADERS)
	$(CC) $(CFLAGS) -o $@ tools/check_input.c src/input_parser.c

# WebSocket backend for the web simulator (see docs/server.md)
server: restaurant_server

restaurant_server: $(SERVER_SRC) $(wildcard server/*.hpp) $(CORE_OBJ)
	$(CXX) $(CXXFLAGS) -o $@ $(SERVER_SRC) $(CORE_OBJ) $(LDLIBS)

build/%.o: src/%.c $(HEADERS)
	@mkdir -p build
	$(CC) $(CFLAGS) -c -o $@ $<

tests/bin/test_%: tests/a2/test_%.c $(CORE) $(HEADERS)
	@mkdir -p tests/bin
	$(CC) $(CFLAGS) -o $@ $< $(CORE) $(LDLIBS)

test: test-a1 test-a2

test-a1: restaurant gantt_chart
	sh tests/a1/edge/check_rows.sh
	sh tests/a1/gantt_chart_test.sh

test-a2: check_input $(UNIT_TESTS)
	@for t in $(UNIT_TESTS); do ./$$t || exit 1; done
	sh tests/a2/test_inputs.sh

clean:
	rm -rf restaurant gantt_chart check_input restaurant_server build tests/bin

.PHONY: all server test test-a1 test-a2 clean
