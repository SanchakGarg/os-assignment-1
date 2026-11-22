# Smart Restaurant – Process Management (A1)

Orders are processes, 2 chefs are the service units. Algorithms: FCFS, PRIORITY (non-preemptive), SJF.

## Structure

| File | Purpose |
|---|---|
| `restaurant.h` | `Process` struct, shared prototypes |
| `main.c` | CLI, picks algorithm |
| `input.c` | Input parser |
| `sim.c` | Event-driven simulation, 2 chefs |
| `sched.c` | **Algorithm placeholders (`pick_fcfs`, `pick_priority`, `pick_sjf`) – write code here** |
| `metrics.c` | Metrics and output |
| `gantt.c`, `gantt.h` | Text Gantt chart rendering, shared by `restaurant` and `gantt_chart` |
| `gantt_chart.c` | Gantt chart generator comparing all three algorithms |
| `input_parser.c`, `input_parser.h` | A2 seven-field input parser with validation |
| `cli_args.c`, `cli_args.h` | A2 command-line arguments (scheduler, allocator, phase, trace) |
| `first_fit.c`, `first_fit.h` | First Fit contiguous allocation |
| `csv_writer.c`, `csv_writer.h` | Standardized A2 result file (and the final-project format) |
| `shared_types.h` | Shared A2 data types: workload, configuration, results *(provisional)* |
| `a2_simulator.h` | A2 simulation entry point `simulate_a2()` *(provisional)* |
| `a2_sim_stub.c` | **Temporary** placeholder until the A2 simulator is merged |
| `check_input.c` | Validates an A2 input file without running the simulator |
| `tests/edge/` | Edge-case inputs, expected rows and `check_rows.sh` |
| `tests/comparison.txt` | 10-order workload used for the [algorithm comparison](#algorithm-comparison) |
| `tests/gantt_chart_test.sh` | Checks the Gantt chart generator |
| `tests/a2/` | A2 unit tests, valid/invalid inputs, `comparison_a2.txt`, `allocator_difference.txt` |
| `scripts/run_comparison.sh` | Runs all 9 scheduler × allocator combinations and prints a table |
| `docs/input-output.md` | Detailed A2 input/output notes |
| `HANDOFF.md` | Integration notes for the team |
## Compile

```
make
make clean
```

## Run

```
./restaurant INPUT_FILE ALGORITHM
```

`ALGORITHM` is one of `FCFS`, `PRIORITY`, `SJF`.

```
./restaurant tests/edge/all_same_time.txt FCFS
./restaurant tests/edge/all_same_time.txt PRIORITY
./restaurant tests/edge/all_same_time.txt SJF
sh tests/edge/check_rows.sh     # every edge case, every algorithm, vs expected rows
sh tests/gantt_chart_test.sh    # Gantt chart generator checks
./gantt_chart tests/edge        # text Gantt charts, one block per input (all algorithms)
./gantt_chart tests/edge/starvation.txt  # Gantt chart for a single input file
```

### A2 (memory management)
 
```
./restaurant INPUT_FILE SCHEDULER ALLOCATOR OUTPUT_FILE [--phase a2|a3] [--trace FILE]
./restaurant tests/a2/comparison_a2.txt FCFS FIRST_FIT result.csv
```
 
| Argument | Values |
|---|---|
| `SCHEDULER` | `FCFS`, `PRIORITY`, `SJF` (not case-sensitive) |
| `ALLOCATOR` | `FIRST_FIT`, `BEST_FIT`, `WORST_FIT` (not case-sensitive) |
| `--phase` | Optional; `a2` by default |
| `--trace FILE` | Optional JSON recording for the browser viewer *(not available yet)* |
 
Exit codes: `0` success, `1` bad arguments, `2` invalid input, `3` simulation failed, `4` result file could not be written. Errors go to the terminal, never into the result file.
 

 
## A2 input format
 
```
N
Q
ID,ARRIVAL,PRIORITY,SERVICE,CATEGORY,SPACE_REQ,TABLE_REQ
... exactly N rows ...
```
 
Example:
 
```
4
2
O1,0,2,8,NORMAL,2,1
O2,1,1,4,VIP,1,1
O3,2,2,5,NORMAL,3,0
O4,3,1,6,VIP,2,2
```
 
`input_parser.c` checks every rule in the A2 specification. At the first problem it stops with a message and a line number, for example `Input error (line 4): SPACE_REQ must be between 1 and 6, got 9`.
 
- N and Q are positive integers. Q is read but unused, because the Restaurant schedulers have no Round Robin.
- There are exactly N rows, each with exactly 7 fields.
- IDs are unique, nonempty and contain no whitespace.
- ARRIVAL ≥ 0, and PRIORITY and SERVICE ≥ 1. All three must be whole numbers.
- CATEGORY is nonempty. It is a label only; priority comes from PRIORITY.
- 1 ≤ SPACE_REQ ≤ 6 and 0 ≤ TABLE_REQ ≤ 3, so no request can exceed a pool.
- Rows may appear in any order. Blank lines at the end and Windows line endings are accepted. Any other content after the N rows is an error.
`tests/a2/inputs/invalid/` holds 20 files, one for each kind of mistake. `tests/a2/inputs/valid/` holds 5 accepted files. To check a file without running the simulation:
 
```
./check_input tests/a2/comparison_a2.txt
```
 
## A2 output format
 
A comma-separated text file with no header row and no debug text:
 
1. `PROCESS,ID,ARRIVAL,PRIORITY,SERVICE,START,COMPLETION,WAITING,TURNAROUND,RESPONSE,MEM_ADMIT,MEM_WAIT,READY_WAIT`, one row per order, sorted by ID as text, so `O1, O10, O2`.
2. Eight `SUMMARY` rows, in this order: `AVERAGE_WAITING`, `AVERAGE_TURNAROUND`, `AVERAGE_RESPONSE`, `THROUGHPUT`, `SERVICE_UTILIZATION_PCT`, `AVERAGE_MEMORY_WAIT`, `COMPLETED_COUNT`, `BLOCKED_FOR_MEMORY_COUNT`.
3. `POOL,SPACE,6,PEAK_OCCUPIED,UTILIZATION_PCT,MAX_EXT_FRAG_SLOTS`, then `POOL,TABLE,3,...`.
Times and counts are integers. Decimal statistics are printed with up to 6 decimal places, within the required 10⁻³ accuracy. The file is written to `OUTPUT_FILE.tmp` and renamed only after a complete, successful run, so a failed run never leaves a result file that looks valid.
 
Expected result for a single order `O1,0,2,2,NORMAL,2,1`:
 
```
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
 
### A2 metrics
 
For arrival A, memory admission M, first start S, completion C and service B:
 
| Metric | Formula |
|---|---|
| Turnaround | C − A |
| Response | S − A |
| Waiting | C − A − B |
| Memory waiting | M − A |
| Ready waiting | Waiting − Memory waiting |
 
With E = last completion − first arrival: throughput = N / E, and chef utilization = Σ service / (2E) × 100. Pool utilization = occupied slot-time / (capacity × E) × 100. External fragmentation at a moment = free slots − largest contiguous free run; the reported value is the maximum over the run.
 
## Memory allocation
 
### First Fit
 
`first_fit(slots, capacity, size)` scans the pool from slot 0 upwards and returns the start of the **first** run of `size` adjacent free slots, or −1 if there is none. The same function serves both SPACE (capacity 6) and TABLE (capacity 3). It only searches and never changes the pool. Admission checks both pools first and allocates only if both requests fit.
 
- **Advantage:** the fastest of the three, because it stops at the first hole that fits.
- **Trade-off:** small leftover holes build up near the start of the pool and increase external fragmentation.
- **Ties:** none are possible, because the lowest address always wins.
Example: in the pool `[X _ X _ _ X]`, a request for 2 slots skips the 1-slot hole at slot 1 and returns slot 3.
 
### Best Fit and Worst Fit
 
*To be added with the A2 simulator.*
 
## A2 algorithm comparison
 
`tests/a2/comparison_a2.txt` is the A1 comparison workload (the same 10 orders as `tests/comparison.txt`) with SPACE and TABLE requests added, so the A2 results can be compared directly with the A1 table below. `tests/a2/allocator_difference.txt` is a small input where the allocator choice changes memory waiting.
 
```
sh scripts/run_comparison.sh tests/a2/comparison_a2.txt > results/comparison.md
```
 
The script runs all 9 combinations (3 schedulers × 3 allocators) and keeps each CSV in `results/comparison/`. It then prints a table of average waiting, turnaround, response and memory wait, the blocked-for-memory count, SPACE and TABLE peak/utilization/fragmentation, and completion order.
 
*Results table and discussion (First/Best/Worst Fit trade-offs, FIFO admission and head-of-line blocking, how memory changes the A1 results) to be added once the A2 simulator is merged.*
 
## Testing
 
```
make test-a2
```
 
| Test | Checks |
|---|---|
| `tests/a2/test_first_fit.c` | Empty and full pools, exact fit, size 1 and full capacity, holes, equal-sized holes, the TABLE pool |
| `tests/a2/test_parser.c` | Spec example values, parsing stops at the A3 resource section, trailing content, error line numbers |
| `tests/a2/test_csv.c` | Exact one-order output, lexicographic ID sorting, final-project format, no output for an incomplete run |
| `tests/a2/test_cli.c` | All scheduler/allocator names, options in any position, bad arguments, the A1 two-argument form |
| `tests/a2/test_inputs.sh` | Every valid input is accepted; every invalid input is rejected with a message |
#A1: Process Management
## Input format (parser)

```
N
Q
ID,ARRIVAL,PRIORITY,SERVICE,CATEGORY
```

Example:

```
5
2
O1,0,2,8,NORMAL
O2,1,1,4,VIP
```

`Q` (Round Robin quantum) is read but unused here. Smaller priority number = higher priority.

## Output

One row per process (sorted by ID), then `SUMMARY` with `AVERAGE_WAITING`, `AVERAGE_TURNAROUND`, `AVERAGE_RESPONSE`, `THROUGHPUT`, `UTILIZATION`.

This CSV is what `restaurant` writes whenever its output is piped or redirected
(for example `./restaurant tests/edge/all_same_time.txt FCFS > out.csv`). When run directly
in a terminal it shows the same numbers as formatted tables — a results table
and a summary box — followed by the Gantt chart.

## Scheduling algorithms

A `pick_*` function returns the index of the READY process to run next, or `-1` if none.

### FCFS scheduling behavior

This project implements FCFS as a non-preemptive queueing policy. Each time the
scheduler must choose the next job, `pick_fcfs` scans every process in the
`READY` state and selects the one with the earliest `arrival` time. If two
ready tasks arrive at the same time, it breaks the tie by choosing the
lexicographically smaller process ID. This makes the scheduler deterministic for
simultaneous arrivals while still preserving FCFS ordering for jobs that arrive
at different times.

### PRIORITY scheduling behavior

`pick_priority` works like a priority queue over the `READY` orders: every time a
chef becomes free, it scans all `READY` orders and hands that chef the one with
the highest priority (the **smallest** priority number). Ties are broken in this
order:

1. Smaller priority number (higher priority) wins.
2. If priorities are equal, the order that arrived earlier wins.
3. If arrival times are also equal, the lexicographically smaller process ID wins.

So VIP orders (priority 1) jump ahead of everything still waiting, and the
result is deterministic even when orders tie on priority and arrival.

The scheduler is **non-preemptive**: the simulator only calls the picker when a
chef is free, and once an order starts it runs for its full service time. A
higher-priority order that arrives while both chefs are busy waits for the next
free chef rather than interrupting an order that is already cooking. A
low-priority order can therefore wait a long time while higher-priority orders
keep arriving (possible starvation), because the scheduler uses no aging.

### SJF scheduling behavior

This project implements SJF (Shortest Job First) as a non-preemptive policy.
Each time a chef becomes free, `pick_sjf` scans every process in the `READY`
state and selects the one with the smallest `service` time, meaning the order
that takes the least time to prepare. Ties are broken deterministically:

1. shorter `service` time first
2. then earlier `arrival` time
3. then lexicographically smaller process ID (`strcmp`, so `O10` comes before `O2`)

A few notes on it's design:

- **Non-preemptive:** once a chef starts an order, it runs to completion. A
  shorter order that arrives mid-preparation waits for the next free chef.
- **Total service time, not remaining time:** the comparison uses `service`.
  Since orders are never interrupted, `service` and `remaining` are equal at
  every decision point, so the result is the same.
- **Priority is ignored:** SJF looks only at preparation time, so a VIP order
  with a long service time waits behind shorter normal orders.
- **Ready set only:** `pick_sjf` considers only `READY` processes. The simulator
  marks an order `READY` when it arrives, so the picker never sees future orders.

On the sample input:

| Algorithm | Avg waiting | Avg turnaround | Avg response |
|---|---|---|---|
| FCFS | 2.80 | 8.00 | 2.80 |
| PRIORITY | 3.00 | 8.20 | 3.00 |
| SJF | 2.40 | 7.60 | 2.40 |

Trade-off: long orders can be delayed for as long as shorter ones keep arriving
(starvation). In `tests/edge/starvation.txt`, order `O3` (service 20) waits 17
time units under SJF, compared with 2 under FCFS.

## Gantt chart visualizer

When `./restaurant` is run in a terminal, it prints a Gantt chart for the chosen
input file and algorithm after the `SUMMARY` block. When its output is piped or
redirected (e.g. `./restaurant tests/edge/all_same_time.txt FCFS > out.csv`), the chart is
left out so the output stays exactly the CSV report described under
[Output](#output). The chart is drawn only after the report has been written,
in a separate child process, and is printed only if it was generated completely.
If charting fails for any reason (even a crash), `restaurant` prints
`Error generating graph` to stderr instead, the results and `SUMMARY` are still
printed in full, and it still exits with status 0.

The repository also includes a terminal-based Gantt chart generator named
`gantt_chart`. Given a directory, it discovers every `.txt` test file in it;
given a single `.txt` file, it charts just that file. For each file it runs the
matching `./restaurant` simulations for FCFS, PRIORITY, and SJF, parses the
reported `START` and `COMPLETION` times, and draws one colored bar per process.
All three algorithms for an input file are printed together in one block that
shares a single time axis, so the schedules line up and can be compared at a
glance.

```bash
make
./gantt_chart tests/edge                 # every .txt in tests/edge/
./gantt_chart tests/edge/starvation.txt  # one input file
```

Each bar spans from the process start time to completion time, and the time axis
starts at 0 so idle gaps remain visible. The chart uses muted but distinct colors
in terminal output; when output is redirected to a file, ANSI color codes are not
emitted so the result stays readable and easy to compare.

## Algorithm comparison

`tests/comparison.txt` is a 10-order workload built to show how the three
algorithms differ: long and short jobs, three VIP orders (priority 1) arriving
while the chefs are busy, and steady arrivals over the first 8 time units.

```
10
2
O1,0,3,8,NORMAL
O2,0,2,4,NORMAL
O3,1,1,6,VIP
O4,2,3,2,NORMAL
O5,3,2,10,NORMAL
O6,4,1,3,VIP
O7,5,3,1,NORMAL
O8,6,2,5,NORMAL
O9,7,1,7,VIP
O10,8,3,3,NORMAL
```

Run it with:

```bash
./restaurant tests/comparison.txt FCFS
./restaurant tests/comparison.txt PRIORITY
./restaurant tests/comparison.txt SJF
./gantt_chart tests/comparison.txt
```

| Metric | FCFS | PRIORITY | SJF |
|---|---:|---:|---:|
| Average waiting | 6.20 | 8.00 | **4.20** |
| Average turnaround | 11.10 | 12.90 | **9.10** |
| Average response | 6.20 | 8.00 | **4.20** |
| Throughput (orders/time) | **0.3846** | **0.3846** | 0.3704 |
| Utilization (%) | **94.23** | **94.23** | 90.74 |
| All orders done at | **26** | **26** | 27 |
| Average waiting, VIP orders | 7.00 | **3.33** | 7.00 |
| Average waiting, other orders | 5.86 | 10.00 | **3.00** |
| Longest wait | **12** (O9, O10) | 19 (O4) | 14 (O5) |

The averages over VIP and other orders and the longest wait are computed from
the per-order `WAITING` column.

- **SJF** gives the lowest average waiting, turnaround and response time,
  because short orders (O4, O7, O10) are cleared first. The cost falls on long
  orders: O5 (service 10) starts last, and the run ends one time unit later
  (27) because the longest job runs at the end, which leaves one chef idle.
- **PRIORITY** serves VIP orders fastest (3.33 average wait, versus 7.00 under
  the other two) but has the worst overall averages. Low-priority orders pay for
  it: O4 waits 19 time units for a 2-unit job.
- **FCFS** sits between the two on average waiting and has the smallest
  longest wait (12), since no order can be passed over by later arrivals.

Gantt chart (all three algorithms on one time axis):

```
=== tests/comparison.txt ===
      Time: 0 -> 27
         0     2     5     8     10    13    16    18    21    24    27
         ------------------------------------------------------------
[FCFS]
O2       |████████                                                    | 0-4
O1       |█████████████████                                           | 0-8
O3       |        ██████████████                                      | 4-10
O4       |                 █████                                      | 8-10
O6       |                      ██████                                | 10-13
O5       |                      ██████████████████████                | 10-20
O7       |                            ███                             | 13-14
O8       |                               ███████████                  | 14-19
O9       |                                          ███████████████   | 19-26
O10      |                                            ███████         | 20-23
         ------------------------------------------------------------
[PRIORITY]
O2       |████████                                                    | 0-4
O1       |█████████████████                                           | 0-8
O3       |        ██████████████                                      | 4-10
O6       |                 ███████                                    | 8-11
O9       |                      ███████████████                       | 10-17
O5       |                        ██████████████████████              | 11-21
O8       |                                     ███████████            | 17-22
O4       |                                              █████         | 21-23
O7       |                                                ███         | 22-23
O10      |                                                   ██████   | 23-26
         ------------------------------------------------------------
[SJF]
O2       |████████                                                    | 0-4
O1       |█████████████████                                           | 0-8
O4       |        █████                                               | 4-6
O7       |             ██                                             | 6-7
O6       |               ███████                                      | 7-10
O10      |                 ███████                                    | 8-11
O8       |                      ███████████                           | 10-15
O3       |                        █████████████                       | 11-17
O9       |                                 ███████████████            | 15-22
O5       |                                     ███████████████████████| 17-27
```
