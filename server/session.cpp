#include "session.hpp"

#include <poll.h>
#include <unistd.h>

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <mutex>
#include <string>

#include "frames.hpp"
#include "json.hpp"
#include "websocket.hpp"

extern "C" {
#include "cli_args.h"
#include "csv_writer.h"
#include "input_parser.h"
}

namespace {

using Clock = std::chrono::steady_clock;

const int DEFAULT_TICK_MS = 500;
const int MAX_TICK_MS = 60000;

/* Every frame lists every order, so keep live runs to what a viewer can show. */
const int MAX_VIEWER_ORDERS = 200;
const int MAX_VIEWER_ACTIONS = 2000;

/* sim.c keeps its state in static variables, so one simulation at a time. */
std::mutex sim_mutex;

struct Run {
    bool active = false;
    bool paused = false;
    int tick_ms = DEFAULT_TICK_MS;
    size_t next = 0;                     /* index of the next frame to send */
    Clock::time_point due;               /* when that frame is due */
    std::vector<RecordedFrame> frames;
    std::vector<std::string> closing;    /* sent after the last frame: results or deadlock */
};

std::string error_json(const std::string &message, int line = 0)
{
    return "{\"type\":\"error\",\"message\":" + json::quote(message) +
           ",\"line\":" + (line > 0 ? std::to_string(line) : "null") + "}";
}

std::string upper(std::string s)
{
    for (char &c : s) c = (char)std::toupper((unsigned char)c);
    return s;
}

int parse_tick(const json::Object &msg, int fallback)
{
    auto it = msg.find("tick_ms");
    if (it == msg.end()) return fallback;
    int v = std::atoi(it->second.c_str());
    return std::clamp(v, 0, MAX_TICK_MS);
}

bool find_kind(const std::string &name, const char *(*name_of)(int), int count, int &out)
{
    for (int k = 0; k < count; k++)
        if (upper(name) == name_of(k)) { out = k; return true; }
    return false;
}

const char *sched_name(int k) { return scheduler_name((SchedulerKind)k); }
const char *alloc_name(int k) { return allocator_name((AllocatorKind)k); }

/* The standard CSV, written into memory by the existing writer. */
bool csv_text(const SimulationResult &result, Phase phase, std::string &out, Error &error)
{
    char *buf = nullptr;
    size_t len = 0;
    FILE *f = open_memstream(&buf, &len);
    if (!f) return false;
    int status = write_standard_csv(f, &result, phase, &error);
    fclose(f);
    if (status == 0) out.assign(buf, len);
    free(buf);
    return status == 0;
}

/* Validates the request, runs the whole simulation and fills `run`.
 * Returns the message to send: "started" on success, "error" otherwise. */
std::string start_run(const json::Object &msg, Run &run)
{
    static const Picker pickers[] = { pick_fcfs, pick_priority, pick_sjf };
    SimulationConfig config = {};
    config.phase = PHASE_A3;             /* the final format; A2 files are valid A3 input */
    int sched = 0, alloc = 0;

    auto field = [&](const char *key) {
        auto it = msg.find(key);
        return it == msg.end() ? std::string() : it->second;
    };
    if (!find_kind(field("scheduler"), sched_name, 3, sched))
        return error_json("unknown scheduler \"" + field("scheduler") +
                          "\" (expected FCFS, PRIORITY or SJF)");
    if (!find_kind(field("allocator"), alloc_name, 3, alloc))
        return error_json("unknown allocator \"" + field("allocator") +
                          "\" (expected FIRST_FIT, BEST_FIT or WORST_FIT)");
    config.scheduler = (SchedulerKind)sched;
    config.allocator = (AllocatorKind)alloc;

    const std::string unsafe = field("unsafe_demo");
    if (unsafe == "true" || unsafe == "1")
        config.unsafe_demo = 1;
    else if (!unsafe.empty() && unsafe != "false" && unsafe != "0")
        return error_json("\"unsafe_demo\" must be true or false");

    std::string orders = field("orders");
    if (orders.empty()) return error_json("\"orders\" is missing or empty");

    /* Parse the orders text with the same parser as the command line. */
    Workload w;
    Error error = {};
    FILE *in = fmemopen(&orders[0], orders.size(), "r");
    if (!in) return error_json("cannot read the orders text");
    int status = read_process_section(in, &w, &error);
    if (status == 0 && read_resource_sections(in, &w, &error) != 0) {
        workload_free(&w);
        status = -1;
    }
    fclose(in);
    if (status != 0) return error_json(error.message, error.line);
    if (w.n > MAX_VIEWER_ORDERS || w.action_count > MAX_VIEWER_ACTIONS) {
        std::string message = "too large for the live viewer: " + std::to_string(w.n) +
                              " orders and " + std::to_string(w.action_count) +
                              " actions (at most " + std::to_string(MAX_VIEWER_ORDERS) +
                              " and " + std::to_string(MAX_VIEWER_ACTIONS) +
                              "); use ./restaurant for big inputs";
        workload_free(&w);
        return error_json(message);
    }

    Recorder recorder{pickers[sched], {}};
    SimulationResult result;
    {
        std::lock_guard<std::mutex> lock(sim_mutex);
        status = simulate_workload(&w, &config, record_frame, &recorder, &result, &error);
    }
    /* A deadlock (unsafe demo only) still has frames worth showing, up to the
     * moment the cycle formed; the result itself has already been freed. */
    bool deadlocked = status == -2 && !recorder.frames.empty();
    if (status != 0 && !deadlocked) {
        workload_free(&w);
        return error_json(error.message);
    }

    std::vector<std::string> closing;
    if (deadlocked) {
        closing.push_back(deadlock_json(recorder.frames.back().time, error.message));
    } else {
        std::string csv;
        if (!csv_text(result, config.phase, csv, error)) {
            simulation_result_free(&result);
            workload_free(&w);
            return error_json(std::string("cannot format results: ") + error.message);
        }
        closing.push_back(results_json(result, csv));
        simulation_result_free(&result);
    }
    closing.push_back("{\"type\":\"done\"}");

    run.active = !recorder.frames.empty();
    run.paused = false;
    run.tick_ms = parse_tick(msg, DEFAULT_TICK_MS);
    run.next = 0;
    run.due = Clock::now();
    run.frames = std::move(recorder.frames);
    run.closing = std::move(closing);
    std::string started = started_json(w, sched_name(sched), alloc_name(alloc),
                                       config.unsafe_demo != 0, (int)run.frames.size(),
                                       run.frames.empty() ? 0 : run.frames.back().time,
                                       run.tick_ms);
    workload_free(&w);
    return started;
}

/* Sends the next frame; after the last one, the closing messages. Returns false if the client left. */
bool send_next(int fd, Run &run)
{
    if (run.next >= run.frames.size()) {
        run.active = false;
        return true;
    }
    if (!ws::send_text(fd, run.frames[run.next].json)) return false;
    run.next++;
    if (run.next == run.frames.size()) {
        run.active = false;
        for (const std::string &m : run.closing)
            if (!ws::send_text(fd, m)) return false;
        return true;
    }
    int gap = run.frames[run.next].time - run.frames[run.next - 1].time;
    run.due = Clock::now() + std::chrono::milliseconds((long long)gap * run.tick_ms);
    return true;
}

/* Handles one client message. Returns false if the client left. */
bool handle(int fd, const std::string &text, Run &run)
{
    json::Object msg;
    std::string parse_error;
    if (!json::parse_flat_object(text, msg, parse_error))
        return ws::send_text(fd, error_json("bad message: " + parse_error));

    const std::string type = msg["type"];
    if (type == "start") {
        run.active = false;                         /* a new start replaces any current run */
        std::string reply = start_run(msg, run);
        return ws::send_text(fd, reply);
    }
    if (type == "pause") {
        run.paused = true;
        return ws::send_text(fd, "{\"type\":\"paused\"}");
    }
    if (type == "resume") {
        run.paused = false;
        run.due = Clock::now();
        return ws::send_text(fd, "{\"type\":\"resumed\"}");
    }
    if (type == "step") {
        if (!run.active) return ws::send_text(fd, error_json("nothing is running"));
        run.paused = true;
        return send_next(fd, run);
    }
    if (type == "speed") {
        run.tick_ms = parse_tick(msg, run.tick_ms);
        return ws::send_text(fd, "{\"type\":\"speed\",\"tick_ms\":" +
                                     std::to_string(run.tick_ms) + "}");
    }
    if (type == "stop") {
        run.active = false;
        return ws::send_text(fd, "{\"type\":\"stopped\"}");
    }
    return ws::send_text(fd, error_json("unknown message type \"" + type + "\""));
}

}  // namespace

