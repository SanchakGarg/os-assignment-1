/*
 * Stress test for the final project: random workloads with random equipment
 * scripts (including out-of-order requests that would deadlock without the
 * prevention policy), run on the real worker threads for every scheduler and
 * allocator. Checks, for every run:
 *   - the run finishes (no hang, no error) with every order completed
 *   - EXCLUSIVITY_VIOLATIONS = 0, UNRESOLVED_DEADLOCKS = 0
 *   - MAX_SIMULTANEOUS_HOLDERS <= 1 and ACQUISITIONS >= ACQUIRE actions
 *   - WAITING = MEM_WAIT + READY_WAIT + RESOURCE_WAIT, all parts >= 0
 *   - COMPLETION >= ARRIVAL + SERVICE, START >= MEM_ADMIT
 * and that the unsafe demo mode always ends (completes or reports a deadlock).
 *
 * Usage: tests/bin/test_concurrency [WORKLOADS]   (default 150)
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "input_parser.h"
#include "restaurant.h"

static const char *const NAMES[] = { "COFFEE_MACHINE", "MICROWAVE", "OVEN_1", "OVEN_2" };
static unsigned long long seed = 12345;
static int failures, runs, deadlocks_seen;

static int rnd(int lo, int hi)    /* inclusive */
{
    seed = seed * 6364136223846793005ULL + 1442695040888963407ULL;
    return lo + (int)((seed >> 33) % (unsigned long long)(hi - lo + 1));
}

#define FAIL(...) do { failures++; printf("FAIL "); printf(__VA_ARGS__); printf("\n"); } while (0)

/* Builds a workload whose action lists are valid by construction. */
static void make_workload(Workload *w, int n)
{
    memset(w, 0, sizeof *w);
    w->n = n;
    w->q = 2;
    w->processes = calloc((size_t)n, sizeof *w->processes);
    w->resource_count = 4;
    w->resources = calloc(4, sizeof *w->resources);
    w->actions = calloc((size_t)n * 8, sizeof *w->actions);
    for (int r = 0; r < 4; r++) {
        snprintf(w->resources[r].id, sizeof w->resources[r].id, "%s", NAMES[r]);
        w->resources[r].capacity = 1;
        w->resources[r].rank = r;
    }
    for (int i = 0; i < n; i++) {
        ProcessInput *p = &w->processes[i];
        snprintf(p->id, sizeof p->id, "P%d", i);
        snprintf(p->category, sizeof p->category, "NORMAL");
        p->arrival = rnd(0, 15);
        p->priority = rnd(1, 3);
        p->service = rnd(1, 8);
        p->space_req = rnd(1, 3);
        p->table_req = rnd(0, 2);

        /* Up to 3 distinct resources in random (often out-of-rank) order,
         * acquired at nondecreasing offsets and released at or after that. */
        int count = rnd(0, 3), used[4] = {0}, off = 0;
        int acq[3], acq_off[3], rel_off[3];
        for (int k = 0; k < count; k++) {
            int r;
            do r = rnd(0, 3); while (used[r]);
            used[r] = 1;
            off = rnd(off, p->service);
            acq[k] = r;
            acq_off[k] = off;
            rel_off[k] = rnd(off, p->service);
        }
        /* Emit in offset order: all events sorted by (offset, acquire-before-release
         * for the same resource). A simple merge over at most 6 events. */
        int emitted[6] = {0};
        for (int e = 0; e < 2 * count; e++) {
            int best = -1, best_off = 0, best_kind = 0;
            for (int k = 0; k < 2 * count; k++) {
                if (emitted[k]) continue;
                int kind = k % 2, idx = k / 2;                     /* 0 acquire, 1 release */
                int o = kind ? rel_off[idx] : acq_off[idx];
                if (kind && !emitted[k - 1]) continue;             /* release after its acquire */
                if (best < 0 || o < best_off || (o == best_off && kind < best_kind)) {
                    best = k; best_off = o; best_kind = kind;
                }
            }
            emitted[best] = 1;
            ActionInput *a = &w->actions[w->action_count++];
            a->process = i;
            a->offset = best_off;
            a->kind = best_kind ? ACTION_RELEASE : ACTION_ACQUIRE;
            a->resource = acq[best / 2];
            a->units = 1;
        }
    }
}

static void check_run(const Workload *w, const SimulationResult *r, const char *label)
{
    if (r->checks.exclusivity_violations != 0) FAIL("%s: exclusivity violations", label);
    if (r->checks.unresolved_deadlocks != 0) FAIL("%s: unresolved deadlocks", label);
    if (r->summary.completed_count != w->n) FAIL("%s: completed %d of %d", label,
                                                 r->summary.completed_count, w->n);
    for (int i = 0; i < r->process_count; i++) {
        const ProcessResult *p = &r->processes[i];
        if (p->waiting != p->mem_wait + p->ready_wait + p->resource_wait)
            FAIL("%s %s: waiting split does not add up", label, p->id);
        if (p->mem_wait < 0 || p->ready_wait < 0 || p->resource_wait < 0)
            FAIL("%s %s: negative wait component", label, p->id);
        if (p->completion < p->arrival + p->service)
            FAIL("%s %s: completed before its service could finish", label, p->id);
        if (p->start < p->mem_admit)
            FAIL("%s %s: started before memory admission", label, p->id);
    }
    for (int k = 0; k < r->resource_count; k++) {
        const ResourceResult *res = &r->resources[k];
        int expected = 0;
        for (int a = 0; a < w->action_count; a++)
            if (w->actions[a].kind == ACTION_ACQUIRE &&
                strcmp(w->resources[w->actions[a].resource].id, res->id) == 0)
                expected++;
        if (res->max_simultaneous_holders > 1) FAIL("%s %s: two holders at once", label, res->id);
        if (res->acquisitions < expected)
            FAIL("%s %s: %d acquisitions < %d ACQUIRE actions", label, res->id,
                 res->acquisitions, expected);
    }
}

int main(int argc, char **argv)
{
    int workloads = argc > 1 ? atoi(argv[1]) : 150;

    for (int k = 0; k < workloads; k++) {
        Workload w;
        make_workload(&w, rnd(2, 25));
        for (int s = 0; s < 3; s++)
            for (int a = 0; a < 3; a++) {
                SimulationConfig cfg = { (SchedulerKind)s, (AllocatorKind)a, PHASE_A3, 0, NULL };
                SimulationResult r;
                Error e = {0};
                char label[64];
                snprintf(label, sizeof label, "workload %d sched %d alloc %d", k, s, a);
                runs++;
                if (simulate_workload(&w, &cfg, NULL, NULL, &r, &e) != 0) {
                    FAIL("%s: %s", label, e.message);
                    continue;
                }
                check_run(&w, &r, label);
                simulation_result_free(&r);
            }

        /* Prevention off: must still end, either complete or a reported deadlock. */
        SimulationConfig unsafe = { SCHED_FCFS, ALLOC_FIRST_FIT, PHASE_A3, 1, NULL };
        SimulationResult r;
        Error e = {0};
        int status = simulate_workload(&w, &unsafe, NULL, NULL, &r, &e);
        runs++;
        if (status == -2) deadlocks_seen++;
        else if (status != 0) FAIL("workload %d unsafe: %s", k, e.message);
        else simulation_result_free(&r);
        workload_free(&w);
    }

    printf("test_concurrency: %d runs, %d failures; unsafe mode hit and reported %d deadlock(s)\n",
           runs, failures, deadlocks_seen);
    return failures != 0;
}
