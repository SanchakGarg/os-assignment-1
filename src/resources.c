#include "resources.h"

#include <errno.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define WATCHDOG_SECONDS 10   /* workers that have not settled by then are a bug, not a wait */

enum { CMD_NONE = 0, CMD_RUN, CMD_QUIT };

typedef struct {
    char id[MAX_ID_LEN];
    int  rank, capacity;

    pthread_mutex_t lock;     /* guards everything below except the atomics */
    pthread_cond_t  handed;   /* broadcast when ownership moves to a waiter */
    int  holder;              /* order index, -1 when free */
    int *waitq;               /* FIFO of waiting orders (n entries) */
    int  wq_len;
    int  stop;                /* shutting down: waiters give up */

    int  acquisitions, wait_events;
    atomic_int inside;        /* workers that currently believe they own it */
    atomic_int max_inside;
} Resource;

typedef struct {
    struct ResourceSystem *rs;
    int order;
    const char *id;
    pthread_t thread;
    int started;

    /* Owned by the worker while it runs, read by the coordinator only once
     * the worker has settled (ordered by the control mutex). */
    const ActionInput **actions;
    int count, cursor;
    char *held;               /* per resource */

    /* Guarded by rs->ctl. */
    pthread_cond_t wake;
    int command;
    WorkerStatus status;
    int waiting_for;          /* resource index while BLOCKED, else -1 */
} Worker;

struct ResourceSystem {
    const Workload *w;
    int n, r, unsafe;
    Resource *res;
    Worker *workers;          /* n entries; threads only for orders with actions */

    pthread_mutex_t ctl;
    pthread_cond_t  settled;
    int busy;                 /* workers in WORKER_BUSY */

    atomic_int now;           /* virtual time, for the trace */
    atomic_int running;       /* workers executing (not blocked) right now */
    atomic_int peak_running;
    atomic_int violations;
    int thread_count;

    FILE *log;
    pthread_mutex_t log_lock;
    struct timespec t0;

    /* Equipment events for viewers, drained by the coordinator after rs_run.
     * Allocated once in rs_create so workers never allocate. */
    pthread_mutex_t ev_lock;
    ResEvent *ev;
    int ev_len, ev_cap;
};

static _Thread_local const char *thread_name = "coordinator";

static void atomic_max(atomic_int *target, int value)
{
    int seen = atomic_load(target);
    while (value > seen && !atomic_compare_exchange_weak(target, &seen, value))
        ;
}

static void trace_line(ResourceSystem *rs, int order, const char *event, int resource,
                       const char *detail)
{
    if (!rs->log) return;
    struct timespec now;
    pthread_mutex_lock(&rs->log_lock);           /* timestamp inside: lines stay in time order */
    clock_gettime(CLOCK_MONOTONIC, &now);
    double ms = (now.tv_sec - rs->t0.tv_sec) * 1e3 + (now.tv_nsec - rs->t0.tv_nsec) / 1e6;
    fprintf(rs->log, "%9.3fms  t=%-3d %-14s %-6s %-17s %-15s %s\n", ms, atomic_load(&rs->now),
            thread_name, order >= 0 ? rs->w->processes[order].id : "-", event,
            resource >= 0 ? rs->res[resource].id : "-", detail ? detail : "");
    fflush(rs->log);
    pthread_mutex_unlock(&rs->log_lock);
}

void rs_trace(ResourceSystem *rs, int order, const char *event, int resource, const char *detail)
{
    trace_line(rs, order, event, resource, detail);
}

/* Records an equipment event for viewers. Called with the resource lock held,
 * so a release is always recorded before the hand-over it causes. */
static void note(ResourceSystem *rs, ResEventKind kind, int order, int resource)
{
    pthread_mutex_lock(&rs->ev_lock);
    if (rs->ev_len < rs->ev_cap)             /* full: the viewer misses it, nothing else does */
        rs->ev[rs->ev_len++] = (ResEvent){ kind, order, resource };
    pthread_mutex_unlock(&rs->ev_lock);
}

/* ---- resource operations, run on worker threads ---- */

/* The calling worker now owns r: count it and check exclusivity independently. */
static void became_owner(ResourceSystem *rs, Resource *r)
{
    int inside = atomic_fetch_add(&r->inside, 1) + 1;
    atomic_max(&r->max_inside, inside);
    if (inside > r->capacity) atomic_fetch_add(&rs->violations, 1);
}

