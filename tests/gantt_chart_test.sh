#!/bin/sh
set -eu

make >/dev/null
./gantt_chart tests/edge >/tmp/gantt_chart_test.out

grep -q "Gantt" /tmp/gantt_chart_test.out

grep -q "Time" /tmp/gantt_chart_test.out

# A leading idle period must remain visible: leading_idle's first jobs start at 10.
awk '
    /leading_idle.txt :: FCFS/ { in_chart = 1 }
    /leading_idle.txt :: PRIORITY/ { exit }
    in_chart && /Time: 0 -> 17/ { has_zero_origin = 1 }
    in_chart && /O2.*\| 10-13/ { has_expected_bar = 1 }
    END { exit !(has_zero_origin && has_expected_bar) }
' /tmp/gantt_chart_test.out

# Redirected output is plain text; terminal-only colour escapes must not leak.
if grep -q "$(printf '\033')" /tmp/gantt_chart_test.out; then
    echo "unexpected ANSI escape sequence in redirected chart output" >&2
    exit 1
fi

echo "Gantt chart generator PASS"
