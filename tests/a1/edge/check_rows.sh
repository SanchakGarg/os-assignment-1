#!/bin/sh
# Compares the process rows printed by ./restaurant with expected/<input>.<ALGO>.rows.
# Ignores a header line, the SUMMARY section, and Windows line endings.
# Run from the project root:  sh tests/edge/check_rows.sh
dir=$(dirname "$0")
pass=0; fail=0
for f in "$dir"/*.txt; do
    name=$(basename "$f" .txt)
    for algo in FCFS PRIORITY SJF; do
        exp="$dir/expected/$name.$algo.rows"
        want=$(tr -d '\r' < "$exp")
        got=$(./restaurant "$f" "$algo" | tr -d '\r' | sed '/^PROCESS_ID/d;/^SUMMARY/,$d')
        if [ "$got" = "$want" ]; then
            pass=$((pass+1))
        else
            fail=$((fail+1)); echo "FAIL: $name $algo"
        fi
    done
done
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]