/* Blocks until the worker owns resource ri. Returns 0, or -1 on shutdown. */
static int res_acquire(Worker *wk, int ri)
{
    ResourceSystem *rs = wk->rs;
    Resource *r = &rs->res[ri];
    char detail[96];

    trace_line(rs, wk->order, "REQUEST", ri, "");
    pthread_mutex_lock(&r->lock);
    if (r->holder < 0) {
        r->holder = wk->order;
        r->acquisitions++;
        became_owner(rs, r);
        trace_line(rs, wk->order, "ACQUIRE", ri, "granted (free)");
        note(rs, RES_ACQUIRE, wk->order, ri);
        pthread_mutex_unlock(&r->lock);
        return 0;
    }

    /* Busy: join the FIFO queue, tell the coordinator, sleep until handed over. */
    r->waitq[r->wq_len++] = wk->order;
    r->wait_events++;
    snprintf(detail, sizeof detail, "held by %s, queue position %d",
             rs->w->processes[r->holder].id, r->wq_len);
    trace_line(rs, wk->order, "WAIT", ri, detail);
    note(rs, RES_WAIT, wk->order, ri);       /* before reporting blocked, so rs_run sees it */

    pthread_mutex_lock(&rs->ctl);
    wk->status = WORKER_BLOCKED;
    wk->waiting_for = ri;
    if (--rs->busy == 0) pthread_cond_broadcast(&rs->settled);
    pthread_mutex_unlock(&rs->ctl);
    atomic_fetch_sub(&rs->running, 1);

    while (r->holder != wk->order && !r->stop)
        pthread_cond_wait(&r->handed, &r->lock);
    if (r->holder != wk->order) {           /* shutdown */
        pthread_mutex_unlock(&r->lock);
        return -1;
    }
    atomic_max(&rs->peak_running, atomic_fetch_add(&rs->running, 1) + 1);
    r->acquisitions++;
    became_owner(rs, r);
    trace_line(rs, wk->order, "ACQUIRE", ri, "granted (handed over on release)");
    note(rs, RES_ACQUIRE, wk->order, ri);
    pthread_mutex_unlock(&r->lock);
    return 0;
}

/* Releases resource ri, handing it straight to the first waiter if any. */
static void res_release(Worker *wk, int ri, const char *event)
{
    ResourceSystem *rs = wk->rs;
    Resource *r = &rs->res[ri];
    ResEventKind kind = strcmp(event, "ROLLBACK") == 0 ? RES_ROLLBACK : RES_RELEASE;
    char detail[96];

    atomic_fetch_sub(&r->inside, 1);
    pthread_mutex_lock(&r->lock);
    if (r->holder != wk->order) {           /* double release: never allowed */
        atomic_fetch_add(&rs->violations, 1);
        trace_line(rs, wk->order, "BAD_RELEASE", ri, "not the holder");
        pthread_mutex_unlock(&r->lock);
        return;
    }
    note(rs, kind, wk->order, ri);
    if (r->wq_len == 0) {
        r->holder = -1;
        trace_line(rs, wk->order, event, ri, "now free");
    } else {
        int next = r->waitq[0];
        memmove(r->waitq, r->waitq + 1, (size_t)--r->wq_len * sizeof *r->waitq);
        r->holder = next;
        /* The waiter is busy again before this worker can report settled,
         * so the coordinator never sees a half-finished hand-over. */
        pthread_mutex_lock(&rs->ctl);
        rs->workers[next].status = WORKER_BUSY;
        rs->workers[next].waiting_for = -1;
        rs->busy++;
        pthread_mutex_unlock(&rs->ctl);
        snprintf(detail, sizeof detail, "handed to %s", rs->w->processes[next].id);
        trace_line(rs, wk->order, event, ri, detail);
        pthread_cond_broadcast(&r->handed);
    }
    pthread_mutex_unlock(&r->lock);
}

static int by_rank(const void *a, const void *b, const ResourceSystem *rs)
{
    return rs->res[*(const int *)a].rank - rs->res[*(const int *)b].rank;
}

/* Performs every action at the worker's current offset. Returns -1 on shutdown. */
static int run_actions(Worker *wk)
{
    ResourceSystem *rs = wk->rs;
    int offset = wk->actions[wk->cursor]->offset;
    int list[8];

    while (wk->cursor < wk->count && wk->actions[wk->cursor]->offset == offset) {
        const ActionInput *a = wk->actions[wk->cursor];
        if (a->kind == ACTION_RELEASE) {
            res_release(wk, a->resource, "RELEASE");
            wk->held[a->resource] = 0;
        } else {
            int m = 0;
            /* Prevention: never wait for a resource while holding a higher-ranked
             * one. Give those back first and take everything again in rank order. */
            for (int h = 0; h < rs->r && !rs->unsafe; h++)
                if (wk->held[h] && rs->res[h].rank > rs->res[a->resource].rank) {
                    res_release(wk, h, "ROLLBACK");
                    wk->held[h] = 0;
                    list[m++] = h;
                }
            list[m++] = a->resource;
            for (int i = 1; i < m; i++)              /* insertion sort by rank */
                for (int j = i; j > 0 && by_rank(&list[j - 1], &list[j], rs) > 0; j--) {
                    int tmp = list[j]; list[j] = list[j - 1]; list[j - 1] = tmp;
                }
            for (int i = 0; i < m; i++) {
                if (res_acquire(wk, list[i]) != 0) return -1;
                wk->held[list[i]] = 1;
            }
        }
        wk->cursor++;
    }
    return 0;
}

