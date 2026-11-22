/* Unit tests for first_fit(). Run: make test */
#include <stdio.h>
#include "first_fit.h"

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

    if (failures == 0)
        printf("test_first_fit: all tests passed\n");
    return failures == 0 ? 0 : 1;
}
