# Restaurant server (WebSocket backend)

`restaurant_server` lets a web page drive the simulator. The browser connects, chooses a scheduler and an allocator, sends the orders file and starts. The server then streams the restaurant step by step, and finishes with the same results the command line writes.

## Build and run

```sh
make server                  # builds ./restaurant_server (C++17, no external libraries)
./restaurant_server          # ws://127.0.0.1:8080
./restaurant_server 9000     # another port
```

The server listens on 127.0.0.1 only. To try it without the real UI, open `server/test.html` in a browser, click **Connect**, pick a file such as `tests/a2/edge/07_fragmentation_and_fit.txt`, and click **Start**.

## How it works

The simulation is deterministic and takes milliseconds, so on `start` the server:
1. checks the orders with the same parser as the command line (`read_process_section`);
2. runs the whole simulation once (`simulate_workload`), recording a snapshot after every event time;
3. streams those snapshots to the browser at the chosen speed.

Pause, step and speed only control the stream, so the results are always identical to `./restaurant INPUT SCHEDULER ALLOCATOR OUTPUT`. Each connection has its own thread. The simulator itself runs one connection at a time behind a mutex, because `sim.c` keeps its state in static variables.

## Messages

Every message is one JSON object with a `type`.

### Browser → server

| type | fields | effect |
|---|---|---|
| `start` | `scheduler` (`FCFS` / `PRIORITY` / `SJF`), `allocator` (`FIRST_FIT` / `BEST_FIT` / `WORST_FIT`), `orders` (the file's text), `tick_ms` (optional, default 500) | Validates the input, runs the simulation and starts streaming. A new `start` replaces the current run. |
| `pause` | – | Stops the stream. |
| `resume` | – | Continues the stream. |
| `step` | – | Sends exactly one frame and stays paused. |
| `speed` | `tick_ms` | Changes the speed: milliseconds per simulated time unit (0–60000). |
| `stop` | – | Abandons the current run. |

```json
{"type":"start","scheduler":"FCFS","allocator":"BEST_FIT","orders":"4\n2\nO1,0,2,8,NORMAL,2,1\nO2,1,1,4,VIP,1,1\nO3,2,2,5,NORMAL,3,0\nO4,3,1,6,VIP,2,2\n","tick_ms":500}
```

### Server → browser

| type | when | contents |
|---|---|---|
| `hello` | on connect | available `schedulers`, `allocators`, `chefs` (2), `pools` (`SPACE` 6, `TABLE` 3) |
| `error` | bad message or bad input | `message`, and `line` (input line number, or null). The connection stays open; fix the input and send `start` again. |
| `started` | after a valid `start` | `scheduler`, `allocator`, `tick_ms`, `frame_count`, `end_time`, and the parsed `processes` |
| `frame` | one per event time | the whole restaurant at that time (below) |
| `paused`, `resumed`, `speed`, `stopped` | acknowledgements | `speed` repeats the new `tick_ms` |
| `results` | after the last frame | `csv` (exactly the graded result file), plus `processes`, `summary` and `pools` as JSON |
| `done` | after `results` | – |

A frame is a complete picture, so the UI can draw it without remembering earlier frames:

```json
{"type":"frame","seq":4,"time":10,
 "events":[{"type":"COMPLETE","process_id":"A2","chef_id":1},
           {"type":"DISPATCH","process_id":"B1","chef_id":1}],
 "processes":[{"id":"A1","state":"TERMINATED","executed_service":1,"remaining_service":0,"chef_id":null},
              {"id":"B1","state":"RUNNING","executed_service":0,"remaining_service":2,"chef_id":1}],
 "chefs":["A4","B1"],
 "pools":{"SPACE":["B2","B2",null,"B1","A4","A4"],"TABLE":["B1","B2",null]},
 "queues":{"memory":[],"ready":["B2"]}}
```

- `events` types: `ARRIVE`, `MEMORY_BLOCK` (arrived but did not fit), `MEMORY_ADMIT`, `DISPATCH`, `COMPLETE`, in the order they happened.
- `processes[].state`: `NEW`, `BLOCKED_MEMORY`, `READY`, `RUNNING`, `TERMINATED`.
- `pools`: the owner of each slot in address order, or `null` when free.
- `queues.memory`: the FIFO memory queue, head first. `queues.ready`: READY orders in the order the selected scheduler would pick them.
- Frames are sent only at event times. The delay before the next frame is `(next time − this time) × tick_ms`, so idle stretches take proportionally longer. To animate cooking between frames, a RUNNING order's progress grows by 1 per time unit until its next frame.

The frame layout follows the team's shared data guide (`docs/shared-data.md`, section 4, on the viewer branch), so live frames and saved recordings have the same shape.
