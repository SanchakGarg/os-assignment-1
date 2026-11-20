# Shared data: what our parts give each other

Use this when implementing a task, rather than trying to guess another person's output. The names below are our proposed shared design. These headers, functions and examples still need to be implemented; they are not existing APIs.

A **snapshot** means a complete picture of the restaurant at one simulation time. A **callback** is just a function the simulator calls to pass that picture to the recording writer. A **fixture** is a small saved example used for testing.

## 1. The C handovers

| Handover | Sender → receiver | What must be included |
| --- | --- | --- |
| `Workload` | Anam → Sanchak | N, Q and process records; Sanchak adds optional resource definitions/actions |
| `SimulationConfig` | Anam → Sanchak | A2/A3, FCFS/PRIORITY/SJF, FIRST_FIT/BEST_FIT/WORST_FIT, normal/unsafe-demo mode and prevention-policy selection |
| `ResourceCommand` | Sanchak → Abhinav | Unique command ID, simulation time, process ID, action index, work offset, ACQUIRE/RELEASE and resource ID |
| `ResourceAnswer` | Abhinav → Sanchak | Matching command ID, GRANTED/BLOCKED/RELEASED/ERROR, changed owner and any newly granted waiting orders |
| `SimulationSnapshot` + events | Sanchak → Abhinav | Time/sequence, every order's state/progress, chef assignments, slot owners, ordered queues and copied equipment state |
| `SimulationResult` | Sanchak → Anam and Abhinav | Per-process results, summary, pool results, resource counters and safety checks; numbers already calculated |

Sanchak creates the C type definitions in shared headers. Abhinav supplies the resource interface and snapshot callback declaration with him. Anam uses those headers. Do not independently define three different versions of Process or Result.

Suggested function names to agree in that first shared commit:

```c
/* Signatures describe the intended connection; definitions/types are future work. */
int read_process_section(FILE *input, Workload *out, Error *error);
int read_resource_sections(FILE *input, Workload *out, Error *error);
int simulate(const Workload *input, const SimulationConfig *config,
             ResourceManager *resources, SnapshotCallback callback,
             void *callback_context, SimulationResult *out, Error *error);
int write_standard_csv(FILE *output, const SimulationResult *result,
                       Phase phase, Error *error);
void record_snapshot(const SimulationSnapshot *snapshot,
                     const SimulationEvents *events, void *context);
```

Use a consistent success/error return convention in the actual header. `record_snapshot` must save any write error in its writer context so the CLI can report it. Anam's process parser leaves the stream at the resource section; Sanchak's resource parser treats EOF/trailing blank lines as no resource actions, otherwise requires both R and K sections. Modules report errors; `main.c` decides the exit code and prints messages.

**Who can change the data:** the simulator changes process/time/memory state; the equipment manager changes equipment ownership under its mutex. The simulator copies equipment answers before making process changes. The writer only reads snapshots, and the browser reads its own parsed JSON. Snapshot pointers are valid only during the callback: the writer must serialize or copy them before returning. Do not hold a resource lock while invoking the callback or writing files.

The simulator calls the callback after a consistent group of changes, including the first settled arrival and final cleanup. Allocate both memory pools together before sending a snapshot. Same-time changes keep their recorded sequence order. Supply meaningful event names/reasons so the viewer can explain what happened.

## 2. Exactly what a process and its results contain

Input fields: `id, arrival, priority, service, category, space_req, table_req`.

During simulation, also keep: state, service already executed, remaining service, assigned chef or none, allocation ranges, memory-admission time, first-start time, completion time and accumulated waiting intervals. Use states `NEW`, `BLOCKED_MEMORY`, `READY`, `RUNNING`, `BLOCKED_RESOURCE`, `TERMINATED`; A2 never uses BLOCKED_RESOURCE.

Sanchak's final per-process results, also used as JSON keys:

```text
id, arrival, priority, service, start, completion,
waiting, turnaround, response, mem_admit, mem_wait, ready_wait, resource_wait
```

For arrival A, memory admission M, first start S, completion C and service demand B:

| Number | Calculation |
| --- | --- |
| Turnaround | C − A |
| Response | S − A |
| Total waiting | C − A − B |
| Memory waiting | M − A |
| Resource waiting | Total simulation time spent BLOCKED_RESOURCE; zero in A2 |
| Ready waiting | Total waiting − memory waiting − resource waiting |

Let E = last completion − first arrival. Throughput is N/E; chef utilization is sum(service)/(2E) × 100. Each pool's utilization is its occupied-slot-time divided by capacity × E, multiplied by 100. Fragmentation at a state is total free slots minus the largest continuous free run; report its maximum. Also report peak occupied slots and how many orders failed to receive their full allocation at arrival. Count each such order once, including orders waiting behind a blocked head.

Summary keys: `average_waiting, average_turnaround, average_response, throughput, service_utilization_pct, average_memory_wait, completed_count, blocked_for_memory_count`.

