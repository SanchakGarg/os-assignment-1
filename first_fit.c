#include "first_fit.h"
#include <stddef.h>

int first_fit(const char *const slots[], int capacity, int size)
{
    if (size == 0)
        return 0;                        /* nothing to allocate */
    if (slots == NULL || size < 0 || size > capacity)
        return -1;

    int run_start = -1;
    int run_len = 0;

    for (int i = 0; i < capacity; i++) {
        if (slots[i] == NULL) {          /* free slot extends the current run */
            if (run_len == 0)
                run_start = i;
            run_len++;
            if (run_len == size)
                return run_start;        /* first run that is big enough */
        } else {                         /* occupied slot ends the run */
            run_len = 0;
        }
    }
    return -1;                           /* does not fit: order waits (FIFO) */
}
