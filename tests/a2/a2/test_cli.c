/* Unit tests for parse_cli_args(). Run: make test */
#include <stdio.h>
#include <string.h>

#include "cli_args.h"

static int failures = 0;

static int run(int argc, char **argv, CliOptions *o, Error *e)
{
    return parse_cli_args(argc, argv, o, e);
}

#define EXPECT(cond, msg)                                                   \
    do {                                                                    \
        if (!(cond)) {                                                      \
            printf("FAIL line %d: %s (%s)\n", __LINE__, msg, e.message);    \
            failures++;                                                     \
        }                                                                   \
    } while (0)

int main(void)
{
    CliOptions o;
    Error e = {0};

    char *basic[] = { "cli", "case.txt", "FCFS", "FIRST_FIT", "result.csv" };
    EXPECT(run(5, basic, &o, &e) == 0, "four positional arguments");
    EXPECT(o.config.scheduler == SCHED_FCFS && o.config.allocator == ALLOC_FIRST_FIT,
           "FCFS + FIRST_FIT");
    EXPECT(o.config.phase == PHASE_A2 && o.trace_path == NULL, "defaults: a2, no trace");
    EXPECT(strcmp(o.input_path, "case.txt") == 0 && strcmp(o.output_path, "result.csv") == 0,
           "paths");

    char *full[] = { "cli", "--phase", "a3", "case.txt", "sjf", "worst_fit",
                     "out.csv", "--trace", "run.trace.json" };
    EXPECT(run(9, full, &o, &e) == 0, "options before and after, lowercase names");
    EXPECT(o.config.scheduler == SCHED_SJF && o.config.allocator == ALLOC_WORST_FIT,
           "SJF + WORST_FIT");
    EXPECT(o.config.phase == PHASE_A3, "phase a3");
    EXPECT(o.trace_path && strcmp(o.trace_path, "run.trace.json") == 0, "trace path");

    char *prio[] = { "cli", "case.txt", "PRIORITY", "BEST_FIT", "out.csv" };
    EXPECT(run(5, prio, &o, &e) == 0 && o.config.scheduler == SCHED_PRIORITY &&
           o.config.allocator == ALLOC_BEST_FIT, "PRIORITY + BEST_FIT");

    char *bad_sched[] = { "cli", "case.txt", "RR", "FIRST_FIT", "out.csv" };
    EXPECT(run(5, bad_sched, &o, &e) == -1 && strstr(e.message, "scheduler"),
           "RR is not a Restaurant scheduler");

    char *bad_alloc[] = { "cli", "case.txt", "FCFS", "NEXT_FIT", "out.csv" };
    EXPECT(run(5, bad_alloc, &o, &e) == -1 && strstr(e.message, "allocator"),
           "unknown allocator rejected");

    char *too_few[] = { "cli", "case.txt", "FCFS", "FIRST_FIT" };
    EXPECT(run(4, too_few, &o, &e) == -1, "missing output file rejected");

    char *bad_phase[] = { "cli", "case.txt", "FCFS", "FIRST_FIT", "out.csv", "--phase", "a4" };
    EXPECT(run(7, bad_phase, &o, &e) == -1, "bad phase rejected");

    char *no_value[] = { "cli", "case.txt", "FCFS", "FIRST_FIT", "out.csv", "--trace" };
    EXPECT(run(6, no_value, &o, &e) == -1, "--trace without a path rejected");

    char *same[] = { "cli", "case.txt", "FCFS", "FIRST_FIT", "case.txt" };
    EXPECT(run(5, same, &o, &e) == -1, "output may not overwrite input");

    /* A1 legacy form keeps working: ./restaurant FILE ALGORITHM */
    char *legacy[] = { "cli", "tests/comparison.txt", "SJF" };
    EXPECT(run(3, legacy, &o, &e) == 0 && o.legacy_a1 == 1 &&
           o.config.scheduler == SCHED_SJF && o.output_path == NULL, "A1 two-argument form");

    char *legacy_bad[] = { "cli", "in.txt", "FIRST_FIT" };
    EXPECT(run(3, legacy_bad, &o, &e) == -1, "A1 form still checks the scheduler");

    char *legacy_trace[] = { "cli", "in.txt", "FCFS", "--trace", "t.json" };
    EXPECT(run(5, legacy_trace, &o, &e) == -1, "--trace not allowed with the A1 form");

    char *a2_form[] = { "cli", "in.txt", "FCFS", "BEST_FIT", "out.csv" };
    EXPECT(run(5, a2_form, &o, &e) == 0 && o.legacy_a1 == 0, "4-argument form is A2");

    if (failures == 0)
        printf("test_cli: all tests passed\n");
    return failures == 0 ? 0 : 1;
}