static void *worker_main(void *arg)
{
    Worker *wk = arg;
    ResourceSystem *rs = wk->rs;
    char name[48];
    snprintf(name, sizeof name, "worker-%s", wk->id);
    thread_name = name;

    pthread_mutex_lock(&rs->ctl);
    for (;;) {
        while (wk->command == CMD_NONE)
            pthread_cond_wait(&wk->wake, &rs->ctl);
        if (wk->command == CMD_QUIT) break;
        wk->command = CMD_NONE;
        pthread_mutex_unlock(&rs->ctl);

        atomic_max(&rs->peak_running, atomic_fetch_add(&rs->running, 1) + 1);
        int status = run_actions(wk);

        pthread_mutex_lock(&rs->ctl);
        if (status != 0) break;              /* shut down while blocked */
        atomic_fetch_sub(&rs->running, 1);
        wk->status = WORKER_IDLE;
        if (--rs->busy == 0) pthread_cond_broadcast(&rs->settled);
    }
    pthread_mutex_unlock(&rs->ctl);
    return NULL;
}

/* ---- coordinator side ---- */

ResourceSystem *rs_create(const Workload *w, int unsafe_demo, FILE *log, Error *error)
{
    ResourceSystem *rs = calloc(1, sizeof *rs);
    if (!rs) goto oom;
    rs->w = w;
    rs->n = w->n;
    rs->r = w->resource_count;
    rs->unsafe = unsafe_demo;
    rs->log = log;
    clock_gettime(CLOCK_MONOTONIC, &rs->t0);
    pthread_mutex_init(&rs->ctl, NULL);
    pthread_cond_init(&rs->settled, NULL);
    pthread_mutex_init(&rs->log_lock, NULL);
    pthread_mutex_init(&rs->ev_lock, NULL);

    /* One ACQUIRE makes at most 3R-1 events (rollbacks, waits, acquires). */
    rs->ev_cap = w->action_count * 3 * (rs->r > 0 ? rs->r : 1) + 1;
    rs->ev = calloc((size_t)rs->ev_cap, sizeof *rs->ev);
    if (!rs->ev) goto oom;

    rs->res = calloc((size_t)(rs->r > 0 ? rs->r : 1), sizeof *rs->res);
    rs->workers = calloc((size_t)rs->n, sizeof *rs->workers);
    if (!rs->res || !rs->workers) goto oom;

    for (int i = 0; i < rs->r; i++) {
        Resource *r = &rs->res[i];
        snprintf(r->id, sizeof r->id, "%s", w->resources[i].id);
        r->rank = w->resources[i].rank;
        r->capacity = w->resources[i].capacity;
        r->holder = -1;
        r->waitq = calloc((size_t)rs->n, sizeof *r->waitq);
        pthread_mutex_init(&r->lock, NULL);
        pthread_cond_init(&r->handed, NULL);
        if (!r->waitq) goto oom;
    }

    for (int i = 0; i < rs->n; i++) {
        Worker *wk = &rs->workers[i];
        wk->rs = rs;
        wk->order = i;
        wk->id = w->processes[i].id;
        wk->waiting_for = -1;
        pthread_cond_init(&wk->wake, NULL);
        for (int k = 0; k < w->action_count; k++)
            if (w->actions[k].process == i) wk->count++;
        if (wk->count == 0) continue;
        wk->actions = calloc((size_t)wk->count, sizeof *wk->actions);
        wk->held = calloc((size_t)(rs->r > 0 ? rs->r : 1), 1);
        if (!wk->actions || !wk->held) goto oom;
        for (int k = 0, j = 0; k < w->action_count; k++)
            if (w->actions[k].process == i) wk->actions[j++] = &w->actions[k];
    }

    for (int i = 0; i < rs->n; i++) {
        Worker *wk = &rs->workers[i];
        if (wk->count == 0) continue;
        if (pthread_create(&wk->thread, NULL, worker_main, wk) != 0) {
            snprintf(error->message, sizeof error->message, "could not start worker thread for %s",
                     wk->id);
            rs_destroy(rs);
            return NULL;
        }
        wk->started = 1;
        rs->thread_count++;
    }
    if (log) {
        char detail[160];
        snprintf(detail, sizeof detail, "%d worker thread(s), %d resource(s), deadlock prevention %s",
                 rs->thread_count, rs->r, unsafe_demo ? "OFF (unsafe demo)" : "ON (ordered + rollback)");
        trace_line(rs, -1, "START", -1, detail);
    }
    return rs;

oom:
    snprintf(error->message, sizeof error->message, "out of memory for the resource system");
    rs_destroy(rs);
    return NULL;
}

