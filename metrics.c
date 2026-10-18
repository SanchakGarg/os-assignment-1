#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "restaurant.h"

static int by_id(const void *a, const void *b)
{
    return strcmp(((const Process *)a)->id, ((const Process *)b)->id);
}

void print_results(Process *p, int n)
{
    double total_wait = 0, total_turn = 0, total_resp = 0, busy = 0;
    int first_arrival = p[0].arrival, last_completion = 0, count = 0;

    qsort(p, n, sizeof *p, by_id);
    puts("PROCESS_ID,ARRIVAL,PRIORITY,SERVICE,START,COMPLETION,WAITING,TURNAROUND,RESPONSE");

    for (int i = 0; i < n; i++) {
        if (p[i].state != TERMINATED) continue;
        int turnaround = p[i].completion - p[i].arrival;
        int waiting = turnaround - p[i].service;
        int response = p[i].start - p[i].arrival;
        printf("%s,%d,%d,%d,%d,%d,%d,%d,%d\n", p[i].id, p[i].arrival, p[i].priority,
               p[i].service, p[i].start, p[i].completion, waiting, turnaround, response);

        total_wait += waiting;
        total_turn += turnaround;
        total_resp += response;
        busy += p[i].service;
        count++;
        if (p[i].arrival < first_arrival) first_arrival = p[i].arrival;
        if (p[i].completion > last_completion) last_completion = p[i].completion;
    }

    if (count == 0) count = 1;                       /* avoid divide by zero */
    int elapsed = last_completion - first_arrival;
    if (elapsed <= 0) elapsed = 1;

    puts("SUMMARY");
    printf("AVERAGE_WAITING,%.2f\n", total_wait / count);
    printf("AVERAGE_TURNAROUND,%.2f\n", total_turn / count);
    printf("AVERAGE_RESPONSE,%.2f\n", total_resp / count);
    printf("THROUGHPUT,%.4f\n", (double)count / elapsed);
    printf("UTILIZATION,%.2f\n", busy / (CHEFS * elapsed) * 100);
}
