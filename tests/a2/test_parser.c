/* Unit tests for read_process_section(). Run: make test */
#include <stdio.h>
#include <string.h>

#include "input_parser.h"

static int failures = 0;

#define EXPECT(cond, msg)                                         \
    do {                                                          \
        if (!(cond)) {                                            \
            printf("FAIL line %d: %s\n", __LINE__, msg);          \
            failures++;                                           \
        }                                                         \
    } while (0)

/* Writes text to a temporary stream and parses it. */
static int parse_text(const char *text, Workload *w, Error *e, FILE **stream_out)
{
    FILE *f = tmpfile();
    fputs(text, f);
    rewind(f);
    int status = read_process_section(f, w, e);
    if (stream_out)
        *stream_out = f;
    else
        fclose(f);
    return status;
}

int main(void)
{
    Workload w;
    Error e;

    /* Spec example 8.2: values read correctly, in file order */
    EXPECT(parse_text("4\n2\nO1,0,2,8,NORMAL,2,1\nO2,1,1,4,VIP,1,1\n"
                      "O3,2,2,5,NORMAL,3,0\nO4,3,1,6,VIP,2,2\n", &w, &e, NULL) == 0,
           "spec restaurant example should parse");
    EXPECT(w.n == 4 && w.q == 2, "N and Q");
    EXPECT(strcmp(w.processes[3].id, "O4") == 0, "fourth ID is O4");
    EXPECT(w.processes[3].arrival == 3 && w.processes[3].priority == 1 &&
           w.processes[3].service == 6 && w.processes[3].space_req == 2 &&
           w.processes[3].table_req == 2, "O4 numeric fields");
    EXPECT(strcmp(w.processes[1].category, "VIP") == 0, "O2 category");
    workload_free(&w);

    /* Stream is left at the A3 resource section for Sanchak's parser */
    FILE *f = NULL;
    EXPECT(parse_text("1\n2\nO1,0,1,4,VIP,1,0\n1\nOVEN_1,1\n", &w, &e, &f) == 0,
           "A3-style file: process section parses");
    char next[64] = "";
    if (fgets(next, sizeof next, f) == NULL) next[0] = 0;
    EXPECT(strcmp(next, "1\n") == 0, "stream positioned at R line");
    fclose(f);
    workload_free(&w);

    /* A2 mode: trailing content is rejected, trailing blank lines are fine */
    EXPECT(parse_text("1\n2\nO1,0,1,4,VIP,1,0\n\n  \n", &w, &e, &f) == 0, "trailing blanks");
    EXPECT(expect_only_blank_lines(f, &e) == 0, "only blank lines remain");
    fclose(f);
    workload_free(&w);
    EXPECT(parse_text("1\n2\nO1,0,1,4,VIP,1,0\nextra\n", &w, &e, &f) == 0, "extra row parses section");
    EXPECT(expect_only_blank_lines(f, &e) == -1, "extra row rejected in A2");
    fclose(f);
    workload_free(&w);

    /* Errors report the right line number */
    EXPECT(parse_text("2\n2\nO1,0,1,4,VIP,1,0\nO2,0,1,4,VIP,9,0\n", &w, &e, NULL) == -1,
           "SPACE_REQ 9 rejected");
    EXPECT(e.line == 4, "error is on line 4");
    EXPECT(strstr(e.message, "SPACE_REQ") != NULL, "message names SPACE_REQ");
    EXPECT(w.processes == NULL, "no partial workload on error");

    if (failures == 0)
        printf("test_parser: all tests passed\n");
    return failures == 0 ? 0 : 1;
}
