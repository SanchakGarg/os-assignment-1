# Smart Restaurant – Process, Memory and Concurrency (A1 + A2 + Final Project)

Orders are processes and 2 chefs are the service units. Schedulers: FCFS, PRIORITY (non-preemptive) and SJF. Before cooking, an order must be given adjacent slots in two memory pools, SPACE (6 waiting seats) and TABLE (3 dining tables), using First Fit, Best Fit or Worst Fit. While cooking, an order can use the shared kitchen equipment (`MICROWAVE`, `OVEN_1`, `OVEN_2`, `COFFEE_MACHINE`). Real POSIX worker threads acquire and release the equipment under mutexes and condition variables, and deadlock prevention is on.

The three questions the system answers:

| Question | Part | In the restaurant |
|---|---|---|
| Who should be served next? | A1, process scheduling | Which READY order a free chef cooks next (FCFS / PRIORITY / SJF) |
| Where can it be allocated? | A2, contiguous memory | Which adjacent seats and tables an order gets (First / Best / Worst Fit, FIFO admission) |
| How can entities safely share limited resources? | Final, concurrency | Which order may use an oven, microwave or coffee machine, with no double use and no deadlock |

| OS concept | Restaurant |
|---|---|
| Process | Order |
| CPU / execution unit (2) | Chef 0, Chef 1 |
| Contiguous memory pools | SPACE (6 seats), TABLE (3 tables) |
| Exclusive shared resources (capacity 1 each) | `COFFEE_MACHINE`, `MICROWAVE`, `OVEN_1`, `OVEN_2` |
| States | `NEW → BLOCKED_MEMORY → READY → RUNNING → (BLOCKED_RESOURCE → READY → RUNNING)* → TERMINATED` |

## Structure

```
src/        the simulator
server/     C++ WebSocket backend for the web simulator
tools/      helper programs (gantt_chart, check_input)
tests/a1/   A1 edge cases, expected rows, comparison workload, Gantt test
tests/a2/   A2 unit tests, valid/invalid inputs, edge cases, comparison workload
tests/a3/   final-project samples, edge cases, invalid inputs, concurrency stress test
scripts/    comparison table and final-project checks
docs/       input/output notes, edge-case notes, final-project samples
```

