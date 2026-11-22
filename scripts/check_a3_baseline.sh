#!/bin/sh
# Final-project requirement: "Preserve the A2 baseline exactly when no
# shared-resource actions are present."
#
# For every resource-free input and all 9 scheduler x allocator combinations,
# runs the program in A2 and A3 mode and checks that the A3 result is the A2
# result plus:
#   - RESOURCE_WAIT = 0 appended to every PROCESS row
#   - no RESOURCE rows
#   - CHECK,EXCLUSIVITY_VIOLATIONS,0 / CHECK,UNRESOLVED_DEADLOCKS,0 /
#     CHECK,COMPLETED_COUNT,N  (in that order, at the end)
#
# Usage (from the project root): sh scripts/check_a3_baseline.sh [CLI] [INPUT...]
# Default inputs: tests/a3/baseline_*.txt, tests/a3/allocator_difference.txt,
#                 tests/a2/comparison_a2.txt and tests/a2/inputs/valid/*.txt

CLI=${1:-./restaurant}
[ $# -gt 0 ] && shift
if [ $# -eq 0 ]; then
    set -- tests/a3/baseline_*.txt tests/a3/allocator_difference.txt \
           tests/a2/comparison_a2.txt tests/a2/inputs/valid/*.txt
fi
if [ ! -x "$CLI" ]; then echo "CLI not found or not executable: $CLI" >&2; exit 1; fi

TMP=$(mktemp -d) || exit 1
trap 'rm -rf "$TMP"' EXIT
pass=0
fail=0

for input in "$@"; do
    n=$(sed -n '1{s/[[:space:]]//g;p;}' "$input")
    for sched in FCFS PRIORITY SJF; do
        for alloc in FIRST_FIT BEST_FIT WORST_FIT; do
            name="$(basename "$input") $sched $alloc"
            a2="$TMP/a2.csv"; a3="$TMP/a3.csv"; expected="$TMP/expected.csv"
            rm -f "$a2" "$a3"

            # A2 mode only accepts files without resource sections; an input
            # with explicit "0 / 0" sections is compared against its A2 twin.
            a2_input="$input"
            if [ "$(basename "$input")" = baseline_explicit_zero.txt ]; then
                a2_input="$TMP/a2_twin.txt"
                head -n $((n + 2)) "$input" > "$a2_input"
            fi

            if ! "$CLI" "$a2_input" "$sched" "$alloc" "$a2" --phase a2 2> "$TMP/err" ||
               ! "$CLI" "$input" "$sched" "$alloc" "$a3" --phase a3 2>> "$TMP/err"; then
                echo "FAIL $name: run failed: $(head -n 1 "$TMP/err")"
                fail=$((fail + 1))
                continue
            fi

            # Build the expected A3 file from the A2 file.
            awk -F, -v n="$n" '
                $1 == "PROCESS" { print $0 ",0"; next }
                { print }
                END {
                    print "CHECK,EXCLUSIVITY_VIOLATIONS,0"
                    print "CHECK,UNRESOLVED_DEADLOCKS,0"
                    print "CHECK,COMPLETED_COUNT," n
                }' "$a2" > "$expected"

            if cmp -s "$expected" "$a3"; then
                pass=$((pass + 1))
            else
                echo "FAIL $name: A3 output differs from A2 baseline"
                diff "$expected" "$a3" | head -n 10 | sed 's/^/    /'
                fail=$((fail + 1))
            fi
        done
    done
done

echo "check_a3_baseline: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
