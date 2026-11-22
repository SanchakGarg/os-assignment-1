# Simulation Walkthrough — How Everything Works

A detailed, example-driven explanation of the **Last Call** restaurant simulator:
how the browser talks to the server, how each assignment part maps to restaurant
concepts, and what every metric in the results panel means.

---

## The Big Picture

```
Browser (web/)                   restaurant_server (C++)
─────────────────────────────    ────────────────────────────────
 Select: FCFS / FIRST_FIT        │
 Select: Workload (.txt)         │   uses the same sim.c / sched.c / resources.c
 ▶ RUN LIVE  ──── WebSocket ────►│   simulate_workload()
                                 │   ↓ frame by frame
 Canvas, Orders, Events ◄────────│   {type:"frame", ...}  × N frames
 Speed ×0.5 / ×1 / ×2 / ×4 ────►│   {type:"speed", tick_ms:500}
 ⏸ Pause / ▶ Resume ────────────►│   {type:"pause"} / {type:"resume"}
 → Step ─────────────────────────►│   {type:"step"}
 Results panel ◄─────────────────│   {type:"results", ...}
```

The **server holds all simulation state**. The browser sends commands and
receives one `frame` JSON per simulation event tick. Speed controls set how
many milliseconds the server waits between sending frames (`tick_ms`).

---

## The Restaurant Metaphor

| OS Concept               | Restaurant                                                    |
|--------------------------|---------------------------------------------------------------|
| Process                  | An order (O1, O2, …)                                          |
| CPU (×2 cores)           | Chef 0, Chef 1 — only 2 orders can cook at once              |
| Contiguous memory pool 1 | **SPACE** — 6 waiting seats, need *adjacent* slots            |
| Contiguous memory pool 2 | **TABLE** — 3 dining tables, need *adjacent* slots            |
| Shared resource          | Kitchen equipment: `OVEN_1`, `OVEN_2`, `MICROWAVE`, `COFFEE_MACHINE` |
| Scheduler                | Rule that decides which READY order a free chef picks next    |
| Allocator                | Rule that decides *which* adjacent slots an order gets        |
| Deadlock prevention      | Global resource ordering (COFFEE_MACHINE < MICROWAVE < OVEN_1 < OVEN_2) |

### Order States

```
NEW
 │  (arrives at tick = arrival)
 ▼
BLOCKED_MEMORY   ← FIFO admission queue; must fit BOTH pools atomically
 │  (both pools grant space)
 ▼
READY            ← waiting for a free chef
 │  (chef is free, scheduler picks this order)
 ▼
RUNNING          ← chef is actively cooking (service ticks tick down)
 │  (needs equipment at some offset)
 ▼
BLOCKED_RESOURCE ← waiting for OVEN_1 / MICROWAVE / etc.
 │  (equipment released by holder)
 ▼
RUNNING          ← resumes cooking
 │  (all service ticks consumed)
 ▼
TERMINATED       ← memory and equipment released, table cleared
```

---

## Worked Example: `tests/a3/integrated.txt` with FCFS + FIRST FIT

### Input File

```
6          ← 6 orders (n)
2          ← 2 chefs
O1,0,2,5,NORMAL,3,1    ← id, arrival, priority, service, category, space_req, table_req
O2,0,1,4,VIP,2,1
O3,1,2,3,NORMAL,2,1
O4,2,1,2,VIP,1,0
O5,3,3,4,NORMAL,1,1
O6,4,2,3,NORMAL,2,0
4          ← 4 resources
COFFEE_MACHINE,1
MICROWAVE,1
OVEN_1,1
OVEN_2,1
14         ← 14 resource actions
O1,1,ACQUIRE,OVEN_1,1    ← process, offset-within-service, action, resource, units
O1,4,RELEASE,OVEN_1,1
O2,0,ACQUIRE,OVEN_1,1
O2,2,RELEASE,OVEN_1,1
O3,0,ACQUIRE,MICROWAVE,1
O3,1,ACQUIRE,OVEN_2,1
O3,3,RELEASE,OVEN_2,1
O3,3,RELEASE,MICROWAVE,1
O4,0,ACQUIRE,COFFEE_MACHINE,1
O4,2,RELEASE,COFFEE_MACHINE,1
O5,1,ACQUIRE,COFFEE_MACHINE,1
O5,2,RELEASE,COFFEE_MACHINE,1
O6,0,ACQUIRE,OVEN_2,1
O6,3,RELEASE,OVEN_2,1
```

### A1 · Scheduling — Who Cooks Next?

**FCFS** = First Come, First Served.  Tie-break: alphabetical ID.

