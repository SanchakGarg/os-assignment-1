#ifndef RESTAURANT_H
#define RESTAURANT_H

#include "memory.h"
#include "shared_types.h"

#define CHEFS 2
#define MAXP 1000

/* NEW -> BLOCKED_MEMORY/READY -> RUNNING -> TERMINATED */
typedef enum { NEW, BLOCKED_MEMORY, READY, RUNNING, TERMINATED } State;

typedef struct {
    char id[32], category[32];
    int arrival, priority, service, remaining;
    int space_req, table_req;     /* slots needed; both 0 in A1 */
    int space_at, table_at;       /* first slot held in each pool */
    int mem_admit;                /* time memory was granted */
    int start, completion;
    State state;
} Process;

/* The two memory pools an order needs together. */
typedef struct {
    Pool space;
    Pool table;
} Memory;

typedef int (*Picker)(Process *p, int n, int t);

/* sched.c: which READY order a free chef cooks next (-1 if none) */
int pick_fcfs(Process *p, int n, int t);
int pick_priority(Process *p, int n, int t);
int pick_sjf(Process *p, int n, int t);

/* sim.c: runs every order to completion. Returns 0, or -1 if it got stuck. */
int simulate(Process *p, int n, Picker pick, Placer place, Memory *mem);

/* sim.c: A2 entry point: parsed input + settings -> calculated results */
int simulate_workload(const Workload *input, const SimulationConfig *config,
                      SimulationResult *out, Error *error);
void simulation_result_free(SimulationResult *result);

/* metrics.c */
void print_results(Process *p, int n, int pretty, const char *file, const char *algorithm);
int collect_results(const Process *p, int n, const Memory *mem, SimulationResult *out);

/* input.c: A1 five-field input */
int read_input(const char *file, Process *p, int *n, int *q);

#endif
