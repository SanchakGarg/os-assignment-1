# Restaurant server (WebSocket backend)

`restaurant_server` lets a web page drive the simulator. The browser connects, chooses a scheduler, an allocator and the deadlock mode, sends the orders file and starts. The server then streams the restaurant step by step (chefs, seats and tables, kitchen equipment) and finishes with the same results the command line writes.

## Build and run

```sh
make server                  # builds ./restaurant_server (C++17, no external libraries)
./restaurant_server          # ws://127.0.0.1:8080, viewer at http://127.0.0.1:8080/
./restaurant_server 9000     # another port
```

The server listens on 127.0.0.1 only. The same port also serves the browser viewer: a plain `GET` returns files from `./web`, so start the server from the repository root. `/` maps to `web/index.html`. Only plain file names under `web/` are served (letters, digits, `.`, `_`, `-`, `/`, no `..`); anything else gets 404. To try the protocol without the viewer, open `server/test.html` in a browser, click **Connect**, pick a file such as `tests/a3/integrated.txt`, and click **Start**.

WebSocket connections are accepted from pages opened from disk (`Origin: null`), from tools that send no Origin, and from the viewer served by this server (`Origin` equal to `http://` + the loopback `Host`). Other websites get 403, so they can't drive the local server.

## How it works

The simulation takes milliseconds, so on `start` the server:
1. checks the orders with the same parser as the command line (`read_process_section`, then `read_resource_sections`). A2 files are valid input with no equipment;
2. runs the whole simulation once (`simulate_workload`), recording a snapshot after every event time;
3. streams those snapshots to the browser at the chosen speed.

