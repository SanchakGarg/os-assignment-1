#!/bin/sh
# Runs the final-project sample inputs in normal (safe) A3 mode and checks the
# safety and consistency rules from the final spec on each result file.
#
# Checked for every sample, scheduler and allocator:
#   - the run finishes (no hang) and writes a result
#   - every PROCESS row has 14 fields
#   - WAITING = MEM_WAIT + READY_WAIT + RESOURCE_WAIT  (final spec, section 7)
#   - TURNAROUND = COMPLETION - ARRIVAL, WAITING = TURNAROUND - SERVICE
#   - one RESOURCE row per declared resource, sorted by ID
#   - CHECK rows: EXCLUSIVITY_VIOLATIONS=0, UNRESOLVED_DEADLOCKS=0, COMPLETED_COUNT=N
#   - SUMMARY,COMPLETED_COUNT = N
# Sample-specific:
#   - independent_ovens.txt: every RESOURCE_WAIT is 0 (different ovens never wait)
#   - contention_same_oven.txt: OVEN_1 has at least 1 wait event
#
# Usage (from the project root): sh scripts/check_a3_samples.sh [CLI] [TIMEOUT_SECONDS]
# The unsafe deadlock demo mode is Abhinav's and is run separately; here
# deadlock_unsafe.txt runs in normal mode, where the prevention policy must
# let it finish (or report a clearly unsatisfiable request).

CLI=${1:-./restaurant}
LIMIT=${2:-20}
SAMPLES="tests/a3/baseline_no_resources.txt tests/a3/baseline_explicit_zero.txt
tests/a3/allocator_difference.txt tests/a3/contention_same_oven.txt
tests/a3/independent_ovens.txt tests/a3/deadlock_safe_order.txt
tests/a3/deadlock_unsafe.txt tests/a3/integrated.txt"

if [ ! -x "$CLI" ]; then echo "CLI not found or not executable: $CLI" >&2; exit 1; fi
TIMEOUT=""
if command -v timeout > /dev/null 2>&1; then TIMEOUT="timeout $LIMIT"
elif command -v gtimeout > /dev/null 2>&1; then TIMEOUT="gtimeout $LIMIT"   # macOS + coreutils
else echo "note: no timeout command found; a hang will not be caught automatically" >&2
fi

TMP=$(mktemp -d) || exit 1
trap 'rm -rf "$TMP"' EXIT
pass=0
fail=0

for input in $SAMPLES; do
    base=$(basename "$input")
    n=$(sed -n '1{s/[[:space:]]//g;p;}' "$input")
    # Declared resource IDs, sorted (empty if the sections are omitted).
    awk -v n="$n" 'NR == n + 3 { r = $1 + 0; next }
                   NR > n + 3 && NR <= n + 3 + r { split($0, f, ","); print f[1] }' \
        "$input" | sort > "$TMP/declared"

    for sched in FCFS PRIORITY SJF; do
        for alloc in FIRST_FIT BEST_FIT WORST_FIT; do
            out="$TMP/out.csv"
            rm -f "$out"
            # shellcheck disable=SC2086
            $TIMEOUT "$CLI" "$input" "$sched" "$alloc" "$out" --phase a3 2> "$TMP/err"
            code=$?
            if [ "$code" -eq 124 ]; then
                echo "FAIL $base $sched $alloc: did not finish within ${LIMIT}s (hang?)"
                fail=$((fail + 1)); continue
            fi
            if [ "$code" -ne 0 ] || [ ! -s "$out" ]; then
                echo "FAIL $base $sched $alloc: exit $code: $(head -n 1 "$TMP/err")"
                fail=$((fail + 1)); continue
            fi

            awk -F, '$1 == "RESOURCE" { print $2 }' "$out" > "$TMP/emitted"
            problems=$(awk -F, -v n="$n" -v base="$base" '
                $1 == "PROCESS" {
                    rows++
                    if (NF != 14) { print "PROCESS row has " NF " fields: " $0; next }
                    if ($8 != $12 + $13 + $14) print $2 ": WAITING != MEM_WAIT+READY_WAIT+RESOURCE_WAIT"
                    if ($9 != $7 - $3)         print $2 ": TURNAROUND != COMPLETION-ARRIVAL"
                    if ($8 != $9 - $5)         print $2 ": WAITING != TURNAROUND-SERVICE"
                    if (base == "independent_ovens.txt" && $14 != 0)
                        print $2 ": RESOURCE_WAIT should be 0 with separate ovens"
                }
                $1 == "SUMMARY" && $2 == "COMPLETED_COUNT" && $3 != n { print "SUMMARY COMPLETED_COUNT=" $3 ", expected " n }
                $1 == "RESOURCE" && base == "contention_same_oven.txt" && $2 == "OVEN_1" && $6 < 1 {
                    print "OVEN_1 should have at least 1 wait event" }
                $1 == "CHECK" { check[++c] = $2 "=" $3 }
                END {
                    if (rows != n) print "expected " n " PROCESS rows, found " rows
                    if (check[1] != "EXCLUSIVITY_VIOLATIONS=0") print "bad CHECK row 1: " check[1]
                    if (check[2] != "UNRESOLVED_DEADLOCKS=0")   print "bad CHECK row 2: " check[2]
                    if (check[3] != "COMPLETED_COUNT=" n)       print "bad CHECK row 3: " check[3]
                }' "$out")
            if ! cmp -s "$TMP/declared" "$TMP/emitted"; then
                problems="$problems
RESOURCE rows ($(tr '\n' ' ' < "$TMP/emitted")) != declared resources in sorted order ($(tr '\n' ' ' < "$TMP/declared"))"
            fi

            if [ -n "$problems" ]; then
                echo "FAIL $base $sched $alloc:"
                echo "$problems" | sed '/^$/d; s/^/    /'
                fail=$((fail + 1))
            else
                pass=$((pass + 1))
            fi
        done
    done
done

echo "check_a3_samples: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
