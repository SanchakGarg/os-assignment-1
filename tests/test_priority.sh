#!/bin/sh
# Compares PRIORITY output on tests/sample.txt with hand-computed tests/priority.expected
make -s || exit 1
./restaurant tests/sample.txt PRIORITY | diff - tests/priority.expected && echo "PASS" || { echo "FAIL"; exit 1; }
