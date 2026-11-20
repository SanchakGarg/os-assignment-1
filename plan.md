# Smart Restaurant: A2 and A3 delivery plan

Status: implementation plan, prepared November 20, 2026. This document plans future work; its checkboxes do not claim implementation. No implementation or asset generation is part of this planning change.

## 1. Scope, authority, and confirmed decisions

The user's request is to review the existing work and produce this plan. The attached specifications supply the assignment requirements; their submission instructions are recorded as future team tasks, not instructions to submit or modify anything now. Only the **Smart Restaurant** scenario applies.

Confirmed with Abhinav:

- A3 means the attached **Final Project**.
- Both A2 and A3 are due **November 21, 2026, end of day**. The joint presentation/viva is **November 23**: five minutes presenting and five minutes answering questions.
- The team is **Abhinav, Sanchak, and Anam**, all equally proficient.
- Abhinav wants primary ownership of **mutexes/synchronization and visualization**.
- The graphical application should be a **native C desktop application for Windows and macOS**, with an in-app menu for choosing an input case and viewing its simulation.
- Deliver A2 and A3 as separate, independently runnable checkpoints and archives, even though development shares one repository.

Proposals in this plan: SDL3, CMake, module boundaries, exact teammate task allocation, asset dimensions, and commit/review conventions. These are engineering recommendations, not requirements imposed by the PDFs. Final art style, minimum OS versions/CPU architectures, available test machines, and the particular deadlock-prevention policy remain decisions to settle before their dependent implementation. Until then, do not claim compatibility with untested targets or invent a detailed visual theme.

Source references use PDF sections/pages:

- [A2 specification](OSLab_CS_3710__A2_Specifications.pdf): restaurant mapping and admission §§3–6, metrics/input/output §§7–9, comparisons and delivery §§10–15.
- [Final/A3 specification](OSLab_CS_3710__Final_Project_Specifications.pdf): resources and concurrency §§3–5, deadlock §6, retained semantics and contracts §§7–9, integrated demonstration and submission §§10–14.

## 2. Current repository assessment

Reviewed working tree at commit `d1e9858`, including the locally modified README. Existing README edits, untracked PDFs, and untracked `restaurant`/`gantt_chart` executables belong to the existing workspace and must not be accidentally staged or overwritten.

| Area | Existing work | Next action |
| --- | --- | --- |
| Scheduling | `sched.c`: FCFS, non-preemptive PRIORITY, SJF; deterministic arrival/ID tie-breaking | Preserve; only READY orders are eligible |
| Simulation | `sim.c`: event-driven virtual time, two chefs, arrivals/completions | Add memory admission and later resource actions; retain two execution units |
| Model | `restaurant.h`: NEW/READY/RUNNING/TERMINATED and service fields | Add allocation metadata, waiting states, action progress, trace interfaces |
| Input | `input.c`: five-field A1 records using `fscanf` | Strict seven-field A2 records, then optional A3 sections; diagnose malformed data |
| Reporting | `metrics.c`: A1 human-readable CSV-like output | Versioned A2/A3 standard exports; more decimal precision |
| Visualization | `gantt_chart.c`: terminal chart parses current A1 stdout via `popen` | Preserve as legacy tooling or adapt; use structured events for desktop visualization |
| Tests | Shell scripts, fixtures, expected scheduling rows | Preserve A1 checks; add A2/A3 oracles and portable test execution |
| Build | Small Makefile, no graphical or concurrency dependency | Keep a simple CLI path; add portable desktop/thread builds and release packaging |
| Docs | A1 README, including stale statement that schedulers are placeholders | Correct descriptions when corresponding changes land |

Baseline verification on November 20, in a temporary copy so local binaries were untouched:

- `make`: passed, with three unused `t` parameter warnings in scheduler functions.
- `sh tests/edge/check_rows.sh`: **30 passed, 0 failed**.
- `sh tests/test_priority.sh`: passed.
- `sh tests/gantt_chart_test.sh`: passed.

