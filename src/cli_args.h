#ifndef CLI_ARGS_H
#define CLI_ARGS_H

#include "shared_types.h"

/*
 * Command line (Anam):
 *   restaurant INPUT_FILE SCHEDULER ALLOCATOR OUTPUT_FILE [--phase a2|a3] [--trace TRACE.json]
 *              [--log FILE|-] [--unsafe-demo]
 *   restaurant INPUT_FILE SCHEDULER          <- A1 legacy form, unchanged A1 behaviour
 *
 *   SCHEDULER: FCFS | PRIORITY | SJF            (case-insensitive)
 *   ALLOCATOR: FIRST_FIT | BEST_FIT | WORST_FIT (case-insensitive)
 *   --phase   : defaults to DEFAULT_PHASE (a3 in the final release)
 *   --trace   : optional JSON recording path for Abhinav's writer; no trace if absent
 *   --log     : resource-event trace (thread, virtual time, order, equipment); "-" = stderr
 *   --unsafe-demo : turn deadlock prevention off for the bounded circular-wait demo
 * The 2-argument form keeps the A1 program (5-field input, report on stdout,
 * Gantt chart in a terminal) so tests/edge/check_rows.sh and gantt_chart work.
 * Options may appear before, between or after the positional arguments.
 */

#ifndef DEFAULT_PHASE
#define DEFAULT_PHASE PHASE_A3
#endif

typedef struct {
    const char       *input_path;
    const char       *output_path;
    const char       *trace_path;   /* NULL when --trace is absent */
    int               legacy_a1;
    int               show_help;
    SimulationConfig  config;
} CliOptions;

/* Returns 0 on success, -1 with a message in *error. */
int parse_cli_args(int argc, char **argv, CliOptions *out, Error *error);

void print_usage(const char *program);

const char *scheduler_name(SchedulerKind kind);
const char *allocator_name(AllocatorKind kind);

#endif
