#include <stdio.h>
#include "restaurant.h"

/* File format: N, Q, then N lines of ID,ARRIVAL,PRIORITY,SERVICE,CATEGORY */
int read_input(const char *file, Process *p, int *n, int *q)
{
    FILE *f = fopen(file, "r");
    if (!f) return -1;

    if (fscanf(f, "%d %d", n, q) != 2 || *n < 1 || *n > MAXP) {
        fclose(f);
        return -1;
    }
    for (int i = 0; i < *n; i++) {
        int got = fscanf(f, " %31[^,],%d,%d,%d,%31s", p[i].id, &p[i].arrival,
                         &p[i].priority, &p[i].service, p[i].category);
        if (got != 5) {
            fclose(f);
            return -1;
        }
        p[i].remaining = p[i].service;   /* nothing cooked yet */
        p[i].start = -1;                 /* not started yet */
        p[i].state = NEW;
    }
    fclose(f);
    return 0;
}
