/*
 * Tests for write_standard_csv() using hand-filled results (no simulator).
 * Run: make test
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "csv_writer.h"

static int failures = 0;

static char *write_to_string(const SimulationResult *r, Phase phase, int *status)
{
    FILE *f = tmpfile();
    Error e = {0};
    *status = write_standard_csv(f, r, phase, &e);
    long size = ftell(f);
    rewind(f);
    char *text = calloc((size_t)size + 1, 1);
    if (fread(text, 1, (size_t)size, f) != (size_t)size) text[0] = 0;
    fclose(f);
    return text;
}

static void expect_text(const char *name, const char *got, const char *expected)
{
    if (strcmp(got, expected) != 0) {
        printf("FAIL %s\n--- expected ---\n%s--- got ---\n%s", name, expected, got);
        failures++;
    }
}

static PoolResult pool(const char *id, int cap, int peak, double util, int frag)
{
    PoolResult p = {0};
    strcpy(p.id, id);
    p.capacity = cap;
    p.peak_occupied = peak;
    p.utilization_pct = util;
    p.max_ext_frag_slots = frag;
    return p;
}

int main(void)
{
    int status;

    /* --- shared-data.md section 5: one order, O1,0,2,2,NORMAL,2,1 --- */
    ProcessResult o1 = { "O1", 0, 2, 2, /*start*/0, /*completion*/2,
                         /*waiting*/0, /*turnaround*/2, /*response*/0,
                         /*mem_admit*/0, /*mem_wait*/0, /*ready_wait*/0, /*resource_wait*/0 };
    SimulationResult one = {0};
    one.complete = 1;
    one.process_count = 1;
    one.processes = &o1;
    one.summary = (SummaryResult){ 0, 2, 0, 0.5, 50.0, 0, 1, 0 };
    one.pools[0] = pool("SPACE", 6, 2, 100.0 / 3.0, 0);
    one.pools[1] = pool("TABLE", 3, 1, 100.0 / 3.0, 0);

    char *text = write_to_string(&one, PHASE_A2, &status);
    if (status != 0) { printf("FAIL one-order A2 returned error\n"); failures++; }
    expect_text("one-order A2", text,
        "PROCESS,O1,0,2,2,0,2,0,2,0,0,0,0\n"
        "SUMMARY,AVERAGE_WAITING,0\n"
        "SUMMARY,AVERAGE_TURNAROUND,2\n"
        "SUMMARY,AVERAGE_RESPONSE,0\n"
        "SUMMARY,THROUGHPUT,0.5\n"
        "SUMMARY,SERVICE_UTILIZATION_PCT,50\n"
        "SUMMARY,AVERAGE_MEMORY_WAIT,0\n"
        "SUMMARY,COMPLETED_COUNT,1\n"
        "SUMMARY,BLOCKED_FOR_MEMORY_COUNT,0\n"
        "POOL,SPACE,6,2,33.333333,0\n"
        "POOL,TABLE,3,1,33.333333,0\n");
    free(text);

    /* --- same run in A3 format with no resources: RESOURCE_WAIT=0, CHECK rows, no RESOURCE rows --- */
    one.checks = (CheckResult){ 0, 0, 1 };
    text = write_to_string(&one, PHASE_A3, &status);
    expect_text("one-order A3 resource-free", text,
        "PROCESS,O1,0,2,2,0,2,0,2,0,0,0,0,0\n"
        "SUMMARY,AVERAGE_WAITING,0\n"
        "SUMMARY,AVERAGE_TURNAROUND,2\n"
        "SUMMARY,AVERAGE_RESPONSE,0\n"
        "SUMMARY,THROUGHPUT,0.5\n"
        "SUMMARY,SERVICE_UTILIZATION_PCT,50\n"
        "SUMMARY,AVERAGE_MEMORY_WAIT,0\n"
        "SUMMARY,COMPLETED_COUNT,1\n"
        "SUMMARY,BLOCKED_FOR_MEMORY_COUNT,0\n"
        "POOL,SPACE,6,2,33.333333,0\n"
        "POOL,TABLE,3,1,33.333333,0\n"
        "CHECK,EXCLUSIVITY_VIOLATIONS,0\n"
        "CHECK,UNRESOLVED_DEADLOCKS,0\n"
        "CHECK,COMPLETED_COUNT,1\n");
    free(text);

    /* --- sorting: IDs are lexicographic (O1 < O10 < O2); resources sorted by ID --- */
    ProcessResult many[3] = {
        { "O2",  0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0 },
        { "O10", 0, 1, 1, 1, 2, 1, 2, 1, 0, 0, 1, 0 },
        { "O1",  0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 3 },
    };
    ResourceResult res[2] = { { "OVEN_1", 1, 1, 2, 1 }, { "MICROWAVE", 1, 1, 1, 0 } };
    SimulationResult r = {0};
    r.complete = 1;
    r.process_count = 3;
    r.processes = many;
    r.pools[0] = pool("SPACE", 6, 3, 25.0, 1);
    r.pools[1] = pool("TABLE", 3, 0, 0.0, 0);
    r.resource_count = 2;
    r.resources = res;
    r.checks = (CheckResult){ 0, 0, 3 };
    text = write_to_string(&r, PHASE_A3, &status);
    const char *p1 = strstr(text, "PROCESS,O1,");
    const char *p10 = strstr(text, "PROCESS,O10,");
    const char *p2 = strstr(text, "PROCESS,O2,");
    const char *mw = strstr(text, "RESOURCE,MICROWAVE,1,1,1,0\n");
    const char *ov = strstr(text, "RESOURCE,OVEN_1,1,1,2,1\n");
    const char *ck = strstr(text, "CHECK,EXCLUSIVITY_VIOLATIONS");
    if (!(p1 && p10 && p2 && p1 < p10 && p10 < p2)) {
        printf("FAIL process rows not in O1, O10, O2 order\n%s", text);
        failures++;
    }
    if (!(mw && ov && ck && mw < ov && ov < ck)) {
        printf("FAIL resource rows not sorted / before CHECK rows\n%s", text);
        failures++;
    }
    if (!strstr(text, "PROCESS,O1,0,1,1,0,1,0,1,0,0,0,0,3\n")) {
        printf("FAIL RESOURCE_WAIT not appended in A3\n%s", text);
        failures++;
    }
    free(text);

    /* --- an incomplete run must produce no output at all --- */
    r.complete = 0;
    text = write_to_string(&r, PHASE_A2, &status);
    if (status == 0 || text[0] != '\0') {
        printf("FAIL incomplete run wrote output\n");
        failures++;
    }
    free(text);

    if (failures == 0)
        printf("test_csv: all tests passed\n");
    return failures == 0 ? 0 : 1;
}
