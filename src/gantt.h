#ifndef GANTT_H
#define GANTT_H

#include <stdio.h>

typedef struct {
    char id[32];
    int start;
    int end;
} GanttJob;

/* Colour is used only when `out` is a terminal, unless forced on here (for
 * charts drawn into a buffer that will later be written to a terminal). */
void gantt_force_color(int on);

/* Draw a time axis from min_time to max_time, then one bar per job. */
void gantt_print_axis(FILE *out, int min_time, int max_time);
void gantt_print_rule(FILE *out);
void gantt_print_bar(FILE *out, const GanttJob *job, int min_time, int max_time);
void gantt_sort_jobs(GanttJob *jobs, int count);

#endif