Pause, step and speed only control the stream. Each connection has its own thread. The simulator runs one connection at a time behind a mutex, because `sim.c` keeps its state in static variables. The result CSV uses the final-project format (`--phase a3`, the command line's default).

Results are identical to `./restaurant INPUT SCHEDULER ALLOCATOR OUTPUT` whenever no two orders contend for the same equipment at the same instant. When they do, the OS decides which worker thread wins the mutex, so two runs (server or command line) can differ. See "Virtual time vs real thread execution" in the README.

A live run is limited to 200 orders and 2000 actions, because every frame lists every order. Use `./restaurant` for bigger inputs.

## Messages

Every message is one JSON object with a `type`.

### Browser → server

| type | fields | effect |
|---|---|---|
| `start` | `scheduler` (`FCFS` / `PRIORITY` / `SJF`), `allocator` (`FIRST_FIT` / `BEST_FIT` / `WORST_FIT`), `orders` (the file's text), `tick_ms` (optional, default 500), `unsafe_demo` (optional `true`/`false`, default `false`: deadlock prevention off) | Validates the input, runs the simulation and starts streaming. A new `start` replaces the current run. With `tick_ms: 0` every frame is sent immediately, so the browser can pace playback itself. |
| `pause` | – | Stops the stream. |
| `resume` | – | Continues the stream. |
| `step` | – | Sends exactly one frame and stays paused. |
| `speed` | `tick_ms` | Changes the speed: milliseconds per simulated time unit (0–60000). |
| `stop` | – | Abandons the current run. |

```json
{"type":"start","scheduler":"FCFS","allocator":"BEST_FIT","orders":"2\n2\nO1,0,1,4,NORMAL,1,1\nO2,0,2,4,NORMAL,1,1\n1\nOVEN_1,1\n4\nO1,1,ACQUIRE,OVEN_1,1\nO1,3,RELEASE,OVEN_1,1\nO2,1,ACQUIRE,OVEN_1,1\nO2,3,RELEASE,OVEN_1,1\n","tick_ms":500}
```

### Server → browser

| type | when | contents |
|---|---|---|
| `hello` | on connect | available `schedulers`, `allocators`, `chefs` (2), `pools` (`SPACE` 6, `TABLE` 3), `equipment` (the inventory in rank order), `unsafe_demo` (supported), `max_orders` |
| `error` | bad message or bad input | `message`, and `line` (input line number, or null). The connection stays open; fix the input and send `start` again. |
| `started` | after a valid `start` | `scheduler`, `allocator`, `unsafe_demo`, `tick_ms`, `frame_count`, `end_time`, the declared `resources` (`id`, `capacity`, `rank`) and the parsed `processes`, each with its equipment `actions` (`offset`, `action`, `resource`) |
| `frame` | one per event time | the whole restaurant at that time (below) |
| `paused`, `resumed`, `speed`, `stopped` | acknowledgements | `speed` repeats the new `tick_ms` |
| `results` | after the last frame | `csv` (exactly the graded result file), plus `processes` (with `resource_wait`), `summary`, `pools`, `resources` and `checks` as JSON |
| `deadlock` | after the last frame, in place of `results` | only with `unsafe_demo`: `time` and the `message` describing the wait-for cycle. The last frame shows the deadlocked state. |
| `done` | after `results` or `deadlock` | – |

A frame is a complete picture, so the UI can draw it without remembering earlier frames:

```json
{"type":"frame","seq":2,"time":2,
 "events":[{"type":"RESOURCE_RELEASE","process_id":"O2","chef_id":1,"resource":"OVEN_1"},
           {"type":"RESOURCE_ACQUIRE","process_id":"O1","chef_id":null,"resource":"OVEN_1"},
           {"type":"RESOURCE_UNBLOCK","process_id":"O1","chef_id":null,"resource":"OVEN_1"},
           {"type":"DISPATCH","process_id":"O1","chef_id":0,"resource":null}],
 "processes":[{"id":"O1","state":"RUNNING","executed_service":1,"remaining_service":4,"chef_id":0,
               "holds":["OVEN_1"],"waits_for":null},
              {"id":"O3","state":"BLOCKED_MEMORY","executed_service":0,"remaining_service":3,"chef_id":null,
               "holds":[],"waits_for":null}],
 "chefs":["O1","O2"],
 "chef_stretch_end":[5,4],
 "pools":{"SPACE":["O1","O1","O1","O2","O2",null],"TABLE":["O1","O2",null]},
 "resources":[{"id":"OVEN_1","holder":"O1","waiting":[]},{"id":"OVEN_2","holder":null,"waiting":[]}],
 "queues":{"memory":["O3","O4"],"ready":[]}}
```

- `events` types, in the order they happened:
  - memory and CPU: `ARRIVE`, `MEMORY_BLOCK` (arrived but did not fit), `MEMORY_ADMIT`, `DISPATCH`, `COMPLETE`;
  - equipment: `RESOURCE_ACQUIRE`, `RESOURCE_WAIT` (the unit is busy, so the order joins its FIFO queue), `RESOURCE_BLOCK` (the order gives up its chef), `RESOURCE_RELEASE`, `RESOURCE_ROLLBACK` (deadlock prevention gives back a higher-ranked unit before waiting for a lower one), `RESOURCE_UNBLOCK` (it got the unit and is READY again).
  - `chef_id` is the chef involved, or null. `resource` is the equipment involved, or null.
- `processes[].state`: `NEW`, `BLOCKED_MEMORY`, `READY`, `RUNNING`, `BLOCKED_RESOURCE`, `TERMINATED`. `holds` lists the equipment the order holds. `waits_for` is the unit a `BLOCKED_RESOURCE` order is waiting for.
- `chefs`: the order each chef is cooking, or null. `chef_stretch_end`: when that chef's current stretch of cooking ends (the next equipment action or the end of service), or null.
- `pools`: the owner of each slot in address order, or `null` when free.
- `resources`: each declared unit's `holder` (or null) and its FIFO `waiting` queue, head first. Empty when the input has no equipment.
- `queues.memory`: the FIFO memory queue, head first. `queues.ready`: READY orders in the order the selected scheduler would pick them.
- Frames are sent at every time something changes: an arrival, an admission, a dispatch, a completion or any equipment action. The delay before the next frame is `(next time − this time) × tick_ms`, so idle stretches take proportionally longer. Between two frames a RUNNING order cooks without interruption, so its `executed_service` grows by exactly 1 per time unit until the next frame.

The frame layout follows the team's shared data guide (`docs/shared-data.md`, section 4, on the viewer branch). The equipment fields (`resource`, `holds`, `waits_for`, `chef_stretch_end`, `resources`) are additions, so older readers that ignore unknown fields keep working.
