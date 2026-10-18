#include <string.h>
#include "restaurant.h"

/* Return index of the READY process to run next, or -1 if none. */

int pick_fcfs(Process *p, int n, int t)
{
    /* TODO */
    return -1;
}

int pick_priority(Process *p, int n, int t)
{
    int best = -1;
    for (int i = 0; i < n; i++) {
        if (p[i].state != READY) continue;
        if (best < 0) { best = i; continue; }

        if (p[i].priority != p[best].priority) {
            if (p[i].priority < p[best].priority) best = i;      /* higher priority */
        } else if (p[i].arrival != p[best].arrival) {
            if (p[i].arrival < p[best].arrival) best = i;        /* arrived earlier */
        } else if (strcmp(p[i].id, p[best].id) < 0) {
            best = i;                                            /* smaller ID */
        }
    }
    return best;
}

int pick_sjf(Process *p, int n, int t)
{
    int best = -1;
    for (int i = 0; i < n; i++) {
        if (p[i].state != READY) continue;
        if (best < 0) { best = i; continue; }

        if (p[i].service != p[best].service) {
            if (p[i].service < p[best].service) best = i;        /* shorter job */
        } else if (p[i].arrival != p[best].arrival) {
            if (p[i].arrival < p[best].arrival) best = i;        /* arrived earlier */
        } else if (strcmp(p[i].id, p[best].id) < 0) {
            best = i;                                            /* smaller ID */
        }
    }
    return best;
}