void run_session(int fd)
{
    if (!ws::handshake(fd)) {
        close(fd);
        return;
    }

    const std::string hello =
        "{\"type\":\"hello\",\"schedulers\":[\"FCFS\",\"PRIORITY\",\"SJF\"],"
        "\"allocators\":[\"FIRST_FIT\",\"BEST_FIT\",\"WORST_FIT\"],"
        "\"chefs\":" + std::to_string(CHEFS) +
        ",\"pools\":{\"SPACE\":" + std::to_string(SPACE_CAPACITY) +
        ",\"TABLE\":" + std::to_string(TABLE_CAPACITY) + "}"
        ",\"equipment\":[\"COFFEE_MACHINE\",\"MICROWAVE\",\"OVEN_1\",\"OVEN_2\"]"
        ",\"unsafe_demo\":true,\"max_orders\":" + std::to_string(MAX_VIEWER_ORDERS) + "}";
    Run run;
    bool open = ws::send_text(fd, hello);

    while (open) {
        /* Wait for a message, or until the next frame is due. */
        int timeout = -1;
        if (run.active && !run.paused) {
            auto left = std::chrono::duration_cast<std::chrono::milliseconds>(run.due - Clock::now());
            timeout = (int)std::max<long long>(0, left.count());
        }
        pollfd pfd = { fd, POLLIN, 0 };
        int ready = poll(&pfd, 1, timeout);
        if (ready < 0) break;

        if (ready > 0) {
            std::string text;
            if (ws::read_message(fd, text) == ws::ReadResult::Closed) break;
            open = handle(fd, text, run);
        } else if (run.active && !run.paused) {
            open = send_next(fd, run);
        }
    }

    ws::send_close(fd);
    close(fd);
}
