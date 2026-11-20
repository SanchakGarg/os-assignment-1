# Anam's work: input files, CSV output and repeatable runs

Read [the team plan](../../plan.md) and [the shared data guide](../shared-data.md). Your part makes it easy to give the simulator an input, run it and obtain the output the assignment expects.

## Files you will work on

Existing: `input.c`, `main.c`, CSV-writing code currently in `metrics.c`, run scripts and README. Add sample inputs/check scripts as needed. Sanchak owns calculation of metrics; keep output formatting separate from those calculations. Coordinate Makefile changes with the person adding each new module.

## A2: tasks in order

1. **Read the seven-field process rows.** The file begins with N and Q, followed by exactly N rows: `ID,ARRIVAL,PRIORITY,SERVICE,CATEGORY,SPACE_REQ,TABLE_REQ`.
2. **Check the fields.** N/Q positive; arrival nonnegative; priority/service positive; SPACE 1–6; TABLE 0–3. IDs must be unique, nonempty and contain no whitespace/commas. Categories must be nonempty and comma-free. Reject missing/extra fields, invalid numbers and truncation with a useful line/field error. Ignore trailing blank lines.
3. **Hand back typed data.** Fill the shared Workload/ProcessSpec definitions supplied by Sanchak. Leave the file open at the optional resource section, which Sanchak's parser reads. If reading fails, clean up allocated data and report the error.
4. **Add CLI options.** Accept input path, scheduler, allocator and output path. Validate the supported names. Pass phase/configuration and the optional trace-output request to the appropriate modules. The sample command is in the data guide.
5. **Write the required CSV.** Receive a completed result from Sanchak, sort output records by ID without rearranging live simulator state, and format the supplied numbers. Do not recalculate waits/utilization in the writer. Use the exact record layouts/order in the guide and PDF.
6. **Keep old examples usable.** Preserve the old five-field A1 checks through an explicit legacy option or adapter agreed with Sanchak; do not silently guess a malformed A2 file is A1.
7. **Add a comparison script.** Run one chosen nontrivial input with FCFS, PRIORITY and SJF, each with First/Best/Worst Fit. Save nine outputs, stop/report failures and make a concise README comparison table. Ask Sanchak to verify the expected results and explanations.
8. **Write verified commands.** Document how to build, run a case and find the output. Correct the README's outdated claim that the schedulers are placeholders when updating that section.

## A3: tasks in order

1. Call Sanchak's optional resource/action parser after the process section; report its errors clearly. You do not need to implement that parser.
2. Extend CSV formatting with the supplied `resource_wait`, RESOURCE rows and three CHECK rows. Keep A2 and A3 export formats selectable; do not change the saved A2 submission format.
3. Add a script/check that compares resource-free A2 and A3 numeric results. The A3 process row adds zero resource wait; extra final CHECK rows are expected.
4. Document one baseline run and one real-concurrency run, using workloads the relevant owners provide.
5. Assemble separate A2/A3 source archives from tested versions. Include the examples, instructions and files each owner supplies. Ask Sanchak to verify the core and Abhinav to verify the viewer/assets bundle. Test extraction/build/run before submission.

## What you give the others

| Recipient | Deliverable |
| --- | --- |
| Sanchak | Validated process records and CLI configuration, or a clear input error |
| Abhinav | CLI passes the trace path/configuration to his writer; no browser or JSON implementation needed from you |
| Whole team | Exact CSV files, sample input/error cases, nine-run script/table, build/run documentation and separate archives |

## How to start without the finished simulator

Use one small input file to test the parser. For output, manually fill the shared result structure with the known single-order answer in the data guide and call the CSV writer. Once Sanchak's simulator is ready, replace that sample result with its real output; the writer stays the same.

## Check your work

- Valid seven-field input; duplicate ID; missing field; negative arrival; zero service; out-of-range requests; bad number; trailing blank lines.
- A valid resource section remains available for Sanchak's parser.
- Unknown scheduler/allocator and missing output path give clear errors.
- CSV has no header, debug text or extra prose; row ordering/counts match the PDFs; decimal precision satisfies `10^-3`.
- A2 and final output examples format correctly from supplied result structures. Failed runs do not produce an output claiming success.
- Comparison script produces all nine runs and reports failures. Instructions work from a clean extracted folder.

## Suggested feature commits

1. Seven-field process parsing and validation.
2. CLI options and module wiring.
3. A2 CSV formatting and known-answer checks.
4. Comparison runner and README results.
5. A3 CSV formatting and baseline comparison.
6. Separate release archives/instructions.

## Instruction to give your agent

> Work on Anam's part of this restaurant project. Read `plan.md`, `docs/tasks/anam.md` and `docs/shared-data.md`, inspect the existing code, and use the restaurant input/output requirements in the two PDFs. Implement process input validation, CLI options, CSV formatting, repeatable run scripts and documentation as described. Use Sanchak's shared structures and already calculated results; do not implement scheduling, memory allocation, metric calculations, the optional resource/action parser, synchronization, JSON or visualization. Test CSV formatting with a manually filled known-answer result before the simulator is ready. Coordinate shared-header/build changes. Keep every feature in a focused commit and preserve unrelated local edits. Report changed files, commits, exact run/check commands, outputs and anything needed from the other owners. Explain the code so I can understand it for the viva. Ask about genuinely missing decisions rather than inventing new formats.
