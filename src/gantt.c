#include <stdio.h>
#include <unistd.h>
#include "gantt.h"

#define BAR_WIDTH 60

static int force_color = 0;

void gantt_force_color(int on)
{
    force_color = on;
}

static int color_for_job(const char *id)
{
    static const int muted_palette[] = {
        22,  24,  30,  58,
        94, 101, 131, 167,
        179, 243
    };
    unsigned long hash = 0;

    for (const unsigned char *p = (const unsigned char *)id; *p; ++p) {
        hash = hash * 131u + (unsigned long)(*p);
    }

    return muted_palette[(int)(hash % (sizeof(muted_palette) / sizeof(muted_palette[0])))];
}

void gantt_print_rule(FILE *out)
{
    fprintf(out, "         ");
    for (int i = 0; i < BAR_WIDTH; i++) fputc('-', out);
    fprintf(out, "\n");
}

void gantt_print_axis(FILE *out, int min_time, int max_time)
{
    int span = max_time - min_time;
    if (span <= 0) {
        span = 1;
    }

    fprintf(out, "      Time: %d -> %d\n", min_time, max_time);
    fprintf(out, "         ");
    for (int i = 0; i < 10; i++) {
        int tick = min_time + (span * i) / 10;
        fprintf(out, "%-6d", tick);
    }
    fprintf(out, "%d\n", max_time);
    gantt_print_rule(out);
}

void gantt_print_bar(FILE *out, const GanttJob *job, int min_time, int max_time)
{
    int span = max_time - min_time;
    if (span <= 0) {
        span = 1;
    }

    int start_x = ((job->start - min_time) * BAR_WIDTH) / span;
    int end_x = ((job->end - min_time) * BAR_WIDTH) / span;
    int color = color_for_job(job->id);
    /* Colour only for a terminal; redirected output stays plain text. */
    int use_color = force_color || isatty(fileno(out));

    if (end_x <= start_x) {
        end_x = start_x + 1;
    }
    if (end_x > BAR_WIDTH) {
        end_x = BAR_WIDTH;
    }

    fprintf(out, "%-8s |", job->id);
    for (int x = 0; x < BAR_WIDTH; x++) {
        if (x >= start_x && x < end_x) {
            if (use_color) {
                fprintf(out, "\033[38;5;%dm█\033[0m", color);
            } else {
                fprintf(out, "█");
            }
        } else {
            fputc(' ', out);
        }
    }
    fprintf(out, "| %d-%d\n", job->start, job->end);
}

void gantt_sort_jobs(GanttJob *jobs, int count)
{
    for (int i = 1; i < count; i++) {
        GanttJob key = jobs[i];
        int j = i - 1;
        while (j >= 0 && (jobs[j].start > key.start || (jobs[j].start == key.start && jobs[j].end > key.end))) {
            jobs[j + 1] = jobs[j];
            j--;
        }
        jobs[j + 1] = key;
    }
}
