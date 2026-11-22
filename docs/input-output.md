# Input, output and running the simulator (A2)

*Owner: Anam. Paste these sections into the main README.*

## Building and running

```sh
make                 # builds restaurant, gantt_chart and check_input
make test-a2         # parser, First Fit, CSV writer and CLI tests + bad-input checks

./restaurant INPUT_FILE SCHEDULER ALLOCATOR OUTPUT_FILE [--phase a2|a3] [--trace FILE]   # A2
./restaurant tests/a2/comparison_a2.txt FCFS FIRST_FIT result.csv

./restaurant INPUT_FILE SCHEDULER     # A1 form, unchanged (5-field input, report on stdout)
./restaurant tests/comparison.txt SJF
```

The 2-argument A1 form is kept so that the A1 schedulers, `tests/edge/check_rows.sh` and `gantt_chart` work exactly as they did in A1. Its output was checked to be byte-for-byte identical to the A1 build on `tests/comparison.txt` for all three schedulers.

| Argument | Allowed values |
| --- | --- |
| `SCHEDULER` | `FCFS`, `PRIORITY`, `SJF` (not case-sensitive) |
| `ALLOCATOR` | `FIRST_FIT`, `BEST_FIT`, `WORST_FIT` (not case-sensitive) |
| `--phase` | Optional. `a2` (default in the A2 release) or `a3` |
| `--trace FILE` | Optional. Also writes the JSON recording for the browser viewer. If absent, no trace is written. |

Options can appear anywhere on the command line. Exit codes: `0` success, `1` bad arguments, `2` invalid input, `3` simulation failed, `4` output could not be written. Error messages go to the terminal, never into the result file.

## Input format (import)

```text
N
Q
ID,ARRIVAL,PRIORITY,SERVICE,CATEGORY,SPACE_REQ,TABLE_REQ
... exactly N rows ...
```

Example (spec section 8.2):

```text
4
2
O1,0,2,8,NORMAL,2,1
O2,1,1,4,VIP,1,1
O3,2,2,5,NORMAL,3,0
O4,3,1,6,VIP,2,2
```

The parser checks every rule in the spec and stops with a message and line number at the first problem:

- N and Q are positive integers. Q is read but unused, because Restaurant has no Round Robin.
- There are exactly N rows, each with exactly 7 fields.
- IDs are unique, nonempty and contain no whitespace.
- ARRIVAL ≥ 0, and PRIORITY and SERVICE ≥ 1. All three must be whole numbers.
- CATEGORY is not empty. It is only a label; priority comes from PRIORITY.
- 1 ≤ SPACE_REQ ≤ 6 and 0 ≤ TABLE_REQ ≤ 3, so no request is impossible.
- Rows may be in any order. Blank lines at the end and Windows line endings are accepted. In A2, any other content after the N rows is an error.

Example message: `Input error (line 4): SPACE_REQ must be between 1 and 6, got 9`.

`tests/a2/inputs/invalid/` contains one file for each kind of mistake. `sh tests/a2/test_inputs.sh` checks that each is rejected with a clear message and that every file in `tests/a2/inputs/valid/` is accepted.

## Result file (export)

The result is plain comma-separated text with no header row and no debug output:

1. `PROCESS,ID,ARRIVAL,PRIORITY,SERVICE,START,COMPLETION,WAITING,TURNAROUND,RESPONSE,MEM_ADMIT,MEM_WAIT,READY_WAIT`, one row per order, sorted by ID as text, so `O1, O10, O2`.
2. Eight `SUMMARY` rows, in this order: AVERAGE_WAITING, AVERAGE_TURNAROUND, AVERAGE_RESPONSE, THROUGHPUT, SERVICE_UTILIZATION_PCT, AVERAGE_MEMORY_WAIT, COMPLETED_COUNT, BLOCKED_FOR_MEMORY_COUNT.
3. `POOL,SPACE,6,PEAK_OCCUPIED,UTILIZATION_PCT,MAX_EXT_FRAG_SLOTS`, then the same for `TABLE,3`.

Times and counts are integers. Decimal values are printed with up to 6 decimal places, within the required 10⁻³ accuracy. The file is first written to `OUTPUT_FILE.tmp` and only renamed to `OUTPUT_FILE` after a complete, successful run. A failed run therefore never leaves behind a result file that looks valid.

Example: one order, `O1,0,2,2,NORMAL,2,1`, any scheduler and allocator.

```text
PROCESS,O1,0,2,2,0,2,0,2,0,0,0,0
SUMMARY,AVERAGE_WAITING,0
SUMMARY,AVERAGE_TURNAROUND,2
SUMMARY,AVERAGE_RESPONSE,0
SUMMARY,THROUGHPUT,0.5
SUMMARY,SERVICE_UTILIZATION_PCT,50
SUMMARY,AVERAGE_MEMORY_WAIT,0
SUMMARY,COMPLETED_COUNT,1
SUMMARY,BLOCKED_FOR_MEMORY_COUNT,0
POOL,SPACE,6,2,33.333333,0
POOL,TABLE,3,1,33.333333,0
```

## First Fit allocation

`first_fit(slots, capacity, size)` scans the pool from slot 0 upwards and returns the start of the **first** run of `size` adjacent free slots, or −1 if none exists. The same function serves SPACE (capacity 6) and TABLE (capacity 3). It only searches and never modifies the pool. The admission code checks both pools first and commits only if both fit, so an order never holds half of its request.

- **Advantage:** fastest of the three, because it stops at the first hole that fits.
- **Trade-off:** small leftover holes build up near the start of the pool, which raises external fragmentation over time.
- **Ties:** none possible, because the lowest address always wins.

Example with pool `[X _ X _ _ X]` and a request of 2: First Fit skips the 1-slot hole at 1 and returns 3.

## Comparing the 9 combinations

```sh
sh scripts/run_comparison.sh tests/a2/comparison_a2.txt > results/comparison.md
```

`tests/a2/comparison_a2.txt` is the A1 comparison workload (`tests/comparison.txt`, the same 10 orders) with SPACE_REQ and TABLE_REQ added. The README can therefore set the A2 numbers beside the A1 table and show how memory admission changes the schedule. The script runs FCFS, PRIORITY and SJF with FIRST_FIT, BEST_FIT and WORST_FIT. It keeps each CSV in `results/comparison/` and prints the README table: average waiting, turnaround, response and memory wait, blocked-for-memory count, SPACE and TABLE peak/utilization/fragmentation, and completion order.
