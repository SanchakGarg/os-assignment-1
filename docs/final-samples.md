# Final project: sample inputs and checks

*Owner: Anam. The README's final-project section builds on this.*

The final input format is the A2 format followed by two optional sections: R equipment rows, then K action rows. An unchanged A2 input is therefore a valid final-project input with no equipment use.

```text
N
Q
ID,ARRIVAL,PRIORITY,SERVICE,CATEGORY,SPACE_REQ,TABLE_REQ   (N rows)
R
RESOURCE_ID,CAPACITY                                       (R rows)
K
ID,WORK_OFFSET,ACTION,RESOURCE_ID,UNITS                    (K rows)
```

`WORK_OFFSET` counts the units of the order's own cooking already done, not the clock time. The equipment names are the spec's: `MICROWAVE`, `OVEN_1`, `OVEN_2` and `COFFEE_MACHINE`, each with capacity 1.

Every sample was checked against the spec's rules:
- section counts match;
- resources are declared and standard;
- offsets run from 0 to SERVICE and never decrease within an order;
- every RELEASE matches a held unit;
- every ACQUIRE is released by offset SERVICE.

## The samples (`tests/a3/`)

| File | Demonstrates (spec section 10 / 13) | What should happen |
| --- | --- | --- |
| `baseline_no_resources.txt` | (i) Resource-free baseline: the A1 comparison workload with memory requests and no equipment sections | Same numbers as A2, `RESOURCE_WAIT=0`, CHECK rows `0, 0, 10`, no RESOURCE rows |
| `baseline_explicit_zero.txt` | Same input with explicit `R=0`, `K=0` | Identical to the previous file |
| `allocator_difference.txt` | (ii) Allocators place orders differently and change memory waiting | See the trace below |
| `contention_same_oven.txt` | (iii) Two orders reach `OVEN_1` at the same offset at the same time | One gets the oven, and the other blocks, gives up its chef and keeps its slots. It resumes after the release at offset 3. Its `RESOURCE_WAIT` > 0 and `OVEN_1` has ≥ 1 wait event. |
| `independent_ovens.txt` | (iii) Two different ovens used at once | Both cook at the same time with no blocking, and every `RESOURCE_WAIT` is 0 |
| `deadlock_unsafe.txt` | (iv) Circular wait: O1 takes `MICROWAVE` then `OVEN_1`, while O2 takes `OVEN_1` then `MICROWAVE` | Unsafe demo mode: both block at offset 1 with a wait-for cycle, which must be detected and reported within a bounded time. Normal mode: the prevention policy stops the cycle and both orders complete. |
| `deadlock_safe_order.txt` | (iv) The same two orders and equipment in one global order (`MICROWAVE` before `OVEN_1`) | No cycle is possible; the second order simply waits for the microwave |
| `integrated.txt` | (v) Everything together. O3 is memory-blocked on arrival at t=1, because O1 and O2 hold 5 of the 6 SPACE slots. O1 blocks on `OVEN_1` at t=1, which O2 holds until its offset 2. All four pieces of equipment are used, in an order consistent with `COFFEE_MACHINE < MICROWAVE < OVEN_1 < OVEN_2`. | All 6 orders complete with CHECK rows `0, 0, 6`. Exact later timings depend on the scheduler. |

### Hand trace: `allocator_difference.txt` with FCFS

Assumptions: at each time step, completions free memory first; then the FIFO memory queue admits from its head; then free chefs pick READY orders.

1. At t=0, A1–A4 fill the SPACE pool in order: `[A1 A1 A2 A3 A4 A4]`. With one free run at a time, all three allocators agree.
2. A1 finishes at t=1 and A3 at t=2. A2 and A4 keep both chefs busy until t=10 and t=12. The pool is now `[_ _ A2 _ A4 A4]`: one 2-slot gap and one 1-slot gap.
3. At t=3, B1 (needs 1 slot) and B2 (needs 2) arrive:

| Allocator | B1 goes to | B2 | B2 memory wait | Blocked for memory |
| --- | --- | --- | --- | --- |
| First Fit | slot 0, the first gap | no 2-slot gap left, so it waits until A2 frees slot 2 at t=10, then gets slots 1–2 | 7 | 1 |
| Best Fit | slot 3, the exact-size gap | slots 0–1 immediately | 0 | 0 |
| Worst Fit | slot 0, the largest gap | same as First Fit | 7 | 1 |

**Why total waiting doesn't change:** with Best Fit, B2 holds memory from t=3, but both chefs are busy until t=10 and t=12, so it starts at t=12 in every case. The time moves from *memory waiting* (7) to *ready waiting* (9). It shows that a better allocator does not help when the chefs are the bottleneck.

The same trace was reproduced with a small independent reference model. Sanchak's simulator should give these values for FCFS. If it doesn't, either the assumptions above differ or there is a bug.

## Deadlock: the four conditions in our kitchen

| Condition | In the restaurant | Present? |
| --- | --- | --- |
| Mutual exclusion | Only one order can use `OVEN_1` at a time | Yes, required by the spec |
| Hold and wait | O1 keeps the microwave while waiting for the oven | Yes |
| No preemption | Equipment is never taken away from an order | Yes |
| Circular wait | O1 waits for O2's oven while O2 waits for O1's microwave | Only with opposite orders, as in `deadlock_unsafe.txt` |

Our prevention policy breaks **circular wait**: ordered acquisition with rollback. The global rank is `COFFEE_MACHINE < MICROWAVE < OVEN_1 < OVEN_2`, and a worker only waits for a unit ranked above everything it holds. In `deadlock_unsafe.txt` in normal mode, O2 asks for `MICROWAVE` while holding `OVEN_1`. It first gives `OVEN_1` back (`ROLLBACK` in the trace), then waits for `MICROWAVE` and takes both again in rank order. Both orders complete. The cost falls on the out-of-order order, which waits 3 instead of 0. Orders that follow the global order pay nothing. With `--unsafe-demo`, the cycle forms, is detected at t=1 and the run stops with exit code 5. Full details are in the README under "Deadlock".

## Checks

```sh
make
sh scripts/check_a3_baseline.sh   # resource-free inputs: A3 output = A2 output + RESOURCE_WAIT=0 + CHECK rows (all 9 combinations)
sh scripts/check_a3_samples.sh    # every sample, all 9 combinations, normal mode
```

`check_a3_samples.sh` checks the following on every result:
- the run finishes within a time limit, with no hang;
- `WAITING = MEM_WAIT + READY_WAIT + RESOURCE_WAIT` (spec section 7), `TURNAROUND = COMPLETION − ARRIVAL` and `WAITING = TURNAROUND − SERVICE`;
- one RESOURCE row per declared resource, sorted by ID;
- the CHECK rows are `0, 0, N`;
- `independent_ovens.txt` has no resource waiting;
- `contention_same_oven.txt` has at least one `OVEN_1` wait.

Both scripts were tested against a correct fake program, which passed, and a deliberately broken one, which failed as it should.