void rs_destroy(ResourceSystem *rs)
{
    if (!rs) return;
    if (rs->workers) {
        pthread_mutex_lock(&rs->ctl);
        for (int i = 0; i < rs->n; i++) {
            rs->workers[i].command = CMD_QUIT;
            pthread_cond_signal(&rs->workers[i].wake);
        }
        pthread_mutex_unlock(&rs->ctl);
    }
    for (int i = 0; rs->res && i < rs->r; i++) {     /* wake workers stuck in a wait */
        pthread_mutex_lock(&rs->res[i].lock);
        rs->res[i].stop = 1;
        pthread_cond_broadcast(&rs->res[i].handed);
        pthread_mutex_unlock(&rs->res[i].lock);
    }
    for (int i = 0; rs->workers && i < rs->n; i++) {
        Worker *wk = &rs->workers[i];
        if (wk->started) pthread_join(wk->thread, NULL);
        pthread_cond_destroy(&wk->wake);
        free(wk->actions);
        free(wk->held);
    }
    for (int i = 0; rs->res && i < rs->r; i++) {
        pthread_mutex_destroy(&rs->res[i].lock);
        pthread_cond_destroy(&rs->res[i].handed);
        free(rs->res[i].waitq);
    }
    if (rs->log && rs->thread_count > 0) {
        char detail[128];
        snprintf(detail, sizeof detail, "peak workers running resource code at once: %d",
                 atomic_load(&rs->peak_running));
        trace_line(rs, -1, "STOP", -1, detail);
    }
    pthread_mutex_destroy(&rs->ctl);
    pthread_cond_destroy(&rs->settled);
    pthread_mutex_destroy(&rs->log_lock);
    pthread_mutex_destroy(&rs->ev_lock);
    free(rs->ev);
    free(rs->res);
    free(rs->workers);
    free(rs);
}

int rs_pending_at(const ResourceSystem *rs, int order, int offset)
{
    const Worker *wk = &rs->workers[order];
    return wk->cursor < wk->count && wk->actions[wk->cursor]->offset == offset;
}

int rs_next_offset(const ResourceSystem *rs, int order)
{
    const Worker *wk = &rs->workers[order];
    return wk->cursor < wk->count ? wk->actions[wk->cursor]->offset : -1;
}

void rs_set_time(ResourceSystem *rs, int t)
{
    atomic_store(&rs->now, t);
}

int rs_run(ResourceSystem *rs, const int *orders, int count, Error *error)
{
    struct timespec deadline;
    clock_gettime(CLOCK_REALTIME, &deadline);
    deadline.tv_sec += WATCHDOG_SECONDS;

    /* All commands are posted while the control lock is held, so the workers
     * start together the moment the coordinator begins waiting. */
    pthread_mutex_lock(&rs->ctl);
    for (int i = 0; i < count; i++) {
        Worker *wk = &rs->workers[orders[i]];
        wk->command = CMD_RUN;
        wk->status = WORKER_BUSY;
        rs->busy++;
        pthread_cond_signal(&wk->wake);
    }
    while (rs->busy > 0) {
        if (pthread_cond_timedwait(&rs->settled, &rs->ctl, &deadline) == ETIMEDOUT && rs->busy > 0) {
            pthread_mutex_unlock(&rs->ctl);
            snprintf(error->message, sizeof error->message,
                     "watchdog: resource workers did not settle within %d s", WATCHDOG_SECONDS);
            return -1;
        }
    }
    pthread_mutex_unlock(&rs->ctl);
    return 0;
}

WorkerStatus rs_status(ResourceSystem *rs, int order)
{
    pthread_mutex_lock(&rs->ctl);
    WorkerStatus s = rs->workers[order].status;
    pthread_mutex_unlock(&rs->ctl);
    return s;
}

int rs_held_count(const ResourceSystem *rs, int order)
{
    const Worker *wk = &rs->workers[order];
    int held = 0;
    for (int i = 0; wk->held && i < rs->r; i++) held += wk->held[i];
    return held;
}

