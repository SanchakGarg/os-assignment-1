#ifndef RESTAURANT_H
#define RESTAURANT_H

#include "memory.h"
#include "resources.h"
#include "shared_types.h"

#define CHEFS 2
#define MAXP 1000

/* NEW -> BLOCKED_MEMORY/READY -> RUNNING -> TERMINATED, and in the final project
 * RUNNING -> BLOCKED_RESOURCE -> READY when kitchen equipment is busy. */
typedef enum { NEW, BLOCKED_MEMORY, READY, RUNNING, TERMINATED, BLOCKED_RESOURCE } State;

typedef struct {
    char id[32], category[32];
    int arrival, priority, service, remaining;
    int space_req, table_req;     /* slots needed; both 0 in A1 */
    int space_at, table_at;       /* first slot held in each pool */
    int mem_admit;                /* time memory was granted */
    int start, completion;
    int blocked_since;            /* time it entered BLOCKED_RESOURCE */
    int blocked_on;               /* resource it waits for (or last waited for), -1 if none */
    int resource_wait;            /* total time spent in BLOCKED_RESOURCE */
    State state;
} Process;

/* The two memory pools an order needs together. */
typedef struct {
    Pool space;
    Pool table;
} Memory;

typedef int (*Picker)(Process *p, int n, int t);

/* What happened at one event time, for live viewers (e.g. the web server). */
typedef enum { EV_ARRIVE, EV_MEMORY_BLOCK, EV_MEMORY_ADMIT, EV_DISPATCH, EV_COMPLETE,
               EV_RESOURCE_BLOCK, EV_RESOURCE_UNBLOCK,
               EV_RESOURCE_ACQUIRE, EV_RESOURCE_WAIT, EV_RESOURCE_RELEASE,
               EV_RESOURCE_ROLLBACK } EventType;

typedef struct {
    EventType type;
    int order;                        /* index into the Process array */
    int chef;                         /* chef number, -1 if not about a chef */
    int resource;                     /* equipment index, -1 if not about equipment */
} SimEvent;

/* The whole restaurant after all events at `time`. Pointers are valid only
 * during the callback: copy what you need before returning. */
typedef struct {
    int time;
    const Process *p;
    int n;
    const int *chefs;                 /* CHEFS entries: order index or -1 */
    const Memory *mem;
    const int *mem_queue;             /* orders waiting for slots, head first */
    int mem_queue_len;
    const SimEvent *events;
    int event_count;
    const int *executed;              /* n entries: service units done by `time` */
    const int *stretch_end;           /* CHEFS entries: when the current stretch ends, -1 if idle */
    ResourceSystem *rs;               /* equipment state (rs_holder...), NULL if none */
} Snapshot;

typedef void (*SnapshotFn)(const Snapshot *s, void *ctx);

/* sched.c: which READY order a free chef cooks next (-1 if none) */
int pick_fcfs(Process *p, int n, int t);
int pick_priority(Process *p, int n, int t);
int pick_sjf(Process *p, int n, int t);

/* sim.c: runs every order to completion. rs (NULL if there is no equipment)
 * runs the orders' resource actions on worker threads. Returns 0; -1 if it got
 * stuck or the workers failed (message in *error); -2 on a detected deadlock.
 * If on_step is not NULL it is called once per event time. */
int simulate(Process *p, int n, Picker pick, Placer place, Memory *mem,
             ResourceSystem *rs, SnapshotFn on_step, void *ctx, Error *error);

/* sim.c: entry point: parsed input + settings -> calculated results.
 * Returns 0, -1 on error, or -2 if the unsafe demo hit a deadlock. */
int simulate_workload(const Workload *input, const SimulationConfig *config,
                      SnapshotFn on_step, void *ctx,
                      SimulationResult *out, Error *error);
void simulation_result_free(SimulationResult *result);

/* metrics.c */
void print_results(Process *p, int n, int pretty, const char *file, const char *algorithm);
int collect_results(const Process *p, int n, const Memory *mem, SimulationResult *out);

/* input.c: A1 five-field input */
int read_input(const char *file, Process *p, int *n, int *q);

#endif
