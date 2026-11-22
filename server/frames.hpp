#pragma once

#include <string>
#include <vector>

extern "C" {
#include "restaurant.h"
}

/* One simulation step, already turned into the JSON message sent to the browser. */
struct RecordedFrame {
    int time;
    std::string json;
};

/* Collects frames while the simulator runs; passed as the SnapshotFn context. */
struct Recorder {
    Picker pick;                       /* to list the ready queue in scheduler order */
    std::vector<RecordedFrame> frames;
};

/* SnapshotFn: copies the snapshot into recorder->frames as a JSON frame. */
void record_frame(const Snapshot *s, void *recorder);

/* {"type":"started",...}: settings and the parsed orders. */
std::string started_json(const Workload &w, const char *scheduler, const char *allocator,
                         int frame_count, int end_time, int tick_ms);

/* {"type":"results",...}: the exact CSV plus the same numbers as JSON. */
std::string results_json(const SimulationResult &r, const std::string &csv);
