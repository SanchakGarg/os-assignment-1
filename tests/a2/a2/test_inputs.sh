#!/bin/sh
# Every file in tests/a2/inputs/valid must be accepted and every file in
# tests/a2/inputs/invalid must be rejected with an error message (exit code 2).
# Run from the project root: sh tests/test_inputs.sh  (or: make test-a2)

CHECK=./check_input
failures=0

for f in tests/a2/inputs/valid/*.txt; do
    if ! "$CHECK" "$f" > /dev/null 2>&1; then
        echo "FAIL: valid input rejected: $f"
        "$CHECK" "$f"
        failures=$((failures + 1))
    fi
done

for f in tests/a2/inputs/invalid/*.txt; do
    message=$("$CHECK" "$f" 2>&1 > /dev/null)
    code=$?
    if [ "$code" -ne 2 ] || [ -z "$message" ]; then
        echo "FAIL: invalid input not rejected clearly: $f (exit $code)"
        failures=$((failures + 1))
    else
        printf '  ok  %-45s %s\n' "$(basename "$f")" "$message"
    fi
done

if [ "$failures" -eq 0 ]; then
    echo "test_inputs: all tests passed"
    exit 0
fi
exit 1
