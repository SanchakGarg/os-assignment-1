# A2 input/output (Anam): handoff notes

This is the A1 project with Anam's A2 input/output modules merged in.

```sh
make && make test-a2      # build, then run all A2 I/O tests
```

## What changed from A1

| File | Change |
| --- | --- |
| `main.c` | Now handles both forms. With 2 arguments it runs **A1 exactly as before**; the output was checked byte-for-byte against the A1 build. With 4 arguments it runs A2: parse → `simulate_a2()` → standard CSV file. |
| `Makefile` | Adds the A2 modules, `check_input` and `make test-a2`. The A1 targets are unchanged. |
| `input.c`, `sim.c`, `sched.c`, `metrics.c`, `gantt*.c`, `restaurant.h` | **Untouched.** |

New files: `first_fit.c/.h`, `input_parser.c/.h`, `cli_args.c/.h`, `csv_writer.c/.h`, `shared_types.h`, `a2_simulator.h`, `a2_sim_stub.c`, `check_input.c`, `tests/a2/`, `scripts/run_comparison.sh`, `docs/input-output.md`.

## For Sanchak

1. **`a2_sim_stub.c` is a placeholder.** It makes every A2 run fail cleanly, with exit code 3 and no CSV. Replace it with your simulator in `A2_SIM_SRC` in the Makefile and **delete it before submission**.
2. **Your entry point should be named `simulate_a2()`**, or any name other than `simulate`. `restaurant.h` already has the A1 `simulate(Process*, int, Picker)`, and two `simulate` functions cannot link together.
3. **`shared_types.h` and `a2_simulator.h` are provisional.** They follow shared-data.md. If you would rather extend `Process` in `restaurant.h` (add `space_req`, `table_req` and the A2 result fields), say so and I'll switch the parser and writer over. It's a small change.
4. **Set `result.complete = 1`** only for a finished run. The writer refuses to write anything otherwise.
5. **`first_fit(slots, capacity, size)`** takes `const char *slots[]`, where NULL means free. It only searches. Your admission code checks SPACE and TABLE and commits both or neither.
6. **The A1 metrics are reusable.** `metrics.c` already computes E = last completion − first arrival and utilization = Σservice / (2E) × 100, matching shared-data.md.
7. **Comparison input:** `tests/a2/comparison_a2.txt` is the A1 10-order workload with memory requests added. Run `sh scripts/run_comparison.sh` once your simulator works.

## For Abhinav

- Replace the `--trace` TODO in `run_a2()` in `main.c` with the trace writer and `record_snapshot`.
- `gantt_chart` still calls `./restaurant FILE ALGO` (the A1 form), so it keeps working unchanged.

## Before submission

- Delete `a2_sim_stub.c` and leave the compiled binaries out of the zip: `restaurant`, `gantt_chart`, `restaurant.exe`, `check_input` and `tests/a2/test_*`.
- `main.c` uses `fork`, `open_memstream` and `isatty` from A1, so build on Linux or macOS. Native Windows/MinGW lacks `open_memstream`, so use WSL there.
