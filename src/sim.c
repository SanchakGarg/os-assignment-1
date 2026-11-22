#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "restaurant.h"

/*
 * Event-driven simulation of the restaurant: 2 chefs, the SPACE and TABLE
 * memory pools and (final project) the shared kitchen equipment. This loop is
 * the single coordinator: it owns the virtual clock, the chefs and the memory.
 * Equipment is acquired and released by real worker threads (resources.c).
 *
 * At each event time t the state is settled by repeating, until nothing changes:
 *   1. orders on a chef that reached a WORK_OFFSET with actions hand them to
 *      their workers, all at once, and the coordinator waits for the workers
 *   2. an order whose worker is now blocked gives up its chef (it keeps its
 *      memory); a blocked order whose worker got the equipment becomes READY
 *   3. orders with no service left complete, freeing their chef and slots;
 *      orders that can cook start their next stretch, up to the next action
 *   4. orders arriving at t join the memory queue (ID order), and the head of
 *      the queue is admitted until it does not fit
 *   5. idle chefs take READY orders using the scheduler (chef 0 first)
 * then jump to the next arrival or end of a stretch. Without equipment this is
 * exactly the A2 order: completions, arrivals, admission, dispatch. A1 orders
 * need no slots, so they are admitted the moment they arrive.
 */

static int chef_order[CHEFS];   /* index of order each chef is cooking, -1 if free */
static int chef_end[CHEFS];     /* time the current stretch ends; -1 = at an action point */
static int chef_stop[CHEFS];    /* work offset the current stretch ends at */

static int *queue;              /* memory queue: arrived orders waiting for slots, FIFO */
static int q_head, q_len;

static SimEvent *events;        /* what happened at the current time, for on_step */
static int event_count, event_cap;
static int *executed;           /* per order, for on_step: service done by the current time */

static ResourceSystem *rs;      /* NULL when there is no equipment */

static void record(EventType type, int order, int chef, int resource)
{
    if (event_count == event_cap) {
        SimEvent *grown = realloc(events, (size_t)event_cap * 2 * sizeof *events);
        if (!grown) return;     /* the viewer misses an event; the simulation is unaffected */
        events = grown;
        event_cap *= 2;
    }
    events[event_count++] = (SimEvent){ type, order, chef, resource };
}

static int done_units(const Process *o) { return o->service - o->remaining; }

static int has_pending(const Process *p, int i)
{
    return rs && rs_pending_at(rs, i, done_units(&p[i]));
}

static void complete(Process *p, int i, int t, Memory *mem, int chef)
{
    Process *o = &p[i];
    o->state = TERMINATED;
    o->completion = t;
    pool_release(&mem->space, o->space_at, o->space_req);
    pool_release(&mem->table, o->table_at, o->table_req);
    record(EV_COMPLETE, i, chef, -1);
    if (chef >= 0) chef_order[chef] = -1;
}

/* Chefs whose stretch ends now stop at their action point (or the end). */
static void reach_stops(Process *p, int t)
{
    for (int c = 0; c < CHEFS; c++) {
        if (chef_order[c] < 0 || chef_end[c] != t) continue;
        p[chef_order[c]].remaining = p[chef_order[c]].service - chef_stop[c];
        chef_end[c] = -1;
    }
}

/* Cooks from the current offset up to the next action or the end of service. */
static void start_stretch(Process *p, int c, int t)
{
    Process *o = &p[chef_order[c]];
    int stop = o->service;
    if (rs) {
        int next = rs_next_offset(rs, chef_order[c]);
        if (next >= 0 && next < stop) stop = next;
    }
    if (o->start < 0) o->start = t;       /* first unit of real service */
    chef_stop[c] = stop;
    chef_end[c] = t + stop - done_units(o);
}

static int chef_of(int order)
{
    for (int c = 0; c < CHEFS; c++)
        if (chef_order[c] == order) return c;
    return -1;
}

/* Equipment operations the workers just did, as events for on_step. */
static void record_equipment_events(void)
{
    static const EventType types[] = { EV_RESOURCE_ACQUIRE, EV_RESOURCE_WAIT,
                                       EV_RESOURCE_RELEASE, EV_RESOURCE_ROLLBACK };
    ResEvent batch[32];
    int got;
    while ((got = rs_take_events(rs, batch, 32)) > 0)
        for (int k = 0; k < got; k++)
            record(types[batch[k].kind], batch[k].order, chef_of(batch[k].order), batch[k].resource);
}

