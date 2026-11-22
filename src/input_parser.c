/*
 * input_parser.c -- reads and validates the standard A2 process section (Anam).
 *
 * Validation follows A2 spec section 8:
 *   N > 0, Q > 0; each row has exactly 7 comma-separated fields;
 *   ID unique, nonempty, no whitespace; ARRIVAL >= 0; PRIORITY, SERVICE > 0;
 *   CATEGORY nonempty; 1 <= SPACE_REQ <= 6; 0 <= TABLE_REQ <= 3.
 * Rows may appear in any order. Every problem is reported with a line number.
 */
#include "input_parser.h"

#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>

#define LINE_BUF   1024
#define FIELD_COUNT 7
#define MAX_PROCESSES 100000   /* sanity cap so a bad N cannot exhaust memory */

static void set_error(Error *error, int line, const char *fmt, ...)
{
    if (error == NULL)
        return;
    va_list args;
    va_start(args, fmt);
    error->line = line;
    vsnprintf(error->message, sizeof error->message, fmt, args);
    va_end(args);
}

/* Removes leading/trailing spaces, tabs and CR/LF in place. */
static char *trim(char *s)
{
    while (*s == ' ' || *s == '\t')
        s++;
    char *end = s + strlen(s);
    while (end > s && (end[-1] == ' ' || end[-1] == '\t' ||
                       end[-1] == '\r' || end[-1] == '\n'))
        *--end = '\0';
    return s;
}

static int is_blank(const char *s)
{
    for (; *s; s++)
        if (!isspace((unsigned char)*s))
            return 0;
    return 1;
}

/*
 * Reads one line into buf. Returns 1 on success, 0 at EOF, -1 if the line is
 * longer than the buffer. *line_no is incremented for every line read.
 */
static int read_line(FILE *input, char *buf, size_t size, int *line_no)
{
    if (fgets(buf, (int)size, input) == NULL)
        return 0;
    (*line_no)++;
    size_t len = strlen(buf);
    if (len == size - 1 && buf[len - 1] != '\n' && !feof(input))
        return -1;
    return 1;
}

/* Reads the next nonblank line. Returns 1, 0 at EOF, -1 if too long. */
static int read_nonblank_line(FILE *input, char *buf, size_t size, int *line_no)
{
    int status;
    while ((status = read_line(input, buf, size, line_no)) == 1)
        if (!is_blank(buf))
            return 1;
    return status;
}

/* Strict integer parse: the whole (trimmed) text must be a decimal integer. */
static int parse_int(const char *text, int *value)
{
    if (*text == '\0')
        return -1;
    errno = 0;
    char *end = NULL;
    long v = strtol(text, &end, 10);
    if (errno != 0 || *end != '\0' || v < INT_MIN || v > INT_MAX)
        return -1;
    *value = (int)v;
    return 0;
}

static int read_header_int(FILE *input, const char *name, int *value,
                           int *line_no, Error *error)
{
    char buf[LINE_BUF];
    int status = read_nonblank_line(input, buf, sizeof buf, line_no);
    if (status == 0) {
        set_error(error, *line_no, "missing %s line (file ended early)", name);
        return -1;
    }
    if (status < 0) {
        set_error(error, *line_no, "%s line is too long", name);
        return -1;
    }
    char *text = trim(buf);
    if (parse_int(text, value) != 0) {
        set_error(error, *line_no, "%s must be an integer, got \"%s\"", name, text);
        return -1;
    }
    if (*value <= 0) {
        set_error(error, *line_no, "%s must be positive, got %d", name, *value);
        return -1;
    }
    return 0;
}

static int has_whitespace(const char *s)
{
    for (; *s; s++)
        if (isspace((unsigned char)*s))
            return 1;
    return 0;
}

