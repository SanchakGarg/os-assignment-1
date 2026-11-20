# Sanchak's work: make the restaurant simulation behave correctly

Read [the team plan](../../plan.md) first, then [the shared data guide](../shared-data.md). Your part is the C simulation: which orders can enter, which chef cooks them, what changes over time and what the final numbers are.

## Files you will work on

Existing: `restaurant.h`, `sim.c`, `sched.c`. Add focused files such as `memory.c`, `memory.h`, `resource_input.c` and a calculation module as needed. Put the shared definitions in clearly named headers; you do not need to reorganize the entire repository.

Anam owns process-file reading, CLI and CSV formatting. Abhinav owns equipment threads, JSON writing and the whole browser/assets side. Coordinate small header/build changes rather than editing each other's implementation.

## A2: tasks in order

1. **Define the shared data.** Extend Process with SPACE/TABLE requests, memory-admission time, exact allocated ranges and the new BLOCKED_MEMORY state. Define configuration, snapshot and final-result structures using the fields in the data guide. Share these headers with Anam and Abhinav in an early commit.
2. **Represent the pools.** SPACE has six slots, TABLE has three. A slot records the owning order or is free. This makes freeing slots and finding adjacent free slots straightforward.
3. **Write three placement functions.** First Fit chooses the first suitable free run; Best Fit the smallest suitable run; Worst Fit the largest. Equal-sized runs choose the lower start index. For example, a request for two slots cannot use two isolated single free slots.
4. **Allocate both pools together.** Find a valid placement in each before marking either occupied. A failed TABLE request must not leave SPACE reserved. TABLE request zero needs no table range.
5. **Add the waiting queue.** Orders enter in arrival order; equal arrivals use lexicographic ID order. Only try the queue's head. If it cannot fit, later orders cannot bypass it. After admitting it, try the next head.
6. **Connect scheduling.** Only admitted orders become READY. Keep FCFS, non-preemptive PRIORITY and SJF. At most two chefs cook at once; lower-numbered free chef gets assigned first. READY orders keep their slots until completion.
7. **Handle simultaneous events.** At time t, finish/release orders in ID order, add arrivals in ID order, attempt admission, then dispatch. Jump to the next event instead of sleeping.
8. **Calculate results.** Use the formulas in the data guide. Record peak occupancy and maximum fragmentation at allocation/release changes; accumulate occupied-slot time between events.
9. **Send complete snapshots to Abhinav.** After a consistent group of changes, call the shared snapshot callback. Include all processes, chef assignments, slot owners, queues, resource state and the events explaining what changed. You supply C data; Abhinav writes JSON.

## A3: tasks in order

1. Read the optional resource definitions and actions after Anam's process parser finishes. An A2 input ending there means zero resource actions. Follow Final Project §8 exactly.
2. Actions use **cooking already performed**, not absolute clock time. An action at offset 2 happens after that order has executed two service units. Preserve listed order for actions at the same offset.
3. Stop the simulation at the next arrival, completion or due action. Ask Abhinav's equipment manager to acquire/release the resource. Do not simulate equipment ownership separately.
4. If acquisition returns BLOCKED, mark BLOCKED_RESOURCE, give up the chef, retain memory and pause service. A later grant makes the order READY, not automatically RUNNING.
5. Apply each worker answer once. Finish all consequences at the current timestamp before advancing time. Allow independent workers to overlap; do not serialize all resource operations through one worker.
6. Handle releases at offset SERVICE before termination. Calculate resource waiting separately from ready waiting. Copy resource counters from Abhinav's manager into the final results.
7. Keep resource-free A3 runs numerically identical to A2. Add integration tests using real workers after your test equipment adapter works.

## What you give the others

| Recipient | Deliverable |
| --- | --- |
| Anam | Shared headers; calculated `SimulationResult`; a hand-filled result example so CSV work can start early |
| Abhinav | Snapshot callback calls with the full data listed in the guide; commands describing due resource actions |
| Whole team | Runnable A2/A3 core; small correctness inputs and expected answers; notes explaining event ordering and metrics |

## Check your work with these cases

- Exact fit, full-capacity request, zero TABLE request, equal-sized holes and fragmented free space.
- Failure in one pool leaves both unchanged; a small order cannot bypass a blocked head.
- Unsorted input, simultaneous arrivals/completions, lexicographic IDs such as O10/O2, and initial idle time.
- An admitted READY order keeps its allocation. On completion all its slots are freed.
- In A3, resource-blocked orders consume no service; unblock leads back through scheduling; all acquisitions/releases finish correctly.
- All nine scheduler/allocator combinations work. Repeated A2 runs have identical output. Memory/ready/resource waiting add up correctly.

You can begin using orders constructed directly in C. You do not need to wait for Anam's parser, Abhinav's browser or the real worker manager.

## Suggested feature commits

1. Shared process/result/snapshot definitions.
2. Contiguous placement algorithms and checks.
3. Atomic FIFO admission and release.
4. Scheduling integration and calculated A2 results.
5. Resource/action parser.
6. Resource blocking/service-offset integration and A3 calculations.

## Instruction to give your agent

> Work on Sanchak's part of this restaurant project. Read `plan.md`, `docs/tasks/sanchak.md` and `docs/shared-data.md`, then inspect the existing C implementation and restaurant sections of both assignment PDFs. Implement the tasks in this brief, preserving FCFS/PRIORITY/SJF and the exact assignment behavior. Start with shared definitions and small known-answer tests. Use test inputs/worker answers while other modules are unfinished, then connect the real implementations. Own the simulation, memory, resource-action parser and metric calculations; do not implement JSON, the browser, assets, Anam's parser or CSV formatting. Coordinate shared headers and build edits. Keep each complete feature in a focused commit. At handover, report changed files, commits, run/test commands, expected output and remaining integration needs. Explain the implementation so I can understand it for the viva. Ask about genuinely missing decisions instead of silently changing the agreed behavior.
