/*
 * The restaurant scene. Rendering is a pure function of (cycle t, phase):
 * every person, chef and ticket has a spot in the frame before t and in the
 * frame at t, and walks between them during a window of the cycle. So play,
 * pause, step back and seek all draw correctly without remembered state.
 *
 * The picture is drawn at 512 x 288 world pixels, scaled up without
 * smoothing; text is drawn afterwards at screen resolution so it stays sharp.
 */
(function () {
  const W = 512, H = 288;
  const Sp = RV.Sprites, P = RV.Playback;
  const Sc = (RV.Scene = {
    pools: { SPACE: 6, TABLE: 3 },
    equipment: ["COFFEE_MACHINE", "MICROWAVE", "OVEN_1", "OVEN_2"],
  });

  /* ---------- layout (world pixels) ---------- */
  const COL_X = { COFFEE_MACHINE: 8, MICROWAVE: 58, OVEN_1: 108, OVEN_2: 158 };
  const STOVE_X = [216, 266];
  const MACHINE_Y = 18, COUNTER_Y = 46, FLOOR_Y = 60, CHEF_Y = 95, DIVIDER_Y = 104;
  const RAIL = { x: 322, y: 2, w: 186, h: 58 }, SLOT_W = 36, SLOTS = 5;
  const CHAIR_Y = 133, TABLE_Y = 137;
  const WALL_Y = 196, WALK_Y = 214, ROAD_Y = 255;
  const DOOR = { x: 238, w: 26 };
  const DOOR_OUT = { x: 251, y: 238 }, DOOR_IN = { x: 251, y: 190 };
  const SPAWN = { x: 306, y: 240 }, EXIT = { x: 545, y: 242 };
  const QUEUE_Y = 241, QUEUE_RIGHT = 230, QUEUE_LEFT = 10, AISLE_Y = 176;

  let seatDX = 36, tableDX = 80, tableW = 64;
  const chairX = i => 20 + i * seatDX;
  const tableX = j => 268 + j * tableDX;
  const seatFeet = i => ({ x: chairX(i) + 10, y: CHAIR_Y + 15, zone: "seat" });
  const stationSpot = key => ({ x: (key in COL_X ? COL_X[key] : STOVE_X[+key.slice(5)]) + 24, y: CHEF_Y });

  /* ---------- canvases ---------- */
  let canvas, ctx, world, wctx, bg;
  let scale = 1, ox = 0, oy = 0, labels = [], overlay = [];
  const FONT = '"Press Start 2P", ui-monospace, monospace';

  Sc.init = function (el) {
    canvas = el;
    ctx = canvas.getContext("2d");
    world = document.createElement("canvas");
    world.width = W;
    world.height = H;
    wctx = world.getContext("2d");
    new ResizeObserver(Sc.resize).observe(canvas.parentElement);
    Sc.resize();
  };

  /* Below this scale text gets unreadable, so on small screens the scene
   * keeps this size and the page pans sideways instead. */
  const MIN_SCALE = 1.4;

  Sc.resize = function () {
    const r = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const pan = r.width < W * MIN_SCALE;
    const cw = pan ? W * MIN_SCALE : r.width;
    const ch = pan ? Math.max(r.height, H * MIN_SCALE) : r.height;
    canvas.classList.toggle("pan", pan);
    canvas.width = Math.max(1, Math.round(cw * dpr));
    canvas.height = Math.max(1, Math.round(ch * dpr));
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    scale = Math.min(canvas.width / W, canvas.height / H);
    ox = Math.round((canvas.width - W * scale) / 2);
    oy = Math.round((canvas.height - H * scale) / 2);
  };

  /* Pool sizes come from the server's hello. */
  Sc.setPools = function (pools) {
    Sc.pools = pools;
    seatDX = Math.min(36, Math.floor(216 / pools.SPACE));
    tableDX = Math.min(80, Math.floor(240 / pools.TABLE));
    tableW = Math.min(64, tableDX - 12);
    bg = null;
  };

  /* ---------- helpers ---------- */
  const clamp01 = u => (u < 0 ? 0 : u > 1 ? 1 : u);
  const ease = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const R = Sp.rect;

  function label(text, x, y, o) {
    labels.push(Object.assign({ text, x, y, size: 4, color: "#fff", align: "center", alpha: 1 }, o));
  }

  Sc.colorOf = function (id) {
    const m = P.run && P.run.meta[id];
    return Sp.ORDER_COLORS[(m ? m.index : 0) % Sp.ORDER_COLORS.length];
  };

  function slotsOf(pool, id) {
    const out = [];
    pool.forEach((o, i) => o === id && out.push(i));
    return out;
  }

  /* Contiguous runs of free slots: [{start, size}]. */
  function holes(pool) {
    const out = [];
    let start = -1;
    pool.forEach((o, i) => {
      if (o === null && start < 0) start = i;
      if (o !== null && start >= 0) { out.push({ start, size: i - start }); start = -1; }
    });
    if (start >= 0) out.push({ start, size: pool.length - start });
    return out;
  }
  Sc.holes = holes;

  /* Points along a polyline at window-relative progress. */
  function along(path, phase) {
    const pts = path.pts;
    const u = ease(clamp01((phase - path.win[0]) / (path.win[1] - path.win[0])));
    if (!path.len) {
      path.seg = [];
      path.len = 0;
      for (let k = 1; k < pts.length; k++) {
        const d = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
        path.seg.push(d);
        path.len += d;
      }
    }
    let dist = u * path.len;
    for (let k = 0; k < path.seg.length; k++) {
      if (dist <= path.seg[k] || k === path.seg.length - 1) {
        const f = path.seg[k] ? Math.min(1, dist / path.seg[k]) : 1;
        return {
          x: pts[k].x + (pts[k + 1].x - pts[k].x) * f,
          y: pts[k].y + (pts[k + 1].y - pts[k].y) * f,
          moving: phase > path.win[0] && phase < path.win[1] && path.len > 0,
          done: phase >= path.win[1],
          u,
        };
      }
      dist -= path.seg[k];
    }
    return { x: pts[0].x, y: pts[0].y, moving: false, done: true, u };
  }

  /* ---------- per-frame derived state (cached on the frame) ---------- */

  /* Where each waiting party stands on the sidewalk, head of the line at the door. */
  function queueLayout(F) {
    if (F._q) return F._q;
    const q = F.queues.memory, meta = P.run.meta;
    const sizes = q.map(id => meta[id].space_req);
    const total = sizes.reduce((a, n) => a + n * 9 + 10, 0);
    const k = Math.min(1, (QUEUE_RIGHT - QUEUE_LEFT) / Math.max(1, total));
    const out = {};
    let right = QUEUE_RIGHT;
    q.forEach((id, idx) => {
      const n = sizes[idx], sp = 9 * k;
      const members = [];
      for (let j = 0; j < n; j++) members.push({ x: right - (n - 1 - j) * sp - 4, y: QUEUE_Y + (j % 2), zone: "queue" });
      out[id] = { members, center: right - ((n - 1) * sp) / 2 - 4, pos: idx };
      right -= n * sp + 10 * k;
    });
    return (F._q = out);
  }

  function memberSpot(F, id, j) {
    const p = F.byId[id];
    if (!p || p.state === "NEW" || p.state === "TERMINATED") return null;
    if (p.state === "BLOCKED_MEMORY") {
      const L = queueLayout(F)[id];
      return L ? L.members[j] : null;
    }
    const seats = slotsOf(F.pools.SPACE, id);
    if (!seats.length) return null;
    return seatFeet(seats[Math.min(j, seats.length - 1)]);
  }

  function memberPath(a, b, j) {
    const dx = j * 3 - 6;
    const door = [{ x: DOOR_OUT.x + dx, y: DOOR_OUT.y }, { x: DOOR_IN.x + dx, y: DOOR_IN.y }];
    const spawn = { x: SPAWN.x + j * 9, y: SPAWN.y + (j % 2) };
    if (!a && b && b.zone === "queue") return { pts: [spawn, b], win: [0.22, 0.7], fadeIn: true };
    if (!a && b) return { pts: [spawn, ...door, { x: b.x, y: AISLE_Y }, b], win: [0.25, 0.92], fadeIn: true };
    if (a && b && a.zone === "queue" && b.zone === "queue") return { pts: [a, b], win: [0.3, 0.72] };
    if (a && b && a.zone === "queue") return { pts: [a, ...door, { x: b.x, y: AISLE_Y }, b], win: [0.28, 0.92] };
    if (a && !b) return { pts: [a, { x: a.x, y: AISLE_Y }, door[1], door[0], { x: EXIT.x + j * 9, y: EXIT.y }], win: [0.12, 0.8] };
    return { pts: [a, b], win: [0.3, 0.8] };
  }

  /*
   * Which spot each chef stands at in each frame: their stove, or the piece of
   * equipment their order acquired most recently and still holds.
   */
  function prepareChefSpots(run) {
    const last = {};
    for (const F of run.frames) {
      for (const ev of F.events) {
        if (ev.type === "RESOURCE_ACQUIRE") last[ev.process_id] = ev.resource;
      }
      F.chefAt = F.chefs.map((o, c) => {
        if (!o) return "stove" + c;
        const holds = F.byId[o].holds;
        if (last[o] && holds.includes(last[o])) return last[o];
        if (holds.length) return (last[o] = holds[holds.length - 1]);
        return "stove" + c;
      });
    }
    P.empty.chefAt = ["stove0", "stove1"];
  }

  function ticketSpot(F, id) {
    const p = F.byId[id];
    if (!p) return null;
    if (p.state === "READY") {
      const k = F.queues.ready.indexOf(id);
      const many = F.queues.ready.length > SLOTS;
      if (many && k >= SLOTS - 1) return { kind: "more", x: RAIL.x + 6 + (SLOTS - 1) * SLOT_W, y: RAIL.y + 19 };
      return { kind: "rail", k, x: RAIL.x + 6 + k * SLOT_W, y: RAIL.y + 19 };
    }
    if (p.state === "BLOCKED_RESOURCE" && p.waits_for in COL_X) {
      const res = F.resources.find(r => r.id === p.waits_for);
      const k = Math.max(0, res ? res.waiting.indexOf(id) : 0);
      return { kind: "hook", k, x: COL_X[p.waits_for] + 2, y: 1 + Math.min(k, 1) * 9 };
    }
    if (p.state === "RUNNING") {
      const spot = stationSpot(F.chefAt[p.chef_id]);
      return { kind: "chef", c: p.chef_id, x: spot.x - 14, y: CHEF_Y - 30 };
    }
    return null;
  }

  /* Pool contents as shown at this phase: releases fade out, then new owners appear. */
  function shownPool(prev, cur, phase) {
    return cur.map((o, i) => (prev[i] === o ? o : phase < 0.15 ? prev[i] : phase < 0.4 ? null : o));
  }

  /* ---------- background (static) ---------- */
  function drawBackground() {
    bg = document.createElement("canvas");
    bg.width = W;
    bg.height = H;
    const g = bg.getContext("2d");
    // kitchen wall: subway tiles
    R(g, 0, 0, W, COUNTER_Y, "#e9eef0");
    for (let y = 0; y < COUNTER_Y; y += 6) {
      R(g, 0, y + 5, RAIL.x - 4, 1, "#cdd6da");
      for (let x = (y / 6) % 2 ? 0 : 6; x < RAIL.x - 4; x += 12) R(g, x, y, 1, 5, "#cdd6da");
    }
    R(g, 0, COUNTER_Y - 2, W, 2, "#b8c2c7");
    // back counter
    R(g, 0, COUNTER_Y, 316, 3, "#c5ccd3");
    R(g, 0, COUNTER_Y + 3, 316, FLOOR_Y - COUNTER_Y - 3, "#7d8690");
    R(g, 0, FLOOR_Y - 2, 316, 2, "#5c646d");
    for (let x = 4; x < 316; x += 50) R(g, x, COUNTER_Y + 5, 42, 9, "#6c747d");
    // kitchen floor: checker
    for (let y = FLOOR_Y; y < DIVIDER_Y; y += 8)
      for (let x = 0; x < W; x += 8) R(g, x, y, 8, 8, ((x + y) / 8) % 2 ? "#d8d2c6" : "#c2bbad");
    // order rail: cork board
    R(g, RAIL.x - 3, RAIL.y - 1, RAIL.w + 4, RAIL.h + 3, "#6b4a2f");
    R(g, RAIL.x - 1, RAIL.y + 1, RAIL.w, RAIL.h - 1, "#c19461");
    for (let k = 0; k < 60; k++) R(g, RAIL.x + ((k * 37) % RAIL.w), RAIL.y + 3 + ((k * 23) % (RAIL.h - 6)), 1, 1, "#a87a4b");
    R(g, RAIL.x + 2, RAIL.y + 16, RAIL.w - 6, 2, "#8c99a3");
    // fridge and sink on the right of the kitchen
    R(g, 330, 64, 26, 38, "#dee2e6");
    R(g, 331, 65, 24, 14, "#f1f3f5");
    R(g, 331, 81, 24, 20, "#f1f3f5");
    R(g, 352, 70, 2, 6, "#868e96");
    R(g, 352, 85, 2, 8, "#868e96");
    R(g, 366, 80, 44, 22, "#868e96");
    R(g, 368, 82, 40, 6, "#adb5bd");
    R(g, 386, 74, 3, 8, "#495057");
    R(g, 386, 74, 8, 2, "#495057");
    // divider counter between kitchen and dining room
    R(g, 0, DIVIDER_Y, W, 14, "#6e4429");
    R(g, 0, DIVIDER_Y, W, 3, "#b07a4a");
    R(g, 0, DIVIDER_Y + 13, W, 1, "#4a2c19");
    // dining floor: planks
    for (let y = DIVIDER_Y + 14; y < WALL_Y; y += 6) {
      R(g, 0, y, W, 6, (y / 6) % 2 ? "#c58f5c" : "#bd8754");
      R(g, 0, y + 5, W, 1, "#a8744a");
      for (let x = (y * 7) % 48; x < W; x += 48) R(g, x, y, 1, 5, "#a8744a");
    }
    // rugs under the seats and the tables
    R(g, 12, 126, 222, 46, "#7b3434");
    R(g, 14, 128, 218, 42, "#8f3f3f");
    R(g, 260, 126, 240, 46, "#2f4f6b");
    R(g, 262, 128, 236, 42, "#365b7a");
    // front wall with windows and the door
    R(g, 0, WALL_Y, W, WALK_Y - WALL_Y, "#9c4a3a");
    for (let y = WALL_Y; y < WALK_Y; y += 4)
      for (let x = (y / 4) % 2 ? 0 : 6; x < W; x += 12) R(g, x, y + 3, 12, 1, "#7d3a2d"), R(g, x, y, 1, 3, "#7d3a2d");
    for (const wx of [24, 112, 300, 396]) {
      R(g, wx, WALL_Y + 3, 70, 10, "#5a3620");
      R(g, wx + 2, WALL_Y + 4, 66, 8, "#9fd3e6");
      R(g, wx + 2, WALL_Y + 4, 66, 2, "#c9ecf5");
      R(g, wx + 34, WALL_Y + 4, 2, 8, "#5a3620");
    }
    R(g, DOOR.x - 2, WALL_Y, DOOR.w + 4, WALK_Y - WALL_Y, "#5a3620");
    R(g, DOOR.x, WALL_Y + 1, DOOR.w, WALK_Y - WALL_Y - 1, "#c58f5c");
    R(g, DOOR.x, WALL_Y + 1, DOOR.w, 2, "#a8744a");
    // sidewalk, curb, road
    R(g, 0, WALK_Y, W, ROAD_Y - WALK_Y, "#b9b8ae");
    for (let x = 0; x < W; x += 20) R(g, x, WALK_Y, 1, ROAD_Y - WALK_Y, "#a3a298");
    R(g, 0, WALK_Y + 20, W, 1, "#a3a298");
    R(g, 0, ROAD_Y - 3, W, 3, "#8d8c84");
    R(g, 0, ROAD_Y, W, H - ROAD_Y, "#3d4046");
    for (let x = 6; x < W; x += 28) R(g, x, ROAD_Y + 18, 14, 2, "#e8d36a");
    // doormat, plants and a street lamp
    R(g, DOOR.x - 1, WALK_Y + 1, DOOR.w + 2, 5, "#5c3b1e");
    Sp.plant(g, DOOR.x - 16, WALK_Y - 6);
    Sp.plant(g, DOOR.x + DOOR.w + 4, WALK_Y - 6);
    Sp.plant(g, 2, 176);
    Sp.plant(g, 498, 176);
    R(g, 480, WALK_Y - 30, 3, 66, "#343a40");
    R(g, 474, WALK_Y - 34, 15, 5, "#495057");
    R(g, 476, WALK_Y - 30, 11, 2, "#ffe066");
  }

  /* ---------- drawing pieces ---------- */

  function drawPerson(d) {
    const sprite = Sp.person(d.color, d.hair, d.frame);
    wctx.globalAlpha = d.alpha;
    wctx.drawImage(sprite, Math.round(d.x - 4), Math.round(d.y - (d.frame === "sit" ? 15 : 14)));
    wctx.globalAlpha = 1;
  }

  function drawWallClock(t, phase) {
    const cx = 302, cy = 9;
    R(wctx, cx - 8, cy - 8, 17, 17, "#343a40");
    R(wctx, cx - 7, cy - 7, 15, 15, "#f8f9fa");
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      R(wctx, cx + Math.round(Math.sin(a) * 6), cy - Math.round(Math.cos(a) * 6), 1, 1, "#868e96");
    }
    const a = phase * Math.PI * 2;
    for (let r = 0; r < 6; r++) R(wctx, cx + Math.round(Math.sin(a) * r), cy - Math.round(Math.cos(a) * r), 1, 1, "#e03131");
    R(wctx, cx, cy, 1, 1, "#212529");
    label(`T=${t}`, cx, 19, { size: 3.2, color: "#212529" });
  }

  /* A small ticket in flight. */
  function drawFlyingTicket(x, y, id) {
    Sp.ticket(wctx, x, y, Sc.colorOf(id), 16, 11);
    label(id, x + 8, y + 5, { size: 3, color: "#212529" });
  }

  function drawRailTicket(spot, id, F, t, phase) {
    const m = P.run.meta[id];
    const col = Sc.colorOf(id);
    if (spot.kind === "more") {
      Sp.ticket(wctx, spot.x, spot.y, "#868e96");
      label(`+${F.queues.ready.length - (SLOTS - 1)}`, spot.x + 15, spot.y + 12, { size: 5, color: "#212529" });
      label("MORE", spot.x + 15, spot.y + 22, { size: 3, color: "#495057" });
      return;
    }
    Sp.ticket(wctx, spot.x, spot.y, col);
    label(id, spot.x + 15, spot.y + 8, { size: 4.5, color: "#212529" });
    const sched = P.run.started.scheduler;
    const lines = [
      ["ARR", m.arrival, sched === "FCFS"],
      ["PRI", m.priority, sched === "PRIORITY"],
      ["JOB", m.service, sched === "SJF"],
    ];
    lines.forEach(([k, v, key], n) => {
      if (key) R(wctx, spot.x + 1, spot.y + 14 + n * 6, 28, 6, "#fff3bf");
      label(`${k} ${v}`, spot.x + 15, spot.y + 15 + n * 6, { size: 3, color: key ? "#c92a2a" : "#495057" });
    });
    const done = P.progress(id, t, phase);
    if (done > 0) {
      R(wctx, spot.x + 2, spot.y + 31, 26, 2, "#dee2e6");
      R(wctx, spot.x + 2, spot.y + 31, Math.round((26 * done) / m.service), 2, "#2f9e44");
    }
  }

  /* A blocked order's tag on the wall above the machine it waits for. */
  function drawHookTag(spot, id, F) {
    const col = Sc.colorOf(id);
    if (spot.k > 1) {                       /* third in line or later: one "+N" tag */
      if (spot.k === 2) {
        const res = F.resources.find(r => r.waiting.includes(id));
        label(`+${res.waiting.length - 2} MORE`, spot.x + 22, spot.y - 10, { size: 2.6, color: "#c92a2a" });
      }
      return;
    }
    R(wctx, spot.x, spot.y, 44, 8, "#fff5f5");
    R(wctx, spot.x, spot.y, 3, 8, col);
    R(wctx, spot.x, spot.y + 7, 44, 1, "#c92a2a");
    label(`WAIT ${id}`, spot.x + 24, spot.y + 2, { size: 3, color: "#c92a2a" });
  }

  /* ---------- main render ---------- */

  Sc.render = function (now) {
    if (!ctx) return;
    if (!bg) drawBackground();
    labels = [];
    overlay = [];
    wctx.drawImage(bg, 0, 0);

    const run = P.run;
    const t = P.t, phase = P.phase;
    const cur = run ? P.frameAt(t) : null;
    const prev = run ? (t > 0 ? P.frameAt(t - 1) : P.empty) : null;
    const events = run ? P.eventsAt(t) : [];
    const declared = new Set(run ? run.started.resources.map(r => r.id) : Sc.equipment);

    drawWallClock(t, run ? phase : 0);
    drawKitchen(run, prev, cur, events, declared, t, phase, now);
    drawDining(run, prev, cur, events, t, phase, now);
    drawStaticLabels(run, cur, prev, phase);
    if (run) drawPopups(prev, cur, events, phase);
    if (run && run.deadlock && t >= P.endTime && phase >= 0.6) drawDeadlock(cur, now);

    // blit the world, then the crisp text on top
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#1b1410";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(world, ox, oy, W * scale, H * scale);
    drawLabels();
    drawOverlay(now);
  };

  function drawKitchen(run, prev, cur, events, declared, t, phase, now) {
    // machines on the back counter
    for (const id of Sc.equipment) {
      const x = COL_X[id] + 4;
      const used = declared.has(id);
      let holder = null, on = false;
      if (run && used) {
        const before = prev.resources.find(r => r.id === id);
        const after = cur.resources.find(r => r.id === id);
        const h0 = before ? before.holder : null, h1 = after ? after.holder : null;
        holder = h0 === h1 ? h1 : phase < 0.15 ? h0 : phase < 0.45 ? null : h1;
        const atIt = cur.chefAt.includes(id) && (prev.chefAt.includes(id) ? true : phase >= 0.55);
        on = !!holder && cur.byId[holder] && cur.byId[holder].state === "RUNNING" && atIt;
      }
      wctx.globalAlpha = used ? 1 : 0.35;
      Sp.machine(wctx, id, x, MACHINE_Y, on, now);
      wctx.globalAlpha = 1;
      R(wctx, x + 35, MACHINE_Y - 4, 4, 4, "#212529");
      R(wctx, x + 36, MACHINE_Y - 3, 2, 2, !used ? "#868e96" : holder ? "#fa5252" : "#51cf66");
      label(id.replace("_", " "), x + 20, COUNTER_Y + 6, { size: 3.4, color: used ? "#f8f9fa" : "#adb5bd" });
      if (!used) label("NOT USED", x + 20, MACHINE_Y + 11, { size: 3, color: "#495057" });
      if (holder) {
        const col = Sc.colorOf(holder);
        label(holder, x + 20, MACHINE_Y + 22, { size: 3.6, color: Sp.ink(col), bg: col, pad: 1.2 });
      }
    }
    // stoves (each chef's home station)
    for (let c = 0; c < 2; c++) {
      const cooking = run && cur.chefs[c] && cur.chefAt[c] === "stove" + c &&
                      (prev.chefAt[c] === "stove" + c && prev.chefs[c] === cur.chefs[c] ? true : phase >= 0.55);
      Sp.stove(wctx, STOVE_X[c] + 4, MACHINE_Y + 2, !!cooking, now);
      label(`STOVE ${c}`, STOVE_X[c] + 24, COUNTER_Y + 6, { size: 3.4, color: "#f8f9fa" });
    }

    if (!run) {
      for (let c = 0; c < 2; c++) drawChef(c, stationSpot("stove" + c), "idle", null, 0);
      return;
    }

    // tickets: rail, hooks, flying
    const flyingTo = {};
    for (const id in run.meta) {
      const a = ticketSpot(prev, id), b = ticketSpot(cur, id);
      if (!a && !b) continue;
      if (a && b && a.kind === "chef" && b.kind === "chef" && a.c === b.c) continue;   /* the chef's bubble */
      const same = a && b && a.kind === b.kind && a.x === b.x && a.y === b.y;
      if (same) {
        if (b.kind === "rail" || b.kind === "more") drawRailTicket(b, id, cur, t, phase);
        else if (b.kind === "hook") drawHookTag(b, id, cur);
        continue;
      }
      if (!b) {                                   /* completed: the ticket becomes the dish */
        if (a.kind !== "chef" && phase < 0.05) drawFlyingTicket(a.x + 6, a.y + 8, id);
        continue;
      }
      let from = a;
      let win = [0.15, 0.55];
      if (!a) {                                   /* just admitted: the order leaves the table */
        const seats = slotsOf(cur.pools.SPACE, id);
        const s = seatFeet(seats[0] !== undefined ? seats[0] : 0);
        from = { x: s.x - 8, y: s.y - 20 };
        win = [0.45, 0.85];
      }
      if (phase >= win[1]) {
        if (b.kind === "rail" || b.kind === "more") drawRailTicket(b, id, cur, t, phase);
        else if (b.kind === "hook") drawHookTag(b, id, cur);
        continue;
      }
      if (b.kind === "chef") flyingTo[b.c] = win[1];
      if (phase <= win[0] && a) {
        if (a.kind === "rail" || a.kind === "more") drawRailTicket(a, id, prev, t, 0);
        else if (a.kind === "hook") drawHookTag(a, id, prev);
        continue;
      }
      if (phase <= win[0]) continue;
      const p = along({ pts: [{ x: from.x, y: from.y }, { x: b.x, y: b.y }], win }, phase);
      drawFlyingTicket(p.x, p.y, id);
    }

    // chefs
    for (let c = 0; c < 2; c++) {
      const a = stationSpot(prev.chefAt[c]), b = stationSpot(cur.chefAt[c]);
      const path = { pts: [a, b], win: [0.15, 0.55] };
      const pos = a.x === b.x ? { x: b.x, y: b.y, moving: false } : along(path, phase);
      const order = cur.chefs[c];
      const prevOrder = prev.chefs[c];
      let frame = "idle";
      if (pos.moving) frame = Math.floor(now * 8) % 2 ? "walkA" : "walkB";
      else if (order && !(flyingTo[c] && phase < flyingTo[c])) frame = Math.floor(now * 4) % 2 ? "cookA" : "cookB";
      let bubble = null;
      if (order && !(flyingTo[c] && phase < flyingTo[c])) bubble = order;
      else if (!order && prevOrder && phase < 0.1) bubble = prevOrder;
      else if (order && prevOrder && prevOrder !== order && phase < 0.1) bubble = prevOrder;
      drawChef(c, pos, frame, bubble, bubble ? P.progress(bubble, t, bubble === order ? phase : 0) : 0);
    }
  }

  function drawChef(c, pos, frame, order, done) {
    const sprite = Sp.chef(c, frame);
    wctx.drawImage(sprite, Math.round(pos.x - 5), Math.round(pos.y - 18));
    label(`CHEF ${c}`, pos.x, pos.y + 2, { size: 3, color: "#212529" });
    if (!order) return;
    const m = P.run.meta[order];
    const col = Sc.colorOf(order);
    const bx = Math.round(pos.x - 14), by = Math.round(pos.y - 31);
    R(wctx, bx, by, 28, 11, "#212529");
    R(wctx, bx + 1, by + 1, 26, 9, "#fffdf3");
    R(wctx, bx + 1, by + 1, 3, 9, col);
    R(wctx, bx + 12, by + 11, 4, 2, "#212529");
    label(order, bx + 15, by + 2, { size: 3.4, color: "#212529" });
    R(wctx, bx + 5, by + 7, 21, 2, "#dee2e6");
    R(wctx, bx + 5, by + 7, Math.round((21 * done) / m.service), 2, "#2f9e44");
    label(`${Math.floor(done + 1e-6)}/${m.service}`, bx + 34, by + 3, { size: 3, color: "#212529", align: "left" });
  }

  function drawDining(run, prev, cur, events, t, phase, now) {
    const space = run ? shownPool(prev.pools.SPACE, cur.pools.SPACE, phase) : new Array(Sc.pools.SPACE).fill(null);
    const table = run ? shownPool(prev.pools.TABLE, cur.pools.TABLE, phase) : new Array(Sc.pools.TABLE).fill(null);

    // owner highlight under the chairs (contiguous run = one order)
    space.forEach((o, i) => {
      if (!o) return;
      const col = Sc.colorOf(o);
      R(wctx, chairX(i) - 4, CHAIR_Y - 3, seatDX, 32, Sp.shade(col, -0.15));
      R(wctx, chairX(i) - 3, CHAIR_Y - 2, seatDX - 2, 30, col);
    });
    for (let i = 0; i < space.length; i++) Sp.chair(wctx, chairX(i), CHAIR_Y);
    for (let j = 0; j < table.length; j++) Sp.table(wctx, tableX(j), TABLE_Y, tableW, table[j] ? Sc.colorOf(table[j]) : null);

    // allocation hint: free holes and the one the allocator picked
    if (run) drawAllocation(prev, cur, events, phase);

    if (!run) return;

    // customers (sorted by y so nearer ones are drawn on top)
    const people = [];
    for (const id in run.meta) {
      const m = run.meta[id];
      const col = Sc.colorOf(id);
      for (let j = 0; j < m.space_req; j++) {
        const a = memberSpot(prev, id, j), b = memberSpot(cur, id, j);
        if (!a && !b) continue;
        let pos, path = null;
        if (a && b && a.x === b.x && a.y === b.y) pos = { x: b.x, y: b.y, moving: false, done: true };
        else {
          path = memberPath(a, b, j);
          pos = along(path, phase);
        }
        if (!b && pos.done) continue;                          /* left the screen */
        let alpha = 1;
        if (path && path.fadeIn) alpha = clamp01((phase - path.win[0]) / 0.06);
        if (alpha <= 0) continue;
        const walking = pos.moving ? (Math.floor(now * 8 + j) % 2 ? "walkA" : "walkB") : "idle";
        people.push({ id, j, x: pos.x, y: pos.y, color: col, hair: m.index * 3 + j, frame: seatedFrame(a, b, pos, walking),
                      alpha, leader: j === 0, moving: pos.moving, carryBag: !b && !m.table_req && pos.u > 0 });
      }
    }
    people.sort((p, q) => p.y - q.y);
    for (const d of people) {
      drawPerson(d);
      if (d.carryBag) Sp.bag(wctx, d.x + 3, d.y - 8);
    }
    // ID signs over walking or waiting parties
    for (const d of people) {
      if (!d.leader || d.frame === "sit") continue;
      const m = run.meta[d.id];
      const col = Sc.colorOf(d.id);
      const L = cur.byId[d.id].state === "BLOCKED_MEMORY" ? queueLayout(cur)[d.id] : null;
      const sx = L && !d.moving ? L.center : d.x + ((m.space_req - 1) * 9) / 2;
      const lift = L && L.pos % 2 ? 11 : 0;                 /* alternate heights in a long line */
      label(d.id, sx, d.y - 25 - lift, { size: 3.6, color: Sp.ink(col), bg: col, pad: 1.2, alpha: d.alpha });
      label(`${m.space_req}S ${m.table_req}T`, sx, d.y - 19 - lift, { size: 2.8, color: "#fff", bg: "rgba(0,0,0,0.55)", pad: 0.8, alpha: d.alpha });
    }

    // seated order IDs on the rug, under each run of seats
    const runs = {};
    space.forEach((o, i) => o && (runs[o] = runs[o] || []).push(i));
    for (const o in runs) {
      const s = runs[o];
      const x = (chairX(s[0]) + chairX(s[s.length - 1]) + 20) / 2;
      const col = Sc.colorOf(o);
      const st = cur.byId[o].state;
      const tag = st === "RUNNING" ? "COOKING" : st === "BLOCKED_RESOURCE" ? "BLOCKED" : st === "READY" ? "READY" : "";
      label(o, x, CHAIR_Y + 21, { size: 3.2, color: Sp.ink(col), bg: col, pad: 0.8 });
      if (tag) label(tag, x, CHAIR_Y + 26, { size: 2.4, color: "#fff", bg: "rgba(0,0,0,0.6)", pad: 0.6 });
    }
    table.forEach((o, j) => o && label(o, tableX(j) + tableW / 2, TABLE_Y + 4, { size: 3.6, color: Sp.ink(Sc.colorOf(o)) }));

    // dishes for orders served now
    for (const ev of events) {
      if (ev.type !== "COMPLETE") continue;
      const id = ev.process_id;
      const c = prev.chefs.indexOf(id);
      const start = c >= 0 ? stationSpot(prev.chefAt[c]) : { x: RAIL.x + 20, y: RAIL.y + 40 };
      const tables = slotsOf(prev.pools.TABLE, id);
      const seats = slotsOf(prev.pools.SPACE, id);
      let target;
      if (tables.length) target = { x: (tableX(tables[0]) + tableX(tables[tables.length - 1]) + tableW) / 2 - 6, y: TABLE_Y + 5 };
      else target = { x: seatFeet(seats[0] || 0).x - 2, y: CHAIR_Y - 6 };
      if (phase > 0.4) continue;                 /* gone before the next owner sits down */
      const p = along({ pts: [{ x: start.x - 6, y: start.y - 26 }, target], win: [0, 0.15] }, phase);
      wctx.globalAlpha = phase > 0.32 ? clamp01((0.4 - phase) / 0.08) : 1;
      if (tables.length) Sp.dish(wctx, Math.round(p.x), Math.round(p.y));
      else if (!p.done) Sp.bag(wctx, Math.round(p.x), Math.round(p.y));
      wctx.globalAlpha = 1;
    }
  }

  function seatedFrame(a, b, pos, frame) {
    if (b && b.zone === "seat" && pos.done) return "sit";
    if (a && a.zone === "seat" && !b && phase0(pos)) return "sit";
    return frame;
  }
  const phase0 = pos => !pos.moving && !pos.done && pos.u === 0;

  function drawAllocation(prev, cur, events, phase) {
    const admits = events.filter(e => e.type === "MEMORY_ADMIT");
    if (!admits.length) return;
    const span = 0.55 / admits.length;
    admits.forEach((ev, k) => {
      const w0 = 0.3 + k * span, w1 = w0 + span;
      if (phase < w0 || phase >= w1) return;
      const later = new Set(admits.slice(k).map(e => e.process_id));
      for (const [name, x0, dx, w, y, h] of [["SPACE", chairX(0) - 3, seatDX, seatDX - 2, CHAIR_Y - 4, 33],
                                             ["TABLE", tableX(0) - 3, tableDX, tableW + 6, TABLE_Y - 4, 33]]) {
        const before = cur.pools[name].map(o => (later.has(o) ? null : o));
        const mine = slotsOf(cur.pools[name], ev.process_id);
        if (!mine.length) continue;
        for (const hole of holes(before)) {
          const hx = x0 + hole.start * dx, hw = (hole.size - 1) * dx + w;
          overlay.push({ type: "box", x: hx, y, w: hw, h, color: "#ffe066", dash: true });
          overlay.push({ type: "text", text: `GAP ${hole.size}`, x: hx + hw / 2, y: y + 1, color: "#ffe066", size: 3, bg: "rgba(0,0,0,0.6)" });
        }
        const cx = x0 + mine[0] * dx, cw = (mine.length - 1) * dx + w;
        overlay.push({ type: "box", x: cx - 1, y: y - 1, w: cw + 2, h: h + 2, color: "#69db7c", dash: false });
        overlay.push({ type: "text", text: `${P.run.started.allocator.replace("_", " ")} → ${ev.process_id}`, x: cx + cw / 2, y: y + h + 2, color: "#69db7c", size: 3.2 });
      }
    });
  }

  function drawStaticLabels(run, cur, prev, phase) {
    const sched = run ? run.started.scheduler : "SCHEDULER";
    label("READY QUEUE", RAIL.x + RAIL.w / 2, RAIL.y + 3, { size: 4.2, color: "#fff8e1", bg: "#6b4a2f", pad: 1 });
    label(run ? `${sched}: ${RV.Narrate.schedulerRule[sched].split(" (")[0].toUpperCase()}` : "ORDERS WAIT HERE FOR A CHEF",
          RAIL.x + RAIL.w / 2, RAIL.y + 10, { size: 2.8, color: "#3b2414" });
    if (run && cur.queues.ready.length) label("▲ NEXT", RAIL.x + 21, RAIL.y + 55, { size: 2.8, color: "#c92a2a" });
    if (run && !cur.queues.ready.length) label("EMPTY", RAIL.x + RAIL.w / 2, RAIL.y + 34, { size: 3.4, color: "#8a6440" });

    label("KITCHEN: 2 CHEFS = 2 CPUS  ·  MACHINES = SHARED RESOURCES (ONE USER AT A TIME)", 8, DIVIDER_Y + 4, { size: 3, color: "#fff3d6", align: "left" });
    label(`SEATS = SPACE POOL (${Sc.pools.SPACE} SLOTS)`, chairX(0) + (seatDX * Sc.pools.SPACE) / 2 - 4, 121, { size: 3.2, color: "#fff", bg: "rgba(0,0,0,0.45)", pad: 1 });
    label(`TABLES = TABLE POOL (${Sc.pools.TABLE} SLOTS)`, tableX(0) + (tableDX * Sc.pools.TABLE) / 2 - 8, 121, { size: 3.2, color: "#fff", bg: "rgba(0,0,0,0.45)", pad: 1 });
    for (let i = 0; i < Sc.pools.SPACE; i++) label(String(i), chairX(i) + 10, CHAIR_Y + 32, { size: 3, color: "#ffe8cc" });
    for (let j = 0; j < Sc.pools.TABLE; j++) label(`T${j}`, tableX(j) + tableW / 2, TABLE_Y + 30, { size: 3, color: "#d0ebff" });
    const sp = run ? cur.pools.SPACE : new Array(Sc.pools.SPACE).fill(null);
    const tb = run ? cur.pools.TABLE : new Array(Sc.pools.TABLE).fill(null);
    const info = pool => {
      const free = pool.filter(o => o === null).length;
      const big = holes(pool).reduce((a, h) => Math.max(a, h.size), 0);
      return `${free} FREE · BIGGEST GAP ${big}`;
    };
    if (!run || phase >= 0.4) {
      label(info(sp), chairX(0) + (seatDX * Sc.pools.SPACE) / 2 - 4, 184, { size: 3, color: "#fff3d6" });
      label(info(tb), tableX(0) + (tableDX * Sc.pools.TABLE) / 2 - 8, 184, { size: 3, color: "#fff3d6" });
    }
    label("STREET = MEMORY QUEUE (FIFO): WAITING FOR ADJACENT SEATS + TABLES", 8, ROAD_Y + 6, { size: 3, color: "#e9ecef", align: "left" });
    label("ENTRANCE", DOOR.x + DOOR.w / 2, WALL_Y - 5, { size: 2.6, color: "#fff3d6", bg: "rgba(0,0,0,0.5)", pad: 0.8 });
    if (run && cur.queues.memory.length) label("◀ HEAD", QUEUE_RIGHT - 2, QUEUE_Y + 4, { size: 2.6, color: "#fff", align: "left" });
  }

  const POPUP = {
    MEMORY_BLOCK: ["NO ROOM", "#ff6b6b", 0.3], MEMORY_ADMIT: ["SEATED", "#69db7c", 0.4],
    DISPATCH: ["START", "#69db7c", 0.5], RESOURCE_ACQUIRE: ["TAKES", "#69db7c", 0.45],
    RESOURCE_WAIT: ["WAIT", "#ffa94d", 0.3], RESOURCE_BLOCK: ["BLOCKED", "#ff6b6b", 0.35],
    RESOURCE_RELEASE: ["FREE", "#74c0fc", 0.15], RESOURCE_ROLLBACK: ["ROLLBACK", "#da77f2", 0.15],
    RESOURCE_UNBLOCK: ["READY", "#69db7c", 0.5], COMPLETE: ["SERVED!", "#ffd43b", 0.1],
  };

  function drawPopups(prev, cur, events, phase) {
    const stack = {};
    events.forEach(ev => {
      const def = POPUP[ev.type];
      if (!def) return;
      let [text, color, start] = def;
      let x, y;
      const id = ev.process_id;
      if (ev.type === "MEMORY_BLOCK") { x = DOOR.x + DOOR.w + 44; y = WALL_Y + 5; text = `${id} NO ROOM`; }
      else if (ev.type === "MEMORY_ADMIT" || ev.type === "COMPLETE") {
        const pool = ev.type === "COMPLETE" ? prev.pools.SPACE : cur.pools.SPACE;
        const s = slotsOf(pool, id);
        x = s.length ? (chairX(s[0]) + chairX(s[s.length - 1]) + 20) / 2 : 120;
        y = CHAIR_Y + 4;
        text = `${id} ${text}`;
      } else if (ev.type === "DISPATCH" || ev.type === "RESOURCE_BLOCK") {
        const F = ev.type === "DISPATCH" ? cur : prev;
        const spot = stationSpot(F.chefAt[ev.chef_id] || "stove" + ev.chef_id);
        x = spot.x; y = CHEF_Y + 7;
        text = ev.type === "DISPATCH" ? `START ${id}` : `${id} BLOCKED`;
      } else if (ev.resource && ev.resource in COL_X) {
        x = COL_X[ev.resource] + 24; y = MACHINE_Y + 2;
        text = ev.type === "RESOURCE_ACQUIRE" ? `+${id}` : ev.type === "RESOURCE_RELEASE" ? `-${id} FREE` : `${id} ${text}`;
      } else return;
      const u = (phase - start) / 0.45;
      if (u < 0 || u > 1) return;
      const key = `${Math.round(x)},${Math.round(y)}`;           /* visible popups at one spot stack up */
      const n = (stack[key] = (stack[key] || 0) + 1) - 1;
      overlay.push({ type: "text", text, x, y: y - n * 7 - u * 3, color, size: 3.4, alpha: u > 0.7 ? (1 - u) / 0.3 : 1, bg: "rgba(0,0,0,0.75)" });
    });
  }

  /* Red arrows for the wait-for cycle: waiter tag → holder badge, and the
   * holder's own waiting tag. */
  function drawDeadlock(F, now) {
    const pulse = 0.55 + 0.45 * Math.sin(now * 6);
    const holderAt = {}, waitAt = {};
    for (const r of F.resources) {
      if (!(r.id in COL_X)) continue;
      if (r.holder) holderAt[r.holder] = (holderAt[r.holder] || []).concat(r.id);
      r.waiting.forEach((o, k) => (waitAt[o] = { r: r.id, k }));
      if (r.holder && r.waiting.length) overlay.push({ type: "box", x: COL_X[r.id] + 2, y: MACHINE_Y - 2, w: 44, h: 32, color: "#ff2b2b", alpha: pulse, width: 2 });
    }
    for (const o in waitAt) {
      const w = waitAt[o];
      const res = F.resources.find(r => r.id === w.r);
      const tagX = COL_X[w.r] + 2 + (w.k % 2) * 23 + 11, tagY = 9;
      const h = res.holder;
      if (h) overlay.push({ type: "arrow", x1: tagX, y1: tagY, x2: COL_X[w.r] + 24, y2: MACHINE_Y + 20, color: "#ff2b2b", alpha: pulse });
      for (const held of holderAt[o] || [])
        overlay.push({ type: "arrow", x1: COL_X[held] + 24, y1: MACHINE_Y + 26, x2: tagX, y2: tagY + 8, color: "#ff8787", alpha: pulse, dash: true, curve: true });
    }
    overlay.push({ type: "text", text: "DEADLOCK: CIRCULAR WAIT", x: 108, y: FLOOR_Y + 4, color: "#fff", bg: "#c92a2a", size: 4.4, alpha: 1 });
  }

  /* ---------- screen-space text and overlay ---------- */

  function drawLabels() {
    ctx.textBaseline = "top";
    for (const l of labels) drawText(l);
  }

  function drawText(l) {
    const px = Math.max(7, Math.round(l.size * scale));
    ctx.font = `${px}px ${FONT}`;
    const x = ox + l.x * scale, y = oy + l.y * scale;
    const w = ctx.measureText(l.text).width;
    const left = l.align === "left" ? x : l.align === "right" ? x - w : x - w / 2;
    ctx.globalAlpha = l.alpha === undefined ? 1 : l.alpha;
    if (l.bg) {
      const pad = (l.pad || 1) * scale;
      ctx.fillStyle = l.bg;
      ctx.fillRect(Math.round(left - pad), Math.round(y - pad), Math.round(w + pad * 2), Math.round(px + pad * 2));
    }
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, Math.round(left), Math.round(y));
    ctx.globalAlpha = 1;
  }

  function drawOverlay() {
    for (const o of overlay) {
      if (o.type === "text") { drawText(Object.assign({ align: "center" }, o)); continue; }
      ctx.save();
      ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = Math.max(2, (o.width || 1.6) * scale * 0.7);
      ctx.setLineDash(o.dash ? [4 * scale * 0.5, 3 * scale * 0.5] : []);
      if (o.type === "box") {
        ctx.strokeRect(ox + o.x * scale, oy + o.y * scale, o.w * scale, o.h * scale);
      } else if (o.type === "arrow") {
        const x1 = ox + o.x1 * scale, y1 = oy + o.y1 * scale, x2 = ox + o.x2 * scale, y2 = oy + o.y2 * scale;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        let ax = x1, ay = y1;
        if (o.curve) {
          const mx = (x1 + x2) / 2, my = Math.max(y1, y2) + 18 * scale;
          ctx.quadraticCurveTo(mx, my, x2, y2);
          ax = mx; ay = my;
        } else ctx.lineTo(x2, y2);
        ctx.stroke();
        const ang = Math.atan2(y2 - ay, x2 - ax), s = 3 * scale;
        ctx.setLineDash([]);
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - s * Math.cos(ang - 0.5), y2 - s * Math.sin(ang - 0.5));
        ctx.lineTo(x2 - s * Math.cos(ang + 0.5), y2 - s * Math.sin(ang + 0.5));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  Sc.load = function (run) {
    prepareChefSpots(run);
  };
})();