/* Parses one numeric field and checks min <= value <= max. */
static int parse_field(char *text, const char *name, int min, int max,
                       int *value, int line_no, Error *error)
{
    if (parse_int(text, value) != 0) {
        set_error(error, line_no, "%s must be an integer, got \"%s\"", name, text);
        return -1;
    }
    if (*value < min || *value > max) {
        if (max == INT_MAX)
            set_error(error, line_no, "%s must be >= %d, got %d", name, min, *value);
        else
            set_error(error, line_no, "%s must be between %d and %d, got %d",
                      name, min, max, *value);
        return -1;
    }
    return 0;
}

static int parse_process_row(char *line, ProcessInput *p, int line_no, Error *error)
{
    char *fields[FIELD_COUNT];
    int count = 0;
    char *cursor = line;

    /* Split on commas manually (strtok would merge empty fields). */
    while (1) {
        char *comma = strchr(cursor, ',');
        if (count == FIELD_COUNT) {
            set_error(error, line_no, "expected %d fields, found more", FIELD_COUNT);
            return -1;
        }
        fields[count++] = cursor;
        if (comma == NULL)
            break;
        *comma = '\0';
        cursor = comma + 1;
    }
    if (count != FIELD_COUNT) {
        set_error(error, line_no, "expected %d fields "
                  "(ID,ARRIVAL,PRIORITY,SERVICE,CATEGORY,SPACE_REQ,TABLE_REQ), found %d",
                  FIELD_COUNT, count);
        return -1;
    }
    for (int i = 0; i < FIELD_COUNT; i++)
        fields[i] = trim(fields[i]);

    /* ID */
    if (fields[0][0] == '\0') {
        set_error(error, line_no, "process ID is empty");
        return -1;
    }
    if (has_whitespace(fields[0])) {
        set_error(error, line_no, "process ID \"%s\" contains whitespace", fields[0]);
        return -1;
    }
    if (strlen(fields[0]) >= MAX_ID_LEN) {
        set_error(error, line_no, "process ID is longer than %d characters", MAX_ID_LEN - 1);
        return -1;
    }
    strcpy(p->id, fields[0]);

    if (parse_field(fields[1], "ARRIVAL", 0, INT_MAX, &p->arrival, line_no, error) ||
        parse_field(fields[2], "PRIORITY", 1, INT_MAX, &p->priority, line_no, error) ||
        parse_field(fields[3], "SERVICE", 1, INT_MAX, &p->service, line_no, error))
        return -1;

    /* CATEGORY: descriptive label only; priority comes from PRIORITY. */
    if (fields[4][0] == '\0') {
        set_error(error, line_no, "CATEGORY is empty");
        return -1;
    }
    if (strlen(fields[4]) >= MAX_CATEGORY_LEN) {
        set_error(error, line_no, "CATEGORY is longer than %d characters", MAX_CATEGORY_LEN - 1);
        return -1;
    }
    strcpy(p->category, fields[4]);

    if (parse_field(fields[5], "SPACE_REQ", 1, SPACE_CAPACITY, &p->space_req, line_no, error) ||
        parse_field(fields[6], "TABLE_REQ", 0, TABLE_CAPACITY, &p->table_req, line_no, error))
        return -1;

    return 0;
}

