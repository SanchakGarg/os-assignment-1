#include <stddef.h>
#include "memory.h"

/*
 * Finds the next free run at or after *i. Returns its length (0 if there is
 * none) and its first slot in *start; *i is left just past the run.
 */
static int next_free_run(const char *const slots[], int capacity, int *i, int *start)
{
    while (*i < capacity && slots[*i] != NULL) (*i)++;
    *start = *i;
    while (*i < capacity && slots[*i] == NULL) (*i)++;
    return *i - *start;
}

static int bad_request(const char *const slots[], int capacity, int size)
{
    return slots == NULL || size < 0 || size > capacity;
}

/* Choose the first suitable free run when scanning from slot 0 upward. */
int first_fit(const char *const slots[], int capacity, int size)
{
    if (size == 0) return 0;                 /* e.g. TABLE_REQ = 0 */
    if (bad_request(slots, capacity, size)) return -1;

    int i = 0, start, len;
    while ((len = next_free_run(slots, capacity, &i, &start)) > 0)
        if (len >= size) return start;
    return -1;                               /* does not fit: order waits */
}

/* Choose the suitable free run with the smallest length (ties: lowest slot). */
int best_fit(const char *const slots[], int capacity, int size)
{
    if (size == 0) return 0;
    if (bad_request(slots, capacity, size)) return -1;

    int i = 0, start, len, best = -1, best_len = 0;
    while ((len = next_free_run(slots, capacity, &i, &start)) > 0)
        if (len >= size && (best < 0 || len < best_len)) {
            best = start;
            best_len = len;
        }
    return best;
}

/* Choose the suitable free run with the largest length (ties: lowest slot). */
int worst_fit(const char *const slots[], int capacity, int size)
{
    if (size == 0) return 0;
    if (bad_request(slots, capacity, size)) return -1;

    int i = 0, start, len, best = -1, best_len = 0;
    while ((len = next_free_run(slots, capacity, &i, &start)) > 0)
        if (len >= size && len > best_len) {
            best = start;
            best_len = len;
        }
    return best;
}

void pool_init(Pool *pool, const char *name, int capacity)
{
    pool->name = name;
    pool->capacity = capacity;
    for (int i = 0; i < MAX_SLOTS; i++) pool->slots[i] = NULL;
    pool->peak_occupied = 0;
    pool->max_ext_frag = 0;
    pool->occupied_time = 0;
}

void pool_take(Pool *pool, int start, int size, const char *owner)
{
    for (int i = start; i < start + size; i++) pool->slots[i] = owner;
}

/* Frees exactly the slots given; neighbouring free runs merge automatically. */
void pool_release(Pool *pool, int start, int size)
{
    for (int i = start; i < start + size; i++) pool->slots[i] = NULL;
}

int pool_used(const Pool *pool)
{
    int used = 0;
    for (int i = 0; i < pool->capacity; i++)
        if (pool->slots[i] != NULL) used++;
    return used;
}

int pool_ext_frag(const Pool *pool)
{
    int i = 0, start, len, largest = 0;
    while ((len = next_free_run(pool->slots, pool->capacity, &i, &start)) > 0)
        if (len > largest) largest = len;
    return pool->capacity - pool_used(pool) - largest;
}
