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

void workload_free(Workload *workload)
{
    if (workload == NULL)
        return;
    free(workload->processes);
    workload->processes = NULL;
    workload->n = 0;
}