| File | Purpose |
|---|---|
| `src/main.c` | Entry point: A1 form (`INPUT SCHEDULER`) or standard form (`INPUT SCHEDULER ALLOCATOR OUTPUT`) |
| `src/restaurant.h` | `Process` record, `Memory`, and the scheduler/simulator/metrics prototypes |
| `src/sim.c` | The coordinator: virtual clock, 2 chefs, FIFO memory queue, both-or-neither admission, resource blocking/unblocking; `simulate_workload()` is the entry point |
| `src/resources.c`, `.h` | Shared-resource subsystem: worker threads, per-resource mutex + FIFO wait queue + condition variable, deadlock prevention, wait-for cycle detection, resource trace |
| `src/sched.c` | Schedulers: `pick_fcfs`, `pick_priority`, `pick_sjf` |
| `src/memory.c`, `src/memory.h` | Allocators: `first_fit`, `best_fit`, `worst_fit`, plus pool take/release/fragmentation |
| `src/metrics.c` | A1 report, and `collect_results()` for the A2/final metrics |
| `src/input.c` | A1 five-field input |
| `src/input_parser.c`, `.h` | A2 seven-field input, and the final resource/action sections, with validation |
| `src/cli_args.c`, `.h` | Command-line arguments (scheduler, allocator, phase, trace, log, unsafe demo) |
| `src/csv_writer.c`, `.h` | Standard result file (A2 and final formats) |
| `src/shared_types.h` | Shared data: `Workload`, `SimulationConfig`, `SimulationResult` |
| `src/gantt.c`, `.h` | Text Gantt chart drawing |
| `tools/gantt_chart.c` | Gantt charts comparing all three schedulers |
| `tools/check_input.c` | Validates an A2 input file without running the simulation |
| `scripts/run_comparison.sh` | Runs all 9 scheduler × allocator combinations and prints a table |
| `scripts/check_a3_baseline.sh` | Resource-free inputs: final output = A2 output + `RESOURCE_WAIT=0` + CHECK rows |
| `scripts/check_a3_samples.sh` | Every final sample, all 9 combinations: invariants and CHECK rows |
| `tests/a3/test_concurrency.c` | Randomized stress test on the real threads (see [Testing](#testing)) |
| `tests/a3/test_inputs.sh` | Invalid resource/action inputs are rejected; samples run; unsafe demo stops |
| `docs/input-output.md` | Detailed A2 input/output notes |
| `docs/edge-cases.md` | What each A2/A3 edge-case input should show |
| `docs/final-samples.md` | Final-project samples and hand traces |
| `server/` | WebSocket backend: the browser picks scheduler/allocator, sends orders, and receives the simulation step by step (`make server`, see `docs/server.md`) |
| `docs/server.md` | Server protocol: messages, frame format, pacing controls |

## Compile

```
make            # builds restaurant, gantt_chart, check_input (needs a C11 compiler and pthreads)
make test       # A1 + A2 + final-project tests
make clean
```

## Run

### Final project (default)

```
./restaurant INPUT_FILE SCHEDULER ALLOCATOR OUTPUT_FILE [--log FILE|-] [--unsafe-demo] [--phase a2|a3]
```

| Argument | Values |
|---|---|
| `SCHEDULER` | `FCFS`, `PRIORITY`, `SJF` (not case-sensitive) |
| `ALLOCATOR` | `FIRST_FIT`, `BEST_FIT`, `WORST_FIT` (not case-sensitive) |
| `--log FILE` | Write the resource-event trace to FILE (`-` = the terminal, on stderr) |
| `--unsafe-demo` | Turn deadlock prevention **off** for the bounded circular-wait demonstration |
| `--phase` | `a3` (default): final format. `a2`: the exact A2 format and A2 input rules |
| `--trace FILE` | JSON recording for the browser viewer *(not available yet)* |

The two required runs, plus the deadlock demo:

```
# (i) A2-compatible baseline, no shared-resource actions
./restaurant tests/a3/baseline_no_resources.txt FCFS FIRST_FIT result.csv

# (ii) real shared-resource activity, with the trace on the terminal
./restaurant tests/a3/integrated.txt PRIORITY BEST_FIT result.csv --log -
./restaurant tests/a3/contention_same_oven.txt FCFS FIRST_FIT result.csv --log -

# (iv) deadlock: unsafe demo (prevention off) is detected and stopped, exit code 5 ...
./restaurant tests/a3/deadlock_unsafe.txt FCFS FIRST_FIT result.csv --unsafe-demo --log -
# ... and the same input in normal mode completes
./restaurant tests/a3/deadlock_unsafe.txt FCFS FIRST_FIT result.csv --log -
```

Exit codes: `0` success, `1` bad arguments, `2` invalid input, `3` simulation failed, `4` result file could not be written, `5` deadlock detected (only possible with `--unsafe-demo`). Errors go to the terminal, never into the result file.

### A1 (process scheduling only)

```
./restaurant INPUT_FILE ALGORITHM
```

`ALGORITHM` is one of `FCFS`, `PRIORITY`, `SJF`.

```
./restaurant tests/a1/edge/all_same_time.txt FCFS
./restaurant tests/a1/edge/all_same_time.txt PRIORITY
./restaurant tests/a1/edge/all_same_time.txt SJF
sh tests/a1/edge/check_rows.sh     # every edge case, every algorithm, vs expected rows
sh tests/a1/gantt_chart_test.sh    # Gantt chart generator checks
./gantt_chart tests/a1/edge        # text Gantt charts, one block per input (all algorithms)
./gantt_chart tests/a1/edge/starvation.txt  # Gantt chart for a single input file
```

### A2 (memory management)

```
./restaurant tests/a2/comparison_a2.txt FCFS FIRST_FIT result.csv --phase a2
```

`--phase a2` gives exactly the A2 result file (13 PROCESS fields, no RESOURCE/CHECK rows) and the strict A2 input rule that nothing may follow the N process rows. Without it the same run gives the final format, with `RESOURCE_WAIT=0` and the CHECK rows appended.


# Final Project: Concurrency and Integrated Simulation

## Final input format

The first N + 2 lines are exactly the A2 input. Two optional sections follow:

```
N
Q
ID,ARRIVAL,PRIORITY,SERVICE,CATEGORY,SPACE_REQ,TABLE_REQ   (exactly N rows)
R
RESOURCE_ID,CAPACITY                                       (exactly R rows)
K
ID,WORK_OFFSET,ACTION,RESOURCE_ID,UNITS                    (exactly K rows)
```

Example (`tests/a3/contention_same_oven.txt`): both orders need `OVEN_1` after 1 unit of cooking and give it back after 3.

```
2
2
O1,0,1,4,NORMAL,1,1
O2,0,2,4,NORMAL,1,1
1
OVEN_1,1
4
O1,1,ACQUIRE,OVEN_1,1
O1,3,RELEASE,OVEN_1,1
O2,1,ACQUIRE,OVEN_1,1
O2,3,RELEASE,OVEN_1,1
```

`read_resource_sections()` in `src/input_parser.c` checks every rule. At the first problem it stops with a line number, for example `Input error (line 9): A acquires OVEN_1 again while still holding it (capacity 1; release it first)`.

- If the file ends after the process rows, R = K = 0, so an unchanged A2 file is a valid final input. If R is present, the K line must follow, and both sections must have exactly R and K rows.
- Resource IDs must be from the restaurant inventory (`COFFEE_MACHINE`, `MICROWAVE`, `OVEN_1`, `OVEN_2`) and unique, with `CAPACITY` = 1. A subset may be declared.
- Action rows need an existing order ID, `WORK_OFFSET` from 0 to that order's SERVICE, `ACQUIRE` or `RELEASE`, a declared resource and `UNITS` = 1.
- Each order's offsets must not decrease. Rows for the same order and offset run in input order.
- A `RELEASE` must name a unit the order holds. An `ACQUIRE` may not take a unit the order already holds, which would deadlock with itself. Every `ACQUIRE` must be released by offset SERVICE at the latest. Acquiring the same unit again after releasing it is allowed.
- Anything after the K rows is an error.

`tests/a3/invalid/` has 17 files, one per kind of mistake. `sh tests/a3/test_inputs.sh` checks that each is rejected with exit code 2 and a message.

## Final output format

The A2 records are emitted in the same order with `RESOURCE_WAIT` appended to every PROCESS row, then one RESOURCE row per declared resource (sorted by ID), then three CHECK rows. There is no header row.

```
PROCESS,O1,0,1,4,0,6,2,6,0,0,0,0,2
PROCESS,O2,0,2,4,0,4,0,4,0,0,0,0,0
SUMMARY,AVERAGE_WAITING,1
SUMMARY,AVERAGE_TURNAROUND,5
SUMMARY,AVERAGE_RESPONSE,0
SUMMARY,THROUGHPUT,0.333333
SUMMARY,SERVICE_UTILIZATION_PCT,66.666667
SUMMARY,AVERAGE_MEMORY_WAIT,0
SUMMARY,COMPLETED_COUNT,2
SUMMARY,BLOCKED_FOR_MEMORY_COUNT,0
POOL,SPACE,6,2,27.777778,1
POOL,TABLE,3,2,55.555556,1
RESOURCE,OVEN_1,1,1,2,1
CHECK,EXCLUSIVITY_VIOLATIONS,0
CHECK,UNRESOLVED_DEADLOCKS,0
CHECK,COMPLETED_COUNT,2
```

| Value | Meaning |
|---|---|
| `RESOURCE_WAIT` | Virtual time the order spent in `BLOCKED_RESOURCE`, waiting for equipment |
| `READY_WAIT` | `WAITING − MEM_WAIT − RESOURCE_WAIT`, so time blocked on equipment is not counted as ready-queue time |
| `MAX_SIMULTANEOUS_HOLDERS` | Most worker threads that owned the unit at the same moment, counted independently of the lock (always ≤ 1) |
| `ACQUISITIONS` | Times the unit was granted, including re-acquisitions after a prevention rollback |
| `WAIT_EVENTS` | Times a request found the unit busy and had to wait |
| `EXCLUSIVITY_VIOLATIONS` | Owner counts above capacity, releases by a non-holder, plus units still held or waited for at the end. A non-zero count fails the run |
| `UNRESOLVED_DEADLOCKS` | Always 0 in a successful run. A wait-for cycle stops the run instead (exit code 5) |
| `COMPLETED_COUNT` | Orders that terminated; equals N |

So for every order, `COMPLETION − ARRIVAL − SERVICE = MEM_WAIT + READY_WAIT + RESOURCE_WAIT`. For resource-free inputs every value is the A2 value, with `RESOURCE_WAIT=0` and no RESOURCE rows. `scripts/check_a3_baseline.sh` checks this for 9 inputs × 9 combinations.

`START` is the first time the order actually executes a unit of service. It usually equals the A2 dispatch time. It differs only when an order is dispatched, blocks immediately at offset 0 and has to be scheduled again. `RESPONSE = START − ARRIVAL`.

## Integrated lifecycle

```
NEW ──arrives──► BLOCKED_MEMORY ──both pools fit──► READY ──chef picks it──► RUNNING ──offset SERVICE──► TERMINATED
                 (FIFO queue)                         ▲                       │      (all units released,
                                                      │                       │       memory freed)
                                       unit handed    │                       │ ACQUIRE finds the unit busy:
                                       over on release└── BLOCKED_RESOURCE ◄──┘ chef freed; memory and held
                                                                                units kept
```

1. An arriving order joins the FIFO memory queue. It becomes READY only when both its SPACE and TABLE requests fit (A2 rules, unchanged).
2. A free chef takes a READY order chosen by the scheduler. At most 2 orders cook at once.
3. The chef cooks until the order's next `WORK_OFFSET` with actions, or to the end of its service. At that point the order's actions run on its worker thread.
4. If an `ACQUIRE` can't be granted, the order becomes `BLOCKED_RESOURCE` and its chef is free for someone else. It keeps its seats, table and any equipment it already holds.
5. When the unit is released, it is handed straight to the first waiter. The order becomes READY and must be picked by the scheduler again. Waiting uses no service time.
6. Restaurant schedulers are non-preemptive, so there is no preemption or Round Robin case. Completion requires offset SERVICE to be reached and every acquisition to be released. The coordinator checks this and fails the run otherwise. Then the memory is freed.

## Virtual time vs real thread execution

There are two clocks:

- **Virtual time** (`t=` in the trace, every number in the CSV) is the simulation clock. Only the coordinator thread (`simulate()` in `src/sim.c`) advances it, jumping from event to event. It decides arrivals, admission, dispatch and when a stretch of cooking ends. Cooking takes virtual time and no real time.
- **Real time** (the `ms` column in the trace) is when the OS actually ran the threads. The equipment operations really happen on worker threads, which the OS schedules however it likes. Two workers run in parallel, and which one wins a contended mutex is up to the OS.

The bridge between them: at virtual time `t`, the coordinator gives every order that reached an action point its work at the same moment, then sleeps on a condition variable until every worker is either finished or blocked. Only then does it read the outcome and continue at the same `t`. Nothing in virtual time depends on real durations or `sleep()`. When several orders request the same unit at the same `t`, the real race decides who gets it. Results can therefore legitimately differ between runs. In 400 runs of `contention_same_oven.txt`, O1 won 386 times and O2 won 14. Every run was valid and consistent. Resource-free inputs start no threads and are fully deterministic.

## Worker/thread model

- **1 coordinator thread** (the main thread) owns the virtual clock, the 2 chefs, the memory pools and the scheduler.
- **1 worker thread per order that has resource actions**, created when the run starts and joined at the end. Orders without actions need no thread. A worker sleeps on its own condition variable until the coordinator posts a command. It then performs all actions at the order's current offset, possibly blocking inside `res_acquire()`.
- The coordinator posts all commands for one virtual instant while holding the control lock. The workers therefore start together as soon as the coordinator begins waiting. The trace's `STOP` line reports the peak number of workers that were running resource code at the same moment: 2 for every sample with two concurrent orders.

## Synchronization primitives and ownership rules

| Shared state | Protected by | Notes |
|---|---|---|
| A unit's holder, FIFO wait queue and statistics | That resource's `pthread_mutex_t` | Requests for different units use different mutexes and really run in parallel (`independent_ovens.txt`) |
| Waking a waiter | That resource's `pthread_cond_t handed` | `pthread_cond_wait` in a `while (holder != me)` loop, which handles spurious wake-ups. There is no polling and no `sleep()` |
| Worker commands, worker status (`IDLE`/`BUSY`/`BLOCKED`), busy count | Control `pthread_mutex_t` + one `pthread_cond_t` per worker + a `settled` condition variable | The coordinator waits for `busy == 0` |
| Independent exclusivity check, peak counters | C11 `atomic_int` | Updated by the owning thread after it gets the unit, so the lock logic is checked rather than trusted |
| Trace output | Trace mutex | The timestamp is taken inside the mutex, so lines are in real-time order |

Rules:
- **Acquire:** lock the resource. If it's free, take it. Otherwise append yourself to the FIFO queue, mark yourself `BLOCKED` (so the coordinator can settle) and wait on `handed`.
- **Release:** lock the resource and check you are the holder (otherwise it counts as a violation). If someone is waiting, **hand ownership directly** to the first waiter and mark it `BUSY` *before* this worker reports done, then broadcast. Otherwise mark the unit free.
- **No lost wake-ups:** the hand-over and the waiter's check happen under the same mutex, and ownership is assigned before the signal. A waiter that hasn't reached `pthread_cond_wait` yet still sees `holder == me` and doesn't sleep.
- **No stranded waiters:** at shutdown, every resource gets `stop = 1` and a broadcast, so even a deadlocked worker wakes and exits before `pthread_join`.
- **Fairness:** waiters on one unit are served in FIFO order, and no new request can barge past a waiter. Simultaneous requests at the same virtual instant are ordered by the real race (not FIFO by priority or ID). The spec does not require strict fairness. Starvation is impossible for a single unit because the queue is FIFO and every holder releases by its SERVICE offset.
- **Lock order:** resource lock → control lock → trace lock, never the reverse, so the implementation itself cannot deadlock.

Correctness evidence: ThreadSanitizer (`-fsanitize=thread`) reports **no data races** on every sample, every scheduler, the unsafe demo and 600 randomized stress runs.

## Deadlock

### The four conditions in the kitchen

| Condition | In the restaurant | Present? |
|---|---|---|
| Mutual exclusion | Only one order can use `OVEN_1` at a time | Yes, required (capacity 1) |
| Hold and wait | O1 keeps the microwave while waiting for the oven | Yes, the spec lets a blocked order keep its equipment |
| No preemption | A chef can't take equipment away from another order | Yes, but our policy lets an order give its own equipment back (see below) |
| Circular wait | O1 waits for O2's oven while O2 waits for O1's microwave | Only when two orders take units in opposite orders. **This is the condition we rule out.** |

### Unsafe demonstration (bounded)

`tests/a3/deadlock_unsafe.txt`: O1 takes `MICROWAVE` then `OVEN_1`, and O2 takes `OVEN_1` then `MICROWAVE`. Both are at offset 1 at t=1.

```
$ ./restaurant tests/a3/deadlock_unsafe.txt FCFS FIRST_FIT result.csv --unsafe-demo --log -
    0.116ms  t=0   worker-O2      O2     REQUEST           OVEN_1
    0.130ms  t=0   worker-O2      O2     ACQUIRE           OVEN_1          granted (free)
    0.117ms  t=0   worker-O1      O1     REQUEST           MICROWAVE
    0.155ms  t=0   worker-O1      O1     ACQUIRE           MICROWAVE       granted (free)
    0.171ms  t=1   worker-O1      O1     REQUEST           OVEN_1
    0.180ms  t=1   worker-O1      O1     WAIT              OVEN_1          held by O2, queue position 1
    0.175ms  t=1   worker-O2      O2     REQUEST           MICROWAVE
    0.197ms  t=1   worker-O2      O2     WAIT              MICROWAVE       held by O1, queue position 1
    0.206ms  t=1   coordinator    O1     BLOCKED_RESOURCE  -               gives up chef 0, keeps its memory
    0.210ms  t=1   coordinator    O2     BLOCKED_RESOURCE  -               gives up chef 1, keeps its memory
    0.214ms  t=1   coordinator    -      DEADLOCK          -               wait-for cycle: O1 waits for OVEN_1 (held by O2); O2 waits for MICROWAVE (held by O1)
DEADLOCK DETECTED (unsafe demo, prevention off): deadlock at t=1: wait-for cycle: ...
The run was stopped and every worker thread released; no result file was written.
$ echo $?
5
```

Both worker threads are really blocked in `pthread_cond_wait` on each other's resource. After every virtual instant, the coordinator builds the wait-for graph (order → holder of the unit it waits for) and looks for a cycle. When it finds one, it reports it, wakes every worker with the shutdown flag, joins them and exits. The run ends in a few milliseconds instead of hanging. The coordinator's wait also has a 10-second watchdog, so even a bug in the workers ends in an error rather than a hang. The stress test runs the unsafe mode on random workloads: every run either completed or reported its cycle.

### Prevention policy (always on in normal mode): ordered acquisition with rollback

Every resource has a fixed global rank: `COFFEE_MACHINE < MICROWAVE < OVEN_1 < OVEN_2`.

**Rule:** a worker only ever *waits* for a unit ranked higher than every unit it holds. When an order requests a unit ranked below one it already holds (an out-of-order request), its worker first releases those higher-ranked units (`ROLLBACK` in the trace; they may be handed to their waiters). It then acquires the requested unit and the released ones again, in ascending rank.

**Why it works:** in any wait-for cycle, each order would wait for a unit ranked higher than one it holds, all the way round the cycle. That would need rank(a) < rank(b) < … < rank(a), which is impossible. So circular wait can't occur. This is the classic resource-ordering proof. The spec explicitly allows a prevention policy to roll back held resources.

The same input in normal mode:

```
    0.082ms  t=1   worker-O1      O1     REQUEST           OVEN_1
    0.083ms  t=1   worker-O2      O2     ROLLBACK          OVEN_1          now free
    0.097ms  t=1   worker-O2      O2     REQUEST           MICROWAVE
    0.101ms  t=1   worker-O2      O2     WAIT              MICROWAVE       held by O1, queue position 1
    0.104ms  t=1   worker-O1      O1     ACQUIRE           OVEN_1          granted (free)
    0.115ms  t=1   coordinator    O2     BLOCKED_RESOURCE  -               gives up chef 1, keeps its memory
    0.122ms  t=3   worker-O1      O1     RELEASE           OVEN_1          now free
    0.134ms  t=4   worker-O1      O1     RELEASE           MICROWAVE       handed to O2
    0.146ms  t=4   worker-O2      O2     ACQUIRE           MICROWAVE       granted (handed over on release)
    0.153ms  t=4   worker-O2      O2     ACQUIRE           OVEN_1          granted (free)
    0.160ms  t=4   coordinator    O2     UNBLOCK           -               READY again after waiting 3
```

Both orders complete with `CHECK,UNRESOLVED_DEADLOCKS,0`.

**Why this policy:** inputs are fixed scripts, and the spec's own unsafe example must still run in normal mode. Rejecting out-of-order scripts would break that, and all-or-nothing acquisition would need every order's whole resource list up front. Rollback keeps every valid input runnable, and it costs nothing for inputs that already follow the order (`deadlock_safe_order.txt`, `integrated.txt`: no rollback ever happens).

**Limitations and impact:**
- **Utilization and throughput:** a rollback gives up a unit the order will need again, so another order may grab it first. In `deadlock_unsafe.txt`, O2 releases `OVEN_1` at t=1 and only gets it back at t=4. In this model that's free: equipment isn't consumed, and the order resumes from the same offset. A real kitchen would lose the work done with that oven.
- **Fairness:** the order that asks out of order is the one that pays, by waiting longer (O2 waits 3, O1 waits 0). Orders that follow the global order are never penalised.
- **Bounded:** rollback happens only on out-of-order requests, at most once per such request, so it can't loop. Liveness follows from no circular wait, FIFO queues and every holder releasing by its SERVICE offset. This was checked on 3000 random runs with out-of-order scripts.
- **Not handled:** a fixed rank ignores how long each unit is used. Ordering by rank also doesn't reduce *waiting*, only deadlock. The rank list is specific to the restaurant inventory.

## Resource-event trace

`--log FILE` (or `--log -` for the terminal) writes one line per event. The columns are: real time since start, virtual time `t`, the thread that did it (`worker-<order>` or `coordinator`), the order, the event, the resource and details.

| Event | By | Meaning |
|---|---|---|
| `REQUEST` | worker | About to try to acquire |
| `ACQUIRE` | worker | Now owns the unit: `granted (free)` or `granted (handed over on release)` |
| `WAIT` | worker | The unit is busy. Shows the holder and queue position |
| `RELEASE` / `ROLLBACK` | worker | Gave the unit back: `now free` or `handed to <order>`. `ROLLBACK` is the prevention policy |
| `BLOCKED_RESOURCE` | coordinator | The order gives up its chef and keeps its memory |
| `UNBLOCK` | coordinator | The order is READY again, after waiting N virtual time units |
| `DEADLOCK` | coordinator | The wait-for cycle found in unsafe mode |
| `START` / `STOP` | coordinator | Thread count, policy, peak simultaneous workers |

Two orders on different ovens at the same instant (`tests/a3/edge/03_simultaneous_different_ovens.txt`). Both are granted at once, with no waiting:

```
    0.038ms  t=0   worker-A       A      REQUEST           OVEN_1
    0.054ms  t=0   worker-A       A      ACQUIRE           OVEN_1          granted (free)
    0.060ms  t=0   worker-B       B      REQUEST           OVEN_2
    0.064ms  t=0   worker-B       B      ACQUIRE           OVEN_2          granted (free)
    0.077ms  t=4   worker-A       A      RELEASE           OVEN_1          now free
    0.086ms  t=4   worker-B       B      RELEASE           OVEN_2          now free
    0.125ms  t=4   coordinator    -      STOP              -               peak workers running resource code at once: 2
```

Two orders on the same oven (`contention_same_oven.txt`). The losing thread waits, and the oven is handed over on release:

```
    0.133ms  t=1   worker-O2      O2     REQUEST           OVEN_1
    0.147ms  t=1   worker-O2      O2     ACQUIRE           OVEN_1          granted (free)
    0.153ms  t=1   worker-O1      O1     REQUEST           OVEN_1
    0.171ms  t=1   worker-O1      O1     WAIT              OVEN_1          held by O2, queue position 1
    0.187ms  t=1   coordinator    O1     BLOCKED_RESOURCE  -               gives up chef 0, keeps its memory
    0.198ms  t=3   worker-O2      O2     RELEASE           OVEN_1          handed to O1
    0.206ms  t=3   worker-O1      O1     ACQUIRE           OVEN_1          granted (handed over on release)
    0.214ms  t=3   coordinator    O1     UNBLOCK           -               READY again after waiting 2
```

## Final challenge: observed results

All runs below were made with prevention on. Where two orders race for the same unit at the same instant, the other outcome is equally valid.

**1. Scheduling changes order, response and waiting.** `tests/a3/integrated.txt`, Best Fit:

| Order | FCFS start / wait | PRIORITY start / wait | SJF start / wait |
|---|---|---|---|
| O3 (prio 2, service 3) | 4 / 3 | 6 / 7 | 6 / 7 |
| O4 (VIP, service 2) | 6 / 4 | 4 / 2 | 4 / 2 |
| O6 (prio 2, service 3) | 8 / 4 | 6 / 2 | 6 / 2 |
| Average response | 2.5 | 2.167 | 2.167 |

PRIORITY and SJF both pull O4 (VIP and shortest) ahead of O3. O3 then also has to wait for `OVEN_2`, which O6 holds. Under PRIORITY and SJF it picks up `RESOURCE_WAIT=2`, against 0 under FCFS. The scheduler therefore changes resource contention too, not just the ready queue. The A1 comparison table further down shows larger differences on the 10-order workload.

**2. Allocation policy changes waiting.** `tests/a3/allocator_difference.txt`, FCFS (hand trace in `docs/final-samples.md`). The SPACE pool is `[_ _ A2 _ A4 A4]` when B1 (1 seat) and B2 (2 seats) arrive at t=3:

| Allocator | B1 placed at | B2 MEM_WAIT | B2 READY_WAIT | Blocked for memory | SPACE utilization |
|---|---|---|---|---|---|
| First Fit | seat 0 | 7 | 2 | 1 | 65.48 % |
| Best Fit | seat 3 (exact hole) | **0** | 9 | **0** | **82.14 %** |
| Worst Fit | seat 0 (largest hole) | 7 | 2 | 1 | 65.48 % |

Best Fit admits B2 at once. Its total waiting stays 9, because both chefs are busy until t=10 and t=12: the wait moves from memory to the ready queue. On the 10-order A2 workload all three allocators give identical results (see the A2 table below), because there FIFO head-of-line blocking, not hole choice, decides who gets in.

**3. Concurrency.** Two worker threads overlap in real time (peak 2) and compete for the same mutex. `OVEN_1` never has more than one holder (`MAX_SIMULTANEOUS_HOLDERS=1`, `EXCLUSIVITY_VIOLATIONS=0`). Different ovens are used at the same time with no waits (`independent_ovens.txt`: both `RESOURCE_WAIT=0`).

**4. Deadlock.** Without prevention, the circular wait is detected and stopped at t=1 (exit 5). With prevention, the same input completes: O1 at t=4, O2 at t=7, `UNRESOLVED_DEADLOCKS=0`.

**5. Integration.** In `integrated.txt`, O3 arrives at t=1 and is memory-blocked (`MEM_WAIT=3`), because O1 and O2 hold 5 of 6 seats. O1 blocks on `OVEN_1` at t=1 and gives up its chef. In `tests/a3/edge/11_blocked_while_holding.txt`, B holds `MICROWAVE` while blocked on `OVEN_1`, and its free chef immediately starts C (C starts at t=1, ready wait 1). A blocked order never cooks: its `COMPLETION − ARRIVAL` always equals service + memory + ready + resource waits.

## Trade-offs

- **Waiting time vs priority service:** SJF minimises average waiting, PRIORITY serves VIPs first, and FCFS has the smallest worst case. With equipment, the scheduler also decides *who reaches the oven first*, so a favoured order can push its resource waiting onto others.
- **Throughput and chef utilization vs resource blocking:** a blocked order gives up its chef. That keeps chef utilization up (another order cooks meanwhile) at the cost of a context switch, because the order must be scheduled again. Holding the chef while waiting would be simpler but would idle a chef.
- **Memory utilization vs waiting:** Best Fit packs seats more tightly (82 % vs 65 % above) but doesn't shorten total waiting when chefs are the bottleneck. FIFO admission is fair and deterministic, but one large order at the head blocks smaller ones (head-of-line blocking). Orders blocked on equipment *keep* their seats, which can block admission further. That's the price of not rolling back memory.
- **Resource utilization vs deadlock avoidance:** ordered acquisition with rollback never refuses a valid script and costs nothing when scripts follow the order. Out-of-order requesters lose units temporarily, which lowers that unit's utilization and adds `ACQUISITIONS`. All-or-nothing acquisition would remove rollbacks but would hold units idle for longer.
- **Synchronization overhead:** one mutex per unit lets different units work in parallel. The coordinator waits for every worker at each action point, which adds real latency (microseconds) but keeps virtual time consistent. Each resource operation costs a few lock and unlock calls plus one condition-variable wake. That is small next to thread creation, done once per order.
- **Fairness:** FIFO hand-over means no waiter is overtaken, but same-instant requests are ordered by the OS race. Results can differ between runs only in which of two equal claimants wins.

## Assumptions

- Restaurant schedulers are non-preemptive and there is no Round Robin (Q is read but unused), as in A1. An order keeps its chef across action points unless it blocks.
- An order dispatched at an action point runs that point's actions before cooking. If it blocks there, it never received service, so `START` is when service actually begins.
- When equipment is handed to a blocked order at time t, the order becomes READY at t and can be dispatched at t. Releases at the end of service (offset SERVICE) happen before the order completes and frees its memory.
- Releases and acquisitions at the same instant from different orders are not ordered against each other. If an acquire finds the unit still held, it waits and is handed the unit at the same instant (0 resource wait, 1 wait event).
- Within one virtual instant the coordinator repeats actions, completions, admission and dispatch until nothing changes. With no actions this is exactly A2's order.

## Limitations

- Event order inside one virtual instant depends on the OS thread schedule, so contended runs are not byte-for-byte reproducible. Resource-free runs are.
- One thread per order with actions. Thousands of such orders would create thousands of threads. A fixed worker pool would scale better but would hide the "order is blocked" relationship.
- Detection of deadlock in unsafe mode stops the run. It doesn't recover by choosing a victim.
- The live server (`server/`) accepts at most 200 orders and 2000 actions per run, because every frame repeats every order.

## Optional features included

- Wait-for graph cycle detection (used by the unsafe demo and as a safety check in normal mode), plus a watchdog on the coordinator.
- FIFO, hand-over resource queues: no barging, no starvation for a unit.
- A rich resource trace with real and virtual timestamps and thread names.
- A randomized stress test on the real threads (`tests/a3/test_concurrency.c`), also run under ThreadSanitizer.
- An independent atomic exclusivity check and a conservation check (nothing still held at the end).


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
- Rows may appear in any order. Blank lines at the end and Windows line endings are accepted. With `--phase a2`, any other content after the N rows is an error. In the default final mode, it must be the resource/action sections (see [Final input format](#final-input-format)).
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
 
### Best Fit

`best_fit` chooses the **smallest** free run that is big enough. Ties go to the lowest slot.

- **Advantage:** it keeps large runs free for large orders. In `tests/a2/edge/07_fragmentation_and_fit.txt` it lets B2 in at once, where First and Worst Fit make it wait 7.
- **Trade-off:** it tends to leave tiny leftover holes that nobody can use.

Example: in `[_ _ _ X _ X]`, a 1-slot request takes slot 4 (the exact-size hole), not slot 0.

### Worst Fit

`worst_fit` chooses the **largest** free run. Ties go to the lowest slot.

- **Advantage:** the leftover piece is as large as possible, so it is more likely to fit a later order.
- **Trade-off:** it breaks up the big runs, so a later large order may not fit anywhere.

Example: in `[X _ X _ _ X]`, a 1-slot request takes slot 3 (the 2-slot hole), not slot 1.

### Admission

All three algorithms only search; `try_admit()` in `src/sim.c` places the order in SPACE and in TABLE first, and marks slots only if **both** fit, so an order never holds half its request. Orders wait in one FIFO queue (arrival time, then ID). Only the head is tried; if it does not fit, the orders behind it wait too. Slots are freed when the order completes; adjacent free slots join up automatically.
 
## A2 algorithm comparison
 
`tests/a2/comparison_a2.txt` is the A1 comparison workload (the same 10 orders as `tests/a1/comparison.txt`) with SPACE and TABLE requests added, so the A2 results can be compared directly with the A1 table below. `tests/a2/allocator_difference.txt` is a small input where the allocator choice changes memory waiting.
 
```
mkdir -p results && sh scripts/run_comparison.sh tests/a2/comparison_a2.txt > results/comparison.md
```
 
The script runs all 9 combinations (3 schedulers × 3 allocators) and keeps each CSV in `results/comparison/`. It then prints a table of average waiting, turnaround, response and memory wait, the blocked-for-memory count, SPACE and TABLE peak/utilization/fragmentation, and completion order.
 
| Scheduler | Allocator | Avg wait | Avg turnaround | Avg response | Avg mem wait | Blocked for memory | SPACE peak / util % / frag | TABLE peak / util % / frag | Completion order |
|---|---|---|---|---|---|---|---|---|---|
| FCFS | any | 6.2 | 11.1 | 6.2 | 5.4 | 8 | 6 / 73.718 / 1 | 3 / 67.949 / 1 | O2 → O1 → O3 → O4 → O6 → O7 → O8 → O5 → O10 → O9 |
| PRIORITY | any | 6.2 | 11.1 | 6.2 | 5.4 | 8 | 6 / 73.718 / 1 | 3 / 67.949 / 1 | O2 → O1 → O3 → O4 → O6 → O7 → O8 → O5 → O10 → O9 |
| SJF | any | 6.9 | 11.8 | 6.9 | 6.3 | 8 | 6 / 66.667 / 1 | 3 / 66.667 / 1 | O2 → O4 → O1 → O3 → O7 → O6 → O8 → O10 → O5 → O9 |

- **Memory dominates.** O1 and O2 take 5 of the 6 seats at t=0, so O3 (2 seats) waits from t=1. In total 8 of the 10 orders wait for memory (5.4 units on average). Orders reach READY in FIFO admission order, a few at a time. In this workload FCFS and PRIORITY happen to pick those few in the same order, so they give identical results. In A1 they differed a lot (average wait 6.2 vs 8.0).
- **SJF gets worse with memory** (6.9 vs 4.2 in A1). At t=4, SJF starts the short O4 before O3. O3 then cooks from 6 to 12 instead of 4 to 10 and keeps its seats 2 units longer. O5 (3 seats, 2 tables) at the head of the memory queue is admitted at 12 instead of 10, and everyone behind it is delayed. Picking the shortest *ready* job doesn't help when the real bottleneck is memory admission.
- **The allocators tie on this workload.** With FIFO admission, the head of the queue either fits in the single large hole or nothing does, so all three pick the same slots. `tests/a3/allocator_difference.txt` (above) is built to make them differ.
- **Head-of-line blocking:** small orders such as O4 (1 seat) wait behind a large head order even when a seat is free. That's the cost of FIFO's fairness and predictability.
 
## Testing

```
make test       # A1, A2 and final-project tests
make test-a1    # A1 rows against expected output, Gantt chart
make test-a2    # A2 unit tests and input checks
make test-a3    # final project: inputs, baseline, samples, concurrency stress
```
 
| Test | Checks |
|---|---|
| `tests/a2/test_memory.c` | First/Best/Worst Fit: empty and full pools, exact fit, size 1 and full capacity, holes, equal-sized holes, the TABLE pool; fragmentation and freeing |
| `tests/a2/test_parser.c` | Spec example values, parsing stops at the A3 resource section, trailing content, error line numbers |
| `tests/a2/test_csv.c` | Exact one-order output, lexicographic ID sorting, final-project format, no output for an incomplete run |
| `tests/a2/test_cli.c` | All scheduler/allocator names, options in any position, bad arguments, the A1 two-argument form |
| `tests/a2/test_inputs.sh` | Every valid input is accepted; every invalid input is rejected with a message |
| `tests/a3/test_inputs.sh` | 17 invalid resource/action inputs rejected (exit 2, message); every sample and edge input completes; the unsafe demo stops both circular-wait inputs (exit 5) |
| `scripts/check_a3_baseline.sh` | Resource-free inputs, all 9 combinations: final output = A2 output + `RESOURCE_WAIT=0` + CHECK rows (81 checks) |
| `scripts/check_a3_samples.sh` | Every final sample, all 9 combinations: no hang, 14 fields, `WAITING = MEM_WAIT + READY_WAIT + RESOURCE_WAIT`, RESOURCE rows sorted, CHECK rows `0, 0, N` (72 checks) |
| `tests/a3/test_concurrency.c` | 150 random workloads (2–25 orders, random and often out-of-order equipment scripts) × 9 combinations on the real threads: no errors or hangs, no violations, ≤ 1 holder, waiting split adds up, nothing completes early; the unsafe mode always completes or reports its deadlock. Pass a count to run more: `./tests/bin/test_concurrency 300` |

ThreadSanitizer run (no data races reported):

```
gcc -O1 -g -fsanitize=thread -pthread -Isrc -o tsan_stress tests/a3/test_concurrency.c \
    src/sim.c src/sched.c src/memory.c src/metrics.c src/input.c src/input_parser.c \
    src/cli_args.c src/csv_writer.c src/gantt.c src/resources.c -lm
./tsan_stress 60
```
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
(for example `./restaurant tests/a1/edge/all_same_time.txt FCFS > out.csv`). When run directly
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
(starvation). In `tests/a1/edge/starvation.txt`, order `O3` (service 20) waits 17
time units under SJF, compared with 2 under FCFS.

## Gantt chart visualizer

When `./restaurant` is run in a terminal, it prints a Gantt chart for the chosen
input file and algorithm after the `SUMMARY` block. When its output is piped or
redirected (e.g. `./restaurant tests/a1/edge/all_same_time.txt FCFS > out.csv`), the chart is
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
./gantt_chart tests/a1/edge                 # every .txt in tests/a1/edge/
./gantt_chart tests/a1/edge/starvation.txt  # one input file
```

Each bar spans from the process start time to completion time, and the time axis
starts at 0 so idle gaps remain visible. The chart uses muted but distinct colors
in terminal output; when output is redirected to a file, ANSI color codes are not
emitted so the result stays readable and easy to compare.

## Algorithm comparison

`tests/a1/comparison.txt` is a 10-order workload built to show how the three
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
./restaurant tests/a1/comparison.txt FCFS
./restaurant tests/a1/comparison.txt PRIORITY
./restaurant tests/a1/comparison.txt SJF
./gantt_chart tests/a1/comparison.txt
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
=== tests/a1/comparison.txt ===
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
