/*
 * The restaurant, as one room seen from above in the style of a handheld
 * RPG interior: the kitchen in the top-left corner, the order board on the
 * back wall, 6 waiting chairs in the bottom-left corner, 3 tables in the
 * middle, and the door out to the street where the line forms.
 *
 * Rendering is a pure function of (cycle t, phase): every person, chef and
 * ticket has a spot in the frame before t and in the frame at t, and walks
 * between them (along grid lines, facing the way it walks) during a window
 * of the cycle. So play, pause, step back and seek all draw correctly.
 *
 * The picture is drawn at 512 x 288 world pixels and scaled up without
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
  const MACH_X = { COFFEE_MACHINE: 8, MICROWAVE: 42, OVEN_1: 76, OVEN_2: 110, stove0: 144, stove1: 178 };
  const MACH_Y = 24, WALL_H = 56, CHEF_Y = 100;
  const COUNTER_Y = 112, COUNTER_X = 216;                /* L-shaped counter closing the kitchen */
  const BOARD = { x: 252, y: 4, w: 204, h: 50 }, SLOT_W = 28, SLOTS = 7;
  const TABLE_W = 48;
  const CHAIR_Y = 168;
  const WALL_Y = 208, OUT_Y = 222, PATH_Y = 252;
  const DOOR = { x: 248, w: 32 };
  const DOOR_OUT = { x: 264, y: PATH_Y }, DOOR_IN = { x: 264, y: 200 }, AISLE_Y = 200;
  const SPAWN = { x: 540, y: PATH_Y }, EXIT = { x: 548, y: PATH_Y + 3 };
  const PICKUP = { x: 240, y: 100 };                     /* takeaway bags at the counter end */
  const QUEUE_RIGHT = 238, QUEUE_LEFT = 8;

  /* Tables stand in a triangle in the middle of the hall: T1 bottom-left, T2 at
   * the top, T3 bottom-right. Left to right is still pool order, so the
   * adjacent pairs are T1-T2 and T2-T3 (a dotted runner links them). */
  const TRIANGLE = [{ x: 254, y: 138 }, { x: 326, y: 76 }, { x: 398, y: 138 }];
  let tableSpots = TRIANGLE;

  let chairDX = 20;
  const chairX = i => 16 + i * chairDX;
  const tablePos = j => tableSpots[j];
  const seatSpot = i => ({ x: chairX(i) + 8, y: CHAIR_Y + 12, zone: "seat" });
  const tableFront = j => ({ x: tablePos(j).x + TABLE_W / 2, y: tablePos(j).y + 50 });
  const stationSpot = key => ({ x: MACH_X[key] + 16, y: CHEF_Y });
  const tableName = j => `T${j + 1}`;

  /* ---------- canvases ---------- */
  let canvas, ctx, world, wctx, bg;
  let scale = 1, ox = 0, oy = 0, labels = [], overlay = [];
  const FONT = '"Jersey 10", ui-monospace, monospace';

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
    Sc.render(performance.now() / 1000);          /* resizing cleared the canvas: redraw now */
  };

  /* Pool sizes come from the server's hello. */
  Sc.setPools = function (pools) {
    Sc.pools = pools;
    chairDX = Math.min(20, Math.floor(130 / pools.SPACE));
    const n = pools.TABLE, dx = Math.min(70, Math.floor(220 / n));
    tableSpots = n === 3 ? TRIANGLE : Array.from({ length: n }, (_, j) => ({ x: 240 + j * dx, y: 138 }));
    bg = null;
  };

  /* ---------- helpers ---------- */
  const clamp01 = u => (u < 0 ? 0 : u > 1 ? 1 : u);
  const ease = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const R = Sp.rect, BOX = Sp.box;

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

  const dirOf = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down");

  /* Position along one stage {pts, win} at this phase. */
  function along(path, phase) {
    const pts = path.pts;
    const u = ease(clamp01((phase - path.win[0]) / (path.win[1] - path.win[0])));
    if (path.len === undefined) {
      path.seg = [];
      path.len = 0;
      for (let k = 1; k < pts.length; k++) {
        const d = Math.abs(pts[k].x - pts[k - 1].x) + Math.abs(pts[k].y - pts[k - 1].y);
        path.seg.push(d);
        path.len += d;
      }
    }
    let dist = u * path.len;
    for (let k = 0; k < path.seg.length; k++) {
      if (dist <= path.seg[k] || k === path.seg.length - 1) {
        const f = path.seg[k] ? Math.min(1, dist / path.seg[k]) : 1;
        const a = pts[k], b = pts[k + 1];
        return {
          x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f,
          moving: phase > path.win[0] && phase < path.win[1] && path.len > 0,
          done: phase >= path.win[1], started: phase > path.win[0],
          dir: dirOf(b.x - a.x, b.y - a.y), u,
        };
      }
      dist -= path.seg[k];
    }
    return { x: pts[0].x, y: pts[0].y, moving: false, done: true, started: true, dir: "down", u };
  }

  /* Position along a path that may have stages with pauses between them. */
  function follow(path, phase) {
    const stages = path.stages || [path];
    for (let s = 0; s < stages.length; s++) {
      const st = stages[s];
      if (phase < st.win[0]) {
        if (s === 0) return Object.assign(along(st, st.win[0]), { moving: false, done: false, started: false, u: 0, pause: -1 });
        return Object.assign(along(stages[s - 1], 1), { moving: false, done: false, started: true, pause: s - 1 });
      }
      if (phase < st.win[1]) return Object.assign(along(st, phase), { pause: null });
    }
    return Object.assign(along(stages[stages.length - 1], 1), { done: true, pause: null });
  }

  /* An axis-aligned route: horizontal first, then vertical, through each point. */
  function grid(points) {
    const out = [points[0]];
    for (let k = 1; k < points.length; k++) {
      const a = out[out.length - 1], b = points[k];
      if (a.x !== b.x && a.y !== b.y) out.push({ x: b.x, y: a.y });
      out.push(b);
    }
    return out;
  }

  /* ---------- per-frame derived state ---------- */

  /* Where each waiting party stands on the path, head of the line at the door. */
  function queueLayout(F) {
    if (F._q) return F._q;
    const q = F.queues.memory, meta = P.run.meta;
    const sizes = q.map(id => meta[id].space_req);
    const total = sizes.reduce((a, n) => a + n * 13 + 8, 0);
    const k = Math.min(1, (QUEUE_RIGHT - QUEUE_LEFT) / Math.max(1, total));
    const out = {};
    let right = QUEUE_RIGHT;
    q.forEach((id, idx) => {
      const n = sizes[idx], sp = 13 * k;
      const members = [];
      for (let j = 0; j < n; j++) members.push({ x: right - (n - 1 - j) * sp - 7, y: PATH_Y, zone: "queue" });
      out[id] = { members, center: right - ((n - 1) * sp) / 2 - 7, pos: idx };
      right -= n * sp + 8 * k;
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
    return seatSpot(seats[Math.min(j, seats.length - 1)]);
  }

  /* Route for member j from spot a (previous frame) to b (this frame). */
  function memberPath(a, b, j, id, prev) {
    const lag = j * 0.025;                         /* party members follow in a line */
    const w = (s, e) => [Math.min(0.95, s + lag), Math.min(0.99, e + lag)];
    const spawn = { x: SPAWN.x + j * 14, y: PATH_Y };
    if (!a && b && b.zone === "queue") return { pts: [spawn, b], win: w(0.22, 0.72), fadeIn: true };
    if (!a && b) return { pts: grid([spawn, DOOR_OUT, DOOR_IN, { x: b.x, y: AISLE_Y }, b]), win: w(0.25, 0.93), fadeIn: true };
    if (a && b && a.zone === "queue" && b.zone === "queue") return { pts: [a, b], win: w(0.3, 0.72) };
    if (a && b && a.zone === "queue") return { pts: grid([a, DOOR_OUT, DOOR_IN, { x: b.x, y: AISLE_Y }, b]), win: w(0.3, 0.93) };
    if (a && !b) {
      /* served: go to the order's table (or the counter for takeaway), then out */
      const tables = slotsOf(prev.pools.TABLE, id);
      const stop = tables.length ? tableFront(tables[Math.min(j, tables.length - 1)]) : PICKUP;
      const spot = { x: stop.x + (j % 3) * 8 - 8, y: stop.y + Math.floor(j / 3) * 6 };
      return {
        stages: [
          { pts: grid([a, { x: a.x, y: AISLE_Y }, { x: spot.x, y: AISLE_Y }, spot]), win: w(0.06, 0.3) },
          { pts: grid([spot, { x: spot.x, y: AISLE_Y }, DOOR_IN, DOOR_OUT, { x: EXIT.x + j * 14, y: PATH_Y }]), win: w(0.4, 0.86) },
        ],
        facePause: tables.length ? "up" : "left",
      };
    }
    return { pts: grid([a, b]), win: w(0.3, 0.8) };
  }

  /* Which spot each chef stands at in each frame: their stove, or the machine
   * their order acquired most recently and still holds. */
  function prepareChefSpots(run) {
    const last = {};
    for (const F of run.frames) {
      for (const ev of F.events) if (ev.type === "RESOURCE_ACQUIRE") last[ev.process_id] = ev.resource;
      F.chefAt = F.chefs.map((o, c) => {
        if (!o) return "stove" + c;
        const holds = F.byId[o].holds.filter(r => r in MACH_X);
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
      if (many && k >= SLOTS - 1) return { kind: "more", x: BOARD.x + 8 + (SLOTS - 1) * SLOT_W, y: BOARD.y + 15 };
      return { kind: "rail", k, x: BOARD.x + 8 + k * SLOT_W, y: BOARD.y + 15 };
    }
    if (p.state === "BLOCKED_RESOURCE" && p.waits_for in MACH_X) {
      const res = F.resources.find(r => r.id === p.waits_for);
      const k = Math.max(0, res ? res.waiting.indexOf(id) : 0);
      return { kind: "hook", k, x: MACH_X[p.waits_for] + 1, y: 2 + Math.min(k, 1) * 10 };
    }
    if (p.state === "RUNNING") {
      const spot = stationSpot(F.chefAt[p.chef_id]);
      return { kind: "chef", c: p.chef_id, x: spot.x - 14, y: CHEF_Y - 37 };
    }
    return null;
  }

  /* Pool contents as shown at this phase: releases fade out, then new owners appear. */
  function shownPool(prev, cur, phase, release, take) {
    return cur.map((o, i) => (prev[i] === o ? o : phase < release ? prev[i] : phase < take ? null : o));
  }

  /* ---------- background (static) ---------- */
  function drawBackground() {
    bg = document.createElement("canvas");
    bg.width = W;
    bg.height = H;
    const g = bg.getContext("2d");
    // dining floor: big polished tiles
    for (let y = WALL_H; y < WALL_Y; y += 16)
      for (let x = 0; x < W; x += 16) {
        R(g, x, y, 16, 16, ((x + y) / 16) % 2 ? "#f4ecd8" : "#ece2c8");
        R(g, x, y, 16, 1, "#e0d2b2");
        R(g, x, y, 1, 16, "#e0d2b2");
      }
    // back wall of the dining room
    R(g, COUNTER_X, 0, W - COUNTER_X, WALL_H, "#f4dcb0");
    R(g, COUNTER_X, 0, W - COUNTER_X, 4, "#c89060");
    for (let x = COUNTER_X; x < W; x += 8) R(g, x, 36, 4, 16, "#e8c898");
    R(g, COUNTER_X, 34, W - COUNTER_X, 2, "#c89060");
    R(g, COUNTER_X, WALL_H - 4, W - COUNTER_X, 4, "#a86c40");
    R(g, COUNTER_X, WALL_H - 1, W - COUNTER_X, 1, "#283040");
    // kitchen: white tiled wall and checker floor
    R(g, 0, 0, COUNTER_X, WALL_H, "#f8f8ff");
    for (let y = 0; y < WALL_H; y += 8) {
      R(g, 0, y + 7, COUNTER_X, 1, "#d8dce8");
      for (let x = (y / 8) % 2 ? 0 : 8; x < COUNTER_X; x += 16) R(g, x, y, 1, 7, "#d8dce8");
    }
    R(g, 0, WALL_H - 1, COUNTER_X, 1, "#283040");
    for (let y = WALL_H; y < COUNTER_Y; y += 8)
      for (let x = 0; x < COUNTER_X; x += 8) R(g, x, y, 8, 8, ((x + y) / 8) % 2 ? "#dfe3ee" : "#c3c9d8");
    // L-shaped counter (front face facing the room)
    BOX(g, COUNTER_X, 40, 16, COUNTER_Y - 40 + 2, "#f0d8a8");
    R(g, COUNTER_X + 1, 41, 14, 2, "#fff0d0");
    BOX(g, 0, COUNTER_Y, COUNTER_X + 16, 8, "#f0d8a8");
    R(g, 1, COUNTER_Y + 1, COUNTER_X + 14, 2, "#fff0d0");
    BOX(g, 0, COUNTER_Y + 7, COUNTER_X + 16, 10, "#c89858");
    for (let x = 6; x < COUNTER_X + 10; x += 24) R(g, x, COUNTER_Y + 10, 14, 4, "#b08040");
    // order board on the back wall
    BOX(g, BOARD.x - 3, BOARD.y - 2, BOARD.w + 6, BOARD.h + 4, "#8a5428");
    R(g, BOARD.x, BOARD.y + 1, BOARD.w, BOARD.h - 2, "#d8a868");
    for (let k = 0; k < 70; k++) R(g, BOARD.x + ((k * 37) % BOARD.w), BOARD.y + 3 + ((k * 23) % (BOARD.h - 6)), 1, 1, "#c09050");
    // furniture along the walls
    Sp.bookshelf(g, 470, 22);
    Sp.plant(g, 492, 182);
    Sp.plant(g, 440, 182);
    // rugs: waiting corner and dining area
    BOX(g, 6, 158, 144, 40, "#e8c860");
    R(g, 9, 161, 138, 34, "#d05050");
    for (let x = 12; x < 146; x += 8) R(g, x, 163, 4, 2, "#f0a0a0"), R(g, x, 191, 4, 2, "#f0a0a0");
    BOX(g, 242, 64, 216, 118, "#e8c860");
    R(g, 245, 67, 210, 112, "#5878c8");
    for (let x = 248; x < 452; x += 8) R(g, x, 69, 4, 2, "#a8c0f0"), R(g, x, 175, 4, 2, "#a8c0f0");
    // dotted runner between neighbouring tables (the pool's adjacency)
    for (let j = 0; j + 1 < tableSpots.length; j++) {
      const a = tableSpots[j], b = tableSpots[j + 1];
      const ax = a.x + TABLE_W / 2, ay = a.y + 10, bx = b.x + TABLE_W / 2, by = b.y + 10;
      const steps = Math.floor(Math.hypot(bx - ax, by - ay) / 7);
      for (let k = 1; k < steps; k++)
        R(g, Math.round(ax + ((bx - ax) * k) / steps) - 1, Math.round(ay + ((by - ay) * k) / steps) - 1, 3, 3, "#f8e088");
    }
    Sp.plant(g, 0, 182);
    // bottom wall with the door
    R(g, 0, WALL_Y, W, OUT_Y - WALL_Y, "#c89060");
    R(g, 0, WALL_Y, W, 3, "#e8b880");
    R(g, 0, OUT_Y - 1, W, 1, "#283040");
    R(g, 0, WALL_Y - 1, W, 1, "#283040");
    BOX(g, DOOR.x - 2, WALL_Y - 1, DOOR.w + 4, OUT_Y - WALL_Y + 2, "#6a4020");
    R(g, DOOR.x, WALL_Y, DOOR.w, OUT_Y - WALL_Y, "#f4ecd8");
    R(g, DOOR.x + 2, WALL_Y + 6, DOOR.w - 4, 7, "#d04848");
    R(g, DOOR.x + 2, WALL_Y + 6, DOOR.w - 4, 1, "#f08080");
    // outside: grass, path, flowers, fence, tree
    R(g, 0, OUT_Y, W, H - OUT_Y, "#88d070");
    for (let k = 0; k < 90; k++) {
      const x = (k * 53) % W, y = OUT_Y + 4 + ((k * 29) % (H - OUT_Y - 6));
      R(g, x, y, 1, 2, "#68b050");
      R(g, x + 2, y + 1, 1, 1, "#68b050");
    }
    R(g, 0, PATH_Y - 13, W, 24, "#c8b080");
    R(g, 0, PATH_Y - 12, W, 22, "#e8d8a8");
    R(g, DOOR.x - 2, OUT_Y, DOOR.w + 4, PATH_Y - 12 - OUT_Y, "#c8b080");
    R(g, DOOR.x, OUT_Y, DOOR.w, PATH_Y - 12 - OUT_Y, "#e8d8a8");
    for (let k = 0; k < 40; k++) R(g, (k * 41) % W, PATH_Y - 9 + ((k * 7) % 18), 2, 1, "#d0bc88");
    for (const [x, y] of [[20, 230], [60, 274], [140, 228], [200, 276], [310, 274], [380, 228], [430, 276], [500, 230]]) {
      R(g, x, y, 2, 2, "#f05050"); R(g, x + 3, y + 1, 2, 2, "#f8e040"); R(g, x + 1, y + 3, 2, 2, "#f05050");
    }
    for (let x = 0; x < 230; x += 8) { BOX(g, x, 270, 4, 12, "#fbfbff"); }
    R(g, 0, 274, 230, 2, "#283040");
    Sp.sign(g, 290, 224, 50);
    Sp.tree(g, 470, 262);
  }

  /* ---------- drawing pieces ---------- */

  function drawPerson(d) {
    const sprite = Sp.person(d.color, d.hair, d.dir, d.frame);
    wctx.globalAlpha = d.alpha;
    wctx.drawImage(sprite, Math.round(d.x - 7), Math.round(d.y - (d.frame === "sit" ? 18 : 20)));
    wctx.globalAlpha = 1;
  }

  function drawWallClock(t, phase) {
    const cx = 236, cy = 18;
    R(wctx, cx - 8, cy - 8, 17, 17, "#283040");
    R(wctx, cx - 7, cy - 7, 15, 15, "#fbfbff");
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      R(wctx, cx + Math.round(Math.sin(a) * 6), cy - Math.round(Math.cos(a) * 6), 1, 1, "#8890a0");
    }
    const a = phase * Math.PI * 2;
    for (let r = 0; r < 6; r++) R(wctx, cx + Math.round(Math.sin(a) * r), cy - Math.round(Math.cos(a) * r), 1, 1, "#e03838");
    label(`T=${t}`, cx, cy + 10, { size: 3.4, color: "#283040" });
  }

  function drawFlyingTicket(x, y, id) {
    Sp.ticket(wctx, x, y, Sc.colorOf(id), 16, 11);
    label(id, x + 8, y + 5, { size: 3.2, color: "#283040" });
  }

  function drawBoardTicket(spot, id, F, t, phase) {
    const m = P.run.meta[id];
    if (spot.kind === "more") {
      Sp.ticket(wctx, spot.x, spot.y, "#8890a0");
      label(`+${F.queues.ready.length - (SLOTS - 1)}`, spot.x + 13, spot.y + 10, { size: 5, color: "#283040" });
      label("MORE", spot.x + 13, spot.y + 19, { size: 3, color: "#585f70" });
      return;
    }
    Sp.ticket(wctx, spot.x, spot.y, Sc.colorOf(id));
    label(id, spot.x + 13, spot.y + 7, { size: 4.4, color: "#283040" });
    const sched = P.run.started.scheduler;
    [["ARR", m.arrival, sched === "FCFS"], ["PRI", m.priority, sched === "PRIORITY"], ["JOB", m.service, sched === "SJF"]]
      .forEach(([k, v, key], n) => {
        if (key) R(wctx, spot.x + 1, spot.y + 12 + n * 5, 24, 5, "#fff0a0");
        label(`${k} ${v}`, spot.x + 13, spot.y + 12.5 + n * 5, { size: 3, color: key ? "#c02828" : "#585f70" });
      });
    const done = P.progress(id, t, phase);
    if (done > 0) {
      R(wctx, spot.x + 2, spot.y + 27, 22, 2, "#d8dce8");
      R(wctx, spot.x + 2, spot.y + 27, Math.round((22 * done) / m.service), 2, "#38a048");
    }
  }

  /* A blocked order's tag on the wall above the machine it waits for. */
  function drawHookTag(spot, id, F) {
    if (spot.k > 1) {                             /* third in line or later: one "+N" note */
      if (spot.k === 2) {
        const res = F.resources.find(r => r.waiting.includes(id));
        label(`+${res.waiting.length - 2}`, spot.x + 33, spot.y - 8, { size: 3, color: "#c02828" });
      }
      return;
    }
    BOX(wctx, spot.x, spot.y, 30, 9, "#fff0f0");
    R(wctx, spot.x + 1, spot.y + 1, 3, 7, Sc.colorOf(id));
    label(`WAIT ${id}`, spot.x + 17, spot.y + 2.4, { size: 3.2, color: "#c02828" });
  }

  /* Tiny chair and table icons with the counts a party needs. */
  function needSign(x, y, chairs, tables, alpha) {
    const w = 30;
    wctx.globalAlpha = alpha;
    BOX(wctx, x - w / 2, y, w, 9, "#fbfbff");
    R(wctx, x - w / 2 + 3, y + 2, 3, 3, "#c07838");
    R(wctx, x - w / 2 + 3, y + 5, 4, 1, "#c07838");
    R(wctx, x - w / 2 + 3, y + 6, 1, 2, "#283040");
    R(wctx, x - w / 2 + 6, y + 6, 1, 2, "#283040");
    R(wctx, x + 1, y + 3, 6, 2, "#c88848");
    R(wctx, x + 2, y + 5, 1, 3, "#283040");
    R(wctx, x + 5, y + 5, 1, 3, "#283040");
    wctx.globalAlpha = 1;
    label(String(chairs), x - w / 2 + 11, y + 2, { size: 3.4, color: "#283040", alpha });
    label(String(tables), x + 11, y + 2, { size: 3.4, color: "#283040", alpha });
  }

  /* ---------- main render ---------- */

  Sc.render = function (now) {
    if (!ctx) return;
    if (!bg) drawBackground();
    labels = [];
    overlay = [];
    wctx.drawImage(bg, 0, 0);

    const run = P.run;
    const t = P.t, phase = run ? P.phase : 0;
    const cur = run ? P.frameAt(t) : null;
    const prev = run ? (t > 0 ? P.frameAt(t - 1) : P.empty) : null;
    const events = run ? P.eventsAt(t) : [];
    const declared = new Set(run ? run.started.resources.map(r => r.id) : Sc.equipment);

    drawWallClock(t, phase);
    drawKitchen(run, prev, cur, declared, t, phase, now);
    drawRoom(run, prev, cur, events, t, phase, now);
    drawStaticLabels(run, prev, cur, phase);
    if (run) drawPopups(prev, cur, events, phase);
    if (run && run.deadlock && t >= P.endTime && phase >= 0.6) drawDeadlock(cur, now);

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#181c28";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(world, ox, oy, W * scale, H * scale);
    ctx.save();                                   /* nothing spills outside the room */
    ctx.beginPath();
    ctx.rect(ox, oy, W * scale, H * scale);
    ctx.clip();
    drawLabels();
    drawOverlay();
    ctx.restore();
  };

  function drawKitchen(run, prev, cur, declared, t, phase, now) {
    for (const id of Sc.equipment) {
      const x = MACH_X[id];
      const used = declared.has(id);
      let holder = null, on = false;
      if (run && used) {
        const before = prev.resources.find(r => r.id === id), after = cur.resources.find(r => r.id === id);
        const h0 = before ? before.holder : null, h1 = after ? after.holder : null;
        holder = h0 === h1 ? h1 : phase < 0.15 ? h0 : phase < 0.45 ? null : h1;
        const atIt = cur.chefAt.includes(id) && (prev.chefAt.includes(id) || phase >= 0.55);
        on = !!holder && cur.byId[holder] && cur.byId[holder].state === "RUNNING" && atIt;
      }
      wctx.globalAlpha = used ? 1 : 0.4;
      Sp.machine(wctx, id, x, MACH_Y, on, now);
      wctx.globalAlpha = 1;
      BOX(wctx, x + 26, MACH_Y - 3, 5, 5, !used ? "#8890a0" : holder ? "#f04848" : "#50d060");
      label(id.replace("_", " ").replace("COFFEE MACHINE", "COFFEE"), x + 16, WALL_H + 2, { size: 3.2, color: used ? "#283040" : "#8890a0" });
      if (!used) label("NOT USED", x + 16, MACH_Y + 12, { size: 3, color: "#283040", bg: "rgba(255,255,255,0.8)", pad: 0.6 });
      if (holder) {
        const col = Sc.colorOf(holder);
        label(holder, x + 16, MACH_Y + 22, { size: 3.6, color: Sp.ink(col), bg: col, pad: 1, border: "#283040" });
      }
    }
    for (let c = 0; c < 2; c++) {
      const key = "stove" + c;
      const cooking = run && cur.chefs[c] && cur.chefAt[c] === key &&
                      (prev.chefAt[c] === key && prev.chefs[c] === cur.chefs[c] ? true : phase >= 0.55);
      Sp.stove(wctx, MACH_X[key], MACH_Y, !!cooking, now);
      label(`STOVE ${c}`, MACH_X[key] + 16, WALL_H + 2, { size: 3.2, color: "#283040" });
    }

    if (!run) {
      for (let c = 0; c < 2; c++) drawChef(c, stationSpot("stove" + c), "down", "stand", null, 0, now, false);
      return;
    }

    // tickets: board, hooks, in flight
    const flyingTo = {};
    for (const id in run.meta) {
      const a = ticketSpot(prev, id), b = ticketSpot(cur, id);
      if (!a && !b) continue;
      if (a && b && a.kind === "chef" && b.kind === "chef" && a.c === b.c) continue;  /* the chef's bubble */
      const same = a && b && a.kind === b.kind && a.x === b.x && a.y === b.y;
      const drawAt = (s, F, ph) => {
        if (s.kind === "rail" || s.kind === "more") drawBoardTicket(s, id, F, t, ph);
        else if (s.kind === "hook") drawHookTag(s, id, F);
      };
      if (same) { drawAt(b, cur, phase); continue; }
      const railish = q => q && (q.kind === "rail" || q.kind === "more");
      if ((railish(a) && railish(b)) || (a && b && a.kind === "hook" && b.kind === "hook")) {
        /* moving along the board (or along a machine's line): slide, full size */
        const p = along({ pts: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], win: [0.15, 0.55] }, phase);
        drawAt(Object.assign({}, phase < 0.55 ? a : b, { x: p.x, y: p.y }), phase < 0.55 ? prev : cur, phase);
        continue;
      }
      if (!b) { if (a.kind !== "chef" && phase < 0.05) drawFlyingTicket(a.x + 5, a.y + 8, id); continue; }
      let from = a, win = [0.15, 0.55];
      if (!a) {                                     /* just seated: the order goes to the board */
        const seats = slotsOf(cur.pools.SPACE, id);
        const s = seatSpot(seats.length ? seats[0] : 0);
        from = { x: s.x - 8, y: s.y - 26 };
        win = [0.45, 0.85];
      }
      if (phase >= win[1]) { drawAt(b, cur, phase); continue; }
      if (b.kind === "chef") flyingTo[b.c] = win[1];
      if (phase <= win[0]) { if (a) drawAt(a, prev, 0); continue; }
      const p = along({ pts: [{ x: from.x, y: from.y }, { x: b.x, y: b.y }], win }, phase);
      drawFlyingTicket(p.x, p.y, id);
    }

    // chefs
    for (let c = 0; c < 2; c++) {
      const a = stationSpot(prev.chefAt[c]), b = stationSpot(cur.chefAt[c]);
      const pos = a.x === b.x ? { x: b.x, y: b.y, moving: false } : along({ pts: [a, b], win: [0.15, 0.55] }, phase);
      const order = cur.chefs[c], prevOrder = prev.chefs[c];
      const waiting = flyingTo[c] && phase < flyingTo[c];
      let dir = "down", frame = "stand", working = false;
      if (pos.moving) { dir = pos.dir; frame = Math.floor(now * 8) % 2 ? "walkA" : "walkB"; }
      else if (order && !waiting) { dir = "up"; working = true; }
      let bubble = null;
      if (order && !waiting) bubble = order;
      else if (prevOrder && prevOrder !== order && phase < 0.1) bubble = prevOrder;
      drawChef(c, pos, dir, frame, bubble, bubble ? P.progress(bubble, t, bubble === order ? phase : 0) : 0, now, working);
    }
  }

  function drawChef(c, pos, dir, frame, order, done, now, working) {
    const bob = working && Math.floor(now * 4) % 2 ? 1 : 0;
    wctx.drawImage(Sp.chef(c, dir, frame), Math.round(pos.x - 8), Math.round(pos.y - 24 - bob));
    label(`CHEF ${c}`, pos.x, pos.y + 2, { size: 3, color: "#283040" });
    if (!order) return;
    const m = P.run.meta[order];
    const col = Sc.colorOf(order);
    const bx = Math.round(pos.x - 14), by = Math.round(pos.y - 37);
    BOX(wctx, bx, by, 28, 11, "#fbfbff");
    R(wctx, bx + 1, by + 1, 3, 9, col);
    R(wctx, bx + 12, by + 10, 4, 2, "#fbfbff");
    R(wctx, bx + 12, by + 12, 4, 1, "#283040");
    label(order, bx + 15, by + 1.6, { size: 3.4, color: "#283040" });
    R(wctx, bx + 5, by + 7, 21, 2, "#d8dce8");
    R(wctx, bx + 5, by + 7, Math.round((21 * done) / m.service), 2, "#38a048");
    label(`${Math.floor(done + 1e-6)}/${m.service}`, bx + 30, by + 3, { size: 3, color: "#283040", align: "left", bg: "rgba(255,255,255,0.75)", pad: 0.5 });
  }

  function drawRoom(run, prev, cur, events, t, phase, now) {
    const space = run ? shownPool(prev.pools.SPACE, cur.pools.SPACE, phase, 0.15, 0.4) : new Array(Sc.pools.SPACE).fill(null);
    const table = run ? shownPool(prev.pools.TABLE, cur.pools.TABLE, phase, 0.38, 0.45) : new Array(Sc.pools.TABLE).fill(null);

    // tables with their name plates, cloths and flags
    for (let j = 0; j < table.length; j++) {
      const { x, y } = tablePos(j), o = table[j];
      Sp.table(wctx, x, y, o ? Sc.colorOf(o) : null);
      BOX(wctx, x + 17, y + 13, 14, 7, "#fbfbff");
      label(tableName(j), x + 24, y + 14.2, { size: 3.6, color: "#283040" });
      if (o) {
        Sp.flag(wctx, x + 38, y - 9, Sc.colorOf(o));
        label(o, x + 16, y + 4, { size: 4, color: Sp.ink(Sc.colorOf(o)) });
      }
    }
    // chairs in the corner, tinted under their owner
    space.forEach((o, i) => {
      if (!o) return;
      const col = Sc.colorOf(o);
      R(wctx, chairX(i) - 2, CHAIR_Y - 9, chairDX, 32, Sp.shade(col, -0.2));
      R(wctx, chairX(i) - 1, CHAIR_Y - 8, chairDX - 2, 30, col);
    });
    for (let i = 0; i < space.length; i++) Sp.chair(wctx, chairX(i), CHAIR_Y);

    if (!run) return;
    drawAllocation(cur, events, phase);

    // customers, nearer ones drawn on top
    const people = [];
    for (const id in run.meta) {
      const m = run.meta[id];
      const col = Sc.colorOf(id);
      for (let j = 0; j < m.space_req; j++) {
        const a = memberSpot(prev, id, j), b = memberSpot(cur, id, j);
        if (!a && !b) continue;
        let pos, path = null;
        if (a && b && a.x === b.x && a.y === b.y) pos = { x: b.x, y: b.y, moving: false, done: true, started: true, dir: "right", u: 1 };
        else {
          path = memberPath(a, b, j, id, prev);
          pos = follow(path, phase);
        }
        if (!b && pos.done) continue;                          /* walked off the screen */
        let alpha = 1;
        if (path && path.fadeIn) alpha = clamp01((phase - path.win[0]) / 0.06);
        if (alpha <= 0) continue;
        let dir = pos.moving ? pos.dir : "right", frame = pos.moving ? (Math.floor(now * 8 + j) % 2 ? "walkA" : "walkB") : "stand";
        const sitting = (b && b.zone === "seat" && pos.done) || (a && a.zone === "seat" && !b && !pos.started);
        if (sitting) { dir = "down"; frame = "sit"; }
        else if (!pos.moving && pos.pause === 0 && path && path.facePause) dir = path.facePause;
        people.push({ id, j, x: pos.x, y: pos.y, color: col, hair: m.index * 3 + j, dir, frame, alpha,
                      moving: pos.moving, leaving: !b, carryBag: !b && !m.table_req && pos.pause === null && pos.started });
      }
    }
    people.sort((p, q) => p.y - q.y);
    for (const d of people) {
      drawPerson(d);
      if (d.carryBag) Sp.bag(wctx, d.x + 4, d.y - 10);
    }
    // ID sign over each party that is standing or walking
    /* Signs follow the party's members, so they never jump ahead of them. */
    const leaders = {}, sumX = {}, count = {};
    for (const d of people) {
      if (d.frame === "sit") continue;
      if (!leaders[d.id] || d.j === 0) leaders[d.id] = d;
      sumX[d.id] = (sumX[d.id] || 0) + d.x;
      count[d.id] = (count[d.id] || 0) + 1;
    }
    for (const id in leaders) {
      const d = leaders[id], m = run.meta[id], col = Sc.colorOf(id);
      const sx = sumX[id] / count[id];
      /* outside, every other party's sign sits higher so a long line stays readable */
      const lift = (m.index % 2) * 12 * clamp01((d.y - WALL_Y) / 30);
      label(id, sx, d.y - 28 - lift, { size: 3.6, color: Sp.ink(col), bg: col, pad: 0.8, alpha: d.alpha, border: "#283040" });
      if (!d.leaving) needSign(sx, d.y - 41 - lift, m.space_req, m.table_req, d.alpha);
    }
    // seated orders: ID and state under their chairs
    const runs = {};
    space.forEach((o, i) => o && (runs[o] = runs[o] || []).push(i));
    let nth = 0;
    for (const o in runs) {
      const s = runs[o];
      const x = (chairX(s[0]) + chairX(s[s.length - 1]) + 16) / 2;
      const col = Sc.colorOf(o);
      const st = cur.byId[o].state;
      const tag = st === "RUNNING" ? "COOKING" : st === "BLOCKED_RESOURCE" ? "BLOCKED" : st === "READY" ? "READY" : "";
      label(o, x, CHAIR_Y + 19, { size: 3.4, color: Sp.ink(col), bg: col, pad: 0.8, border: "#283040" });
      if (tag) label(tag, x, CHAIR_Y + 25 + (nth++ % 2) * 6, { size: 2.6, color: "#fff", bg: "rgba(40,48,64,0.85)", pad: 0.6 });
    }

    // dishes for orders served now
    for (const ev of events) {
      if (ev.type !== "COMPLETE" || phase > 0.5) continue;
      const id = ev.process_id;
      const c = prev.chefs.indexOf(id);
      const start = c >= 0 ? stationSpot(prev.chefAt[c]) : { x: BOARD.x + 20, y: 60 };
      const tables = slotsOf(prev.pools.TABLE, id);
      const target = tables.length ? { x: tablePos(tables[0]).x + 18, y: tablePos(tables[0]).y + 4 } : { x: COUNTER_X + 3, y: COUNTER_Y - 6 };
      const p = along({ pts: [{ x: start.x - 6, y: start.y - 30 }, target], win: [0, 0.15] }, phase);
      wctx.globalAlpha = phase > 0.42 ? clamp01((0.5 - phase) / 0.08) : 1;
      if (tables.length) Sp.dish(wctx, Math.round(p.x), Math.round(p.y));
      else if (phase < 0.3) Sp.bag(wctx, Math.round(p.x), Math.round(p.y));
      wctx.globalAlpha = 1;
    }
  }

  /* Outline(s) for a run of slots: one box over a run of chairs, one box per
   * table (they stand in a triangle, not a row). */
  function runBoxes(name, start, size) {
    if (name === "SPACE") {
      const x = chairX(start) - 2;
      return [{ x, y: CHAIR_Y - 10, w: chairX(start + size - 1) + 18 - x, h: 32 }];
    }
    return Array.from({ length: size }, (_, k) => {
      const p = tablePos(start + k);
      return { x: p.x - 4, y: p.y - 12, w: TABLE_W + 8, h: 44 };
    });
  }

  /* Free gaps (dashed) and the gap the allocator picked (solid), per admission. */
  function drawAllocation(cur, events, phase) {
    const admits = events.filter(e => e.type === "MEMORY_ADMIT");
    if (!admits.length) return;
    const span = 0.55 / admits.length;
    admits.forEach((ev, k) => {
      const w0 = 0.3 + k * span, w1 = w0 + span;
      if (phase < w0 || phase >= w1) return;
      const later = new Set(admits.slice(k).map(e => e.process_id));
      for (const name of ["SPACE", "TABLE"]) {
        const before = cur.pools[name].map(o => (later.has(o) ? null : o));
        const mine = slotsOf(cur.pools[name], ev.process_id);
        if (!mine.length) continue;
        for (const hole of holes(before)) {
          const boxes = runBoxes(name, hole.start, hole.size);
          boxes.forEach(b => overlay.push({ type: "box", x: b.x, y: b.y, w: b.w, h: b.h, color: "#f0c020", dash: true }));
          overlay.push({ type: "text", text: `GAP ${hole.size}`, x: boxes[0].x + boxes[0].w / 2, y: boxes[0].y + 1, color: "#283040", size: 3, bg: "#fff0a0", border: "#283040" });
        }
        const chosen = runBoxes(name, mine[0], mine.length);
        chosen.forEach(b => overlay.push({ type: "box", x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2, color: "#30c050" }));
        const c0 = chosen[0];
        overlay.push({ type: "text", text: `${P.run.started.allocator.replace("_", " ")} → ${ev.process_id}`, x: c0.x + c0.w / 2, y: c0.y + c0.h + 2, color: "#ffffff", size: 3.2, bg: "#30a048", border: "#283040" });
      }
    });
  }

  function drawStaticLabels(run, prev, cur, phase) {
    const sched = run ? run.started.scheduler : null;
    label("ORDER BOARD = READY QUEUE", BOARD.x + BOARD.w / 2, BOARD.y + 2, { size: 3.6, color: "#fff", bg: "#8a5428", pad: 0.8 });
    label(run ? `${sched}: ${RV.Narrate.schedulerRule[sched].split(" (")[0].toUpperCase()}` : "ORDERS WAIT HERE FOR A CHEF",
          BOARD.x + BOARD.w / 2, BOARD.y + 8.5, { size: 2.8, color: "#4a2810" });
    if (run && cur.queues.ready.length) label("▲ NEXT", BOARD.x + 21, BOARD.y + 47, { size: 2.8, color: "#c02828" });
    if (run && !cur.queues.ready.length) label("EMPTY", BOARD.x + BOARD.w / 2, BOARD.y + 28, { size: 3.6, color: "#a07040" });

    label("KITCHEN · 2 CHEFS = 2 CPUS · MACHINES = SHARED RESOURCES", 6, COUNTER_Y + 10, { size: 2.8, color: "#fff8e8", align: "left" });
    const chairsMid = chairX(0) + (chairDX * Sc.pools.SPACE) / 2 - 2;
    const tablesMid = tableSpots.reduce((a, p) => a + p.x, 0) / tableSpots.length + TABLE_W / 2;
    const tablesLow = Math.max(...tableSpots.map(p => p.y));
    /* before the chairs and tables change hands this cycle, count the old state */
    const F = run ? (phase < 0.4 ? prev : cur) : null;
    const sp = F ? F.pools.SPACE : new Array(Sc.pools.SPACE).fill(null);
    const tb = F ? F.pools.TABLE : new Array(Sc.pools.TABLE).fill(null);
    const info = pool => ` · ${pool.filter(o => o === null).length} FREE, GAP ${holes(pool).reduce((a, h) => Math.max(a, h.size), 0)}`;
    label(`CHAIRS = SPACE POOL${info(sp)}`, chairsMid, CHAIR_Y - 19, { size: 2.8, color: "#fff", bg: "rgba(40,48,64,0.85)", pad: 0.8 });
    label(`TABLES = TABLE POOL${info(tb)}`, tablesMid, tablesLow + 34, { size: 2.8, color: "#fff", bg: "rgba(40,48,64,0.85)", pad: 0.8 });
    label("RESTAURANT", 315, 227.5, { size: 2.7, color: "#4a2810" });
    label("OUTSIDE = MEMORY QUEUE (FIFO)", 330, H - 9, { size: 2.8, color: "#1c4010", align: "left" });
    if (run && cur.queues.memory.length) label("◀ HEAD", QUEUE_RIGHT + 2, PATH_Y + 3, { size: 2.6, color: "#4a2810", align: "left" });
  }

  const POPUP = {
    MEMORY_BLOCK: ["NO ROOM!", "#c02828", 0.3], MEMORY_ADMIT: ["SEATED", "#208838", 0.4],
    DISPATCH: ["START", "#208838", 0.5], RESOURCE_ACQUIRE: ["TAKES", "#208838", 0.45],
    RESOURCE_WAIT: ["WAIT", "#d06010", 0.3], RESOURCE_BLOCK: ["BLOCKED", "#c02828", 0.35],
    RESOURCE_RELEASE: ["FREE", "#2860c0", 0.15], RESOURCE_ROLLBACK: ["ROLLBACK", "#8838b8", 0.15],
    RESOURCE_UNBLOCK: ["READY", "#208838", 0.5], COMPLETE: ["SERVED!", "#c08000", 0.1],
  };

  function drawPopups(prev, cur, events, phase) {
    const stack = {};
    events.forEach(ev => {
      const def = POPUP[ev.type];
      if (!def) return;
      let [text, color, start] = def;
      const id = ev.process_id;
      let x, y;
      if (ev.type === "MEMORY_BLOCK") {
        const L = queueLayout(cur)[id];
        x = L ? L.center : DOOR_OUT.x; y = PATH_Y + 5; text = `${id} ${text}`;
      } else if (ev.type === "MEMORY_ADMIT") {
        const s = slotsOf(cur.pools.SPACE, id);
        x = s.length ? (chairX(s[0]) + chairX(s[s.length - 1]) + 16) / 2 : 80; y = CHAIR_Y - 2; text = `${id} ${text}`;
      } else if (ev.type === "COMPLETE") {
        const tb = slotsOf(prev.pools.TABLE, id);
        x = tb.length ? tablePos(tb[0]).x + TABLE_W / 2 : PICKUP.x; y = tb.length ? tablePos(tb[0]).y - 12 : PICKUP.y - 30; text = `${id} ${text}`;
      } else if (ev.type === "DISPATCH" || ev.type === "RESOURCE_BLOCK") {
        const F = ev.type === "DISPATCH" ? cur : prev;
        const spot = stationSpot(F.chefAt[ev.chef_id] || "stove" + ev.chef_id);
        x = spot.x; y = CHEF_Y + 6;
        text = ev.type === "DISPATCH" ? `START ${id}` : `${id} BLOCKED`;
      } else if (ev.resource && ev.resource in MACH_X) {
        x = MACH_X[ev.resource] + 16; y = MACH_Y + 4;
        text = ev.type === "RESOURCE_ACQUIRE" ? `+${id}` : ev.type === "RESOURCE_RELEASE" ? `-${id} FREE` : `${id} ${text}`;
      } else return;
      const u = (phase - start) / 0.45;
      if (u < 0 || u > 1) return;
      const key = `${Math.round(x)},${Math.round(y)}`;           /* visible popups at one spot stack up */
      const n = (stack[key] = (stack[key] || 0) + 1) - 1;
      overlay.push({ type: "text", text, x, y: y - n * 7 - u * 3, color, size: 3.4, alpha: u > 0.7 ? (1 - u) / 0.3 : 1, bg: "#fbfbff", border: "#283040" });
    });
  }

  /* Red arrows for the wait-for cycle: waiter tag → holder badge, and the
   * holder's own waiting tag. */
  function drawDeadlock(F, now) {
    const pulse = 0.55 + 0.45 * Math.sin(now * 6);
    const holderAt = {}, waitAt = {};
    for (const r of F.resources) {
      if (!(r.id in MACH_X)) continue;
      if (r.holder) holderAt[r.holder] = (holderAt[r.holder] || []).concat(r.id);
      r.waiting.forEach((o, k) => (waitAt[o] = { r: r.id, k }));
      if (r.holder && r.waiting.length) overlay.push({ type: "box", x: MACH_X[r.id] - 1, y: MACH_Y - 1, w: 34, h: 34, color: "#f02828", alpha: pulse, width: 2 });
    }
    for (const o in waitAt) {
      const w = waitAt[o];
      const res = F.resources.find(r => r.id === w.r);
      const tagX = MACH_X[w.r] + 16, tagY = 6 + Math.min(w.k, 1) * 10;
      if (res.holder) overlay.push({ type: "arrow", x1: tagX, y1: tagY + 4, x2: tagX, y2: MACH_Y + 20, color: "#f02828", alpha: pulse });
      for (const held of holderAt[o] || [])
        overlay.push({ type: "arrow", x1: MACH_X[held] + 16, y1: MACH_Y + 28, x2: tagX, y2: tagY + 5, color: "#ff7878", alpha: pulse, dash: true, curve: true });
    }
    overlay.push({ type: "text", text: "DEADLOCK: CIRCULAR WAIT", x: 76, y: WALL_H + 9, color: "#fff", bg: "#c02828", size: 4.4, border: "#283040" });
  }

  /* ---------- screen-space text and overlay ---------- */

  function drawLabels() {
    ctx.textBaseline = "top";
    for (const l of labels) drawText(l);
  }

  function drawText(l) {
    const px = Math.max(12, Math.round(l.size * scale * 1.9));
    ctx.font = `${px}px ${FONT}`;
    const x = ox + l.x * scale, y = oy + l.y * scale;
    const w = ctx.measureText(l.text).width;
    const left = l.align === "left" ? x : l.align === "right" ? x - w : x - w / 2;
    ctx.globalAlpha = l.alpha === undefined ? 1 : l.alpha;
    if (l.bg) {
      const pad = (l.pad || 1) * scale;
      const bx = Math.round(left - pad - 1), by = Math.round(y - pad), bw = Math.round(w + pad * 2 + 2), bh = Math.round(px + pad * 2);
      if (l.border) {
        ctx.fillStyle = l.border;
        ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      }
      ctx.fillStyle = l.bg;
      ctx.fillRect(bx, by, bw, bh);
    }
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, Math.round(left), Math.round(y - px * 0.08));
    ctx.globalAlpha = 1;
  }

  function drawOverlay() {
    for (const o of overlay) {
      if (o.type === "text") { drawText(Object.assign({ align: "center" }, o)); continue; }
      ctx.save();
      ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = Math.max(2, (o.width || 1.6) * scale * 0.7);
      ctx.setLineDash(o.dash ? [2 * scale, 1.5 * scale] : []);
      if (o.type === "box") {
        ctx.strokeRect(ox + o.x * scale, oy + o.y * scale, o.w * scale, o.h * scale);
      } else if (o.type === "arrow") {
        const x1 = ox + o.x1 * scale, y1 = oy + o.y1 * scale, x2 = ox + o.x2 * scale, y2 = oy + o.y2 * scale;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        let ax = x1, ay = y1;
        if (o.curve) {
          const mx = (x1 + x2) / 2, my = Math.max(y1, y2) + 20 * scale;
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
