/* Unit tests for first_fit(). Run: make test */
#include <stdio.h>
#include "memory.h"

static int failures = 0;

#define CHECK(expr, expected)                                                   \
    do {                                                                        \
        int got_ = (expr);                                                      \
        if (got_ != (expected)) {                                               \
            printf("FAIL line %d: %s = %d, expected %d\n",                      \
                   __LINE__, #expr, got_, (expected));                          \
            failures++;                                                         \
        }                                                                       \
    } while (0)

#define X "busy"   /* any non-NULL owner */

int main(void)
{
    /* Empty SPACE pool (6 slots) */
    const char *empty[6] = { NULL, NULL, NULL, NULL, NULL, NULL };
    CHECK(first_fit(empty, 6, 1), 0);           /* size 1 */
    CHECK(first_fit(empty, 6, 6), 0);           /* full capacity */
    CHECK(first_fit(empty, 6, 7), -1);          /* larger than the pool */
    CHECK(first_fit(empty, 6, 0), 0);           /* TABLE_REQ=0 style: nothing needed */
    CHECK(first_fit(empty, 6, -1), -1);         /* invalid size */

    /* Full pool */
    const char *full[6] = { X, X, X, X, X, X };
    CHECK(first_fit(full, 6, 1), -1);
    CHECK(first_fit(full, 6, 0), 0);

    /* Holes: [X _ X _ _ X]  -> hole of 1 at 1, hole of 2 at 3 */
    const char *holes[6] = { X, NULL, X, NULL, NULL, X };
    CHECK(first_fit(holes, 6, 1), 1);           /* first hole wins even though it is small */
    CHECK(first_fit(holes, 6, 2), 3);           /* skips the 1-slot hole */
    CHECK(first_fit(holes, 6, 3), -1);          /* 3 free slots total, but not contiguous */

    /* Exact fit at the end: [X X X X _ _] */
    const char *tail[6] = { X, X, X, X, NULL, NULL };
    CHECK(first_fit(tail, 6, 2), 4);

    /* Equal-sized holes: [_ _ X _ _ X] -> lowest address */
    const char *equal[6] = { NULL, NULL, X, NULL, NULL, X };
    CHECK(first_fit(equal, 6, 2), 0);

    /* First Fit vs Best Fit difference: [_ _ _ X _ X], size 1
       First Fit takes slot 0 (Best Fit would take slot 4). */
    const char *mixed[6] = { NULL, NULL, NULL, X, NULL, X };
    CHECK(first_fit(mixed, 6, 1), 0);

    /* TABLE pool (3 slots) */
    const char *table[3] = { NULL, X, NULL };
    CHECK(first_fit(table, 3, 1), 0);
    CHECK(first_fit(table, 3, 2), -1);
    CHECK(first_fit(table, 3, 3), -1);

    /* Best Fit: smallest run that fits. [_ _ _ X _ X] size 1 -> the 1-slot hole */
    CHECK(best_fit(mixed, 6, 1), 4);
    CHECK(best_fit(mixed, 6, 2), 0);            /* only the 3-slot run fits */
    CHECK(best_fit(holes, 6, 1), 1);            /* [X _ X _ _ X]: 1-slot hole */
    CHECK(best_fit(holes, 6, 2), 3);
    CHECK(best_fit(equal, 6, 2), 0);            /* equal runs -> lowest slot */
    CHECK(best_fit(full, 6, 1), -1);
    CHECK(best_fit(empty, 6, 6), 0);
    CHECK(best_fit(empty, 6, 0), 0);

    /* Worst Fit: largest run. */
    CHECK(worst_fit(holes, 6, 1), 3);           /* 2-slot hole beats 1-slot hole */
    CHECK(worst_fit(mixed, 6, 1), 0);
    CHECK(worst_fit(equal, 6, 1), 0);           /* equal runs -> lowest slot */
    CHECK(worst_fit(holes, 6, 3), -1);          /* 3 free, but not adjacent */
    CHECK(worst_fit(full, 6, 1), -1);
    CHECK(worst_fit(empty, 6, 0), 0);

    /* Pool helpers: [_ _ A _ B B] -> 3 free, largest run 2, fragmentation 1 */
    Pool pool;
    pool_init(&pool, "SPACE", 6);
    pool_take(&pool, 2, 1, "A");
    pool_take(&pool, 4, 2, "B");
    CHECK(pool_used(&pool), 3);
    CHECK(pool_ext_frag(&pool), 1);
    pool_release(&pool, 2, 1);                  /* [_ _ _ _ B B]: holes merge */
    CHECK(pool_ext_frag(&pool), 0);
    CHECK(first_fit(pool.slots, 6, 4), 0);
    pool_release(&pool, 4, 2);
    CHECK(pool_used(&pool), 0);                 /* empty pool: no fragmentation */
    CHECK(pool_ext_frag(&pool), 0);

    if (failures == 0)
        printf("test_memory: all tests passed\n");
    return failures == 0 ? 0 : 1;
}