int read_process_section(FILE *input, Workload *out, Error *error)
{
    int line_no = 0;
    int n = 0, q = 0;

    if (out == NULL || input == NULL) {
        set_error(error, 0, "internal error: null input or output");
        return -1;
    }
    memset(out, 0, sizeof *out);

    if (read_header_int(input, "N (process count)", &n, &line_no, error) != 0 ||
        read_header_int(input, "Q (quantum)", &q, &line_no, error) != 0)
        return -1;
    if (n > MAX_PROCESSES) {
        set_error(error, line_no - 1, "N=%d exceeds the supported maximum of %d", n, MAX_PROCESSES);
        return -1;
    }

    ProcessInput *processes = calloc((size_t)n, sizeof *processes);
    if (processes == NULL) {
        set_error(error, 0, "out of memory for %d processes", n);
        return -1;
    }

    char buf[LINE_BUF];
    for (int i = 0; i < n; i++) {
        int status = read_nonblank_line(input, buf, sizeof buf, &line_no);
        if (status == 0) {
            set_error(error, line_no, "N=%d but only %d process rows were found", n, i);
            free(processes);
            return -1;
        }
        if (status < 0) {
            set_error(error, line_no, "process row is too long");
            free(processes);
            return -1;
        }
        if (parse_process_row(trim(buf), &processes[i], line_no, error) != 0) {
            free(processes);
            return -1;
        }
        for (int j = 0; j < i; j++) {
            if (strcmp(processes[j].id, processes[i].id) == 0) {
                set_error(error, line_no, "duplicate process ID \"%s\"", processes[i].id);
                free(processes);
                return -1;
            }
        }
    }

    out->n = n;
    out->q = q;
    out->processes = processes;
    out->lines_read = line_no;
    return 0;
}

int expect_only_blank_lines(FILE *input, Error *error)
{
    char buf[LINE_BUF];
    int line_no = 0;   /* counted from the end of the process section */
    int status;
    while ((status = read_line(input, buf, sizeof buf, &line_no)) != 0) {
        if (status < 0 || !is_blank(buf)) {
            set_error(error, 0, "unexpected content after the N process rows "
                      "(A2 input must end after exactly N rows; use --phase a3 "
                      "for resource sections)");
            return -1;
        }
    }
    return 0;
}

/* ---- A3: resource and action sections (final spec section 8) ---- */

/* Smart Restaurant inventory (final spec section 3). The index is the
 * resource's rank in the global acquisition order used for deadlock prevention. */
static const char *const INVENTORY[] = { "COFFEE_MACHINE", "MICROWAVE", "OVEN_1", "OVEN_2" };
#define INVENTORY_SIZE (int)(sizeof INVENTORY / sizeof INVENTORY[0])
#define MAX_RESOURCES INVENTORY_SIZE
#define MAX_ACTIONS 100000

/* Splits on commas into at most max trimmed fields. Returns the field count,
 * or max + 1 if there are more. */
static int split_fields(char *line, char **fields, int max)
{
    int count = 0;
    char *cursor = line;
    while (1) {
        if (count == max)
            return max + 1;
        char *comma = strchr(cursor, ',');
        fields[count++] = cursor;
        if (comma == NULL)
            break;
        *comma = '\0';
        cursor = comma + 1;
    }
    for (int i = 0; i < count; i++)
        fields[i] = trim(fields[i]);
    return count;
}

/* Reads a nonnegative count line (R or K). Returns 1, 0 at EOF, -1 on error. */
static int read_count(FILE *input, const char *name, int max, int *value,
                      int *line_no, Error *error)
{
    char buf[LINE_BUF];
    int status = read_nonblank_line(input, buf, sizeof buf, line_no);
    if (status == 0)
        return 0;
    if (status < 0) {
        set_error(error, *line_no, "%s line is too long", name);
        return -1;
    }
    char *text = trim(buf);
    if (parse_int(text, value) != 0) {
        set_error(error, *line_no, "%s must be an integer, got \"%s\"", name, text);
        return -1;
    }
    if (*value < 0 || *value > max) {
        set_error(error, *line_no, "%s must be between 0 and %d, got %d", name, max, *value);
        return -1;
    }
    return 1;
}

static int find_process(const Workload *w, const char *id)
{
    for (int i = 0; i < w->n; i++)
        if (strcmp(w->processes[i].id, id) == 0)
            return i;
    return -1;
}

static int find_resource(const Workload *w, const char *id)
{
    for (int i = 0; i < w->resource_count; i++)
        if (strcmp(w->resources[i].id, id) == 0)
            return i;
    return -1;
}