| Tick | Event |
|------|-------|
| 0    | O1 and O2 both arrive. SPACE=6, TABLE=3. **First Fit**: O1 needs 3 SPACE + 1 TABLE — fits at slots 0-2 and slot 0. O2 needs 2 SPACE + 1 TABLE — only 3 slots left, needs 2 adjacent; slots 3-4 fit + TABLE slot 1. Both admitted. |
| 0    | FCFS: O1 arrived first (tie → alphabetical → O1 before O2). Chef 0 → O1, Chef 1 → O2. |
| 1    | O3 arrives. Only 1 SPACE slot free — not enough (needs 2). O3 → BLOCKED_MEMORY. |
| 2    | O4 arrives. Needs 1 SPACE + 0 TABLE — slot 5 is free; admitted. O4 → READY. FCFS: O4 waits behind O3 in memory queue but O4 needs 1 slot which fits; however, **FIFO admission** means O3 must be attempted first — O3 still can't fit, so O4 also blocks. |
| 4    | O2 finishes (service=4). Releases SPACE 3-4 and TABLE 1. O3 now fits (needs 2 SPACE: slots 3-4 ✓, needs 1 TABLE: slot 1 ✓). O3 admitted. O4 also fits (1 SPACE: slot 5 ✓). O4 admitted. |
| 4    | Chef 1 is free. FCFS among READY: O3 (arrived t=1) before O4 (arrived t=2). Chef 1 → O3. |

### A2 · Memory Allocation — Where Do They Sit?

**First Fit**: scan from slot 0, pick the first run of adjacent free slots that fits.

SPACE pool (6 slots), TABLE pool (3 slots):

```
Tick 0 after admitting O1 and O2:
  SPACE: [O1][O1][O1][O2][O2][ ]
  TABLE: [O1][O2][ ]

Tick 1, O3 arrives: needs 2 SPACE + 1 TABLE
  SPACE: only slot 5 free (1 slot, not 2) → BLOCKED

Tick 4, O2 finishes: releases SPACE 3,4 and TABLE 1
  SPACE: [O1][O1][O1][ ][ ][ ]
  TABLE: [O1][ ][ ]
  O3 (head of FIFO queue) needs 2 SPACE → slots 3-4 ✓; 1 TABLE → slot 1 ✓ → ADMITTED
  O4 needs 1 SPACE → slot 5 ✓; 0 TABLE ✓ → ADMITTED
```

**Best Fit** would have chosen the *smallest* run that still fits — fewer wasted
gaps but more fragmentation work.  **Worst Fit** picks the largest run,
leaving bigger leftover chunks to serve future large requests.

### A3 · Equipment Sharing — Who Gets the Oven?

Resource actions have an *offset* relative to when that order started cooking.
O1 starts cooking at tick 0, so its `ACQUIRE OVEN_1` at offset 1 triggers at
tick 1. O2 also wants `OVEN_1` at offset 0 of its service (tick 0).

**FCFS on OVEN_1**: O2 acquires it first (tick 0, offset 0).
O1 reaches offset 1 at tick 1 and must wait → `BLOCKED_RESOURCE`.
At tick 2, O2 releases OVEN_1. O1 unblocks, acquires, resumes → `RUNNING`.

**Deadlock prevention (Global Order)**:  
Resources are ranked: `COFFEE_MACHINE(0) < MICROWAVE(1) < OVEN_1(2) < OVEN_2(3)`.  
Any order that needs two resources must acquire them in ascending rank order.
O3 needs `MICROWAVE` then `OVEN_2` — rank 1 then rank 3 ✓ (safe).  
If instead O3 held OVEN_2 and tried for MICROWAVE while O1 held MICROWAVE and
tried for OVEN_2, the cycle would deadlock — the global order prevents that.

### Results After the Run

Actual output from `./restaurant tests/a3/integrated.txt FCFS FIRST_FIT out.csv`:

| Order | Arrival | Priority | Burst | Start | Finish | Waiting | Turnaround | Response | Mem Wait | Ready Wait | Res Wait |
|-------|---------|----------|-------|-------|--------|---------|------------|----------|----------|------------|----------|
| O1    | 0       | 2        | 5     | 0     | 6      | 1       | 6          | 0        | 0        | 0          | 1        |
| O2    | 0       | 1        | 4     | 0     | 4      | 0       | 4          | 0        | 0        | 0          | 0        |
| O3    | 1       | 2        | 3     | 4     | 7      | 3       | 6          | 3        | 3        | 0          | 0        |
| O4    | 2       | 1        | 2     | 6     | 8      | 4       | 6          | 4        | 2        | 2          | 0        |
| O5    | 3       | 3        | 4     | 7     | 11     | 4       | 8          | 4        | 1        | 3          | 0        |
| O6    | 4       | 2        | 3     | 8     | 11     | 4       | 7          | 4        | 2        | 2          | 0        |
| **AVG** |       |          |       |       |        | **2.67** | **6.17** | **2.50** | **1.67** |            |          |

**Summary**:

