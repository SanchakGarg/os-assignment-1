# Edge cases: Smart Restaurant 

These are **12 high-value, valid test inputs** for Sanchak to run against the merged simulator. They do not replace the existing valid/invalid input tests or the existing A3 samples. All input process sections have been accepted by the uploaded seven-field parser. Full simulator behavior is **not yet verified**; treat the expectations below as assertions to check, not results already observed.

## A2 — 6 focused tests

| File | Why run it | Expected behavior |
|---|---|---|
| `01_single_order.txt` | Known-answer baseline | O1 begins at 0, completes at 2, all waiting = 0; SPACE peak 2, TABLE peak 1, throughput 0.5, service utilization 50%; no fragmentation |
| `02_simultaneous_arrivals_unsorted.txt` | Same-time arrivals and unsorted IDs | Admission uses lexicographic IDs (O1, O10, O2, O9), regardless of input row order; two chefs maximum |
| `04_table_pool_atomicity.txt` | Two-pool atomic allocation | A occupies all 3 TABLE slots at t=0; B and then C cannot get admitted before A completes at t=5, even though SPACE has room; neither may reserve SPACE early |
| `05_fifo_head_of_line.txt` | FIFO cannot bypass head | A uses 4 SPACE, B fills other 2 at t=1. At t=2 C requests 3 slots but cannot fit, and D (requests 1) cannot overtake C despite being small |
| `07_fragmentation_and_fit.txt` | First/Best/Worst Fit yield different placements | Under FCFS, Best Fit admits B2 at t=3; First Fit and Worst Fit only admit B2 at t=10. Compare `MEM_WAIT` and fragmentation. (A1–A4 creates gaps of 2 and 1 slots.) |
| `09_simultaneous_completions.txt` | Event ordering at same tick | A/B finish at t=3 and release slots **before** C/D arrivals are considered; C can be admitted at t=3 |

## A3 — 6 focused tests

| File | Why run it | Expected behavior |
|---|---|---|
| `01_resource_free_baseline.txt` | A3 must reproduce A2 | Same A2 values with RESOURCE_WAIT=0, CHECK rows `0,0,1`, no RESOURCE rows |
| `03_simultaneous_different_ovens.txt` | Independent resources | A uses OVEN_1 while B uses OVEN_2; both may progress concurrently; resource wait 0; never more than one owner per instance |
| `04_same_resource_contention.txt` | Exclusive ownership, blocked/wakeup | A and B request MICROWAVE at offset 1; one blocks, gives up a chef but retains memory; later resumes; wait events >=1, at least one resource wait > 0 |
| `06_release_at_service_end.txt` | Terminal-offset actions | A/B each RELEASE COFFEE_MACHINE at offset SERVICE=2 **before** TERMINATED; no leaked owner |
| `07_memory_before_resource.txt` | A1/A2/A3 lifecycle integration | C arrives at t=1 requesting 3 SPACE while A/B own all 6; C cannot ACQUIRE OVEN_1 until full memory admission |
| `08_circular_wait_unsafe_demo.txt` | Deadlock challenge | Unsafe *bounded* demo shows circular wait between MICROWAVE and OVEN_1; normal prevention must complete or explicitly identify an unsatisfiable request, never hang |

## Commands — after simulator merge

```sh
make
# Example A2 case across all 9 combinations
for sched in FCFS PRIORITY SJF; do
  for alloc in FIRST_FIT BEST_FIT WORST_FIT; do
    ./restaurant tests/a2/edge/07_fragmentation_and_fit.txt "$sched" "$alloc" "/tmp/a2_${sched}_${alloc}.csv" --phase a2
  done
done

# Example A3 concurrency case
./restaurant tests/a3/edge/04_same_resource_contention.txt FCFS FIRST_FIT /tmp/a3_contention.csv --phase a3
```

Important: Inspect resulting PROCESS, SUMMARY, POOL, RESOURCE and CHECK lines and (for A3) thread/event evidence. The CSV alone does **not** prove actual threaded concurrency; Abhinav must demonstrate real overlapping worker activity.

If the project retains the temporary `a2_sim_stub.c`, A2 runs will intentionally fail and cannot be evaluated. Keep your existing invalid-input tests; these 12 files are intentionally valid behavioral edge cases.
