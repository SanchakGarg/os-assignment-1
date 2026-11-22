#include "cli_args.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

static int equals_ignore_case(const char *a, const char *b)
{
    for (; *a && *b; a++, b++)
        if (toupper((unsigned char)*a) != toupper((unsigned char)*b))
            return 0;
    return *a == '\0' && *b == '\0';
}

static const char *const SCHEDULER_NAMES[] = { "FCFS", "PRIORITY", "SJF" };
static const char *const ALLOCATOR_NAMES[] = { "FIRST_FIT", "BEST_FIT", "WORST_FIT" };

const char *scheduler_name(SchedulerKind kind) { return SCHEDULER_NAMES[kind]; }
const char *allocator_name(AllocatorKind kind) { return ALLOCATOR_NAMES[kind]; }

static int parse_scheduler(const char *text, SchedulerKind *out)
{
    for (int i = 0; i < 3; i++)
        if (equals_ignore_case(text, SCHEDULER_NAMES[i])) {
            *out = (SchedulerKind)i;
            return 0;
        }
    return -1;
}

static int parse_allocator(const char *text, AllocatorKind *out)
{
    for (int i = 0; i < 3; i++)
        if (equals_ignore_case(text, ALLOCATOR_NAMES[i])) {
            *out = (AllocatorKind)i;
            return 0;
        }
    return -1;
}

void print_usage(const char *program)
{
    fprintf(stderr,
        "Usage: %s INPUT_FILE SCHEDULER ALLOCATOR OUTPUT_FILE [options]   (A2)\n"
        "       %s INPUT_FILE SCHEDULER                                 (A1, unchanged)\n"
        "  SCHEDULER  FCFS | PRIORITY | SJF\n"
        "  ALLOCATOR  FIRST_FIT | BEST_FIT | WORST_FIT\n"
        "Options:\n"
        "  --phase a2|a3     output format/phase (default: %s)\n"
        "  --trace FILE      also write the JSON recording for the browser viewer\n"
        "  --log FILE|-      write the resource-event trace (- = stderr)\n"
        "  --unsafe-demo     deadlock prevention OFF: bounded circular-wait demo\n"
        "  --help            show this message\n",
        program, program, DEFAULT_PHASE == PHASE_A2 ? "a2" : "a3");
}

int parse_cli_args(int argc, char **argv, CliOptions *out, Error *error)
{
    const char *positional[4];
    int npos = 0;
    int phase_given = 0;

    memset(out, 0, sizeof *out);
    out->config.phase = DEFAULT_PHASE;
    error->line = 0;

    for (int i = 1; i < argc; i++) {
        const char *arg = argv[i];

        if (strcmp(arg, "--help") == 0 || strcmp(arg, "-h") == 0) {
            out->show_help = 1;
            return 0;
        } else if (strcmp(arg, "--phase") == 0) {
            if (i + 1 >= argc) {
                snprintf(error->message, sizeof error->message, "--phase needs a value (a2 or a3)");
                return -1;
            }
            const char *value = argv[++i];
            phase_given = 1;
            if (equals_ignore_case(value, "a2"))
                out->config.phase = PHASE_A2;
            else if (equals_ignore_case(value, "a3"))
                out->config.phase = PHASE_A3;
            else {
                snprintf(error->message, sizeof error->message,
                         "unknown phase \"%s\" (expected a2 or a3)", value);
                return -1;
            }
        } else if (strcmp(arg, "--log") == 0) {
            if (i + 1 >= argc) {
                snprintf(error->message, sizeof error->message, "--log needs a file path or -");
                return -1;
            }
            out->config.resource_log = argv[++i];
        } else if (strcmp(arg, "--unsafe-demo") == 0) {
            out->config.unsafe_demo = 1;
        } else if (strcmp(arg, "--trace") == 0) {
            if (i + 1 >= argc) {
                snprintf(error->message, sizeof error->message, "--trace needs a file path");
                return -1;
            }
            out->trace_path = argv[++i];
        } else if (arg[0] == '-' && arg[1] == '-') {
            snprintf(error->message, sizeof error->message, "unknown option \"%s\"", arg);
            return -1;
        } else {
            if (npos == 4) {
                snprintf(error->message, sizeof error->message,
                         "too many arguments (unexpected \"%s\")", arg);
                return -1;
            }
            positional[npos++] = arg;
        }
    }

    if (npos == 2) {                    /* A1 legacy form: INPUT_FILE SCHEDULER */
        if (out->trace_path != NULL || phase_given || out->config.resource_log ||
            out->config.unsafe_demo) {
            snprintf(error->message, sizeof error->message,
                     "--phase/--trace/--log/--unsafe-demo need the A2 form: "
                     "INPUT_FILE SCHEDULER ALLOCATOR OUTPUT_FILE");
            return -1;
        }
        out->legacy_a1 = 1;
        out->input_path = positional[0];
        if (parse_scheduler(positional[1], &out->config.scheduler) != 0) {
            snprintf(error->message, sizeof error->message,
                     "unknown scheduler \"%s\" (expected FCFS, PRIORITY or SJF)", positional[1]);
            return -1;
        }
        return 0;
    }
    if (npos != 4) {
        snprintf(error->message, sizeof error->message,
                 "expected 4 arguments (INPUT_FILE SCHEDULER ALLOCATOR OUTPUT_FILE), got %d", npos);
        return -1;
    }

    out->input_path = positional[0];
    out->output_path = positional[3];

    if (parse_scheduler(positional[1], &out->config.scheduler) != 0) {
        snprintf(error->message, sizeof error->message,
                 "unknown scheduler \"%s\" (expected FCFS, PRIORITY or SJF)", positional[1]);
        return -1;
    }
    if (parse_allocator(positional[2], &out->config.allocator) != 0) {
        snprintf(error->message, sizeof error->message,
                 "unknown allocator \"%s\" (expected FIRST_FIT, BEST_FIT or WORST_FIT)",
                 positional[2]);
        return -1;
    }
    if (strcmp(out->input_path, out->output_path) == 0) {
        snprintf(error->message, sizeof error->message,
                 "output file must differ from the input file");
        return -1;
    }
    return 0;
}
