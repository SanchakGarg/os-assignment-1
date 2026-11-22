#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "restaurant.h"

#define BOLD  "\033[1m"
#define DIM   "\033[2m"
#define RESET "\033[0m"

typedef struct {
    double avg_wait, avg_turn, avg_resp, throughput, utilization;
    int count, elapsed;
} Summary;

static int by_id(const void *a, const void *b)
{
    return strcmp(((const Process *)a)->id, ((const Process *)b)->id);
}

static int waiting(const Process *p)    { return p->completion - p->arrival - p->service; }
static int turnaround(const Process *p) { return p->completion - p->arrival; }
static int response(const Process *p)   { return p->start - p->arrival; }

static Summary summarize(const Process *p, int n)
{
    Summary s = {0};
    double total_wait = 0, total_turn = 0, total_resp = 0, busy = 0;
    int first_arrival = p[0].arrival, last_completion = 0, count = 0;

    for (int i = 0; i < n; i++) {
        if (p[i].state != TERMINATED) continue;
        total_wait += waiting(&p[i]);
        total_turn += turnaround(&p[i]);
        total_resp += response(&p[i]);
        busy += p[i].service;
        count++;
        if (p[i].arrival < first_arrival) first_arrival = p[i].arrival;
        if (p[i].completion > last_completion) last_completion = p[i].completion;
    }

    s.count = count;
    if (count == 0) count = 1;                       /* avoid divide by zero */
    int elapsed = last_completion - first_arrival;
    if (elapsed <= 0) elapsed = 1;

    s.elapsed = elapsed;
    s.avg_wait = total_wait / count;
    s.avg_turn = total_turn / count;
    s.avg_resp = total_resp / count;
    s.throughput = (double)s.count / elapsed;
    s.utilization = busy / (CHEFS * elapsed) * 100;
    return s;
}

static void print_csv(const Process *p, int n, const Summary *s)
{
    puts("PROCESS_ID,ARRIVAL,PRIORITY,SERVICE,START,COMPLETION,WAITING,TURNAROUND,RESPONSE");
    for (int i = 0; i < n; i++) {
        if (p[i].state != TERMINATED) continue;
        printf("%s,%d,%d,%d,%d,%d,%d,%d,%d\n", p[i].id, p[i].arrival, p[i].priority,
               p[i].service, p[i].start, p[i].completion, waiting(&p[i]),
               turnaround(&p[i]), response(&p[i]));
    }

    puts("SUMMARY");
    printf("AVERAGE_WAITING,%.2f\n", s->avg_wait);
    printf("AVERAGE_TURNAROUND,%.2f\n", s->avg_turn);
    printf("AVERAGE_RESPONSE,%.2f\n", s->avg_resp);
    printf("THROUGHPUT,%.4f\n", s->throughput);
    printf("UTILIZATION,%.2f\n", s->utilization);
}

/* Box-drawing rule: widths[] are the column content widths. */
static void rule(const char *left, const char *mid, const char *right, const int *widths, int cols)
{
    fputs(left, stdout);
    for (int c = 0; c < cols; c++) {
        for (int i = 0; i < widths[c] + 2; i++) fputs("─", stdout);
        fputs(c < cols - 1 ? mid : right, stdout);
    }
    putchar('\n');
}

static void print_pretty(const Process *p, int n, const Summary *s, const char *file, const char *algorithm)
{
    static const char *heads[] = {"Order", "Arrival", "Priority", "Service", "Start",
                                  "Completion", "Waiting", "Turnaround", "Response"};
    enum { COLS = 9 };
    int w[COLS];

    for (int c = 0; c < COLS; c++) w[c] = (int)strlen(heads[c]);
    for (int i = 0; i < n; i++)
        if ((int)strlen(p[i].id) > w[0]) w[0] = (int)strlen(p[i].id);

    printf("\n" BOLD "RESULTS" RESET DIM "  %s :: %s" RESET "\n", file, algorithm);
    rule("┌", "┬", "┐", w, COLS);
    fputs("│", stdout);
    for (int c = 0; c < COLS; c++)
        printf(" " BOLD "%-*s" RESET " │", w[c], heads[c]);
    putchar('\n');
    rule("├", "┼", "┤", w, COLS);
    for (int i = 0; i < n; i++) {
        if (p[i].state != TERMINATED) continue;
        int v[] = {p[i].arrival, p[i].priority, p[i].service, p[i].start, p[i].completion,
                   waiting(&p[i]), turnaround(&p[i]), response(&p[i])};
        printf("│ %-*s │", w[0], p[i].id);
        for (int c = 1; c < COLS; c++) printf(" %*d │", w[c], v[c - 1]);
        putchar('\n');
    }
    rule("└", "┴", "┘", w, COLS);

    char val[5][32];
    const char *labels[] = {"Average waiting", "Average turnaround", "Average response",
                            "Throughput", "Utilization"};
    snprintf(val[0], sizeof val[0], "%.2f", s->avg_wait);
    snprintf(val[1], sizeof val[1], "%.2f", s->avg_turn);
    snprintf(val[2], sizeof val[2], "%.2f", s->avg_resp);
    snprintf(val[3], sizeof val[3], "%.4f orders/time", s->throughput);
    snprintf(val[4], sizeof val[4], "%.2f %%", s->utilization);

    int sw[2] = {18, 0};
    for (int r = 0; r < 5; r++)
        if ((int)strlen(val[r]) > sw[1]) sw[1] = (int)strlen(val[r]);

    printf("\n" BOLD "SUMMARY" RESET DIM "  %d orders, %d chefs, %d time units" RESET "\n",
           s->count, CHEFS, s->elapsed);
    rule("┌", "┬", "┐", sw, 2);
    for (int r = 0; r < 5; r++)
        printf("│ %-*s │ " BOLD "%*s" RESET " │\n", sw[0], labels[r], sw[1], val[r]);
    rule("└", "┴", "┘", sw, 2);
}

