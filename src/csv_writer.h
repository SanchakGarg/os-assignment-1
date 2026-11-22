#ifndef CSV_WRITER_H
#define CSV_WRITER_H

#include <stdio.h>
#include "shared_types.h"

/*
 * Writes the standardized machine-readable result (Anam).
 *
 * A2 (spec section 9.2):
 *   PROCESS rows sorted by ID (lexicographic), 13 fields each
 *   8 SUMMARY rows in the fixed order
 *   POOL,SPACE,6,...  then  POOL,TABLE,3,...
 * A3 (final spec section 9.2): additionally RESOURCE_WAIT at the end of every
 *   PROCESS row, then RESOURCE rows sorted by ID, then 3 CHECK rows.
 *
 * Only formats numbers already calculated by the simulator. Refuses to write
 * anything if result->complete is 0. Returns 0 or -1 with *error filled.
 */
int write_standard_csv(FILE *output, const SimulationResult *result,
                       Phase phase, Error *error);

/*
 * Writes to "<path>.tmp" and renames it to <path> only after a complete,
 * successful write, so a failed run never leaves a good-looking result file.
 */
int write_standard_csv_file(const char *path, const SimulationResult *result,
                            Phase phase, Error *error);

#endif
