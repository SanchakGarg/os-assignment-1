#ifndef RESOURCES_H
#define RESOURCES_H

/*
 * Shared kitchen equipment (final project): MICROWAVE, OVEN_1, OVEN_2 and
 * COFFEE_MACHINE, each with capacity 1.
 *
 * Every order that has resource actions is backed by a real POSIX worker
 * thread. The coordinator (sim.c) owns the virtual clock and the chefs; when
 * an order reaches a WORK_OFFSET with actions, the coordinator hands those
 * actions to the order's worker and waits until every worker has settled.
 * Workers acquire and release equipment themselves, so several of them run at
 * the same time and really compete for the same locks.
 *
 * Synchronization:
 *   - each resource has its own mutex, a FIFO wait queue and a condition
 *     variable; a release hands ownership directly to the first waiter
 *     (no lost wake-ups, no barging, no busy-waiting);
 *   - one control mutex + condition variables carry commands from the
 *     coordinator to the workers and "settled" notifications back;
 *   - lock order is resource lock -> control lock -> trace lock, never the
 *     reverse, so the locks themselves cannot deadlock.
 *
 * Deadlock prevention (default): resources have a global rank
 * COFFEE_MACHINE < MICROWAVE < OVEN_1 < OVEN_2, and a worker only ever waits
 * for a resource ranked above everything it holds. If an order asks for a
 * lower-ranked resource while holding higher-ranked ones, it first releases
 * those (ROLLBACK), then takes all of them again in rank order. That rules
 * out circular wait. With unsafe_demo set, requests are made exactly as
 * written, so a circular wait can form; the coordinator detects it and stops.
 */

#include <stdio.h>
#include "shared_types.h"

typedef struct ResourceSystem ResourceSystem;

/* A worker as the coordinator sees it once all workers have settled. */
typedef enum { WORKER_IDLE = 0, WORKER_BUSY, WORKER_BLOCKED } WorkerStatus;

/* Starts one worker thread per order with actions. log may be NULL.
 * Returns NULL with *error set on failure. */
ResourceSystem *rs_create(const Workload *w, int unsafe_demo, FILE *log, Error *error);

/* Stops and joins every worker (also ones still blocked) and frees everything. */
void rs_destroy(ResourceSystem *rs);

/* 1 if the order's next unprocessed action is at this work offset. */
int rs_pending_at(const ResourceSystem *rs, int order, int offset);

/* Offset of the order's next unprocessed action, or -1 if none is left. */
int rs_next_offset(const ResourceSystem *rs, int order);

/* Virtual time shown in the trace. */
void rs_set_time(ResourceSystem *rs, int t);

/* Runs the actions at the current offset of each listed order, all at once on
 * their worker threads, and returns once every worker is idle or blocked.
 * Returns 0, or -1 if the workers did not settle in time (watchdog). */
int rs_run(ResourceSystem *rs, const int *orders, int count, Error *error);

WorkerStatus rs_status(ResourceSystem *rs, int order);
int rs_held_count(const ResourceSystem *rs, int order);

/* Looks for a cycle in the wait-for graph. Returns 1 and describes it in
 * report, or 0 if there is none. */
int rs_find_deadlock(ResourceSystem *rs, char *report, size_t size);

/* One line in the resource-event trace, from the coordinator. resource may be -1. */
void rs_trace(ResourceSystem *rs, int order, const char *event, int resource,
              const char *detail);

/* RESOURCE rows and the EXCLUSIVITY_VIOLATIONS check. */
int rs_fill_results(ResourceSystem *rs, SimulationResult *out);

#endif