static int parse_resource_row(char *line, Workload *w, int line_no, Error *error)
{
    char *f[2];
    int count = split_fields(line, f, 2);
    if (count != 2) {
        set_error(error, line_no, "expected 2 fields (RESOURCE_ID,CAPACITY), found %s",
                  count > 2 ? "more" : "1");
        return -1;
    }
    int rank = -1;
    for (int i = 0; i < INVENTORY_SIZE; i++)
        if (strcmp(f[0], INVENTORY[i]) == 0)
            rank = i;
    if (rank < 0) {
        set_error(error, line_no, "unknown resource \"%s\" (Smart Restaurant resources are "
                  "COFFEE_MACHINE, MICROWAVE, OVEN_1, OVEN_2)", f[0]);
        return -1;
    }
    if (find_resource(w, f[0]) >= 0) {
        set_error(error, line_no, "resource \"%s\" is declared twice", f[0]);
        return -1;
    }
    ResourceInput *r = &w->resources[w->resource_count];
    if (parse_field(f[1], "CAPACITY", 1, INT_MAX, &r->capacity, line_no, error))
        return -1;
    if (r->capacity != 1) {
        set_error(error, line_no, "CAPACITY of %s must be 1 (one physical unit), got %d",
                  f[0], r->capacity);
        return -1;
    }
    snprintf(r->id, sizeof r->id, "%s", f[0]);
    r->rank = rank;
    w->resource_count++;
    return 0;
}

static int parse_action_row(char *line, Workload *w, int line_no, Error *error)
{
    char *f[5];
    int count = split_fields(line, f, 5);
    if (count != 5) {
        set_error(error, line_no, "expected 5 fields "
                  "(ID,WORK_OFFSET,ACTION,RESOURCE_ID,UNITS), found %s",
                  count > 5 ? "more" : "fewer");
        return -1;
    }
    ActionInput *a = &w->actions[w->action_count];
    a->process = find_process(w, f[0]);
    if (a->process < 0) {
        set_error(error, line_no, "action names unknown process \"%s\"", f[0]);
        return -1;
    }
    if (parse_field(f[1], "WORK_OFFSET", 0, w->processes[a->process].service,
                    &a->offset, line_no, error))
        return -1;
    if (strcmp(f[2], "ACQUIRE") == 0)
        a->kind = ACTION_ACQUIRE;
    else if (strcmp(f[2], "RELEASE") == 0)
        a->kind = ACTION_RELEASE;
    else {
        set_error(error, line_no, "ACTION must be ACQUIRE or RELEASE, got \"%s\"", f[2]);
        return -1;
    }
    a->resource = find_resource(w, f[3]);
    if (a->resource < 0) {
        set_error(error, line_no, "resource \"%s\" is not declared in the resource section", f[3]);
        return -1;
    }
    if (parse_field(f[4], "UNITS", 1, INT_MAX, &a->units, line_no, error))
        return -1;
    if (a->units != 1) {
        set_error(error, line_no, "UNITS must be 1 for a standard resource, got %d", a->units);
        return -1;
    }
    w->action_count++;
    return 0;
}

/*
 * Checks each order's action list as a whole: offsets never decrease, a
 * RELEASE names a unit the order holds, an ACQUIRE does not re-take a unit it
 * already holds (capacity 1), and everything acquired is released by the end.
 */