int rs_take_events(ResourceSystem *rs, ResEvent *out, int max)
{
    pthread_mutex_lock(&rs->ev_lock);
    int count = rs->ev_len < max ? rs->ev_len : max;
    memcpy(out, rs->ev, (size_t)count * sizeof *out);
    memmove(rs->ev, rs->ev + count, (size_t)(rs->ev_len - count) * sizeof *rs->ev);
    rs->ev_len -= count;
    pthread_mutex_unlock(&rs->ev_lock);
    return count;
}

int rs_resource_count(const ResourceSystem *rs)
{
    return rs->r;
}

const char *rs_resource_id(const ResourceSystem *rs, int resource)
{
    return rs->res[resource].id;
}

/* The resource lock is needed even when settled: a worker that has just
 * reported itself blocked holds it until it reaches pthread_cond_wait. */
int rs_holder(ResourceSystem *rs, int resource)
{
    Resource *r = &rs->res[resource];
    pthread_mutex_lock(&r->lock);
    int holder = r->holder;
    pthread_mutex_unlock(&r->lock);
    return holder;
}

int rs_waiters(ResourceSystem *rs, int resource, int *out, int max)
{
    Resource *r = &rs->res[resource];
    pthread_mutex_lock(&r->lock);
    int count = r->wq_len < max ? r->wq_len : max;
    memcpy(out, r->waitq, (size_t)count * sizeof *out);
    pthread_mutex_unlock(&r->lock);
    return count;
}

int rs_waiting_for(ResourceSystem *rs, int order)
{
    pthread_mutex_lock(&rs->ctl);
    int ri = rs->workers[order].status == WORKER_BLOCKED ? rs->workers[order].waiting_for : -1;
    pthread_mutex_unlock(&rs->ctl);
    return ri;
}

int rs_find_deadlock(ResourceSystem *rs, char *report, size_t size)
{
    int n = rs->n;
    int *waits = malloc((size_t)n * sizeof *waits);     /* resource each order waits for */
    int *next = malloc((size_t)n * sizeof *next);       /* order holding that resource */
    int *mark = calloc((size_t)n, sizeof *mark);
    int found = 0;
    if (!waits || !next || !mark) goto out;

    pthread_mutex_lock(&rs->ctl);
    for (int i = 0; i < n; i++)
        waits[i] = rs->workers[i].status == WORKER_BLOCKED ? rs->workers[i].waiting_for : -1;
    pthread_mutex_unlock(&rs->ctl);
    for (int i = 0; i < n; i++) {
        next[i] = -1;
        if (waits[i] < 0) continue;
        pthread_mutex_lock(&rs->res[waits[i]].lock);
        next[i] = rs->res[waits[i]].holder;
        pthread_mutex_unlock(&rs->res[waits[i]].lock);
    }

    /* Each order waits for at most one other, so follow the chain from every start. */
    for (int s = 0; s < n && !found; s++) {
        int i = s;
        while (i >= 0 && mark[i] == 0) { mark[i] = s + 1; i = next[i]; }
        if (i < 0 || mark[i] != s + 1) continue;
        found = 1;
        size_t len = (size_t)snprintf(report, size, "wait-for cycle:");
        int start = i;
        do {
            if (len < size)
                len += (size_t)snprintf(report + len, size - len, "%s %s waits for %s (held by %s)",
                                        i == start ? "" : ";",
                                        rs->w->processes[i].id, rs->res[waits[i]].id,
                                        rs->w->processes[next[i]].id);
            i = next[i];
        } while (i != start);
    }
out:
    free(waits);
    free(next);
    free(mark);
    return found;
}

int rs_fill_results(ResourceSystem *rs, SimulationResult *out)
{
    out->resource_count = rs->r;
    out->resources = calloc((size_t)(rs->r > 0 ? rs->r : 1), sizeof *out->resources);
    if (!out->resources) return -1;
    int leftover = 0;
    for (int i = 0; i < rs->r; i++) {
        Resource *r = &rs->res[i];
        ResourceResult *o = &out->resources[i];
        pthread_mutex_lock(&r->lock);
        snprintf(o->id, sizeof o->id, "%s", r->id);
        o->capacity = r->capacity;
        o->max_simultaneous_holders = atomic_load(&r->max_inside);
        o->acquisitions = r->acquisitions;
        o->wait_events = r->wait_events;
        if (r->holder >= 0 || r->wq_len > 0) leftover++;   /* conservation: all returned */
        pthread_mutex_unlock(&r->lock);
    }
    out->checks.exclusivity_violations = atomic_load(&rs->violations) + leftover;
    return 0;
}
