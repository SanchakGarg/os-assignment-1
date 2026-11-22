/*
 * check_input -- validates an A2 input file and prints the parsed orders.
 * Works without the simulator; useful for testing inputs and for the demo.
 *
 *   ./check_input tests/inputs/valid/restaurant_example.txt
 */
#include <stdio.h>

#include "input_parser.h"

int main(int argc, char **argv)
{
    if (argc != 2) {
        fprintf(stderr, "Usage: %s INPUT_FILE\n", argv[0]);
        return 1;
    }
    FILE *input = fopen(argv[1], "r");
    if (input == NULL) {
        fprintf(stderr, "Input error: cannot open \"%s\"\n", argv[1]);
        return 2;
    }

    Workload w;
    Error error = {0};
    int status = read_process_section(input, &w, &error);
    if (status == 0)
        status = expect_only_blank_lines(input, &error);
    fclose(input);

    if (status != 0) {
        if (error.line > 0)
            fprintf(stderr, "Input error (line %d): %s\n", error.line, error.message);
        else
            fprintf(stderr, "Input error: %s\n", error.message);
        workload_free(&w);
        return 2;
    }

    printf("Valid input: N=%d Q=%d\n", w.n, w.q);
    printf("%-8s %7s %8s %7s %-10s %5s %5s\n",
           "ID", "ARRIVAL", "PRIORITY", "SERVICE", "CATEGORY", "SPACE", "TABLE");
    for (int i = 0; i < w.n; i++) {
        const ProcessInput *p = &w.processes[i];
        printf("%-8s %7d %8d %7d %-10s %5d %5d\n", p->id, p->arrival, p->priority,
               p->service, p->category, p->space_req, p->table_req);
    }
    workload_free(&w);
    return 0;
}
