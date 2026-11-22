#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "restaurant.h"

/*
 * Event-driven simulation of the restaurant: 2 chefs plus the SPACE and TABLE
 * memory pools. At each event time t, in this order:
 *   1. finish orders whose cooking ends at t, freeing their chef and slots
 *   2. put orders arriving at t into the memory queue (ID order)
 *   3. admit from the head of the memory queue until the head does not fit
 *   4. give idle chefs READY orders using the scheduler (chef 0 first)
 * then jump to the next arrival or completion. A1 orders need no slots, so
 * they are admitted the moment they arrive and A1 behaves exactly as before.
 */

static int chef_order[CHEFS];   /* index of order each chef is cooking, -1 if free */
static int chef_end[CHEFS];     /* time each chef finishes its order */

static int *queue;              /* memory queue: arrived orders waiting for slots, FIFO */
static int q_head, q_len;

static int finish_orders(Process *p, int t, Memory *mem)
{
    int finished = 0;
    for (int c = 0; c < CHEFS; c++) {
        if (chef_order[c] < 0 || chef_end[c] != t) continue;
        Process *o = &p[chef_order[c]];
        o->state = TERMINATED;
        o->completion = t;
        pool_release(&mem->space, o->space_at, o->space_req);
        pool_release(&mem->table, o->table_at, o->table_req);
        chef_order[c] = -1;
        finished++;
    }
    return finished;
}

/* Arrivals join the back of the queue; same-time arrivals in ID order. */
static void queue_arrivals(Process *p, int n, int t)
{
    int first = q_len;
    for (int i = 0; i < n; i++) {
        if (p[i].state != NEW || p[i].arrival > t) continue;
        p[i].state = BLOCKED_MEMORY;
        int j = q_len++;
        while (j > first && strcmp(p[queue[j - 1]].id, p[i].id) > 0) {
            queue[j] = queue[j - 1];
            j--;
        }
        queue[j] = i;
    }
}

/* Reserves both pools, or neither: no partial allocation is ever left. */
static int try_admit(Process *o, Memory *mem, Placer place)
{
    int space_at = place(mem->space.slots, mem->space.capacity, o->space_req);
    int table_at = place(mem->table.slots, mem->table.capacity, o->table_req);
    if (space_at < 0 || table_at < 0) return 0;

    pool_take(&mem->space, space_at, o->space_req, o->id);
    pool_take(&mem->table, table_at, o->table_req, o->id);
    o->space_at = space_at;
    o->table_at = table_at;
    return 1;
}

/* Only the head may be admitted; if it does not fit, everyone behind it waits. */
static void admit_from_queue(Process *p, int t, Memory *mem, Placer place)
{
    while (q_head < q_len && try_admit(&p[queue[q_head]], mem, place)) {
        Process *o = &p[queue[q_head++]];
        o->state = READY;
        o->mem_admit = t;
    }
}

static void assign_chefs(Process *p, int n, int t, Picker pick)
{
    for (int c = 0; c < CHEFS; c++) {
        if (chef_order[c] >= 0) continue;
        int i = pick(p, n, t);
        if (i < 0) return;
        p[i].state = RUNNING;
        if (p[i].start < 0) p[i].start = t;
        chef_order[c] = i;
        chef_end[c] = t + p[i].remaining;
    }
}

/* Peak use and fragmentation of the settled pool at this time. */
static void measure(Pool *pool)
{
    int used = pool_used(pool), frag = pool_ext_frag(pool);
    if (used > pool->peak_occupied) pool->peak_occupied = used;
    if (frag > pool->max_ext_frag) pool->max_ext_frag = frag;
}

/* next time something happens: a chef finishes or an order arrives */
static int next_event(Process *p, int n)
{
    int next = INT_MAX;
    for (int c = 0; c < CHEFS; c++)
        if (chef_order[c] >= 0 && chef_end[c] < next) next = chef_end[c];
    for (int i = 0; i < n; i++)
        if (p[i].state == NEW && p[i].arrival < next) next = p[i].arrival;
    return next;
}

int simulate(Process *p, int n, Picker pick, Placer place, Memory *mem)
{
    int t = 0, done = 0;

    queue = malloc((size_t)n * sizeof *queue);
    if (!queue) return -1;
    q_head = q_len = 0;
    for (int c = 0; c < CHEFS; c++) chef_order[c] = -1;

    while (done < n) {
        done += finish_orders(p, t, mem);
        queue_arrivals(p, n, t);
        admit_from_queue(p, t, mem, place);
        assign_chefs(p, n, t, pick);
        measure(&mem->space);
        measure(&mem->table);

        int next = next_event(p, n);
        if (next == INT_MAX) break;   /* nothing left to happen */
        mem->space.occupied_time += (long long)pool_used(&mem->space) * (next - t);
        mem->table.occupied_time += (long long)pool_used(&mem->table) * (next - t);
        t = next;
    }

    free(queue);
    queue = NULL;
    return done == n ? 0 : -1;
}

static void load_process(Process *o, const ProcessInput *in)
{
    memset(o, 0, sizeof *o);
    snprintf(o->id, sizeof o->id, "%s", in->id);
    snprintf(o->category, sizeof o->category, "%s", in->category);
    o->arrival = in->arrival;
    o->priority = in->priority;
    o->service = o->remaining = in->service;
    o->space_req = in->space_req;
    o->table_req = in->table_req;
    o->mem_admit = o->start = o->completion = -1;
    o->state = NEW;
}

int simulate_workload(const Workload *input, const SimulationConfig *config,
                      SimulationResult *out, Error *error)
{
    /* indexed by SchedulerKind / AllocatorKind */
    static const Picker pickers[] = { pick_fcfs, pick_priority, pick_sjf };
    static const Placer placers[] = { first_fit, best_fit, worst_fit };
    int n = input->n;

    memset(out, 0, sizeof *out);
    error->line = 0;

    Process *p = calloc((size_t)n, sizeof *p);
    if (!p) {
        snprintf(error->message, sizeof error->message, "out of memory for %d orders", n);
        return -1;
    }
    for (int i = 0; i < n; i++) load_process(&p[i], &input->processes[i]);

    Memory mem;
    pool_init(&mem.space, "SPACE", SPACE_CAPACITY);
    pool_init(&mem.table, "TABLE", TABLE_CAPACITY);

    int status = simulate(p, n, pickers[config->scheduler], placers[config->allocator], &mem);
    if (status != 0)
        snprintf(error->message, sizeof error->message,
                 "simulation stopped before every order finished");
    else if ((status = collect_results(p, n, &mem, out)) != 0)
        snprintf(error->message, sizeof error->message, "out of memory for the results");

    free(p);
    return status;
}

void simulation_result_free(SimulationResult *result)
{
    free(result->processes);
    free(result->resources);
    memset(result, 0, sizeof *result);
}
