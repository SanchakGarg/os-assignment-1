#ifndef INPUT_PARSER_H
#define INPUT_PARSER_H

#include <stdio.h>
#include "shared_types.h"

/*
 * Reads the standard A2 process section:
 *     N
 *     Q
 *     ID,ARRIVAL,PRIORITY,SERVICE,CATEGORY,SPACE_REQ,TABLE_REQ   (exactly N rows)
 *
 * On success returns 0, fills *out (out->processes is heap-allocated) and
 * leaves `input` positioned on the line after the last process row, i.e. at
 * the optional A3 resource section, for Sanchak's read_resource_sections().
 * On failure returns -1, fills *error (message + line number) and leaves
 * *out empty.
 */
int read_process_section(FILE *input, Workload *out, Error *error);

/*
 * A2 only: after the process section, the file may contain only blank lines.
 * Returns 0 if so, -1 with an error naming the first unexpected line.
 * (In A3 that content is the resource section instead.)
 */
int expect_only_blank_lines(FILE *input, Error *error);

void workload_free(Workload *workload);

#endif
