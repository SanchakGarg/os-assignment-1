/*
 * The clock. The server sends every frame up front; playback walks through
 * the simulated time one cycle (time unit) at a time. `t` is the current
 * cycle and `phase` (0..1) how far into it we are. Events at time t are
 * animated during cycle t; a RUNNING order cooks one unit per cycle.
 */
(function () {
  const P = (RV.Playback = {
    run: null,            /* { started, frames, results, deadlock } */
    t: 0,
    phase: 0,
    playing: false,
    stepping: false,      /* playing a single cycle, then pause at its end */
    secPerCycle: 1,
    endTime: 0,
    empty: null,          /* the restaurant before the first frame */
  });

  const listeners = {};
  P.on = (name, fn) => (listeners[name] = listeners[name] || []).push(fn);
  const emit = (name, arg) => (listeners[name] || []).forEach(fn => fn(arg));

  /* Gives every frame a by-id lookup once, so the scene can ask cheaply. */
  function index(frame) {
    frame.byId = {};
    for (const p of frame.processes) frame.byId[p.id] = p;
    return frame;
  }

  P.load = function (run, pools) {
    P.run = run;
    run.frames.sort((a, b) => a.time - b.time);
    run.frames.forEach(index);
    run.meta = {};
    run.started.processes.forEach((p, i) => (run.meta[p.id] = Object.assign({ index: i }, p)));
    P.endTime = run.frames.length ? run.frames[run.frames.length - 1].time : 0;
    P.empty = index({
      time: -1,
      events: [],
      processes: run.started.processes.map(p => ({
        id: p.id, state: "NEW", executed_service: 0, remaining_service: p.service,
        chef_id: null, holds: [], waits_for: null,
      })),
      chefs: [null, null],
      chef_stretch_end: [null, null],
      pools: { SPACE: new Array(pools.SPACE).fill(null), TABLE: new Array(pools.TABLE).fill(null) },
      resources: run.started.resources.map(r => ({ id: r.id, holder: null, waiting: [] })),
      queues: { memory: [], ready: [] },
    });
    P.t = 0;
    P.phase = 0;
    P.playing = false;
    P.stepping = false;
    emit("load");
  };

  /* The restaurant at the start of cycle t (last frame with time <= t). */
  P.frameAt = function (t) {
    const f = P.run ? P.run.frames : [];
    let lo = 0, hi = f.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (f[mid].time <= t) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return best < 0 ? P.empty : f[best];
  };

  P.eventsAt = function (t) {
    const f = P.frameAt(t);
    return f.time === t ? f.events : [];
  };

  /* Service done by `id` at cycle t plus `phase` of the current cycle. */
  P.progress = function (id, t, phase) {
    const f = P.frameAt(t);
    const p = f.byId[id];
    if (!p) return 0;
    const meta = P.run.meta[id];
    if (p.state !== "RUNNING") return p.executed_service;
    return Math.min(meta.service, p.executed_service + (t - f.time) + phase);
  };

  P.atEnd = () => P.t >= P.endTime && P.phase >= 1;

  P.tick = function (dt) {
    if (!P.playing || !P.run) return;
    P.phase += dt / P.secPerCycle;
    while (P.phase >= 1) {
      if (P.stepping || P.t >= P.endTime) {    /* stop at the end of this cycle */
        P.phase = 1;
        P.playing = false;
        P.stepping = false;
        emit("state");
        if (P.t >= P.endTime) emit("end");
        return;
      }
      P.t++;
      P.phase -= 1;
      emit("cycle", "forward");
    }
  };

  P.play = function () {
    if (!P.run) return;
    if (P.atEnd()) return P.restart();
    if (P.phase >= 1) {               /* paused at the end of a cycle: go on to the next */
      P.t++;
      P.phase = 0;
      emit("cycle", "forward");
    }
    P.playing = true;
    P.stepping = false;
    emit("state");
  };

  P.pause = function () {
    P.playing = false;
    P.stepping = false;
    emit("state");
  };

  P.toggle = () => (P.playing ? P.pause() : P.play());

  /* Plays exactly one cycle (or finishes the current one), then pauses. */
  P.step = function () {
    if (!P.run) return;
    if (P.phase >= 1) {
      if (P.t >= P.endTime) return;
      P.t++;
      P.phase = 0;
      emit("cycle", "forward");
    }
    P.playing = true;
    P.stepping = true;
    emit("state");
  };

  /* Shows the end of the previous cycle (before this cycle's events). */
  P.back = function () {
    if (!P.run) return;
    P.seek(P.t - 1);
  };

  /* Jumps to the end of cycle t (its events done), paused. */
  P.seek = function (t) {
    if (!P.run) return;
    P.t = Math.max(0, Math.min(P.endTime, Math.round(t)));
    P.phase = 1;
    P.playing = false;
    P.stepping = false;
    emit("cycle", "seek");
    emit("state");
  };

  P.restart = function () {
    if (!P.run) return;
    P.t = 0;
    P.phase = 0;
    P.playing = true;
    P.stepping = false;
    emit("cycle", "seek");
    emit("state");
  };

  P.setSpeed = function (sec) {
    P.secPerCycle = Math.max(0.1, Math.min(5, sec));
    emit("speed");
  };
})();
