#include <dirent.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#define BAR_WIDTH 60
#define MAX_JOBS 256
#define MAX_FILES 256
#define MAX_LINE 512

typedef struct {
    char id[32];
    int start;
    int end;
} Job;

typedef struct {
    char file_name[256];
    char algorithm[16];
    Job jobs[MAX_JOBS];
    int job_count;
    int min_time;
    int max_time;
} Schedule;

static void trim_newline(char *line)
{
    size_t len = strlen(line);
    while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r')) {
        line[--len] = '\0';
    }
}

static int has_suffix(const char *name, const char *suffix)
{
    size_t name_len = strlen(name);
    size_t suffix_len = strlen(suffix);
    return name_len >= suffix_len && strcmp(name + name_len - suffix_len, suffix) == 0;
}

static int list_test_files(const char *dir_path, char files[][256], int max_files)
{
    DIR *dir = opendir(dir_path);
    struct dirent *entry;
    int count = 0;

    if (!dir) {
        fprintf(stderr, "Unable to open directory: %s\n", dir_path);
        return 0;
    }

    while ((entry = readdir(dir)) != NULL) {
        if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
            continue;
        }
        if (!has_suffix(entry->d_name, ".txt")) {
            continue;
        }
        if (count >= max_files) {
            fprintf(stderr, "Too many test files in %s\n", dir_path);
            closedir(dir);
            return 0;
        }

        snprintf(files[count], 256, "%s/%s", dir_path, entry->d_name);
        count++;
    }

    closedir(dir);

    /* Directory iteration order is unspecified; keep generated charts stable. */
    for (int i = 1; i < count; i++) {
        char current[256];
        int j = i - 1;

        snprintf(current, sizeof(current), "%s", files[i]);
        while (j >= 0 && strcmp(files[j], current) > 0) {
            snprintf(files[j + 1], 256, "%s", files[j]);
            j--;
        }
        snprintf(files[j + 1], 256, "%s", current);
    }
    return count;
}

static void sort_jobs(Job *jobs, int count)
{
    for (int i = 1; i < count; i++) {
        Job key = jobs[i];
        int j = i - 1;
        while (j >= 0 && (jobs[j].start > key.start || (jobs[j].start == key.start && jobs[j].end > key.end))) {
            jobs[j + 1] = jobs[j];
            j--;
        }
        jobs[j + 1] = key;
    }
}

static int parse_csv_job_line(char *line, Job *job)
{
    char *fields[9];
    int field_count = 0;
    char *cursor = line;

    while (field_count < 9) {
        fields[field_count++] = cursor;
        char *comma = strchr(cursor, ',');
        if (comma == NULL) {
            break;
        }
        *comma = '\0';
        cursor = comma + 1;
    }

    if (field_count < 9) {
        return 0;
    }

    if (strlen(fields[0]) >= sizeof(job->id)) {
        return 0;
    }
    snprintf(job->id, sizeof(job->id), "%s", fields[0]);
    job->start = atoi(fields[4]);
    job->end = atoi(fields[5]);
    return (job->start >= 0 && job->end >= job->start);
}

static int collect_schedule(const char *input_file, const char *algorithm, Schedule *schedule)
{
    char cmd[512];
    FILE *pipe;
    char line[MAX_LINE];
    int seen_header = 0;
    int count = 0;
    int min_time = 0;
    int max_time = 0;

    snprintf(schedule->file_name, sizeof(schedule->file_name), "%s", input_file);
    snprintf(schedule->algorithm, sizeof(schedule->algorithm), "%s", algorithm);
    schedule->job_count = 0;
    schedule->min_time = 0;
    schedule->max_time = 0;

    snprintf(cmd, sizeof(cmd), "./restaurant \"%s\" \"%s\"", input_file, algorithm);
    pipe = popen(cmd, "r");
    if (!pipe) {
        fprintf(stderr, "Failed to run: %s\n", cmd);
        return 0;
    }

    while (fgets(line, sizeof(line), pipe) != NULL) {
        trim_newline(line);

        if (line[0] == '\0') {
            continue;
        }

        if (strncmp(line, "PROCESS_ID", 10) == 0) {
            seen_header = 1;
            continue;
        }

        if (!seen_header || strncmp(line, "SUMMARY", 7) == 0) {
            continue;
        }

        if (count >= MAX_JOBS) {
            fprintf(stderr, "Too many jobs in %s/%s\n", input_file, algorithm);
            pclose(pipe);
            return 0;
        }

        Job job;
        if (!parse_csv_job_line(line, &job)) {
            continue;
        }

        schedule->jobs[count++] = job;
        if (count == 1) {
            /* A scheduling Gantt chart starts at time zero, including idle time. */
            min_time = 0;
            max_time = job.end;
        } else {
            if (job.end > max_time) {
                max_time = job.end;
            }
        }
    }

    pclose(pipe);
    if (count == 0) {
        return 0;
    }

    schedule->job_count = count;
    schedule->min_time = min_time;
    schedule->max_time = max_time;
    sort_jobs(schedule->jobs, count);
    return 1;
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

static void print_timeline_axis(int min_time, int max_time)
{
    int span = max_time - min_time;
    if (span <= 0) {
        span = 1;
    }

    printf("      Time: %d -> %d\n", min_time, max_time);
    printf("         ");
    for (int i = 0; i < 10; i++) {
        int tick = min_time + (span * i) / 10;
        printf("%-6d", tick);
    }
    printf("%d\n", max_time);
    printf("         ");
    for (int i = 0; i < BAR_WIDTH; i++) putchar('-');
    printf("\n");
}

static void print_schedule_chart(const Schedule *schedule)
{
    int span = schedule->max_time - schedule->min_time;
    if (span <= 0) {
        span = 1;
    }

    printf("\n=== %s :: %s ===\n", schedule->file_name, schedule->algorithm);
    print_timeline_axis(schedule->min_time, schedule->max_time);

    for (int i = 0; i < schedule->job_count; i++) {
        const Job *job = &schedule->jobs[i];
        int start_x = ((job->start - schedule->min_time) * BAR_WIDTH) / span;
        int end_x = ((job->end - schedule->min_time) * BAR_WIDTH) / span;
        int color = color_for_job(job->id);

        if (end_x <= start_x) {
            end_x = start_x + 1;
        }
        if (end_x > BAR_WIDTH) {
            end_x = BAR_WIDTH;
        }

        printf("%-8s |", job->id);
        for (int x = 0; x < BAR_WIDTH; x++) {
            if (x >= start_x && x < end_x) {
                if (isatty(STDOUT_FILENO)) {
                    printf("\033[38;5;%dm█\033[0m", color);
                } else {
                    printf("█");
                }
            } else {
                printf(" ");
            }
        }
        printf("| %d-%d\n", job->start, job->end);
    }
}

int main(int argc, char **argv)
{
    char files[MAX_FILES][256];
    const char *algorithms[] = {"FCFS", "PRIORITY", "SJF"};
    const char *dir_path = "tests";
    int file_count = 0;

    if (argc > 1) {
        dir_path = argv[1];
    }

    printf("Gantt Chart Generator\n");
    printf("Directory: %s\n\n", dir_path);

    file_count = list_test_files(dir_path, files, MAX_FILES);
    if (file_count <= 0) {
        fprintf(stderr, "No .txt files found in %s\n", dir_path);
        return 1;
    }

    for (int i = 0; i < file_count; i++) {
        for (int a = 0; a < 3; a++) {
            Schedule schedule;
            if (collect_schedule(files[i], algorithms[a], &schedule)) {
                print_schedule_chart(&schedule);
            }
        }
    }

    return 0;
}
