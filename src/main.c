#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>
#include "cli_args.h"
#include "csv_writer.h"
#include "gantt.h"
#include "input_parser.h"
#include "restaurant.h"

/* exit codes */
enum { EXIT_BAD_ARGS = 1, EXIT_BAD_INPUT = 2, EXIT_SIM_FAILED = 3, EXIT_WRITE_FAILED = 4 };

/* Gantt chart of the schedule just simulated, on the same 0-based axis as gantt_chart.
 * Returns 0 on success, -1 if the schedule can't be charted. */
static int print_gantt(FILE *out, Process *p, int n, const char *file, const char *algorithm)
{
    static GanttJob jobs[MAXP];
    int count = 0, max_time = 0;

    for (int i = 0; i < n; i++) {
        if (p[i].state != TERMINATED) continue;
        if (p[i].start < 0 || p[i].completion < p[i].start) {
            fprintf(stderr, "  bad times for %s (%d-%d)\n", p[i].id, p[i].start, p[i].completion);
            return -1;
        }
        snprintf(jobs[count].id, sizeof(jobs[count].id), "%s", p[i].id);
        jobs[count].start = p[i].start;
        jobs[count].end = p[i].completion;
        if (p[i].completion > max_time) max_time = p[i].completion;
        count++;
    }
    if (count == 0) {
        fprintf(stderr, "  no completed orders to chart\n");
        return -1;
    }

    gantt_sort_jobs(jobs, count);
    fprintf(out, "\nGANTT CHART (%s :: %s)\n", file, algorithm);
    gantt_print_axis(out, 0, max_time);
    for (int i = 0; i < count; i++)
        gantt_print_bar(out, &jobs[i], 0, max_time);
    return ferror(out) ? -1 : 0;
}

/* The chart is an extra, so it is handled like a caught exception: it is drawn
 * in a child process into a memory buffer and printed only if it completed.
 * Any failure, even a crash, just reports "Error generating graph"; the report
 * above is already complete and restaurant's exit status is unaffected. */
static void try_print_gantt(Process *p, int n, const char *file, const char *algorithm)
{
    int status;
    pid_t pid;

    fflush(stdout);   /* the report is fully written before the chart starts */
    pid = fork();
    if (pid == 0) {
        char *buf = NULL;
        size_t len = 0;
        FILE *out = open_memstream(&buf, &len);

        if (!out) _exit(1);
        gantt_force_color(1);   /* only called when stdout is a terminal */
        if (print_gantt(out, p, n, file, algorithm) != 0 || fclose(out) != 0) _exit(1);
        if (fwrite(buf, 1, len, stdout) != len || fflush(stdout) != 0) _exit(1);
        _exit(0);
    }

    if (pid < 0 || waitpid(pid, &status, 0) < 0 || !WIFEXITED(status) || WEXITSTATUS(status) != 0)
        fprintf(stderr, "\nError generating graph (the results and summary above are complete)\n");
}

/* A1: five-field input, report on stdout, Gantt chart in a terminal. */
static int run_a1(const char *file, SchedulerKind scheduler)
{
    static const Picker pickers[] = { pick_fcfs, pick_priority, pick_sjf };
    static Process p[MAXP];
    const char *algorithm = scheduler_name(scheduler);
    int n, q;
    Memory mem;

    if (read_input(file, p, &n, &q)) { fprintf(stderr, "bad input file\n"); return 1; }
    pool_init(&mem.space, "SPACE", SPACE_CAPACITY);
    pool_init(&mem.table, "TABLE", TABLE_CAPACITY);

    simulate(p, n, pickers[scheduler], first_fit, &mem);   /* A1 orders need no slots */
    /* Only for a terminal: piped/redirected output stays the plain CSV report. */
    int terminal = isatty(STDOUT_FILENO);
    print_results(p, n, terminal, file, algorithm);
    if (terminal) try_print_gantt(p, n, file, algorithm);
    return 0;
}

static void print_error(const char *kind, const Error *error)
{
    if (error->line > 0)
        fprintf(stderr, "%s (line %d): %s\n", kind, error->line, error->message);
    else
        fprintf(stderr, "%s: %s\n", kind, error->message);
}

/* A2: seven-field input -> simulation -> standard result file. */
static int run_standard(const CliOptions *opt)
{
    Workload w;
    SimulationResult result;
    Error error = {0};

    FILE *in = fopen(opt->input_path, "r");
    if (!in) {
        fprintf(stderr, "Input error: cannot open \"%s\"\n", opt->input_path);
        return EXIT_BAD_INPUT;
    }
    int status = read_process_section(in, &w, &error);
    if (status == 0 && expect_only_blank_lines(in, &error) != 0) {
        if (opt->config.phase == PHASE_A3)
            snprintf(error.message, sizeof error.message,
                     "resource/action sections are not supported yet");
        workload_free(&w);
        status = -1;
    }
    fclose(in);
    if (status != 0) {
        print_error("Input error", &error);
        return EXIT_BAD_INPUT;
    }

    if (opt->trace_path)
        fprintf(stderr, "Note: --trace is not available yet; no recording written\n");

    status = simulate_workload(&w, &opt->config, &result, &error);
    workload_free(&w);
    if (status != 0) {
        print_error("Simulation error", &error);
        return EXIT_SIM_FAILED;
    }

    status = write_standard_csv_file(opt->output_path, &result, opt->config.phase, &error);
    simulation_result_free(&result);
    if (status != 0) {
        print_error("Output error", &error);
        return EXIT_WRITE_FAILED;
    }
    return 0;
}

int main(int argc, char **argv)
{
    CliOptions opt;
    Error error = {0};

    if (parse_cli_args(argc, argv, &opt, &error) != 0) {
        fprintf(stderr, "Error: %s\n", error.message);
        print_usage(argv[0]);
        return EXIT_BAD_ARGS;
    }
    if (opt.show_help) {
        print_usage(argv[0]);
        return 0;
    }
    if (opt.legacy_a1) return run_a1(opt.input_path, opt.config.scheduler);
    return run_standard(&opt);
}
