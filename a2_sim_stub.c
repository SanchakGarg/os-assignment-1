/*
 * a2_sim_stub.c -- TEMPORARY placeholder so `restaurant` builds before
 * Sanchak's A2 simulator is merged. It produces NO results: an A2 run reports
 * an error (exit code 3) and writes no CSV. The A1 two-argument form is
 * unaffected.
 *
 * DELETE THIS FILE and remove it from the Makefile when Sanchak's
 * simulate_a2() lands. It must not be in the submitted archive.
 */
#include <stdio.h>
#include "a2_simulator.h"

int simulate_a2(const Workload *input, const SimulationConfig *config,
                ResourceManager *resources, SnapshotCallback callback,
                void *callback_context, SimulationResult *out, Error *error)
{
    (void)input; (void)config; (void)resources; (void)callback;
    (void)callback_context; (void)out;
    error->line = 0;
    snprintf(error->message, sizeof error->message,
             "A2 simulator not merged yet (a2_sim_stub.c is a placeholder)");
    return -1;
}

void simulation_result_free(SimulationResult *result)
{
    (void)result;
}
