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
| `tests/` | Sample inputs, `run_all.sh`, and `edge/` (edge-case inputs, expected results, `check_rows.sh`) |

A `pick_*` function returns the index of the READY process to run next, or `-1` if none.

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
./restaurant tests/sample.txt FCFS
./restaurant tests/sample.txt PRIORITY
./restaurant tests/sample.txt SJF
./tests/run_all.sh        # every test input, every algorithm
./gantt_chart tests/edge  # text Gantt charts for each input and algorithm
```

### FCFS scheduling behavior

This project implements FCFS as a non-preemptive queueing policy. Each time the
scheduler must choose the next job, `pick_fcfs` scans every process in the
`READY` state and selects the one with the earliest `arrival` time. If two
ready tasks arrive at the same time, it breaks the tie by choosing the
lexicographically smaller process ID. This makes the scheduler deterministic for
simultaneous arrivals while still preserving FCFS ordering for jobs that arrive
at different times.

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

### Gantt chart visualizer

The repository also includes a terminal-based Gantt chart generator named
`gantt_chart`. It automatically discovers every `.txt` test file, runs the
matching `./restaurant` simulations for FCFS, PRIORITY, and SJF, parses the
reported `START` and `COMPLETION` times, and draws one colored bar per process.

```bash
make
./gantt_chart tests
./gantt_chart tests/edge
```

Each bar spans from the process start time to completion time, and the time axis
starts at 0 so idle gaps remain visible. The chart uses muted but distinct colors
in terminal output; when output is redirected to a file, ANSI color codes are not
emitted so the result stays readable and easy to compare.

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