static void pool_result(PoolResult *r, const Pool *pool, int elapsed)
{
    snprintf(r->id, sizeof r->id, "%s", pool->name);
    r->capacity = pool->capacity;
    r->peak_occupied = pool->peak_occupied;
    r->utilization_pct = (double)pool->occupied_time / ((double)pool->capacity * elapsed) * 100;
    r->max_ext_frag_slots = pool->max_ext_frag;
}

/*
 * A2 results (spec section 7). For order i with arrival A, memory admission M,
 * first start S, completion C and service B:
 *   turnaround = C - A, response = S - A, waiting = C - A - B,
 *   memory wait = M - A, resource wait = time spent in BLOCKED_RESOURCE,
 *   ready wait = waiting - memory wait - resource wait (final spec section 7).
 * E = last completion - first arrival; throughput = N / E;
 * chef utilization = sum(B) / (2E); pool utilization = occupied slot-time / (KE).
 * Returns 0, or -1 if out of memory.
 */
int collect_results(const Process *p, int n, const Memory *mem, SimulationResult *out)
{
    memset(out, 0, sizeof *out);
    out->processes = calloc((size_t)n, sizeof *out->processes);
    if (!out->processes) return -1;
    out->process_count = n;

    double total_wait = 0, total_turn = 0, total_resp = 0, total_mem = 0, busy = 0;
    int first_arrival = p[0].arrival, last_completion = 0, blocked = 0;

    for (int i = 0; i < n; i++) {
        ProcessResult *r = &out->processes[i];
        snprintf(r->id, sizeof r->id, "%s", p[i].id);
        r->arrival = p[i].arrival;
        r->priority = p[i].priority;
        r->service = p[i].service;
        r->start = p[i].start;
        r->completion = p[i].completion;
        r->mem_admit = p[i].mem_admit;
        r->turnaround = turnaround(&p[i]);
        r->waiting = waiting(&p[i]);
        r->response = response(&p[i]);
        r->mem_wait = p[i].mem_admit - p[i].arrival;
        r->resource_wait = p[i].resource_wait;
        r->ready_wait = r->waiting - r->mem_wait - r->resource_wait;

        total_wait += r->waiting;
        total_turn += r->turnaround;
        total_resp += r->response;
        total_mem += r->mem_wait;
        busy += p[i].service;
        if (r->mem_wait > 0) blocked++;   /* did not get its slots on arrival */
        if (p[i].arrival < first_arrival) first_arrival = p[i].arrival;
        if (p[i].completion > last_completion) last_completion = p[i].completion;
    }

    int elapsed = last_completion - first_arrival;   /* E > 0: every SERVICE >= 1 */
    SummaryResult *s = &out->summary;
    s->average_waiting = total_wait / n;
    s->average_turnaround = total_turn / n;
    s->average_response = total_resp / n;
    s->average_memory_wait = total_mem / n;
    s->throughput = (double)n / elapsed;
    s->service_utilization_pct = busy / (CHEFS * elapsed) * 100;
    s->completed_count = n;
    s->blocked_for_memory_count = blocked;

    pool_result(&out->pools[0], &mem->space, elapsed);
    pool_result(&out->pools[1], &mem->table, elapsed);

    out->checks.completed_count = n;   /* A3 CHECK rows; resources.c adds the rest */
    out->complete = 1;
    return 0;
}

/* pretty: formatted tables for a terminal; otherwise the exact CSV report. */
void print_results(Process *p, int n, int pretty, const char *file, const char *algorithm)
{
    qsort(p, n, sizeof *p, by_id);
    Summary s = summarize(p, n);

    if (pretty) print_pretty(p, n, &s, file, algorithm);
    else print_csv(p, n, &s);
}