Limits of that evidence: the row-check script runs ten edge input files × three algorithms; it does not exercise every expected-output file in the repository. `tests/run_all.sh` prints results rather than asserting them. These checks establish an A1 baseline, not A2/A3 correctness or Windows compatibility.

Concrete gaps: no contiguous allocator, admission FIFO, memory metrics, standardized A2 export, resource action parser, real workers, synchronization, deadlock prevention, or native graphical application. Parser validation lacks many required range/uniqueness checks. Existing two-decimal statistics may violate the new `10^-3` tolerance. The Gantt parser depends on the old header and fixed field positions and cannot represent resource-blocked service intervals correctly.

## 3. Team ownership and review

These assignments distribute substantive engineering work; proficiency is not the basis for division. Each owner writes the implementation, meaningful checks, and explanatory notes for their area. Review ownership makes integration a shared responsibility.

| Person | A2 ownership | A3 ownership | Review and demonstration |
| --- | --- | --- | --- |
| **Abhinav** | Event/snapshot interface, native app foundation, input-case menu, memory/chef visualization | Real worker model, mutexes/conditions, shared-resource ownership, prevention and bounded unsafe demo; graphical integration | Review memory safety with Sanchak; present synchronization and visualization |
| **Sanchak** | Contiguous SPACE/TABLE pools, First/Best/Worst Fit, atomic two-pool admission, FIFO, allocation lifetime, fragmentation/utilization | Resource-action parsing/validation, work-offset integration with memory lifecycle, contention/deadlock test workloads | Review Abhinav's ownership invariants; present admission and allocation |
| **Anam** | Input validation, scheduler/coordinator integration, exact exports/metrics, comparison runner, portable build/test/release foundation | Resource waiting metrics, A2 baseline compatibility, final exports, release packaging and cross-platform checks | Review state/trace integration; present scheduling and results |

Abhinav has two requested major areas, so avoid making all UI support his responsibility: Sanchak handles sprite slicing/asset inventory and test workloads; Anam handles menu configuration data, build/package integration, and test execution. Abhinav owns rendering behavior and art direction. All three review the final integrated demo and practice explaining each other's modules.

Shared-file rule: agree interface changes to `restaurant.h`, `sim.c`, `main.c`, and the build files before editing them concurrently. Anam coordinates core interface integration; other owners prefer their own modules and small interface PRs. Avoid unrelated formatting churn during this deadline.

## 4. Architecture and portability proposal

Use the existing **C simulation core**, a **CLI**, and a **native SDL3 desktop frontend**. SDL supplies a C API for Windows/macOS graphics and native threading primitives, avoiding a POSIX-only pthread implementation that would need a second Windows backend. Pin an exact tested SDL3 release during implementation; do not depend on a moving branch.

