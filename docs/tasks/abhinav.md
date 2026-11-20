# Abhinav's work: safe shared equipment and the browser restaurant

Read [the team plan](../../plan.md) and [the shared data guide](../shared-data.md). You own two connected parts: actual C concurrency and the complete visualization, including the JSON recording and game assets.

## Files you will work on

Add resource/thread modules, snapshot/trace declarations and a JSON writer; add `web/` for HTML/CSS/JavaScript and local assets. You own recording examples and any schema/validation helpers. Agree snapshot/result definitions with Sanchak; coordinate CLI wiring with Anam.

## Part 1: build the browser before the simulator is finished

1. Create a small complete example JSON using the data guide. Label it SYNTHETIC so it cannot be mistaken for a real concurrent run.
2. Make a page that loads it through local file selection. Support JSON content in `.json` or `.txt`; reject unsupported versions, unknown IDs and inconsistent state with useful errors. A raw assignment input file should explain how to generate a recording using C.
3. Add case selection, play/pause, next frame, speed, restart and a timeline. Use recorded states; changing playback speed must not change results. A different scheduler/allocator requires a different C recording.
4. Draw a simple restaurant: two chefs, waiting area, three table slots, order IDs, exact SPACE/TABLE occupancy strips and kitchen equipment. Show queue order and the current event. Make labels readable before adding animation.
5. Add the complete pixel-art treatment and resource views. You own every asset-related task: choosing a style, finding/drawing/generating assets, preparing sprites/atlases, credits, licenses and browser testing.
6. Keep everything local and simple: HTML/CSS/JavaScript Canvas, local images, no required backend. Prefer opening `web/index.html` directly; document a static-server command if needed. Test browser behavior on Windows/macOS, including Safari and Chromium where available.

Start with original colored pixel placeholders. Then choose a consistent viewpoint/palette and 16×16 or 32×32 tile grid. Minimum assets: floor/walls/counters, two distinguishable chefs with idle/cooking/wait poses, waiting/table tiles, microwave, ovens and coffee machine, order/state icons and readable text. For sourced images/fonts, save the actual redistribution license, source and author. Prepare transparent PNGs, inspect scaling and include the assets locally. Do not make simulation progress depend on animation timing.

## Part 2: save what the C simulation did

1. Agree `record_snapshot(snapshot, events, context)` with Sanchak. This is a function the simulator calls after its state is consistent. Sanchak supplies all C state; you serialize it.
2. Write model/run metadata, complete frames and the final result into the JSON format in the guide. Escape strings correctly, preserve numbers, include null/free slots and keep stable IDs.
3. Keep the graded CSV separate. Anam writes that file. Recording must not change scheduling or resource decisions.
4. Use mock C snapshots to test the writer before the real simulator is finished. Connect to Sanchak's callback later and verify that actual recordings load in the same viewer.
5. Explain virtual simulation time separately from real worker timing. Label the browser view as replay; recorded SYNTHETIC examples do not prove actual concurrency.

## Part 3: real workers and shared equipment

1. Provide a small equipment-manager interface for Sanchak: submit acquire/release actions, collect answers, obtain copied ownership/wait information and shut down cleanly. Use command IDs so an answer is applied once.
2. Use at least two real worker threads that overlap. Guard ownership, wait information and shared counters using mutexes. Use condition variables/queues for waiting for work/results; do not rely on sleeps or busy loops.
3. Support `MICROWAVE`, `OVEN_1`, `OVEN_2`, `COFFEE_MACHINE`, each exclusive. Two different ovens can be used at the same time; the same named oven cannot have two owners.
4. If an order cannot acquire equipment, return BLOCKED so Sanchak can release its chef and stop service progress. Keep track of the waiter. When a grant becomes possible, report it back so the order returns to READY.
5. Do not strand both real workers waiting inside resource acquisition: they must remain able to process the releases that unblock orders. Use thread-safe blocked-order state and notifications.
6. Copy resource state/results before handing them to Sanchak. Never let the simulator or JSON writer read half-updated shared state. Join workers and clean up on success, failure and cancellation.
7. Isolate platform-specific thread calls. Test the C backend separately from the browser on the supported machines; decide the exact Windows/macOS thread implementation before committing to it.

## Part 4: deadlock and the demo

Agree the prevention policy with Sanchak before integrating it. Compare global acquisition order and all-or-nothing reservation against the required action streams. Write a short explanation of what the chosen policy does, which deadlock condition it removes, and what inputs/ordering it supports. Do not silently rearrange the input's actions to make it safe; report a genuinely unsatisfiable request clearly.

Add a separate unsafe demonstration where two orders each hold equipment the other needs. It must stop after a bounded demonstration, release state and join threads. Normal runs use prevention by default. Show the difference in the equipment trace/browser, and be able to explain the four deadlock conditions.

## What you give the others

| Recipient | Deliverable |
| --- | --- |
| Sanchak | Shared equipment API, grant/block/release answers, wakeup notices, copied ownership/counters and small usage example |
| Anam | Trace-writer entry points/configuration, viewer bundle and instructions for packaging it |
| Whole team | Complete sample/real JSON recordings, browser/assets, actual concurrency evidence, safe contention run and bounded unsafe demo |

## Check your work

- Same-equipment exclusion; different-oven concurrency; repeated acquire/release; waiter wakeup; no duplicate grant or release.
- Real worker overlap is observable; cancellation and unsafe demo return control and clean up.
- Normal prevention mode completes without unresolved deadlock.
- Imported frames agree with C/CSV results. Pause/seek/reset and equal-time events behave correctly.
- Missing assets/bad files produce readable errors; input strings are rendered as text; labels and sprites work at different display sizes.

## Suggested feature commits

1. Recording format, sample JSON and snapshot callback declaration.
2. Browser file loading and case selection.
3. Pixel scene, playback and inspection panels.
4. Asset set and credits.
5. C recording writer.
6. Real workers, resource ownership and waiting/wakeup.
7. Enabled prevention policy.
8. Bounded unsafe demo and resource/worker visualization.

## Instruction to give your agent

> Work on Abhinav's part of this restaurant project. Read `plan.md`, `docs/tasks/abhinav.md` and `docs/shared-data.md`, inspect the current code and restaurant requirements in both PDFs. Own all visualization work: JSON recording format/writer/examples, browser import/playback, pixel-art assets and visual checks. Also implement real worker threads, mutex/condition-based resource management, deadlock prevention and a bounded unsafe demo. Start browser work with a complete synthetic recording and test resource management separately before integration. Agree shared snapshot/resource headers with Sanchak and CLI wiring with Anam. Do not implement a second simulator in JavaScript or present replay as real concurrency. Use the shared data fields, preserve A2 baseline behavior and keep individual features in focused commits. At handover provide commits, run/check commands, example recordings, asset credits, actual concurrency evidence and remaining integration needs. Explain the implementation for the viva and ask about genuinely missing design choices.