static int check_action_lists(const Workload *w, const int *lines, Error *error)
{
    int n = w->n, r = w->resource_count;
    int *last = malloc((size_t)n * sizeof *last);
    int *held = calloc((size_t)n * (size_t)(r > 0 ? r : 1), sizeof *held);   /* line that took it */
    int status = -1;
    if (!last || !held) {
        set_error(error, 0, "out of memory while checking actions");
        goto out;
    }
    for (int i = 0; i < n; i++)
        last[i] = -1;

    for (int k = 0; k < w->action_count; k++) {
        const ActionInput *a = &w->actions[k];
        const char *pid = w->processes[a->process].id, *rid = w->resources[a->resource].id;
        int *slot = &held[a->process * r + a->resource];
        if (a->offset < last[a->process]) {
            set_error(error, lines[k], "actions of %s must be in nondecreasing WORK_OFFSET "
                      "order (%d comes after %d)", pid, a->offset, last[a->process]);
            goto out;
        }
        last[a->process] = a->offset;
        if (a->kind == ACTION_ACQUIRE) {
            if (*slot) {
                set_error(error, lines[k], "%s acquires %s again while still holding it "
                          "(capacity 1; release it first)", pid, rid);
                goto out;
            }
            *slot = lines[k];
        } else {
            if (!*slot) {
                set_error(error, lines[k], "%s releases %s, which it does not hold", pid, rid);
                goto out;
            }
            *slot = 0;
        }
    }
    for (int i = 0; i < n; i++)
        for (int j = 0; j < r; j++)
            if (held[i * r + j]) {
                set_error(error, held[i * r + j], "%s acquires %s but never releases it "
                          "(add a RELEASE, at offset %d at the latest)",
                          w->processes[i].id, w->resources[j].id, w->processes[i].service);
                goto out;
            }
    status = 0;
out:
    free(last);
    free(held);
    return status;
}

int read_resource_sections(FILE *input, Workload *w, Error *error)
{
    int line_no = w->lines_read;
    int r = 0, k = 0, status;
    char buf[LINE_BUF];
    int *lines = NULL;

    w->resource_count = w->action_count = 0;
    status = read_count(input, "R (resource count)", MAX_RESOURCES, &r, &line_no, error);
    if (status <= 0)
        return status;                  /* 0: sections omitted, R = K = 0 */

    w->resources = calloc((size_t)(r > 0 ? r : 1), sizeof *w->resources);
    if (!w->resources) {
        set_error(error, 0, "out of memory for resources");
        return -1;
    }
    for (int i = 0; i < r; i++) {
        status = read_nonblank_line(input, buf, sizeof buf, &line_no);
        if (status <= 0) {
            set_error(error, line_no, status == 0 ? "R=%d but only %d resource rows were found"
                                                  : "resource row is too long", r, i);
            return -1;
        }
        if (parse_resource_row(trim(buf), w, line_no, error) != 0)
            return -1;
    }

    status = read_count(input, "K (action count)", MAX_ACTIONS, &k, &line_no, error);
    if (status < 0)
        return -1;
    if (status == 0) {
        set_error(error, line_no, "the resource section must be followed by the K (action count) line");
        return -1;
    }
    w->actions = calloc((size_t)(k > 0 ? k : 1), sizeof *w->actions);
    lines = calloc((size_t)(k > 0 ? k : 1), sizeof *lines);
    if (!w->actions || !lines) {
        set_error(error, 0, "out of memory for actions");
        free(lines);
        return -1;
    }
    for (int i = 0; i < k; i++) {
        status = read_nonblank_line(input, buf, sizeof buf, &line_no);
        if (status <= 0) {
            set_error(error, line_no, status == 0 ? "K=%d but only %d action rows were found"
                                                  : "action row is too long", k, i);
            free(lines);
            return -1;
        }
        lines[i] = line_no;
        if (parse_action_row(trim(buf), w, line_no, error) != 0) {
            free(lines);
            return -1;
        }
    }
    status = check_action_lists(w, lines, error);
    free(lines);
    if (status != 0)
        return -1;

    while ((status = read_line(input, buf, sizeof buf, &line_no)) != 0)
        if (status < 0 || !is_blank(buf)) {
            set_error(error, line_no, "unexpected content after the K action rows");
            return -1;
        }
    return 0;
}

void workload_free(Workload *workload)
{
    if (workload == NULL)
        return;
    free(workload->processes);
    free(workload->resources);
    free(workload->actions);
    workload->processes = NULL;
    workload->resources = NULL;
    workload->actions = NULL;
    workload->n = workload->resource_count = workload->action_count = 0;
}