Official references: [SDL platform support](https://www.libsdl.org/), [threads](https://wiki.libsdl.org/SDL3/SDL_CreateThread), [mutexes and conditions](https://wiki.libsdl.org/SDL3/CategoryMutex), [rendering thread requirement](https://wiki.libsdl.org/SDL3/SDL_RenderTexture). SDL rendering belongs on the main thread. This stack is a proposal supported by those capabilities, not a claim that a portable app already exists.

Logical modules (create incrementally, rather than reorganizing everything first):

| Module | Contract | Owner |
| --- | --- | --- |
| Input/configuration | Validated workload; no simulation side effects | Anam; Sanchak adds resource sections |
| Scheduling/coordinator | Single owner of virtual clock, dispatch, process transitions and metrics | Anam |
| Memory/admission | Free-run selection; atomic plan/commit of both pools; exact release | Sanchak |
| Resources/workers | Synchronized acquire/release/wait decisions, actual overlapping worker activity | Abhinav |
| Trace/snapshots | Ordered immutable records of committed changes | Abhinav; shared schema review |
| Export | A2/A3 format selected explicitly; no debug/animation data | Anam |
| Desktop | Case menu, restaurant renderer, controls, metrics and trace panels | Abhinav |
| Asset catalog | Sprite metadata, provenance, licenses, local packaging | Sanchak |

Proposed data flow:

```text
case menu or CLI -> validated workload -> coordinator/scheduler
                                      <-> memory admission
                                      <-> synchronized resource workers (A3)
                                      -> immutable events/snapshots -> desktop
                                      -> finalized metrics -> standard export
```

Interface gate before parallel implementation:

- Agree `SimulationConfig`, `SimulationResult`, pool allocation handles, resource actions, and event record fields.
- Events need sequence number, virtual timestamp, process/chef/resource identity, state transition, allocation changes, and reason. Distinguish wall-clock/thread evidence from virtual timestamps.
- State ownership must be explicit: workers perform resource operations under the resource manager's lock and report results; the coordinator commits process transitions. Do not let both mutate process state independently.
- Use a synchronized command/result queue and condition predicates checked in loops. Release notifications must persist as state, so waking before a waiter sleeps cannot strand it.
- A coordinator owns virtual-time advancement. Drain operations required at a timestamp before advancing; a blocked process consumes no service. A3 progress must pause at the next arrival, completion, or per-process action offset, rather than skipping actions.
- Never hold a simulation/resource lock while drawing, exporting, or waiting for the other subsystem. The main thread renders immutable snapshots.
- A2 can run synchronously and without SDL. A3 headless runs use SDL's thread subsystem without initializing a window/video device. Keep the core independent of SDL-specific types.
- Proposed CMake targets: `restaurant_cli`, `restaurant_app`, shared core, and checks; retain `make` compatibility where practical. A2 builds should not require graphics dependencies.
- Replace/wrap `dirent`, `unistd`, `isatty`, and `popen` where desktop/Windows paths need them. The new app calls the core directly; it does not invoke the CLI through shell commands.
- Resolve asset/input paths from an explicit data directory or executable location, not a presumed working directory. Test paths containing spaces.

## 5. Phase A2: integrated scheduling and memory

### Required behavior

- [ ] Exactly two chefs; retain FCFS, PRIORITY, SJF with existing A1 semantics. Restaurant does not require RR or preemptive scheduling.
- [ ] Fixed contiguous pools: `SPACE=6`, `TABLE=3`. Every request uses SPACE; TABLE may be zero.
- [ ] First Fit scans low addresses; Best Fit chooses smallest suitable maximal free run; Worst Fit chooses largest. Equal-sized runs select the lowest start index. Allocate at the lowest index in the selected run.
- [ ] One admission FIFO sorted by arrival then lexicographic ID. A blocked head prevents bypass. Recheck until the head fails or the queue empties.
- [ ] Plan both pool placements before committing either. Failure in one leaves both unchanged. Zero TABLE demand needs no table allocation.
- [ ] `NEW -> BLOCKED_MEMORY/READY -> RUNNING -> TERMINATED`. Retain allocations while READY/RUNNING; release exactly owned slots on completion. No compaction in standard runs.
- [ ] At timestamp `t`: complete/release in ID order; register arrivals in ID order; admit FIFO; schedule into lower-numbered idle chef first.
- [ ] Detect invalid/impossible inputs clearly; valid workloads finish with both pools empty and all orders terminated.

### Contracts and metrics

- Input: `N`, positive `Q`, then exactly N seven-field `ID,ARRIVAL,PRIORITY,SERVICE,CATEGORY,SPACE_REQ,TABLE_REQ` rows. Validate unique nonempty IDs without commas/whitespace, nonnegative arrivals, positive priority/service, category constraints, SPACE 1–6, TABLE 0–3, integer overflow, field/record counts, and trailing blank lines. Do not silently truncate IDs/categories to existing fixed buffers.
- Preserve old five-field A1 fixtures in an explicit legacy mode or separate adapter; never silently reinterpret malformed A2 input as A1.
- Proposed standard CLI: `restaurant_cli INPUT SCHEDULER ALLOCATOR OUTPUT`; canonical allocator tokens `FIRST_FIT`, `BEST_FIT`, `WORST_FIT`. Document phase selection/aliases when implementing.
- Export exactly the A2 §9.2 order: ID-sorted `PROCESS` records, eight `SUMMARY` records, then `POOL,SPACE,...` and `POOL,TABLE,...`. No CSV header; no extra prose. Preserve all field names and counts from the PDF.
- For each order: turnaround `C-A`, response `S-A`, total wait `C-A-B`, memory wait `M-A`, ready wait `total wait-memory wait`.
- Interval `E=max(C)-min(A)`; throughput `N/E`; chef utilization `sum(B)/(2E)*100`.
- Each pool: integrate occupied slots over virtual time, divide by `capacity*E`; report peak occupancy and maximum `free slots-largest free run`. Inspect fragmentation after relevant transitions, including zero-duration intermediate states; integrate occupancy only across elapsed intervals.
- Count an order as blocked for memory if its full allocation was not granted at arrival, including FIFO head-of-line blocking. Track that once per order.
- Emit enough decimal precision to satisfy `10^-3`; use wide checked arithmetic for times and occupancy integrals.

### A2 completion gate

Run all **nine scheduler × allocator combinations** on the same nontrivial input. README must compare scheduling and memory metrics, allocator trade-offs, FIFO fairness/head-of-line blocking, and changes from A1. Include a discriminating placement/fragmentation workload or explain equal outcomes honestly.

A2 acceptance requires clean build, exact contract checks, preserved A1 tests, deterministic repeated output, all resources reclaimed, README, sample inputs, and an independently rebuilt A2 archive. Graphics are an extension; A3 threading/deadlock behavior must not enter A2 standard runs. Tag and package the A2 checkpoint before A3 changes its export schema.

## 6. Phase A3: real concurrency and integrated resources

### Required behavior

- [ ] Standard exclusive instances: `MICROWAVE`, `OVEN_1`, `OVEN_2`, `COFFEE_MACHINE`, each capacity one. Tables remain memory; chefs remain service units. Ingredients are optional future scope.
- [ ] Two genuine worker threads overlap in real execution and attempt shared operations. A single-thread replay cannot be presented as concurrency evidence.
- [ ] Protect ownership, wait queues/counters, worker queues and state handoffs. Check-and-update is atomic; wait using conditions or equivalent thread-safe rescheduling, never polling or sleeps for correctness.
- [ ] Add `BLOCKED_RESOURCE`: unsuccessful acquire releases the chef, retains memory and already-held resources subject to the prevention policy, and consumes no further service. On grant, return to READY and reschedule.
- [ ] Accept unchanged A2 input as zero-action baseline. Optional `R` resource rows and `K` action rows must appear together when sections are present.
- [ ] Validate resource names/capacities, referenced IDs, ACQUIRE/RELEASE, unit count, action offset 0…SERVICE, per-order nondecreasing offsets and same-offset input order. Validate balanced ownership and repeated acquisition/release semantics.
- [ ] Work offsets measure executed service, not clock time. Execute actions at offset SERVICE, including final releases, before termination.
- [ ] Trace actual acquire/release/block/unblock operations with IDs, logical order/virtual time, worker identity and enough real-execution evidence to demonstrate overlap.

### Prevention design gate (Abhinav, reviewed by Sanchak and Anam)

Before coding, write a short decision record comparing enforced global acquisition order and all-or-nothing reservation. Specify how the chosen policy handles supplied ordered action streams, repeated acquisitions, and orders that already hold resources. Do not silently reorder actions or rewrite work offsets to make a demo pass. If a policy rejects an unsatisfiable pattern, explain exactly why; it must still support the required action contract and normal valid workloads.

State which deadlock condition the chosen policy removes and explain mutual exclusion, hold-and-wait, no preemption and circular wait in restaurant terms. Enable prevention by default. Demonstrate contention, independent oven copies, and eventual progress under that policy.

Provide a separate bounded unsafe demonstration: two orders hold different equipment and request each other's equipment. Coordinate the interleaving explicitly; use a finite deadline/cancellation protocol and cleanup, or an inspectable controlled wait-for cycle. A timeout alone is not cleanup. Return control, join workers and release demo state. Unsafe mode cannot be enabled accidentally by selecting a normal workload.

### A3 metrics and acceptance

- Preserve A2 numeric results exactly on resource-free runs; append `RESOURCE_WAIT=0` to process records.
- Resource runs: `C-A-B = MemoryWait + ReadyWait + ResourceWait`; accumulate resource waiting in virtual time, excluding it from ready wait.
- Export Final §9.2 records: A2 order with the additional PROCESS field, both pools, resource records sorted by ID, then three CHECK rows. Successful normal runs have zero exclusivity violations, zero unresolved deadlocks and completed count N; resource-free inputs have no RESOURCE records but still have the required CHECK records.
- Verify at most one holder per named instance, two different ovens usable concurrently, blocked orders do not execute, no lost wakeups/double releases/stranded waiters, all allocations reclaimed, all worker threads joined.
- Maintain baseline golden tests separately from concurrency checks. Real races need safety/progress assertions; their trace order need not be byte-for-byte identical.

## 7. Native pixel-art application

Target experience: select a case, choose scheduler and allocator, start a run, and watch the restaurant respond to the actual model. The visual extension belongs in the final delivery target; the confirmed deadline requires a small complete scene before animation polish.

### Screens and controls

1. **Case menu**: bundled workload list with descriptions (baseline, FIFO blocking, fragmentation, contention, independent ovens, safe prevention); scheduler/allocator selectors; A2/A3 mode; Run and Back. Load standardized files through a local-path input or supported file picker. Display validation errors before running.
2. **Restaurant view**: waiting area, two labeled chefs/stations, three table slots, four labeled equipment instances, order identity/state, completion area. Show kitchen resources as inactive/out of scope in A2.
3. **Inspection panels**: exact SPACE/TABLE occupancy strips with indices and owners, ready/memory/resource queues, event trace, metrics, selected policy and virtual time. Selecting an order shows its requirements, allocations and waits.
4. **Playback**: pause/resume, speed, reset, step through the next committed event, return to menu, export results. Distinguish live worker activity from replay; replay of a completed trace is useful for teaching but is not evidence of real concurrency.

Pause/step control must be implemented at coordinator boundaries, not by freezing a thread while it holds a mutex. Animation interpolation uses wall time; it cannot change service demand, allocation, action order or computed metrics. Closing/resetting the app cancels cleanly and joins workers.

### Visual language and fun elements

- Stable colors plus labels/icons for NEW, memory blocked, READY, cooking, resource blocked and completed; color alone is insufficient.
- Chef idle/cooking/waiting frames, steam or appliance lights during actual ownership, a short completed-order flourish, and visible queues make state changes readable.
- Show equipment owner IDs and connecting request indicators. The unsafe demo can highlight a wait-for cycle; safe mode shows how the policy prevents it.
- Keep exact slot strips visible: A2 slots are a deliberate OS abstraction, so a party requiring multiple contiguous slots must not be disguised as literal single-seat restaurant behavior.
- A chef walking between decorative locations does not imply service progress. Avoid a full pathfinding/gameplay/economy subsystem before submission.
- Minimum graphical release: complete labeled pixel scene, input-case menu, working controls and truthful state updates. Extra poses, sound, particles and themes follow only when correctness/build gates pass.

## 8. Asset creation and sourcing plan

Owner: Abhinav directs visuals; Sanchak catalogs/prepares assets; Anam verifies packaging. **No assets have been selected, licensed or generated yet.** Asset sourcing is a planned task, not a dependency already satisfied.

| Asset group | Minimum set | Proposed preparation |
| --- | --- | --- |
| Restaurant tiles | Floor, walls, counters, doorway, waiting-seat and table tiles | Consistent 16×16 or 32×32 grid; choose one before final drawing |
| Chefs | Two distinguishable chefs; idle/cooking/wait poses | Shared sprite proportions; a few readable frames rather than many directions |
| Orders/parties | Order token/customer marker, ID labels, state badges | Easily distinguished at small sizes and high queue counts |
| Equipment | Microwave, two labeled oven instances, coffee machine | Idle/in-use/contended states linked to actual model state |
| Feedback/UI | Queue icons, lock/wait indicators, buttons, bitmap font | Legible at integer scaling; keyboard focus/selection states |

Workflow:

1. **Block out immediately** using original simple pixel tiles/placeholders. This lets rendering and memory overlays develop without waiting for art.
2. Agree palette, viewpoint (top-down or side cutaway), tile size, sprite anchors and integer scaling in a small reference sheet. Do not mix incompatible asset packs.
3. Search for a cohesive restaurant/kitchen pack with explicit redistribution rights; inspect the actual license for every included asset/font. Alternatively create original sprites, or generate concept sheets and manually prepare consistent game sprites. AI images require grid, transparency, consistency and frame cleanup before use.
4. Compare candidates on visual fit, license, required credit, modification rights and effort. Record source URL, author, license text/version, download date and modifications. Unknown licensing means use original placeholders until resolved. Seek user preference before any paid purchase.
5. Store editable originals separately from runtime atlases; add metadata for frame rectangles, anchors and animation timing. Prefer PNG/transparency; choose and pin a loader if SDL core loading alone is insufficient. No remote asset fetch at runtime.
6. Inspect sprites in the actual app on both platforms: crisp nearest-neighbor scaling, no halos/bleeding, consistent sizes and readable labels. Include a fallback image for missing assets and a useful diagnostic.
7. Commit assets with `assets/manifest` and `assets/LICENSES/`/credits in the same feature. Package every runtime image/font and retain editable sources where redistribution allows.

Do not wait for final art to prove memory or concurrency behavior. Replacing placeholders must not require changing simulator logic.

## 9. Git workflow and feature-sized commit backlog

Use short-lived branches such as `codex/a2-memory-pools`, `codex/a3-resource-workers`, and `codex/ui-case-menu`. Each complete feature is a focused commit with its directly relevant checks/docs. Separate independent features; do not combine the memory engine, threads and graphics into one commit. A feature can use more than one reviewable commit if needed; avoid leaving the shared branch broken between them.

Commit format: `type(scope): imperative summary`, e.g. `feat(memory): add atomic two-pool admission`. Types: `feat`, `fix`, `test`, `docs`, `build`, `refactor`, `chore`. Explain non-obvious decisions and validation in the body. Do not fabricate authorship or co-author attribution. Stage explicit paths, inspect staged diffs, and exclude generated binaries, build folders and temporary traces. Commit baseline fixtures separately from regenerated expectations when that makes changes auditable.

One teammate reviews each feature before integration. PR description: behavior changed, relevant specification, checks run and known limitations. Serialize merges that alter shared interfaces. Use protected main/required CI if the remote supports them; otherwise enforce the same checks locally. No force-push to shared branches. Release tags `a2-v1.0.0` and `a3-v1.0.0` identify tested snapshots; use new patch tags for fixes rather than moving release tags.

The following are proposed commit units. Each checkbox becomes complete only when its acceptance evidence exists.

| ID | Feature commit | Owner | Depends on / evidence |
| --- | --- | --- | --- |
| P0 | `docs(plan): record restaurant delivery plan` | Abhinav | Review scope and assignments |
| B1 | `build(core): add portable build and baseline checks` | Anam | Warning cleanup, generated-file ignores, preserve A1 checks |
| B2 | `refactor(core): define simulation and event interfaces` | Anam + Abhinav | B1; agreed ownership/schema, A1 checks unchanged |
| M1 | `feat(input): validate A2 restaurant workloads` | Anam | B2; valid and malformed seven-field cases |
| M2 | `feat(memory): implement contiguous placement policies` | Sanchak | B2; exact fit, holes, tie-breaking, zero TABLE |
| M3 | `feat(memory): add atomic FIFO admission and release` | Sanchak | M1/M2; rollback, head-of-line blocking, reclamation |
| M4 | `feat(sim): integrate memory admission with two-chef scheduling` | Anam | M3; simultaneous events and all nine combinations |
| M5 | `feat(report): export A2 memory and scheduling metrics` | Anam | M4; independent hand-calculated result cases |
| M6 | `test(a2): verify comparison workloads and release contracts` | Sanchak + Anam | M5; determinism, complete exports, comparison table |
| U1 | `feat(ui): add native window and input-case menu` | Abhinav | B2; case/config selection and validation errors |
| U2 | `feat(trace): publish simulation events and snapshots` | Abhinav | M4; event order and snapshot consistency |
| U3 | `feat(ui): visualize chefs queues and memory pools` | Abhinav | U1/U2; truthful A2 state view |
| A1 | `feat(assets): add licensed restaurant sprite set and catalog` | Sanchak | Placeholder-first; provenance, slicing and credits |
| R2 | `docs(release): package independent A2 checkpoint` | Anam | M6; clean archive rebuild; tag A2 before final schema changes |
| C1 | `feat(input): parse and validate resource action streams` | Sanchak | M1; optional sections and offset edge cases |
| C2 | `feat(concurrency): add real workers and synchronized resource manager` | Abhinav | B2; real overlap and atomic ownership tests |
| C3 | `feat(sim): integrate resource blocking at service offsets` | Sanchak + Anam | C1/C2; blocked chef release, retained memory, wakeup/reschedule |
| C4 | `feat(deadlock): enable documented prevention policy` | Abhinav | Design gate and C3; default-safe progress evidence |
| C5 | `feat(deadlock): add bounded circular-wait demonstration` | Abhinav | C4; finite cleanup, return to app, comparison trace |
| C6 | `feat(report): export resource waits and safety checks` | Anam | C3/C4; A2 numeric compatibility and final contract |
| U4 | `feat(ui): animate resource contention and add playback controls` | Abhinav | C3/U3/A1; ownership overlays, live/replay labels, safe reset |
| T3 | `test(final): verify integrated safety and platform releases` | Sanchak + Anam | C5/C6/U4; repeated normal runs, archive/platform checks |
| R3 | `docs(release): package A3 and prepare joint demonstration` | All; Anam packages | T3; final archive, credits, README and viva rehearsal |

Check relevant baseline tests after each feature. Pure documentation commits need review/link checks rather than new implementation tests. Do not automatically commit unrelated current README changes or untracked PDFs/binaries with P0.

## 10. Validation and release gates

| Layer | Required evidence | Primary owner |
| --- | --- | --- |
| Baseline | Existing A1 scheduling and terminal-viewer checks retained or explicitly adapted | Anam |
| Allocation | Independent expected placements for First/Best/Worst Fit, hole ties, coalescing, full capacity, atomic failure and FIFO blocking | Sanchak |
| Event integration | Simultaneous completion/arrival, unsorted input, initial idle gaps, lexicographic IDs, READY orders retaining slots | Sanchak + Anam |
| Metrics/exports | Hand-calculated small scenarios; exact record order/counts; all nine combinations; `10^-3` tolerance | Anam |
| Resource actions | Offset zero/SERVICE, equal-offset ordering, reacquisition, invalid releases/references, blocked while holding another resource | Sanchak |
| Concurrency | Same-instance exclusion, different-oven overlap, repeated release/wakeup, joins/cancellation, no leaked ownership | Abhinav + Sanchak |
| Deadlock | Controlled cycle terminates cleanly; normal prevention policy completes counterpart input | Abhinav |
| Graphics | Case menu, import errors, pause/step/reset/export, state-to-sprite consistency, long queues, high-DPI readability | Abhinav + Anam |
| Portability | Native build/run and case/export smoke tests on Windows and macOS, documented compiler/architecture versions | Anam coordinates all |
| Packaging | Build/run from extracted A2 and A3 archives in clean directories, paths with spaces, bundled assets/licenses | Anam |

Use CTest or another portable runner so Windows testing does not depend on `/bin/sh`. Add CI for both platforms where available. Use address/undefined-behavior sanitizers and race detection where the chosen compiler/platform supports them; record unavailable checks instead of claiming they ran. A successful macOS build does not establish Windows support.

Successful exports require all N orders completed; reject failed or incomplete runs rather than reporting success with a partial CSV. Diagnostics go to stderr/UI, separate from the standardized result. Tests should inspect cleanup and conservation, not just happy-path screenshots.

## 11. Schedule, integration order, and scope control

Both deadlines are tomorrow relative to this plan. A full polished desktop app plus correct A2/A3 is substantial work; the sequence below is priority order, not an unsupported estimate of hours.

**November 20: foundation and A2 critical path.** Agree interfaces and prevention policy; Anam handles parser/coordinator/reporting, Sanchak handles memory/admission, Abhinav builds the app/menu and trace interface using placeholders. Merge small reviewed units continuously. Abhinav can investigate worker/prevention design while memory implementation proceeds, without contaminating A2 standard mode.

**November 21: freeze A2, integrate and release A3.** Finish nine-way comparisons, tag and independently rebuild A2; then complete worker/action integration, prevention and bounded demo, final metrics, and graphical resource view. Run both platform checks early enough to fix failures. Leave an explicit release buffer for archive rebuilds, README and demonstration rehearsal; do not schedule new features through the submission cutoff.

If behind, reduce optional animation poses, particles, sound, decorative room detail, ingredients, and optional analytical panels first. Keep the case menu and a complete readable pixel scene as the graphical target. Preserve mandatory memory/concurrency correctness, contracts, separate archives, and Windows/macOS verification. If even the minimum graphic target cannot fit, report that trade-off to the team immediately rather than silently dropping a confirmed requirement.

**November 22–23: rehearse the joint viva.** Follow course rules for any post-deadline code changes; do not assume late modifications are part of the submitted version. Use the released artifacts for practice.

## 12. Documentation, submission, and five-minute demonstration

Update README with scenario/OS abstractions, architecture, build instructions for each OS, CLI and menu operation, input/export formats, scheduler/allocation rules, metrics, nine-way comparison, thread/state ownership, prevention policy, virtual versus wall time, asset credits and known limitations. Every member must be able to explain all three phases.

Prepare two archives from verified release tags, each containing its required source, build metadata, dependency instructions, examples and documentation; include assets in whichever checkpoint uses them. Include tested desktop builds when practical, while keeping source builds reproducible. Name one submitter and one backup at release time; only one person submits each archive to the corresponding Classroom assignment. Submission remains a future team action.

Proposed joint presentation division:

- **Anam, 0:00–1:00:** input-case menu, two-chef scheduling and a result comparison.
- **Sanchak, 1:00–2:15:** contiguous memory map, FIFO blocking, allocator differences and atomic two-pool admission.
- **Abhinav, 2:15–4:15:** live resource contention, concurrent use of different ovens, bounded circular wait and prevention through the graphical view.
- **All, 4:15–5:00:** integrated metrics, baseline compatibility, release checkpoints and one key trade-off.

Have short saved traces as a demonstration fallback, clearly labeled as replay, plus a runnable live concurrency workload. Explain one memory-blocked and one resource-blocked order end to end. All members rehearse questions about correctness, fairness, utilization and synchronization.

## 13. Decisions to close before dependent work

- [ ] Team acknowledges the proposed ownership/review matrix.
- [ ] Confirm available Windows/macOS machines, compiler toolchains and target architectures/minimum OS versions.
- [ ] Record exact SDL3 version and build/dependency packaging approach after a minimal build on both platforms.
- [ ] Select and justify the prevention policy against standard action semantics before implementing C4.
- [ ] Agree pixel-art viewpoint, palette and sprite grid; choose original or explicitly licensed assets before committing final art.
- [ ] Assign the archive submitter/backup and reserve release buffer before the confirmed November 21 cutoff.
