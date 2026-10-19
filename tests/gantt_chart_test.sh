#!/bin/sh
set -eu

make >/dev/null
./gantt_chart tests/edge >/tmp/gantt_chart_test.out

grep -q "Gantt" /tmp/gantt_chart_test.out

grep -q "Time" /tmp/gantt_chart_test.out

# A leading idle period must remain visible: leading_idle's first jobs start at 10.
awk '
    /=== .*leading_idle.txt ===/ { in_block = 1 }
    in_block && /Time: 0 -> 17/ { has_zero_origin = 1 }
    in_block && /^\[FCFS\]/ { in_fcfs = 1; next }
    in_block && /^\[PRIORITY\]/ { exit }
    in_fcfs && /O2.*\| 10-13/ { has_expected_bar = 1 }
    END { exit !(has_zero_origin && has_expected_bar) }
' /tmp/gantt_chart_test.out

# Redirected output is plain text; terminal-only colour escapes must not leak.
if grep -q "$(printf '\033')" /tmp/gantt_chart_test.out; then
    echo "unexpected ANSI escape sequence in redirected chart output" >&2
    exit 1
fi

# All three algorithms for one input share a single block.
for algo in FCFS PRIORITY SJF; do
    awk -v algo="[$algo]" '
        /=== .*leading_idle.txt ===/ { in_block = 1; next }
        in_block && /^===/ { exit }
        in_block && $0 == algo { found = 1 }
        END { exit !found }
    ' /tmp/gantt_chart_test.out
done

echo "Gantt chart generator PASS"
