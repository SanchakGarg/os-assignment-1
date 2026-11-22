#!/bin/sh
# Final-project input and mode checks (run from the project root):
#   - every file in tests/a3/invalid/ is rejected with exit code 2 and a message
#   - every sample and edge input runs in normal mode (exit 0)
#   - the unsafe demo stops the circular-wait inputs with exit code 5, in bounded time
CLI=${1:-./restaurant}
TMP=$(mktemp -d) || exit 1
trap 'rm -rf "$TMP"' EXIT
pass=0
fail=0

ok()  { pass=$((pass + 1)); printf '  ok  %-36s %s\n' "$1" "$2"; }
bad() { fail=$((fail + 1)); printf '  FAIL %-35s %s\n' "$1" "$2"; }

for f in tests/a3/invalid/*.txt; do
    "$CLI" "$f" FCFS FIRST_FIT "$TMP/out.csv" 2> "$TMP/err"
    code=$?
    msg=$(head -n 1 "$TMP/err")
    if [ "$code" -eq 2 ] && [ -n "$msg" ] && [ ! -e "$TMP/out.csv" ]; then ok "$(basename "$f")" "$msg"
    else bad "$(basename "$f")" "exit $code: $msg"; fi
done

for f in tests/a3/*.txt tests/a3/edge/*.txt; do
    "$CLI" "$f" FCFS FIRST_FIT "$TMP/out.csv" 2> "$TMP/err"
    code=$?
    if [ "$code" -eq 0 ]; then ok "$(basename "$f")" "normal mode completes"
    else bad "$(basename "$f")" "exit $code: $(head -n 1 "$TMP/err")"; fi
done

for f in tests/a3/deadlock_unsafe.txt tests/a3/edge/08_circular_wait_unsafe_demo.txt; do
    "$CLI" "$f" FCFS FIRST_FIT "$TMP/out.csv" --unsafe-demo 2> "$TMP/err"
    code=$?
    if [ "$code" -eq 5 ] && grep -q "wait-for cycle" "$TMP/err"; then
        ok "$(basename "$f") --unsafe-demo" "deadlock detected and stopped"
    else bad "$(basename "$f") --unsafe-demo" "exit $code: $(head -n 1 "$TMP/err")"; fi
done

echo "test_inputs (a3): passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