| Metric                  | Value    | Formula / Meaning |
|-------------------------|----------|-------------------|
| Avg Waiting             | 2.67 t   | Total time in all queues (mem + ready + resource) ÷ n |
| Avg Turnaround          | 6.17 t   | (Finish − Arrival) ÷ n |
| Avg Response            | 2.50 t   | (First dispatch − Arrival) ÷ n |
| Throughput              | 0.545 orders/t | Completed ÷ simulation duration |
| Chef Utilization        | 95.5 %   | Sum of all service times ÷ (chefs × duration) |
| Avg Memory Wait         | 1.67 t   | Time blocked in memory FIFO ÷ n |

---

## Metric Definitions

### Per-Order Columns

| Column      | Definition |
|-------------|------------|
| **Arrival** | Tick the order entered the system |
| **Priority** | Scheduler priority number. Lower = higher priority (1 = VIP). Used only by PRIORITY scheduler |
| **Burst**   | Service time — how many CPU ticks are needed to cook this order |
| **Start**   | First tick a chef began working on this order |
| **Finish**  | Tick the order was marked TERMINATED and memory freed |
| **Waiting** | `Turnaround − Burst` — time the order wasn't being cooked |
| **Turnaround** | `Finish − Arrival` — total time from arrival to done |
| **Response** | `Start − Arrival` — how quickly the order got its first chef |
| **Mem Wait** | Ticks spent in the FIFO memory admission queue waiting for space |
| **Ready Wait** | Ticks spent in the READY queue waiting for a free chef |
| **Res Wait** | Ticks spent blocked waiting for a piece of equipment (A3 only) |

### Summary Metrics

| Metric | Formula |
|--------|---------|
| **Avg Waiting** | `Σ waiting / n` — also = Avg Turnaround − Avg Burst |
| **Avg Turnaround** | `Σ (finish − arrival) / n` |
| **Avg Response** | `Σ (start − arrival) / n` — measures perceived "first contact" speed |
| **Throughput** | `completed_count / end_time` — orders served per tick |
| **Chef Utilization %** | `Σ service / (chef_count × end_time) × 100` — % of time chefs were busy |
| **Avg Memory Wait** | `Σ mem_wait / n` — caused by FIFO blocking when pools are full |

### Equipment Table (A3)

| Column | Meaning |
|--------|---------|
| **Peak Holders** | Max simultaneous holders (should equal capacity, verifying mutual exclusion) |
| **Total Acquires** | How many times any order grabbed this resource |
| **Wait Events** | How many acquire calls had to block and wait |

### Correctness Checks

| Check | What it verifies |
|-------|-----------------|
| **Exclusivity violations** | 0 = no two orders ever held the same capacity-1 resource simultaneously |
| **Unresolved deadlocks** | 0 = no circular wait at end of simulation |
| **Completed count** | Should equal the number of orders in the input |

---

## Scheduler Comparison

Run the same workload with different schedulers to see how metrics shift:

| Scheduler | Best for | Trade-off |
|-----------|----------|-----------|
| **FCFS** | Fairness, predictability | High average wait if a long order arrives first (convoy effect) |
| **PRIORITY** | VIP orders (priority 1 get served before priority 3) | Regular orders may starve if VIPs keep arriving |
| **SJF** | Lowest average turnaround | Short orders run first; long orders may wait a long time (starvation) |

## Allocator Comparison

| Allocator | Strategy | Effect |
|-----------|----------|--------|
| **First Fit** | First hole that fits | Fast; can leave small unusable fragments at the front |
| **Best Fit** | Smallest hole that still fits | Minimal waste per allocation; more fragmentation over time |
| **Worst Fit** | Largest hole | Leaves large leftovers — good when future requests are large |

---

## WebSocket Protocol Summary

| Client → Server (`type`) | Payload | Effect |
|--------------------------|---------|--------|
| `start` | `scheduler, allocator, orders, tick_ms, unsafe_demo` | Runs simulation, streams frames |
| `pause` | — | Server stops sending frames |
| `resume` | — | Server resumes from where it paused |
| `step` | — | Server sends exactly one frame then pauses |
| `speed` | `tick_ms` | Changes ms between frames (1000 = 1 frame/s, 100 = 10 frames/s) |
| `stop` | — | Cancels the current run |

| Server → Client (`type`) | Meaning |
|--------------------------|---------|
| `hello` | Sent on connect; lists available schedulers, allocators, equipment |
| `started` | Simulation accepted; includes frame_count and end_time |
| `frame` | One simulation event tick; contains process states, pool state, resource state |
| `results` | Final metrics (processes, summary, pools, resources, checks) |
| `deadlock` | Circular wait detected (only in `unsafe_demo` mode) |
| `done` | Stream finished |
| `error` | Invalid message or bad input |

---

## Running It Locally

```bash
# Build everything
make && make server

# Start the WebSocket server
./restaurant_server          # listens on ws://127.0.0.1:8080

# Open the browser viewer
open http://127.0.0.1:8080

# Or run the CLI directly (no browser)
./restaurant tests/a3/integrated.txt FCFS FIRST_FIT out.csv
cat out.csv
```

The server also serves the `web/` directory over HTTP so `http://127.0.0.1:8080`
opens the simulator automatically.
