#ifndef MEMORY_H
#define MEMORY_H

/*
 * Contiguous memory for the restaurant (A2).
 *
 * A pool is a row of unit-sized slots: SPACE has 6 waiting-seat slots, TABLE
 * has 3 dining-table slots. slots[i] == NULL means slot i is free; otherwise
 * it holds the owning order's ID. An order needs `size` ADJACENT free slots.
 */

#include "shared_types.h"   /* SPACE_CAPACITY (6), TABLE_CAPACITY (3) */

#define MAX_SLOTS SPACE_CAPACITY

typedef struct {
    const char *name;                 /* "SPACE" or "TABLE" */
    int capacity;
    const char *slots[MAX_SLOTS];     /* owner ID per slot, NULL = free */

    /* measurements, updated by the simulator */
    int peak_occupied;                /* most slots ever in use at once */
    int max_ext_frag;                 /* largest (free - largest free run) seen */
    long long occupied_time;          /* sum of used slots x time, for utilization */
} Pool;

/*
 * Placement algorithms. Each returns the first slot of the chosen free run,
 * or -1 if no free run has `size` slots. size == 0 needs nothing and returns 0.
 * They only search; pool_take() marks the slots.
 */
typedef int (*Placer)(const char *const slots[], int capacity, int size);

int first_fit(const char *const slots[], int capacity, int size);  /* first run that fits */
int best_fit(const char *const slots[], int capacity, int size);   /* smallest run that fits */
int worst_fit(const char *const slots[], int capacity, int size);  /* largest run */

void pool_init(Pool *pool, const char *name, int capacity);
void pool_take(Pool *pool, int start, int size, const char *owner);
void pool_release(Pool *pool, int start, int size);
int pool_used(const Pool *pool);
int pool_ext_frag(const Pool *pool);   /* free slots - largest free run */

#endif
