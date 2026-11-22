#!/bin/sh
# Runs every Restaurant scheduler x allocator combination (3 x 3 = 9) on one
# input and prints a Markdown table for the README.
#
# Usage (from the project root, after building restaurant):
#   sh scripts/run_comparison.sh [INPUT_FILE] [CLI_PATH] [OUT_DIR]
# Defaults: tests/a2/comparison_a2.txt ./restaurant results/comparison
#
# Each run's CSV is kept in OUT_DIR (e.g. results/comparison/FCFS_FIRST_FIT.csv)
# so the table can be checked against the raw output.

INPUT=${1:-tests/a2/comparison_a2.txt}
CLI=${2:-./restaurant}
OUT_DIR=${3:-results/comparison}

if [ ! -f "$INPUT" ]; then echo "Input not found: $INPUT" >&2; exit 1; fi
if [ ! -x "$CLI" ];   then echo "CLI not found or not executable: $CLI (run make first)" >&2; exit 1; fi
mkdir -p "$OUT_DIR" || exit 1

echo "Input: \`$INPUT\`"
echo
echo "| Scheduler | Allocator | Avg wait | Avg turnaround | Avg response | Avg mem wait | Blocked for memory | SPACE peak / util % / max frag | TABLE peak / util % / max frag | Completion order |"
echo "|---|---|---|---|---|---|---|---|---|---|"

status=0
for sched in FCFS PRIORITY SJF; do
    for alloc in FIRST_FIT BEST_FIT WORST_FIT; do
        csv="$OUT_DIR/${sched}_${alloc}.csv"
        if ! "$CLI" "$INPUT" "$sched" "$alloc" "$csv" --phase a2 2> "$OUT_DIR/${sched}_${alloc}.err"; then
            echo "| $sched | $alloc | run failed: $(head -n 1 "$OUT_DIR/${sched}_${alloc}.err") |||||||| "
            status=1
            continue
        fi
        awk -F, -v sched="$sched" -v alloc="$alloc" '
            function r(x) { return sprintf("%.3f", x) + 0 }
            $1 == "PROCESS" { n++; id[n] = $2; done[n] = $7 }
            $1 == "SUMMARY" { s[$2] = $3 }
            $1 == "POOL"    { pool[$2] = $4 " / " r($5) " / " $6 }
            END {
                # completion order: by completion time, ties by ID (insertion sort)
                for (i = 2; i <= n; i++)
                    for (j = i; j > 1 && (done[j] < done[j-1] || (done[j] == done[j-1] && id[j] < id[j-1])); j--) {
                        t = done[j]; done[j] = done[j-1]; done[j-1] = t
                        t = id[j];   id[j] = id[j-1];     id[j-1] = t
                    }
                order = ""
                for (i = 1; i <= n; i++) order = order (i > 1 ? " → " : "") id[i]
                printf "| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n", sched, alloc,
                    r(s["AVERAGE_WAITING"]), r(s["AVERAGE_TURNAROUND"]), r(s["AVERAGE_RESPONSE"]),
                    r(s["AVERAGE_MEMORY_WAIT"]), s["BLOCKED_FOR_MEMORY_COUNT"],
                    pool["SPACE"], pool["TABLE"], order
            }' "$csv"
    done
done
exit $status