/* Steps 1 and 2. Returns 1 if anything changed, -1 if the workers failed. */
static int run_actions(Process *p, int n, int t, Error *error)
{
    int round[CHEFS], m = 0, changed = 0;
    char detail[64];

    if (!rs) return 0;
    for (int c = 0; c < CHEFS; c++)
        if (chef_order[c] >= 0 && chef_end[c] < 0 && has_pending(p, chef_order[c]))
            round[m++] = chef_order[c];
    if (m > 0) {
        rs_set_time(rs, t);
        if (rs_run(rs, round, m, error) != 0) return -1;
        record_equipment_events();
        changed = 1;
    }
    for (int c = 0; c < CHEFS; c++) {
        int i = chef_order[c];
        if (i < 0 || rs_status(rs, i) != WORKER_BLOCKED) continue;
        p[i].state = BLOCKED_RESOURCE;
        p[i].blocked_since = t;
        p[i].blocked_on = rs_waiting_for(rs, i);
        chef_order[c] = -1;
        record(EV_RESOURCE_BLOCK, i, c, p[i].blocked_on);
        snprintf(detail, sizeof detail, "gives up chef %d, keeps its memory", c);
        rs_trace(rs, i, "BLOCKED_RESOURCE", -1, detail);
        changed = 1;
    }
    for (int i = 0; i < n; i++) {
        if (p[i].state != BLOCKED_RESOURCE || rs_status(rs, i) != WORKER_IDLE) continue;
        p[i].state = READY;
        p[i].resource_wait += t - p[i].blocked_since;
        record(EV_RESOURCE_UNBLOCK, i, -1, p[i].blocked_on);
        snprintf(detail, sizeof detail, "READY again after waiting %d", t - p[i].blocked_since);
        rs_trace(rs, i, "UNBLOCK", -1, detail);
        changed = 1;
    }
    return changed;
}

