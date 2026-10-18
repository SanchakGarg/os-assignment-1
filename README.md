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
