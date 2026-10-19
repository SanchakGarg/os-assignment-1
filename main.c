#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>
#include "gantt.h"
#include "restaurant.h"

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

int main(int argc, char **argv)
{
    static Process p[MAXP];
    int n, q;
    Picker pick;

    if (argc != 3) { fprintf(stderr, "usage: %s INPUT_FILE FCFS|PRIORITY|SJF\n", argv[0]); return 1; }
    if (!strcmp(argv[2], "FCFS")) pick = pick_fcfs;
    else if (!strcmp(argv[2], "PRIORITY")) pick = pick_priority;
    else if (!strcmp(argv[2], "SJF")) pick = pick_sjf;
    else { fprintf(stderr, "unknown algorithm: %s\n", argv[2]); return 1; }
    if (read_input(argv[1], p, &n, &q)) { fprintf(stderr, "bad input file\n"); return 1; }

    simulate(p, n, pick);
    /* Only for a terminal: piped/redirected output stays the plain CSV report. */
    int terminal = isatty(STDOUT_FILENO);
    print_results(p, n, terminal, argv[1], argv[2]);
    if (terminal) try_print_gantt(p, n, argv[1], argv[2]);
    return 0;
}