/* Step 3. Returns the number of orders completed; sets *changed. */
static int finish_or_continue(Process *p, int n, int t, Memory *mem, int *changed)
{
    int finished = 0;
    for (int c = 0; c < CHEFS; c++) {
        int i = chef_order[c];
        if (i < 0 || chef_end[c] >= 0 || has_pending(p, i)) continue;
        if (p[i].remaining == 0) {
            complete(p, i, t, mem, c);
            finished++;
            *changed = 1;
        } else {
            start_stretch(p, c, t);
        }
    }
    for (int i = 0; i < n; i++)            /* got its equipment at its very last offset */
        if (p[i].state == READY && p[i].remaining == 0 && !has_pending(p, i)) {
            complete(p, i, t, mem, -1);
            finished++;
            *changed = 1;
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
        record(EV_ARRIVE, i, -1, -1);
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

/* Only the head may be admitted; if it does not fit, everyone behind it waits.
 * Returns the number admitted. */
static int admit_from_queue(Process *p, int t, Memory *mem, Placer place)
{
    int admitted = 0;
    while (q_head < q_len && try_admit(&p[queue[q_head]], mem, place)) {
        Process *o = &p[queue[q_head]];
        o->state = READY;
        o->mem_admit = t;
        record(EV_MEMORY_ADMIT, queue[q_head++], -1, -1);
        admitted++;
    }
    return admitted;
}

/* Step 5. The order is at an action point until step 3 starts its stretch. */
static int assign_chefs(Process *p, int n, int t, Picker pick)
{
    int assigned = 0;
    for (int c = 0; c < CHEFS; c++) {
        if (chef_order[c] >= 0) continue;
        int i = pick(p, n, t);
        if (i < 0) break;
        p[i].state = RUNNING;
        chef_order[c] = i;
        chef_end[c] = -1;
        record(EV_DISPATCH, i, c, -1);
        assigned++;
    }
    return assigned;
}

/* Peak use and fragmentation of the settled pool at this time. */
static void measure(Pool *pool)
{
    int used = pool_used(pool), frag = pool_ext_frag(pool);
    if (used > pool->peak_occupied) pool->peak_occupied = used;
    if (frag > pool->max_ext_frag) pool->max_ext_frag = frag;
}

/* next time something happens: a stretch of cooking ends or an order arrives */
static int next_event(Process *p, int n)
{
    int next = INT_MAX;
    for (int c = 0; c < CHEFS; c++)
        if (chef_order[c] >= 0 && chef_end[c] >= 0 && chef_end[c] < next) next = chef_end[c];
    for (int i = 0; i < n; i++)
        if (p[i].state == NEW && p[i].arrival < next) next = p[i].arrival;
    return next;
}

/* Hands the settled state at time t to the viewer, then starts a new event list. */
static void report(Process *p, int n, int t, Memory *mem, SnapshotFn on_step, void *ctx)
{
    if (on_step && event_count > 0) {
        int stretch_end[CHEFS];
        for (int i = 0; i < n; i++)
            executed[i] = done_units(&p[i]);      /* exact except mid-stretch, fixed below */
        for (int c = 0; c < CHEFS; c++) {
            stretch_end[c] = chef_order[c] >= 0 ? chef_end[c] : -1;
            if (chef_order[c] >= 0 && chef_end[c] >= 0)
                executed[chef_order[c]] = chef_stop[c] - (chef_end[c] - t);
        }
        Snapshot s = { t, p, n, chef_order, mem, queue + q_head, q_len - q_head,
                       events, event_count, executed, stretch_end, rs };
        on_step(&s, ctx);
    }
    event_count = 0;
}

/* Settles everything that happens at time t. Returns orders completed, or -1. */
static int settle(Process *p, int n, int t, Picker pick, Placer place, Memory *mem,
                  Error *error)
{
    int finished = 0, changed;
    int queued_before = q_len;

    queue_arrivals(p, n, t);
    do {
        changed = run_actions(p, n, t, error);
        if (changed < 0) return -1;
        finished += finish_or_continue(p, n, t, mem, &changed);
        if (admit_from_queue(p, t, mem, place) > 0) changed = 1;
        if (assign_chefs(p, n, t, pick) > 0) changed = 1;
    } while (changed);

    for (int k = (q_head > queued_before ? q_head : queued_before); k < q_len; k++)
        record(EV_MEMORY_BLOCK, queue[k], -1, -1);    /* arrived now but did not fit */
    return finished;
}

static void free_buffers(void)
{
    free(queue);
    free(events);
    free(executed);
    queue = NULL;
    events = NULL;
    executed = NULL;
    rs = NULL;
}

int simulate(Process *p, int n, Picker pick, Placer place, Memory *mem,
             ResourceSystem *resources, SnapshotFn on_step, void *ctx, Error *error)
{
    int t = 0, done = 0;
    char report_text[MAX_ERROR_LEN - 64];

    queue = malloc((size_t)n * sizeof *queue);
    event_cap = 3 * n + 2 * CHEFS;
    events = malloc((size_t)event_cap * sizeof *events);
    executed = malloc((size_t)(n > 0 ? n : 1) * sizeof *executed);
    if (!queue || !events || !executed) {
        free_buffers();
        snprintf(error->message, sizeof error->message, "out of memory for %d orders", n);
        return -1;
    }
    rs = resources;
    q_head = q_len = event_count = 0;
    for (int c = 0; c < CHEFS; c++) chef_order[c] = -1;

    while (done < n) {
        reach_stops(p, t);
        int finished = settle(p, n, t, pick, place, mem, error);
        if (finished < 0) { free_buffers(); return -1; }
        done += finished;
        measure(&mem->space);
        measure(&mem->table);
        report(p, n, t, mem, on_step, ctx);

        if (rs && rs_find_deadlock(rs, report_text, sizeof report_text)) {
            rs_trace(rs, -1, "DEADLOCK", -1, report_text);
            snprintf(error->message, sizeof error->message, "deadlock at t=%d: %s", t, report_text);
            free_buffers();
            return -2;
        }

        int next = next_event(p, n);
        if (next == INT_MAX) break;   /* nothing left to happen */
        mem->space.occupied_time += (long long)pool_used(&mem->space) * (next - t);
        mem->table.occupied_time += (long long)pool_used(&mem->table) * (next - t);
        t = next;
    }

    free_buffers();
    if (done < n) {
        snprintf(error->message, sizeof error->message,
                 "simulation stopped at t=%d with %d of %d orders unfinished", t, n - done, n);
        return -1;
    }
    for (int i = 0; resources && i < n; i++)
        if (rs_held_count(resources, i) != 0) {
            snprintf(error->message, sizeof error->message,
                     "%s finished while still holding equipment", p[i].id);
            return -1;
        }
    return 0;
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
    o->mem_admit = o->start = o->completion = o->blocked_since = o->blocked_on = -1;
    o->state = NEW;
}

int simulate_workload(const Workload *input, const SimulationConfig *config,
                      SnapshotFn on_step, void *ctx,
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

    /* Equipment: one worker thread per order with resource actions. */
    ResourceSystem *resources = NULL;
    FILE *log = NULL;
    if (input->resource_count > 0 || input->action_count > 0) {
        if (config->resource_log && strcmp(config->resource_log, "-") == 0)
            log = stderr;
        else if (config->resource_log && !(log = fopen(config->resource_log, "w"))) {
            snprintf(error->message, sizeof error->message,
                     "cannot write the resource trace \"%s\"", config->resource_log);
            free(p);
            return -1;
        }
        resources = rs_create(input, config->unsafe_demo, log, error);
        if (!resources) {
            if (log && log != stderr) fclose(log);
            free(p);
            return -1;
        }
    }

    int status = simulate(p, n, pickers[config->scheduler], placers[config->allocator], &mem,
                          resources, on_step, ctx, error);
    if (status == 0 && collect_results(p, n, &mem, out) != 0) {
        snprintf(error->message, sizeof error->message, "out of memory for the results");
        status = -1;
    }
    if (status == 0 && resources && rs_fill_results(resources, out) != 0) {
        snprintf(error->message, sizeof error->message, "out of memory for the results");
        status = -1;
    }
    if (status == 0 && out->checks.exclusivity_violations > 0) {
        snprintf(error->message, sizeof error->message,
                 "%d exclusivity violation(s) detected", out->checks.exclusivity_violations);
        status = -1;
    }
    if (status != 0) simulation_result_free(out);

    rs_destroy(resources);
    if (log && log != stderr) fclose(log);
    free(p);
    return status;
}

void simulation_result_free(SimulationResult *result)
{
    free(result->processes);
    free(result->resources);
    memset(result, 0, sizeof *result);
}
