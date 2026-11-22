/*
 * shared_types.h -- types shared by the parser, simulator and CSV writer:
 * the parsed input (Workload), the run settings (SimulationConfig) and the
 * calculated results (SimulationResult). Field names follow shared-data.md
 * section 2.
 *
 * Return convention: 0 = success, -1 = error (details in Error).
 */
#ifndef SHARED_TYPES_H
#define SHARED_TYPES_H

#define MAX_ID_LEN        32   /* including terminating NUL */
#define MAX_CATEGORY_LEN  32
#define MAX_ERROR_LEN    256

#define SPACE_CAPACITY 6
#define TABLE_CAPACITY 3

typedef struct {
    int  line;                       /* input line number, 0 if not applicable */
    char message[MAX_ERROR_LEN];
} Error;

typedef enum { PHASE_A2 = 0, PHASE_A3 = 1 } Phase;
typedef enum { SCHED_FCFS = 0, SCHED_PRIORITY, SCHED_SJF } SchedulerKind;
typedef enum { ALLOC_FIRST_FIT = 0, ALLOC_BEST_FIT, ALLOC_WORST_FIT } AllocatorKind;

/* One input row: ID,ARRIVAL,PRIORITY,SERVICE,CATEGORY,SPACE_REQ,TABLE_REQ */
typedef struct {
    char id[MAX_ID_LEN];
    int  arrival;
    int  priority;
    int  service;
    char category[MAX_CATEGORY_LEN];
    int  space_req;
    int  table_req;
} ProcessInput;

/* A3 resource row: RESOURCE_ID,CAPACITY */
typedef struct {
    char id[MAX_ID_LEN];
    int  capacity;
    int  rank;                /* position in the global acquisition order */
} ResourceInput;

typedef enum { ACTION_ACQUIRE = 0, ACTION_RELEASE } ActionKind;

/* A3 action row: ID,WORK_OFFSET,ACTION,RESOURCE_ID,UNITS (indices, not names) */
typedef struct {
    int        process;       /* index into Workload.processes */
    int        offset;        /* units of the order's own service done so far */
    ActionKind kind;
    int        resource;      /* index into Workload.resources */
    int        units;
} ActionInput;

typedef struct {
    int           n;          /* number of processes */
    int           q;          /* RR quantum (read, unused by Restaurant schedulers) */
    ProcessInput *processes;  /* n entries, heap-allocated; free with workload_free */
    int           lines_read; /* input lines consumed so far, for A3 error line numbers */
    int            resource_count;   /* A3: R; 0 if the sections are omitted */
    ResourceInput *resources;
    int            action_count;     /* A3: K */
    ActionInput   *actions;          /* in input-row order */
} Workload;

typedef struct {
    SchedulerKind scheduler;
    AllocatorKind allocator;
    Phase         phase;
    int           unsafe_demo;       /* 1: deadlock prevention OFF (bounded demo) */
    const char   *resource_log;      /* resource-event trace file, "-" = stderr, NULL = none */
} SimulationConfig;

/* Final per-process result (shared-data.md section 2). */
typedef struct {
    char id[MAX_ID_LEN];
    int  arrival, priority, service;
    int  start, completion;
    int  waiting, turnaround, response;
    int  mem_admit, mem_wait, ready_wait, resource_wait;
} ProcessResult;

typedef struct {
    double average_waiting;
    double average_turnaround;
    double average_response;
    double throughput;
    double service_utilization_pct;
    double average_memory_wait;
    int    completed_count;
    int    blocked_for_memory_count;
} SummaryResult;

typedef struct {
    char   id[8];            /* "SPACE" or "TABLE" */
    int    capacity;
    int    peak_occupied;
    double utilization_pct;
    int    max_ext_frag_slots;
} PoolResult;

typedef struct {
    char id[MAX_ID_LEN];
    int  capacity;
    int  max_simultaneous_holders;
    int  acquisitions;
    int  wait_events;
} ResourceResult;

typedef struct {
    int exclusivity_violations;
    int unresolved_deadlocks;
    int completed_count;
} CheckResult;

typedef struct {
    int             complete;        /* 1 only when the run finished normally */
    int             process_count;
    ProcessResult  *processes;
    SummaryResult   summary;
    PoolResult      pools[2];        /* [0] = SPACE, [1] = TABLE */
    int             resource_count;  /* A3 only; 0 in A2 */
    ResourceResult *resources;
    CheckResult     checks;          /* A3 only */
} SimulationResult;

#endif /* SHARED_TYPES_H */
