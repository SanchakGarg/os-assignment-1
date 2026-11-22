#include "csv_writer.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

static void set_error(Error *error, const char *message)
{
    if (error == NULL)
        return;
    error->line = 0;
    snprintf(error->message, sizeof error->message, "%s", message);
}

/*
 * Prints a decimal statistic with 6 decimal places, then removes trailing
 * zeros (0.500000 -> 0.5, 50.000000 -> 50). Well inside the 10^-3 tolerance.
 */
static int format_decimal(char *buf, size_t size, double value)
{
    if (!isfinite(value))
        return -1;
    if (value == 0.0)
        value = 0.0;                      /* avoid printing -0 */
    snprintf(buf, size, "%.6f", value);
    char *dot = strchr(buf, '.');
    if (dot != NULL) {
        char *end = buf + strlen(buf) - 1;
        while (end > dot && *end == '0')
            *end-- = '\0';
        if (end == dot)
            *end = '\0';
    }
    if (strcmp(buf, "-0") == 0)
        strcpy(buf, "0");
    return 0;
}

static int compare_process_ids(const void *a, const void *b)
{
    const ProcessResult *pa = *(const ProcessResult *const *)a;
    const ProcessResult *pb = *(const ProcessResult *const *)b;
    return strcmp(pa->id, pb->id);
}

static int compare_resource_ids(const void *a, const void *b)
{
    const ResourceResult *ra = *(const ResourceResult *const *)a;
    const ResourceResult *rb = *(const ResourceResult *const *)b;
    return strcmp(ra->id, rb->id);
}

static int write_process_rows(FILE *out, const SimulationResult *r, Phase phase, Error *error)
{
    int n = r->process_count;
    const ProcessResult **sorted = malloc((size_t)(n > 0 ? n : 1) * sizeof *sorted);
    if (sorted == NULL) {
        set_error(error, "out of memory while sorting process rows");
        return -1;
    }
    for (int i = 0; i < n; i++)
        sorted[i] = &r->processes[i];
    qsort(sorted, (size_t)n, sizeof *sorted, compare_process_ids);

    for (int i = 0; i < n; i++) {
        const ProcessResult *p = sorted[i];
        fprintf(out, "PROCESS,%s,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d",
                p->id, p->arrival, p->priority, p->service, p->start, p->completion,
                p->waiting, p->turnaround, p->response,
                p->mem_admit, p->mem_wait, p->ready_wait);
        if (phase == PHASE_A3)
            fprintf(out, ",%d", p->resource_wait);
        fputc('\n', out);
    }
    free(sorted);
    return 0;
}

static int write_summary_rows(FILE *out, const SummaryResult *s, Error *error)
{
    struct { const char *name; double value; } decimals[] = {
        { "AVERAGE_WAITING",         s->average_waiting },
        { "AVERAGE_TURNAROUND",      s->average_turnaround },
        { "AVERAGE_RESPONSE",        s->average_response },
        { "THROUGHPUT",              s->throughput },
        { "SERVICE_UTILIZATION_PCT", s->service_utilization_pct },
        { "AVERAGE_MEMORY_WAIT",     s->average_memory_wait },
    };
    char buf[64];

    for (size_t i = 0; i < sizeof decimals / sizeof decimals[0]; i++) {
        if (format_decimal(buf, sizeof buf, decimals[i].value) != 0) {
            set_error(error, "summary statistic is NaN or infinite");
            return -1;
        }
        fprintf(out, "SUMMARY,%s,%s\n", decimals[i].name, buf);
    }
    fprintf(out, "SUMMARY,COMPLETED_COUNT,%d\n", s->completed_count);
    fprintf(out, "SUMMARY,BLOCKED_FOR_MEMORY_COUNT,%d\n", s->blocked_for_memory_count);
    return 0;
}

