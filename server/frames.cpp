#include "frames.hpp"

#include "json.hpp"

namespace {

const char *state_name(State s)
{
    switch (s) {
    case NEW:            return "NEW";
    case BLOCKED_MEMORY: return "BLOCKED_MEMORY";
    case READY:          return "READY";
    case RUNNING:        return "RUNNING";
    case TERMINATED:     return "TERMINATED";
    case BLOCKED_RESOURCE: return "BLOCKED_RESOURCE";
    }
    return "?";
}

const char *event_name(EventType e)
{
    switch (e) {
    case EV_ARRIVE:       return "ARRIVE";
    case EV_MEMORY_BLOCK: return "MEMORY_BLOCK";
    case EV_MEMORY_ADMIT: return "MEMORY_ADMIT";
    case EV_DISPATCH:     return "DISPATCH";
    case EV_COMPLETE:     return "COMPLETE";
    case EV_RESOURCE_BLOCK:   return "RESOURCE_BLOCK";
    case EV_RESOURCE_UNBLOCK: return "RESOURCE_UNBLOCK";
    }
    return "?";
}

std::string slots_json(const Pool &pool)
{
    std::string out = "[";
    for (int i = 0; i < pool.capacity; i++)
        out += (i ? "," : "") + json::quote_or_null(pool.slots[i]);
    return out + "]";
}

/* READY orders in the order the scheduler would pick them. */
std::string ready_queue_json(const Snapshot *s, Picker pick)
{
    std::vector<Process> copy(s->p, s->p + s->n);
    std::string out = "[";
    bool first = true;
    for (int i; (i = pick(copy.data(), s->n, s->time)) >= 0; first = false) {
        out += (first ? "" : ",") + json::quote(copy[i].id);
        copy[i].state = RUNNING;          /* taken: let the next one be picked */
    }
    return out + "]";
}

}  // namespace

void record_frame(const Snapshot *s, void *ctx)
{
    Recorder *rec = static_cast<Recorder *>(ctx);
    const Process *p = s->p;
    std::string j = "{\"type\":\"frame\",\"seq\":" + std::to_string(rec->frames.size()) +
                    ",\"time\":" + std::to_string(s->time);

    j += ",\"events\":[";
    for (int e = 0; e < s->event_count; e++) {
        const SimEvent &ev = s->events[e];
        j += (e ? "," : "");
        j += "{\"type\":" + json::quote(event_name(ev.type)) +
             ",\"process_id\":" + json::quote(p[ev.order].id) +
             ",\"chef_id\":" + (ev.chef >= 0 ? std::to_string(ev.chef) : "null") + "}";
    }

    j += "],\"processes\":[";
    for (int i = 0; i < s->n; i++) {
        int chef = -1;
        for (int c = 0; c < CHEFS; c++)
            if (s->chefs[c] == i) chef = c;
        int executed = p[i].state == TERMINATED ? p[i].service
                     : p[i].state == RUNNING    ? s->time - p[i].start   /* non-preemptive */
                     : 0;
        j += (i ? "," : "");
        j += "{\"id\":" + json::quote(p[i].id) +
             ",\"state\":" + json::quote(state_name(p[i].state)) +
             ",\"executed_service\":" + std::to_string(executed) +
             ",\"remaining_service\":" + std::to_string(p[i].service - executed) +
             ",\"chef_id\":" + (chef >= 0 ? std::to_string(chef) : "null") + "}";
    }

    j += "],\"chefs\":[";
    for (int c = 0; c < CHEFS; c++)
        j += (c ? "," : "") + (s->chefs[c] >= 0 ? json::quote(p[s->chefs[c]].id) : "null");

    j += "],\"pools\":{\"SPACE\":" + slots_json(s->mem->space) +
         ",\"TABLE\":" + slots_json(s->mem->table) + "}";

    j += ",\"queues\":{\"memory\":[";
    for (int k = 0; k < s->mem_queue_len; k++)
        j += (k ? "," : "") + json::quote(p[s->mem_queue[k]].id);
    j += "],\"ready\":" + ready_queue_json(s, rec->pick) + "}}";

    rec->frames.push_back({s->time, j});
}

std::string started_json(const Workload &w, const char *scheduler, const char *allocator,
                         int frame_count, int end_time, int tick_ms)
{
    std::string j = "{\"type\":\"started\",\"scheduler\":" + json::quote(scheduler) +
                    ",\"allocator\":" + json::quote(allocator) +
                    ",\"tick_ms\":" + std::to_string(tick_ms) +
                    ",\"frame_count\":" + std::to_string(frame_count) +
                    ",\"end_time\":" + std::to_string(end_time) + ",\"processes\":[";
    for (int i = 0; i < w.n; i++) {
        const ProcessInput &o = w.processes[i];
        j += (i ? "," : "");
        j += "{\"id\":" + json::quote(o.id) + ",\"arrival\":" + std::to_string(o.arrival) +
             ",\"priority\":" + std::to_string(o.priority) +
             ",\"service\":" + std::to_string(o.service) +
             ",\"category\":" + json::quote(o.category) +
             ",\"space_req\":" + std::to_string(o.space_req) +
             ",\"table_req\":" + std::to_string(o.table_req) + "}";
    }
    return j + "]}";
}

std::string results_json(const SimulationResult &r, const std::string &csv)
{
    std::string j = "{\"type\":\"results\",\"csv\":" + json::quote(csv) + ",\"processes\":[";
    for (int i = 0; i < r.process_count; i++) {
        const ProcessResult &p = r.processes[i];
        j += (i ? "," : "");
        j += "{\"id\":" + json::quote(p.id) + ",\"arrival\":" + std::to_string(p.arrival) +
             ",\"priority\":" + std::to_string(p.priority) +
             ",\"service\":" + std::to_string(p.service) +
             ",\"start\":" + std::to_string(p.start) +
             ",\"completion\":" + std::to_string(p.completion) +
             ",\"waiting\":" + std::to_string(p.waiting) +
             ",\"turnaround\":" + std::to_string(p.turnaround) +
             ",\"response\":" + std::to_string(p.response) +
             ",\"mem_admit\":" + std::to_string(p.mem_admit) +
             ",\"mem_wait\":" + std::to_string(p.mem_wait) +
             ",\"ready_wait\":" + std::to_string(p.ready_wait) + "}";
    }

    const SummaryResult &s = r.summary;
    j += "],\"summary\":{\"average_waiting\":" + json::number(s.average_waiting) +
         ",\"average_turnaround\":" + json::number(s.average_turnaround) +
         ",\"average_response\":" + json::number(s.average_response) +
         ",\"throughput\":" + json::number(s.throughput) +
         ",\"service_utilization_pct\":" + json::number(s.service_utilization_pct) +
         ",\"average_memory_wait\":" + json::number(s.average_memory_wait) +
         ",\"completed_count\":" + std::to_string(s.completed_count) +
         ",\"blocked_for_memory_count\":" + std::to_string(s.blocked_for_memory_count) + "}";

    j += ",\"pools\":[";
    for (int k = 0; k < 2; k++) {
        const PoolResult &p = r.pools[k];
        j += (k ? "," : "");
        j += "{\"id\":" + json::quote(p.id) + ",\"capacity\":" + std::to_string(p.capacity) +
             ",\"peak_occupied\":" + std::to_string(p.peak_occupied) +
             ",\"utilization_pct\":" + json::number(p.utilization_pct) +
             ",\"max_ext_frag_slots\":" + std::to_string(p.max_ext_frag_slots) + "}";
    }
    return j + "]}";
}
