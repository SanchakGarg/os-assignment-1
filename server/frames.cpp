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
    case EV_RESOURCE_ACQUIRE: return "RESOURCE_ACQUIRE";
    case EV_RESOURCE_WAIT:    return "RESOURCE_WAIT";
    case EV_RESOURCE_RELEASE: return "RESOURCE_RELEASE";
    case EV_RESOURCE_ROLLBACK: return "RESOURCE_ROLLBACK";
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

std::string id_or_null(const Snapshot *s, int order)
{
    return order >= 0 ? json::quote(s->p[order].id) : "null";
}

std::string resource_or_null(const Snapshot *s, int resource)
{
    return s->rs && resource >= 0 ? json::quote(rs_resource_id(s->rs, resource)) : "null";
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
             ",\"chef_id\":" + (ev.chef >= 0 ? std::to_string(ev.chef) : "null") +
             ",\"resource\":" + resource_or_null(s, ev.resource) + "}";
    }

    /* Equipment: holder and FIFO wait queue of each declared resource. */
    int r_count = s->rs ? rs_resource_count(s->rs) : 0;
    std::vector<int> holder(r_count);
    std::string resources = "[";
    for (int r = 0; r < r_count; r++) {
        std::vector<int> waiting(s->n);
        int w = rs_waiters(s->rs, r, waiting.data(), s->n);
        holder[r] = rs_holder(s->rs, r);
        resources += (r ? "," : "");
        resources += "{\"id\":" + json::quote(rs_resource_id(s->rs, r)) +
                     ",\"holder\":" + id_or_null(s, holder[r]) + ",\"waiting\":[";
        for (int k = 0; k < w; k++)
            resources += (k ? "," : "") + json::quote(p[waiting[k]].id);
        resources += "]}";
    }
    resources += "]";

    j += "],\"processes\":[";
    for (int i = 0; i < s->n; i++) {
        int chef = -1;
        for (int c = 0; c < CHEFS; c++)
            if (s->chefs[c] == i) chef = c;
        std::string holds = "[";
        for (int r = 0; r < r_count; r++)
            if (holder[r] == i) holds += (holds.size() > 1 ? "," : "") + resource_or_null(s, r);
        holds += "]";
        int waits_for = p[i].state == BLOCKED_RESOURCE ? p[i].blocked_on : -1;
        j += (i ? "," : "");
        j += "{\"id\":" + json::quote(p[i].id) +
             ",\"state\":" + json::quote(state_name(p[i].state)) +
             ",\"executed_service\":" + std::to_string(s->executed[i]) +
             ",\"remaining_service\":" + std::to_string(p[i].service - s->executed[i]) +
             ",\"chef_id\":" + (chef >= 0 ? std::to_string(chef) : "null") +
             ",\"holds\":" + holds +
             ",\"waits_for\":" + resource_or_null(s, waits_for) + "}";
    }

    j += "],\"chefs\":[";
    for (int c = 0; c < CHEFS; c++)
        j += (c ? "," : "") + id_or_null(s, s->chefs[c]);
    j += "],\"chef_stretch_end\":[";
    for (int c = 0; c < CHEFS; c++)
        j += (c ? "," : "") + (s->stretch_end[c] >= 0 ? std::to_string(s->stretch_end[c]) : "null");

    j += "],\"pools\":{\"SPACE\":" + slots_json(s->mem->space) +
         ",\"TABLE\":" + slots_json(s->mem->table) + "}";
    j += ",\"resources\":" + resources;

    j += ",\"queues\":{\"memory\":[";
    for (int k = 0; k < s->mem_queue_len; k++)
        j += (k ? "," : "") + json::quote(p[s->mem_queue[k]].id);
    j += "],\"ready\":" + ready_queue_json(s, rec->pick) + "}}";

    rec->frames.push_back({s->time, j});
}

std::string started_json(const Workload &w, const char *scheduler, const char *allocator,
                         bool unsafe_demo, int frame_count, int end_time, int tick_ms)
{
    std::string j = "{\"type\":\"started\",\"scheduler\":" + json::quote(scheduler) +
                    ",\"allocator\":" + json::quote(allocator) +
                    ",\"unsafe_demo\":" + (unsafe_demo ? "true" : "false") +
                    ",\"tick_ms\":" + std::to_string(tick_ms) +
                    ",\"frame_count\":" + std::to_string(frame_count) +
                    ",\"end_time\":" + std::to_string(end_time) + ",\"resources\":[";
    for (int r = 0; r < w.resource_count; r++) {
        j += (r ? "," : "");
        j += "{\"id\":" + json::quote(w.resources[r].id) +
             ",\"capacity\":" + std::to_string(w.resources[r].capacity) +
             ",\"rank\":" + std::to_string(w.resources[r].rank) + "}";
    }
    j += "],\"processes\":[";
    for (int i = 0; i < w.n; i++) {
        const ProcessInput &o = w.processes[i];
        j += (i ? "," : "");
        j += "{\"id\":" + json::quote(o.id) + ",\"arrival\":" + std::to_string(o.arrival) +
             ",\"priority\":" + std::to_string(o.priority) +
             ",\"service\":" + std::to_string(o.service) +
             ",\"category\":" + json::quote(o.category) +
             ",\"space_req\":" + std::to_string(o.space_req) +
             ",\"table_req\":" + std::to_string(o.table_req) + ",\"actions\":[";
        bool first = true;
        for (int k = 0; k < w.action_count; k++) {
            const ActionInput &a = w.actions[k];
            if (a.process != i) continue;
            j += (first ? "" : ",");
            j += "{\"offset\":" + std::to_string(a.offset) +
                 ",\"action\":" + (a.kind == ACTION_ACQUIRE ? "\"ACQUIRE\"" : "\"RELEASE\"") +
                 ",\"resource\":" + json::quote(w.resources[a.resource].id) + "}";
            first = false;
        }
        j += "]}";
    }
    return j + "]}";
}

std::string deadlock_json(int time, const std::string &message)
{
    return "{\"type\":\"deadlock\",\"time\":" + std::to_string(time) +
           ",\"message\":" + json::quote(message) + "}";
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
             ",\"ready_wait\":" + std::to_string(p.ready_wait) +
             ",\"resource_wait\":" + std::to_string(p.resource_wait) + "}";
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

    j += "],\"resources\":[";
    for (int k = 0; k < r.resource_count; k++) {
        const ResourceResult &e = r.resources[k];
        j += (k ? "," : "");
        j += "{\"id\":" + json::quote(e.id) + ",\"capacity\":" + std::to_string(e.capacity) +
             ",\"max_simultaneous_holders\":" + std::to_string(e.max_simultaneous_holders) +
             ",\"acquisitions\":" + std::to_string(e.acquisitions) +
             ",\"wait_events\":" + std::to_string(e.wait_events) + "}";
    }
    j += "],\"checks\":{\"exclusivity_violations\":" + std::to_string(r.checks.exclusivity_violations) +
         ",\"unresolved_deadlocks\":" + std::to_string(r.checks.unresolved_deadlocks) +
         ",\"completed_count\":" + std::to_string(r.checks.completed_count) + "}";
    return j + "}";
}
