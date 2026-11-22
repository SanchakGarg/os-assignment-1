/*
 * a2_simulator.h -- PROVISIONAL interface to Sanchak's A2 simulation, based on
 * shared-data.md section 1. Replace with Sanchak's real header.
 *
 * Named simulate_a2() because restaurant.h already declares the A1
 * simulate(Process *, int, Picker); two functions called simulate() with
 * different signatures cannot be linked into the same program.
 */
#ifndef A2_SIMULATOR_H
#define A2_SIMULATOR_H

#include "shared_types.h"

typedef struct ResourceManager ResourceManager;      /* Abhinav, A3 only */
typedef struct SimulationSnapshot SimulationSnapshot; /* Sanchak/Abhinav */
typedef struct SimulationEvents SimulationEvents;
typedef void (*SnapshotCallback)(const SimulationSnapshot *snapshot,
                                 const SimulationEvents *events, void *context);

int simulate_a2(const Workload *input, const SimulationConfig *config,
                ResourceManager *resources, SnapshotCallback callback,
                void *callback_context, SimulationResult *out, Error *error);

void simulation_result_free(SimulationResult *result);

#endif