Pool result: `id, capacity, peak_occupied, utilization_pct, max_ext_frag_slots`.

Resource result: `id, capacity, max_simultaneous_holders, acquisitions, wait_events`.

Final checks: `exclusivity_violations, unresolved_deadlocks, completed_count`. Successful normal A3 runs have the first two zero and the last equal to N. A2 has no resource results/checks; internally resource wait can be zero.

## 3. The exact CSV Anam writes

Use the two PDFs as the source of truth for graded input/output. These lines show field order; actual rows contain values, no header or placeholder words.

```text
PROCESS,ID,ARRIVAL,PRIORITY,SERVICE,START,COMPLETION,WAITING,TURNAROUND,RESPONSE,MEM_ADMIT,MEM_WAIT,READY_WAIT
SUMMARY,AVERAGE_WAITING,value
SUMMARY,AVERAGE_TURNAROUND,value
SUMMARY,AVERAGE_RESPONSE,value
SUMMARY,THROUGHPUT,value
SUMMARY,SERVICE_UTILIZATION_PCT,value
SUMMARY,AVERAGE_MEMORY_WAIT,value
SUMMARY,COMPLETED_COUNT,value
SUMMARY,BLOCKED_FOR_MEMORY_COUNT,value
POOL,SPACE,6,PEAK_OCCUPIED,UTILIZATION_PCT,MAX_EXT_FRAG_SLOTS
POOL,TABLE,3,PEAK_OCCUPIED,UTILIZATION_PCT,MAX_EXT_FRAG_SLOTS
```

For A3, append RESOURCE_WAIT to each PROCESS row, then add these after the two POOL rows:

```text
RESOURCE,RESOURCE_ID,CAPACITY,MAX_SIMULTANEOUS_HOLDERS,ACQUISITIONS,WAIT_EVENTS
CHECK,EXCLUSIVITY_VIOLATIONS,value
CHECK,UNRESOLVED_DEADLOCKS,value
CHECK,COMPLETED_COUNT,value
```

Sort PROCESS rows lexicographically by ID and RESOURCE rows by resource ID. Emit all SUMMARY lines in the order shown. A resource-free A3 run still has CHECK rows but no RESOURCE rows. Keep times/counts integer, decimal statistics accurate within `10^-3`, and debug messages out of the CSV. Do not write a successful-looking output for an incomplete run.

## 4. The JSON Abhinav writes and reads

This is separate from the required CSV. Use version 1 and the following top-level fields:

| Field | Contents | Where the values come from |
| --- | --- | --- |
| `schema_version` | `1` | Abhinav's writer |
| `run` | `id, phase, scheduler, allocator, prevention_policy, mode, origin, status, time_unit, end_time` | Validated configuration and Sanchak's completed run; Abhinav adds recording metadata |
| `model` | `chef_count: 2`, pools `{SPACE:6,TABLE:3}`, full input `processes`, declared `resources` | Anam's process records, Sanchak's validated model |
| `frames` | Full snapshots in recorded order, as shown below | Sanchak supplies state; Abhinav supplies equipment information and writes JSON |
| `results` | `processes, summary, pools, resources, checks`, with the keys in section 2 | Sanchak's calculated results, including Abhinav's resource counters |
| `worker_evidence` | Recorded real-thread operations; empty for A2 | Abhinav's worker manager |

Run values: phase `A2`/`A3`; mode `BASELINE`/`SAFE`/`UNSAFE_DEMO`; origin `RECORDED`/`SYNTHETIC`; status `COMPLETE`; time unit `virtual_tick`. Use `NONE` as the prevention policy in A2; name the selected actual policy in safe A3 runs. Synthetic examples must be clearly labeled. Normal generated recordings contain completed runs, not half-written output.

A frame is a full picture, not just a list of differences. This lets the viewer jump to any frame without replaying everything before it. Include every process in every frame; owner arrays use process IDs and `null` for free. Chef numbers are zero-based, not worker-thread IDs.

Here is a **frame example**, not a complete importable recording:

```json
{
  "seq": 0,
  "time": 0,
  "events": [
    {"type":"ARRIVE","process_id":"O1","chef_id":null,"resource_id":null,"reason":"arrival"},
    {"type":"MEMORY_ADMIT","process_id":"O1","chef_id":null,"resource_id":null,"reason":"both pools fit"},
    {"type":"DISPATCH","process_id":"O1","chef_id":0,"resource_id":null,"reason":"FCFS"}
  ],
  "processes": [
    {"id":"O1","state":"RUNNING","executed_service":0,"remaining_service":2,"chef_id":0,"waiting_for":[]}
  ],
  "chefs": ["O1", null],
  "pools": {"SPACE":["O1","O1",null,null,null,null],"TABLE":["O1",null,null]},
  "queues": {"memory":[],"ready":[],"resource":{}},
  "resources": []
}
```

