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
| `tests/edge/` | Edge-case inputs, expected rows and `check_rows.sh` |
| `tests/comparison.txt` | 10-order workload used for the [algorithm comparison](#algorithm-comparison) |
| `tests/gantt_chart_test.sh` | Checks the Gantt chart generator |

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