static int write_pool_row(FILE *out, const PoolResult *p, Error *error)
{
    char util[64];
    if (format_decimal(util, sizeof util, p->utilization_pct) != 0) {
        set_error(error, "pool utilization is NaN or infinite");
        return -1;
    }
    fprintf(out, "POOL,%s,%d,%d,%s,%d\n",
            p->id, p->capacity, p->peak_occupied, util, p->max_ext_frag_slots);
    return 0;
}

static int write_resource_and_check_rows(FILE *out, const SimulationResult *r, Error *error)
{
    int n = r->resource_count;
    if (n > 0) {
        const ResourceResult **sorted = malloc((size_t)n * sizeof *sorted);
        if (sorted == NULL) {
            set_error(error, "out of memory while sorting resource rows");
            return -1;
        }
        for (int i = 0; i < n; i++)
            sorted[i] = &r->resources[i];
        qsort(sorted, (size_t)n, sizeof *sorted, compare_resource_ids);
        for (int i = 0; i < n; i++)
            fprintf(out, "RESOURCE,%s,%d,%d,%d,%d\n",
                    sorted[i]->id, sorted[i]->capacity,
                    sorted[i]->max_simultaneous_holders,
                    sorted[i]->acquisitions, sorted[i]->wait_events);
        free(sorted);
    }
    fprintf(out, "CHECK,EXCLUSIVITY_VIOLATIONS,%d\n", r->checks.exclusivity_violations);
    fprintf(out, "CHECK,UNRESOLVED_DEADLOCKS,%d\n", r->checks.unresolved_deadlocks);
    fprintf(out, "CHECK,COMPLETED_COUNT,%d\n", r->checks.completed_count);
    return 0;
}

int write_standard_csv(FILE *output, const SimulationResult *result,
                       Phase phase, Error *error)
{
    if (output == NULL || result == NULL) {
        set_error(error, "internal error: null output or result");
        return -1;
    }
    if (!result->complete) {
        set_error(error, "simulation did not complete; no result file written");
        return -1;
    }
    if (result->process_count < 0 || (result->process_count > 0 && result->processes == NULL) ||
        result->resource_count < 0 || (result->resource_count > 0 && result->resources == NULL)) {
        set_error(error, "internal error: inconsistent result counts");
        return -1;
    }

    if (write_process_rows(output, result, phase, error) != 0 ||
        write_summary_rows(output, &result->summary, error) != 0 ||
        write_pool_row(output, &result->pools[0], error) != 0 ||   /* SPACE */
        write_pool_row(output, &result->pools[1], error) != 0)     /* TABLE */
        return -1;

    if (phase == PHASE_A3 && write_resource_and_check_rows(output, result, error) != 0)
        return -1;

    if (fflush(output) != 0 || ferror(output)) {
        set_error(error, "error while writing the result file");
        return -1;
    }
    return 0;
}

int write_standard_csv_file(const char *path, const SimulationResult *result,
                            Phase phase, Error *error)
{
    char tmp_path[4096];
    if (snprintf(tmp_path, sizeof tmp_path, "%s.tmp", path) >= (int)sizeof tmp_path) {
        set_error(error, "output path is too long");
        return -1;
    }

    FILE *out = fopen(tmp_path, "w");
    if (out == NULL) {
        snprintf(error->message, sizeof error->message,
                 "cannot open output file \"%s\" for writing", path);
        error->line = 0;
        return -1;
    }

    int status = write_standard_csv(out, result, phase, error);
    if (fclose(out) != 0 && status == 0) {
        set_error(error, "error while closing the result file");
        status = -1;
    }
    if (status != 0) {
        remove(tmp_path);
        return -1;
    }
    remove(path);                       /* needed on Windows before rename */
    if (rename(tmp_path, path) != 0) {
        remove(tmp_path);
        snprintf(error->message, sizeof error->message,
                 "cannot move result into \"%s\"", path);
        error->line = 0;
        return -1;
    }
    return 0;
}