| Frame field | Exact expectation |
| --- | --- |
| `seq`, `time` | seq starts at 0 and increases by one; time is a nonnegative integer and never decreases; equal-time frames are allowed |
| `events` | Ordered explanations with the five keys shown; unused IDs are null |
| `processes` | Every process with the seven keys shown; executed + remaining = service; chef is null unless RUNNING; `waiting_for` lists resource IDs and is otherwise empty |
| `chefs` | Exactly two entries: current process ID or null |
| `pools` | Exactly six SPACE entries and three TABLE entries, in address order |
| `queues` | Actual ordered memory/ready queues; `resource` maps resource IDs to ordered waiting process IDs; do not sort them for appearance |
| `resources` | Declared resources as `{id, holder, waiters}`; holder is an ID or null; waiters agree with the resource queues; A2 uses `[]` |

Event types: `ARRIVE`, `MEMORY_BLOCK`, `MEMORY_ADMIT`, `DISPATCH`, `RESOURCE_ACQUIRE`, `RESOURCE_BLOCK`, `RESOURCE_RELEASE`, `RESOURCE_UNBLOCK`, `COMPLETE`, `DEADLOCK_CYCLE`, `PREVENTION_APPLIED`.

Each worker-evidence entry has `seq, worker_id, process_id, action, resource_id, wall_start_ns, wall_end_ns, outcome`. Wall timing is relative to a common monotonic start and separate from simulation ticks. Record actual workers and operations, not synthetic proof of concurrency. Keep JSON integers exactly representable in JavaScript, or agree a string representation before changing the format. Escape strings and never emit NaN/Infinity. A2 uses `worker_evidence: []`, `results.resources: []`, `results.checks: null`.

At a given playback time, display the latest applicable snapshot; next-frame steps follow seq, even at equal times. Interpolate cooking only while that process remains RUNNING on the same chef. Never interpolate ownership or recalculate final metrics from animation.

Abhinav prepares complete sample recordings for one-order A2, FIFO blocking, resource contention and independent ovens, plus invalid examples. Sanchak checks their simulation meaning. Their names/format stay the same when actual C recordings replace the samples.

## 5. A common small example everyone can check

A2 input:

```text
1
2
O1,0,2,2,NORMAL,2,1
```

With any required scheduler/allocator, O1 is admitted and starts at 0, finishes at 2, and releases its two SPACE slots and one TABLE slot. The first frame can be the example above; the last frame has TERMINATED, executed=2, remaining=0, empty slots/queues and no assigned chef.

Expected results: turnaround=2; response and all waits=0; throughput=0.5; chef utilization=50%; SPACE utilization=33.333…%; TABLE utilization=33.333…%; peaks 2/1; maximum fragmentation 0/0; completed=1; blocked-for-memory=0. Anam can format this from a manually filled result, Sanchak can calculate it from C, and Abhinav can animate a hand-written recording of it.

## 6. How A3 connects without getting stuck

```mermaid
sequenceDiagram
    participant S as Sanchak's simulation
    participant B as Abhinav's equipment manager
    participant J as Abhinav's recording writer
    S->>B: Due action: order, equipment, work offset, command ID
    B->>B: Real workers check/update ownership under a mutex
    B-->>S: Grant, block or release; include newly granted waiters
    S->>S: Update order state, chef assignment and waiting times
    S->>J: Complete snapshot and ordered events
    S->>S: Advance clock after current-time work is settled
```

The equipment manager owns resource queues; the simulator owns process state. A blocked order gives up its simulated chef but keeps memory. It must not trap a real worker that is needed to release another resource. Condition variables wait for work/results with predicates checked in loops; no sleep-based correctness. Do not advance past unresolved action answers, apply duplicate answers or count blocked time as cooking. Run offset-SERVICE releases before finishing the order.

Before implementing prevention, Abhinav and Sanchak decide how their policy handles the required ordered action streams without silently changing them. Record the choice and its limitations. Unsafe demos are separate and bounded; safe normal runs complete or explain a genuinely unsatisfiable request.

## 7. Commands and compatibility

Proposed commands, to implement and document:

```text
restaurant_cli case.txt FCFS FIRST_FIT result.csv --phase a2 --trace run.trace.json
restaurant_cli case.txt PRIORITY BEST_FIT result.csv --phase a3 --trace run.trace.json
```

Anam owns argument handling; Sanchak owns simulation configuration; Abhinav owns trace writing. Keep the four positional standard arguments usable, and document what happens when optional phase/trace flags are absent. The default final executable can use A3 output; the A2 release must still export the A2 format. Keep old five-field tests behind an explicit legacy path.

Browser file input reads local recording content; file extension alone is not enough to identify it. No server needs to execute C. Changing scheduler/allocator means generating another recording. Test the native C/thread backend separately from browser compatibility.

If a shared name or meaning needs to change, tell the affected teammate, update this guide and the small examples, then change both sides together. Keep the interface change in a focused commit.
