#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include "gantt.h"

#define MAX_JOBS 256
#define MAX_FILES 256
#define MAX_LINE 512

typedef struct {
    char file_name[256];
    char algorithm[16];
    GanttJob jobs[MAX_JOBS];
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

static int parse_csv_job_line(char *line, GanttJob *job)
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

        GanttJob job;
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
    gantt_sort_jobs(schedule->jobs, count);
    return 1;
}

/* One block per input file: every algorithm shares a single time axis so the
 * bars line up and the schedules can be compared directly. */
static void print_file_block(const char *file_name, const Schedule *schedules, int count)
{
    int min_time = 0;
    int max_time = 0;

    for (int s = 0; s < count; s++) {
        if (schedules[s].max_time > max_time) {
            max_time = schedules[s].max_time;
        }
    }

    printf("\n=== %s ===\n", file_name);
    gantt_print_axis(stdout, min_time, max_time);

    for (int s = 0; s < count; s++) {
        const Schedule *schedule = &schedules[s];

        printf("[%s]\n", schedule->algorithm);
        for (int i = 0; i < schedule->job_count; i++) {
            gantt_print_bar(stdout, &schedule->jobs[i], min_time, max_time);
        }
        if (s < count - 1) {
            gantt_print_rule(stdout);
        }
    }
}

int main(int argc, char **argv)
{
    char files[MAX_FILES][256];
    const char *algorithms[] = {"FCFS", "PRIORITY", "SJF"};
    const char *path = "tests/edge";
    struct stat st;
    int file_count = 0;

    if (argc > 1) {
        path = argv[1];
    }
    if (stat(path, &st) != 0) {
        fprintf(stderr, "No such file or directory: %s\n", path);
        return 1;
    }

    printf("Gantt Chart Generator\n");

    if (S_ISDIR(st.st_mode)) {
        printf("Directory: %s\n\n", path);
        file_count = list_test_files(path, files, MAX_FILES);
        if (file_count <= 0) {
            fprintf(stderr, "No .txt files found in %s\n", path);
            return 1;
        }
    } else {
        printf("File: %s\n\n", path);
        snprintf(files[0], sizeof(files[0]), "%s", path);
        file_count = 1;
    }

    for (int i = 0; i < file_count; i++) {
        static Schedule schedules[3];
        int collected = 0;

        for (int a = 0; a < 3; a++) {
            if (collect_schedule(files[i], algorithms[a], &schedules[collected])) {
                collected++;
            }
        }
        if (collected > 0) {
            print_file_block(files[i], schedules, collected);
        } else {
            fprintf(stderr, "No schedule produced for %s\n", files[i]);
        }
    }

    return 0;
}
