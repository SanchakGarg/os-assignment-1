#include <limits.h>
#include "restaurant.h"

static int chef_order[CHEFS];   /* index of order each chef is cooking, -1 if free */
static int chef_end[CHEFS];     /* time each chef finishes its order */

static int finish_orders(Process *p, int t)
{
    int finished = 0;
    for (int c = 0; c < CHEFS; c++) {
        if (chef_order[c] < 0 || chef_end[c] != t) continue;
        p[chef_order[c]].state = TERMINATED;
        p[chef_order[c]].completion = t;
        chef_order[c] = -1;
        finished++;
    }
    return finished;
}

static void admit_arrivals(Process *p, int n, int t)
{
    for (int i = 0; i < n; i++)
        if (p[i].state == NEW && p[i].arrival <= t)
            p[i].state = READY;
}

static void assign_chefs(Process *p, int n, int t, Picker pick)
{
    for (int c = 0; c < CHEFS; c++) {
        if (chef_order[c] >= 0) continue;
        int i = pick(p, n, t);
        if (i < 0) return;
        p[i].state = RUNNING;
        if (p[i].start < 0) p[i].start = t;
        chef_order[c] = i;
        chef_end[c] = t + p[i].remaining;
    }
}

/* next time something happens: a chef finishes or an order arrives */
static int next_event(Process *p, int n)
{
    int next = INT_MAX;
    for (int c = 0; c < CHEFS; c++)
        if (chef_order[c] >= 0 && chef_end[c] < next) next = chef_end[c];
    for (int i = 0; i < n; i++)
        if (p[i].state == NEW && p[i].arrival < next) next = p[i].arrival;
    return next;
}

void simulate(Process *p, int n, Picker pick)
{
    int t = 0, done = 0;
    for (int c = 0; c < CHEFS; c++) chef_order[c] = -1;

    while (done < n) {
        done += finish_orders(p, t);
        admit_arrivals(p, n, t);
        assign_chefs(p, n, t, pick);
        t = next_event(p, n);
        if (t == INT_MAX) break;   /* nothing left to happen */
    }
}
