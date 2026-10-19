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
| `tests/` | Sample inputs and `run_all.sh` |

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
