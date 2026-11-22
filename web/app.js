'use strict';

// -----------------------------------------------------------------------------
// Last Call Kitchen - Pixel Art Restaurant Simulation & WebSocket Controller
// -----------------------------------------------------------------------------

const EXAMPLES = window.TRACE_EXAMPLES || [];

// 12-Color Shared Palette
const PALETTE = {
  nightPine: '#263A34',
  warmInk: '#3B3731',
  roastUmber: '#684638',
  tavernOak: '#956448',
  honeyLight: '#C48A56',
  apricot: '#E0B477',
  linen: '#F3E4BD',
  sage: '#758B63',
  leaf: '#A4B47A',
  tealSlate: '#587A78',
  tomato: '#B95743',
  hearthGold: '#F0C768'
};

const NAMES = {
  ARRIVE: 'Order arrived',
  MEMORY_BLOCK: 'Waiting for memory',
  MEMORY_ADMIT: 'Memory reserved (Seats & Table)',
  DISPATCH: 'Chef started cooking',
  RESOURCE_ACQUIRE: 'Equipment acquired',
  RESOURCE_WAIT: 'Equipment contention (waiting)',
  RESOURCE_BLOCK: 'Waiting for equipment',
  RESOURCE_RELEASE: 'Equipment released',
  RESOURCE_ROLLBACK: 'Safety rollback applied',
  RESOURCE_UNBLOCK: 'Equipment available (cooking resumed)',
  COMPLETE: 'Order served',
  DEADLOCK_CYCLE: 'Circular wait detected',
  PREVENTION_APPLIED: 'Safety policy applied'
};

// Built-in Workload Presets
const WORKLOAD_PRESETS = {
  a3_integrated: `6\n2\nO1,0,2,5,NORMAL,3,1\nO2,0,1,4,VIP,2,1\nO3,1,2,3,NORMAL,2,1\nO4,2,1,2,VIP,1,0\nO5,3,3,4,NORMAL,1,1\nO6,4,2,3,NORMAL,2,0\n4\nCOFFEE_MACHINE,1\nMICROWAVE,1\nOVEN_1,1\nOVEN_2,1\n14\nO1,1,ACQUIRE,OVEN_1,1\nO1,4,RELEASE,OVEN_1,1\nO2,0,ACQUIRE,OVEN_1,1\nO2,2,RELEASE,OVEN_1,1\nO3,0,ACQUIRE,MICROWAVE,1\nO3,1,ACQUIRE,OVEN_2,1\nO3,3,RELEASE,OVEN_2,1\nO3,3,RELEASE,MICROWAVE,1\nO4,0,ACQUIRE,COFFEE_MACHINE,1\nO4,2,RELEASE,COFFEE_MACHINE,1\nO5,1,ACQUIRE,COFFEE_MACHINE,1\nO5,2,RELEASE,COFFEE_MACHINE,1\nO6,0,ACQUIRE,OVEN_2,1\nO6,3,RELEASE,OVEN_2,1\n`,
  a3_contention: `2\n2\nO1,0,1,4,NORMAL,1,1\nO2,0,2,4,NORMAL,1,1\n1\nOVEN_1,1\n4\nO1,1,ACQUIRE,OVEN_1,1\nO1,3,RELEASE,OVEN_1,1\nO2,1,ACQUIRE,OVEN_1,1\nO2,3,RELEASE,OVEN_1,1\n`,
  a3_deadlock: `2\n2\nO1,0,1,4,NORMAL,1,1\nO2,0,1,4,NORMAL,1,1\n2\nMICROWAVE,1\nOVEN_1,1\n8\nO1,0,ACQUIRE,MICROWAVE,1\nO1,1,ACQUIRE,OVEN_1,1\nO1,3,RELEASE,OVEN_1,1\nO1,4,RELEASE,MICROWAVE,1\nO2,0,ACQUIRE,OVEN_1,1\nO2,1,ACQUIRE,MICROWAVE,1\nO2,3,RELEASE,MICROWAVE,1\nO2,4,RELEASE,OVEN_1,1\n`,
  a3_safe: `2\n2\nO1,0,1,4,NORMAL,1,1\nO2,0,1,4,NORMAL,1,1\n2\nMICROWAVE,1\nOVEN_1,1\n8\nO1,0,ACQUIRE,MICROWAVE,1\nO1,1,ACQUIRE,OVEN_1,1\nO1,3,RELEASE,OVEN_1,1\nO1,4,RELEASE,MICROWAVE,1\nO2,0,ACQUIRE,MICROWAVE,1\nO2,1,ACQUIRE,OVEN_1,1\nO2,3,RELEASE,OVEN_1,1\nO2,4,RELEASE,MICROWAVE,1\n`,
  a2_example: `4\n2\nO1,0,2,8,NORMAL,2,1\nO2,1,1,4,VIP,1,1\nO3,2,2,5,NORMAL,3,0\nO4,3,1,6,VIP,2,2\n`
};

// -----------------------------------------------------------------------------
// Preload Pixel Art Sprites
// -----------------------------------------------------------------------------
const SPRITES = {
  chef0: new Image(),
  chef1: new Image(),
  oven: new Image(),
  microwave: new Image(),
  coffeemachine: new Image(),
  tableEmpty: new Image(),
  tableMeal: new Image(),
  chair: new Image(),
  diner: new Image(),
};

SPRITES.chef0.src = 'assets/pixel-art/chef-cook-01.png';
SPRITES.chef1.src = 'assets/pixel-art/chef-cook-02.png';
SPRITES.oven.src = 'assets/pixel-art/range-woodfire-01.png';
SPRITES.microwave.src = 'assets/pixel-art/microwave-01.png';
SPRITES.coffeemachine.src = 'assets/pixel-art/coffeemachine-01.png';
SPRITES.tableEmpty.src = 'assets/pixel-art/table-empty-01.png';
SPRITES.tableMeal.src = 'assets/pixel-art/table-meal-01.png';
SPRITES.chair.src = 'assets/pixel-art/chair-waiting-01.png';
SPRITES.diner.src = 'assets/pixel-art/diner-01.png';

let spritesLoaded = 0;
const totalSprites = Object.keys(SPRITES).length;
Object.values(SPRITES).forEach(img => {
  img.onload = () => { spritesLoaded++; if (state.runs.length) render(); };
  img.onerror = () => { console.warn('Could not load sprite', img.src); };
});

// -----------------------------------------------------------------------------
// State Management
// -----------------------------------------------------------------------------
const $ = id => document.getElementById(id);

const state = {
  ws: null,
  wsConnected: false,
  wsStreaming: false,
  customWorkloadText: null,
  runs: [],
  active: 0,
  frame: 0,
  playing: false,
  speed: 1,
  arrival: true,
  timer: null,
  toast: null,
  lastDeadlock: null
};

function toast(s) {
  const el = $('toast');
  if (!el) return;
  el.textContent = s;
  el.classList.add('show');
  clearTimeout(state.toast);
  state.toast = setTimeout(() => el.classList.remove('show'), 3300);
}

function run() {
  return state.runs[state.active];
}

function frame() {
  const r = run();
  if (!r || !r.frames || !r.frames.length) return null;
  return r.frames[Math.min(state.frame, r.frames.length - 1)];
}

// -----------------------------------------------------------------------------
// WebSocket Connection to restaurant_server
// -----------------------------------------------------------------------------
function getWsUrl() {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return 'ws://' + location.host;
  }
  return 'ws://127.0.0.1:8080';
}

function setWsStatus(status, text) {
  const el = $('ws-status');
  const txt = $('ws-text');
  if (!el || !txt) return;
  el.className = 'ws-status ' + status;
  txt.textContent = text;
}

function connectWebSocket() {
  if (state.ws && (state.ws.readyState === WebSocket.CONNECTING || state.ws.readyState === WebSocket.OPEN)) {
    return;
  }
  setWsStatus('connecting', 'Connecting...');
  const url = getWsUrl();

  try {
    const ws = new WebSocket(url);
    state.ws = ws;

    ws.onopen = () => {
      state.wsConnected = true;
      setWsStatus('connected', 'Live Server Ready');
      toast('Connected to restaurant_server (WebSocket)');
    };

    ws.onclose = () => {
      state.wsConnected = false;
      state.wsStreaming = false;
      setWsStatus('offline', 'Offline (Mock/Replay)');
    };

    ws.onerror = () => {
      state.wsConnected = false;
      setWsStatus('offline', 'Server Not Found');
    };

    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('Failed to parse server message:', err, e.data);
      }
    };
  } catch (err) {
    setWsStatus('offline', 'Connection Error');
  }
}

function sendWs(obj) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(obj));
    return true;
  }
  toast('Server not connected. Run `./restaurant_server` or open an offline recording.');
  return false;
}

// -----------------------------------------------------------------------------
// Server Message Handler
// -----------------------------------------------------------------------------
function handleServerMessage(msg) {
  switch (msg.type) {
    case 'hello':
      if (Array.isArray(msg.schedulers)) {
        populateSelect('sel-scheduler', msg.schedulers);
      }
      if (Array.isArray(msg.allocators)) {
        populateSelect('sel-allocator', msg.allocators);
      }
      break;

    case 'started': {
      state.wsStreaming = true;
      state.lastDeadlock = null;
      hideDeadlock();

      const newRun = {
        run: {
          id: `Live Service (${msg.scheduler} / ${msg.allocator})`,
          origin: 'RECORDED',
          phase: 'A3',
          scheduler: msg.scheduler,
          allocator: msg.allocator,
          end_time: msg.end_time || 0,
          status: 'RUNNING'
        },
        model: {
          chef_count: 2,
          pools: { SPACE: 6, TABLE: 3 },
          resources: (msg.resources || []).map(r => ({ id: r.id, capacity: r.capacity || 1 })),
          processes: (msg.processes || []).map(p => ({
            id: p.id,
            arrival: p.arrival,
            priority: p.priority,
            service: p.service,
            category: p.category || 'NORMAL',
            space_req: p.space_req,
            table_req: p.table_req
          }))
        },
        frames: [],
        results: {
          processes: [],
          summary: {
            total_orders: msg.processes ? msg.processes.length : 0,
            average_waiting: '...',
            average_turnaround: '...',
            service_utilization_pct: 0,
            throughput: '...',
            average_memory_wait: '...'
          },
          pools: []
        }
      };

      state.runs.push(newRun);
      state.active = state.runs.length - 1;
      state.frame = 0;
      state.playing = true;

      $('welcome').classList.add('hidden');
      $('simulator').classList.remove('hidden');
      render();
      toast(`Simulation started · ${newRun.model.processes.length} orders`);
      break;
    }

    case 'frame': {
      const r = run();
      if (!r) return;
      r.frames.push(msg);
      // Follow the live stream
      state.frame = r.frames.length - 1;
      render();
      break;
    }

    case 'results': {
      const r = run();
      if (r) {
        r.run.status = 'COMPLETE';
        if (msg.summary) r.results.summary = msg.summary;
        if (msg.processes) r.results.processes = msg.processes;
        if (msg.pools) r.results.pools = msg.pools;
        if (msg.csv) r.results._csv = msg.csv;
      }
      state.wsStreaming = false;
      state.playing = false;
      render();
      toast('Service complete! Results computed.');
      break;
    }

    case 'deadlock': {
      const r = run();
      if (r) {
        r.run.status = 'DEADLOCK';
      }
      state.wsStreaming = false;
      state.playing = false;
      state.lastDeadlock = msg;
      showDeadlock(msg.time, msg.message);
      render();
      toast(`⚠️ Deadlock at tick ${msg.time}`);
      break;
    }

    case 'paused':
      state.playing = false;
      render();
      break;

    case 'resumed':
      state.playing = true;
      render();
      break;

    case 'speed':
      break;

    case 'error':
      toast(`Server error: ${msg.message}${msg.line ? ' (line ' + msg.line + ')' : ''}`);
      break;

    case 'done':
      state.wsStreaming = false;
      state.playing = false;
      render();
      break;
  }
}

function showDeadlock(time, message) {
  const banner = $('deadlock-banner');
  const title = $('deadlock-banner-title');
  const msg = $('deadlock-banner-message');
  if (!banner || !title || !msg) return;
  title.textContent = `CIRCULAR WAIT DEADLOCK AT TICK ${time}`;
  msg.textContent = message;
  banner.classList.remove('hidden');
}

function hideDeadlock() {
  const banner = $('deadlock-banner');
  if (banner) banner.classList.add('hidden');
}

function populateSelect(id, values) {
  const el = $(id);
  if (!el) return;
  const curr = el.value;
  el.replaceChildren(...values.map(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    if (v === curr) opt.selected = true;
    return opt;
  }));
}

// -----------------------------------------------------------------------------
// Start Simulation from UI
// -----------------------------------------------------------------------------
async function triggerStartSimulation() {
  const scheduler = $('sel-scheduler')?.value || 'FCFS';
  const allocator = $('sel-allocator')?.value || 'FIRST_FIT';
  const unsafeDemo = $('chk-unsafe-demo')?.checked || false;

  let ordersText = '';
  const workloadChoice = $('sel-workload')?.value || 'a3_integrated';

  if (workloadChoice === 'custom') {
    if (!state.customWorkloadText) {
      toast('Please choose a .txt orders file first.');
      $('server-file-input')?.click();
      return;
    }
    ordersText = state.customWorkloadText;
  } else {
    ordersText = WORKLOAD_PRESETS[workloadChoice] || WORKLOAD_PRESETS.a3_integrated;
  }

  const tickMs = Math.max(80, Math.floor(500 / state.speed));

  if (!state.wsConnected) {
    toast('WebSocket server offline. Attempting to connect...');
    connectWebSocket();
    setTimeout(() => {
      sendWs({
        type: 'start',
        scheduler,
        allocator,
        orders: ordersText,
        tick_ms: tickMs,
        unsafe_demo: unsafeDemo
      });
    }, 600);
    return;
  }

  sendWs({
    type: 'start',
    scheduler,
    allocator,
    orders: ordersText,
    tick_ms: tickMs,
    unsafe_demo: unsafeDemo
  });
}

// -----------------------------------------------------------------------------
// Validation for offline traces
// -----------------------------------------------------------------------------
function validate(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw Error('Choose a valid JSON simulation recording.');
  if (r.schema_version !== 1) throw Error(`Unsupported trace version ${r.schema_version ?? '(missing)'}.`);
  for (const k of ['run', 'model', 'frames', 'results']) {
    if (!r[k] || typeof r[k] !== 'object') throw Error(`Missing ${k} section.`);
  }
  return r;
}

function addRun(r, file = '') {
  try {
    r = validate(r);
    if (file) r._filename = file;
    state.runs.push(r);
    state.active = state.runs.length - 1;
    state.frame = 0;
    hideDeadlock();
    $('welcome').classList.add('hidden');
    $('simulator').classList.remove('hidden');
    render();
    toast(`${r.run.origin === 'SYNTHETIC' ? 'Example' : 'Recording'} loaded · ${r.model.processes.length} orders`);
  } catch (e) {
    toast(file ? `${file}: ${e.message}` : e.message);
  }
}

async function loadExample(x) {
  try {
    if (!x?.data) throw Error('This example is not bundled with the viewer.');
    addRun(structuredClone(x.data));
  } catch (e) {
    toast(e.message);
  }
}

function examples() {
  const el = $('example-list');
  if (!el) return;
  el.replaceChildren();
  for (const x of EXAMPLES) {
    const b = document.createElement('button');
    b.className = 'example-chip';
    b.textContent = x.name;
    b.onclick = () => loadExample(x);
    el.append(b);
  }
}

async function importFiles(files) {
  for (const f of files) {
    try {
      const text = await f.text();
      try {
        const json = JSON.parse(text);
        addRun(json, f.name);
      } catch (err) {
        // Raw workload text file
        state.customWorkloadText = text;
        const sel = $('sel-workload');
        if (sel) {
          sel.value = 'custom';
          toast(`Loaded custom orders from ${f.name}. Click 'RUN LIVE' to simulate!`);
        }
      }
    } catch (e) {
      toast(`${f.name}: ${e.message}`);
    }
  }
}

// -----------------------------------------------------------------------------
// Playback Control Functions
// -----------------------------------------------------------------------------
function stop() {
  state.playing = false;
  clearInterval(state.timer);
  if (state.wsStreaming) {
    sendWs({ type: 'pause' });
  }
}

function seek(n) {
  stop();
  const r = run();
  if (!r || !r.frames.length) return;
  state.frame = Math.max(0, Math.min(Number(n), r.frames.length - 1));
  render();
}

function play() {
  const r = run();
  if (!r || !r.frames.length) return;

  if (state.playing) {
    stop();
    render();
    return;
  }

  if (state.wsStreaming) {
    sendWs({ type: 'resume' });
    state.playing = true;
    render();
    return;
  }

  if (state.frame >= r.frames.length - 1) {
    state.frame = 0;
  }
  state.playing = true;
  render();

  state.timer = setInterval(() => {
    if (state.frame >= r.frames.length - 1) {
      stop();
      render();
      return;
    }
    state.frame++;
    render();
  }, Math.max(120, 600 / state.speed));
}

function stepForward() {
  const r = run();
  if (!r) return;
  if (state.wsStreaming) {
    sendWs({ type: 'step' });
  } else {
    seek(state.frame + 1);
  }
}

function stepBackward() {
  if (state.wsStreaming) {
    stop();
  }
  seek(state.frame - 1);
}

function changeSpeed() {
  state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : state.speed === 4 ? 0.5 : 1;
  if (state.wsStreaming) {
    sendWs({ type: 'speed', tick_ms: Math.max(50, Math.floor(500 / state.speed)) });
  }
  render();
}

function download() {
  const r = run();
  if (!r) return;
  const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${r.run.id || 'restaurant-simulation'}.trace.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

// -----------------------------------------------------------------------------
// UI Rendering
// -----------------------------------------------------------------------------
function render() {
  if (!state.runs.length) return;
  const r = run();
  if (!r) return;
  if (r.frames.length) {
    state.frame = Math.min(state.frame, r.frames.length - 1);
  }
  const f = frame();

  const metaText = `${r.run.phase || 'A3'} · ${r.run.scheduler} · ${r.run.allocator} · ${r.model.processes.length} orders`;
  $('run-title').textContent = r.run.id || 'Dinner service';
  $('origin-badge').textContent = r.run.origin === 'SYNTHETIC' ? 'SYNTHETIC EXAMPLE' : 'RECORDED RUN';
  $('origin-badge').classList.toggle('recorded', r.run.origin === 'RECORDED');
  $('run-meta').textContent = metaText;

  const fsMeta = $('fs-run-meta');
  if (fsMeta) fsMeta.textContent = `${r.run.scheduler} / ${r.run.allocator} · ${r.model.processes.length} orders`;

  if (f) {
    const timeText = `TICK ${f.time}`;
    $('time-chip').textContent = timeText;
    const fsTime = $('fs-time-chip');
    if (fsTime) fsTime.textContent = timeText;
    $('time-display').textContent = String(f.time).padStart(2, '0');
  }

  $('frame-count').textContent = `FRAME ${state.frame + 1} / ${Math.max(1, r.frames.length)}`;
  $('timeline').max = Math.max(0, r.frames.length - 1);
  $('timeline').value = state.frame;
  $('timeline-end').textContent = `TICK ${r.run.end_time || (f ? f.time : 0)}`;
  $('order-count').textContent = r.model.processes.length;

  const playIcon = state.playing ? 'Ⅱ' : '▶';
  $('play-button').textContent = playIcon;
  const fsPlay = $('fs-play-btn');
  if (fsPlay) fsPlay.textContent = playIcon;

  const speedText = `${state.speed}×`;
  $('speed-button').textContent = speedText;
  const fsSpeed = $('fs-speed-btn');
  if (fsSpeed) fsSpeed.textContent = speedText;

  if (f) {
    drawRestaurant($('game-canvas'), r, f);
    orders(r, f);
    events(r, f);
    memory(f);
    equipment(r, f);
  }
  results(r);
}

// Helper to draw clean high-contrast rounded HUD pill badges
function drawPillBadge(c, text, x, y, opt = {}) {
  const font = opt.font || 'bold 11px system-ui, -apple-system, sans-serif';
  c.font = font;
  const padX = opt.padX ?? 8;
  const padY = opt.padY ?? 4;
  const metrics = c.measureText(text);
  const textW = metrics.width;
  const textH = opt.fontSize || 12;
  const w = textW + padX * 2;
  const h = textH + padY * 2;
  const rx = opt.center ? Math.round(x - w / 2) : Math.round(x);
  const ry = opt.center ? Math.round(y - h / 2) : Math.round(y);

  // Drop shadow
  c.fillStyle = 'rgba(0, 0, 0, 0.45)';
  c.beginPath();
  c.roundRect(rx + 1, ry + 2, w, h, 4);
  c.fill();

  // Background
  c.fillStyle = opt.bg || '#263A34';
  c.beginPath();
  c.roundRect(rx, ry, w, h, 4);
  c.fill();

  // High-contrast Border
  if (opt.border) {
    c.strokeStyle = opt.border;
    c.lineWidth = opt.borderWidth || 1.5;
    c.stroke();
  }

  // Text
  c.fillStyle = opt.color || '#F3E4BD';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(text, rx + padX, ry + h / 2);
}

// -----------------------------------------------------------------------------
// The Pixel-Art Canvas Scene Renderer (Crisp Native High-Resolution HUD)
// -----------------------------------------------------------------------------
function drawRestaurant(canvas, r, f) {
  if (!canvas) return;
  const box = canvas.getBoundingClientRect();
  if (!box.width || !box.height) return;

  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(box.width);
  const H = Math.round(box.height);

  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  const c = canvas.getContext('2d');
  c.save();
  c.scale(dpr, dpr);
  c.imageSmoothingEnabled = false;

  const now = performance.now();
  const animTick = Math.floor(now / 180);

  // Layout parameters
  const wallH = Math.max(48, Math.floor(H * 0.16));
  const kitchenH = Math.max(160, Math.floor(H * 0.48));
  const passY = kitchenH - 12;

  // 1. FLOORING
  // Checkerboard terracotta tiles for kitchen
  const tileSize = 20;
  for (let y = 0; y < kitchenH; y += tileSize) {
    for (let x = 0; x < W; x += tileSize) {
      c.fillStyle = ((Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0) ? '#D0B27B' : '#C3A36D';
      c.fillRect(x, y, tileSize, tileSize);
    }
  }

  // Oak planks for dining room
  for (let y = kitchenH; y < H; y += 12) {
    c.fillStyle = (Math.floor(y / 12) % 2 === 0) ? '#956448' : '#87573E';
    c.fillRect(0, y, W, 12);
    c.fillStyle = '#684638';
    c.fillRect(0, y, W, 1);
    for (let x = (y * 7) % 48; x < W; x += 48) {
      c.fillRect(x, y, 1, 12);
    }
  }

  // 2. REAR KITCHEN WALL
  c.fillStyle = '#5A382C';
  c.fillRect(0, 0, W, wallH);
  c.fillStyle = '#87573E';
  c.fillRect(0, wallH - 4, W, 4);
  c.fillStyle = '#3B3731';
  c.fillRect(0, wallH, W, 2);

  // Upper shelf with spice jars
  c.fillStyle = '#3B3731';
  c.fillRect(20, Math.floor(wallH * 0.4), W - 40, 4);
  for (let x = 32; x < W - 50; x += 30) {
    const colors = [PALETTE.leaf, PALETTE.hearthGold, PALETTE.tomato, PALETTE.tealSlate];
    c.fillStyle = colors[(x * 5) % colors.length];
    c.fillRect(x, Math.floor(wallH * 0.4) - 9, 10, 9);
    c.fillStyle = PALETTE.linen;
    c.fillRect(x + 2, Math.floor(wallH * 0.4) - 11, 6, 3);
  }

  // Central Clock
  const clockX = Math.floor(W * 0.5);
  const clockY = Math.floor(wallH * 0.4);
  c.fillStyle = PALETTE.warmInk;
  c.fillRect(clockX - 10, clockY - 14, 20, 20);
  c.fillStyle = PALETTE.linen;
  c.fillRect(clockX - 8, clockY - 12, 16, 16);
  c.fillStyle = PALETTE.warmInk;
  c.fillRect(clockX - 1, clockY - 6, 3, 3);
  c.fillRect(clockX, clockY - 9, 2, 5);

  // 3. SERVICE PASS COUNTER
  c.fillStyle = '#684638';
  c.fillRect(0, passY, W, 12);
  c.fillStyle = '#956448';
  c.fillRect(0, passY + 2, W, 8);
  c.fillStyle = '#C48A56';
  c.fillRect(0, passY + 2, W, 2); // Highlight

  // Service pickup bell
  c.fillStyle = PALETTE.hearthGold;
  c.fillRect(W - 48, passY - 4, 10, 6);
  c.fillStyle = PALETTE.warmInk;
  c.fillRect(W - 45, passY - 7, 4, 3);

  // 4. KITCHEN APPLIANCES (Shared Equipment: OVEN_1, OVEN_2, MICROWAVE, COFFEE_MACHINE)
  const appW = Math.min(68, Math.max(54, Math.floor(W * 0.1)));
  const appH = appW;
  const appY = wallH + 6;

  const appliances = [
    { id: 'OVEN_1', name: 'OVEN 1', img: SPRITES.oven },
    { id: 'OVEN_2', name: 'OVEN 2', img: SPRITES.oven },
    { id: 'MICROWAVE', name: 'MICROWAVE', img: SPRITES.microwave },
    { id: 'COFFEE_MACHINE', name: 'COFFEE MACHINE', img: SPRITES.coffeemachine }
  ];

  const totalAppWidth = (appliances.length * appW);
  const availWidth = Math.max(W - 140, totalAppWidth + 60);
  const appGap = Math.max(16, Math.floor((availWidth - totalAppWidth) / 4));

  appliances.forEach((app, idx) => {
    const ax = 20 + idx * (appW + appGap);
    const resData = f.resources ? f.resources.find(r => r.id === app.id) : null;
    const isHeld = !!(resData && resData.holder);
    const waitingOrders = resData && resData.waiting ? resData.waiting : [];

    // Header Title Badge
    drawPillBadge(c, app.name, ax + appW / 2, appY - 8, {
      bg: '#263A34',
      color: '#F3E4BD',
      border: '#684638',
      center: true,
      font: 'bold 11px system-ui, monospace',
      padX: 7,
      padY: 3
    });

    // Draw Appliance Sprite
    if (app.img && app.img.complete && app.img.naturalWidth > 0) {
      c.drawImage(app.img, ax, appY, appW, appH);
    }

    // Active Cooking Animation / Glow
    if (isHeld) {
      c.fillStyle = (animTick % 2 === 0) ? 'rgba(240, 199, 104, 0.45)' : 'rgba(224, 180, 119, 0.35)';
      c.fillRect(ax + 8, appY + appH * 0.45, appW - 16, appH * 0.4);

      // Steam puffs rising
      const puffX = ax + appW * 0.45 + ((animTick % 3) * 4);
      const puffY = appY + 8 - ((animTick % 4) * 3);
      c.fillStyle = 'rgba(243, 228, 189, 0.9)';
      c.fillRect(puffX, puffY, 4, 4);
      c.fillRect(puffX + 3, puffY - 4, 3, 3);
    }

    // Status Pill below sprite
    const badgeY = appY + appH + 10;
    if (isHeld) {
      drawPillBadge(c, `🔥 IN USE: ${resData.holder}`, ax + appW / 2, badgeY, {
        bg: '#B95743',
        color: '#FFFFFF',
        border: '#F0C768',
        borderWidth: 2,
        center: true,
        font: 'bold 11px system-ui, monospace'
      });
    } else {
      drawPillBadge(c, '● READY', ax + appW / 2, badgeY, {
        bg: '#1C3A2E',
        color: '#81B58B',
        border: '#45816A',
        center: true,
        font: 'bold 11px system-ui, monospace'
      });
    }

    // Wait Queue Badge if orders are waiting
    if (waitingOrders.length > 0) {
      drawPillBadge(c, `⏳ WAIT: ${waitingOrders.join(', ')}`, ax + appW / 2, badgeY + 20, {
        bg: '#F0C768',
        color: '#263A34',
        border: '#684638',
        center: true,
        font: 'bold 10px system-ui, monospace'
      });
    }
  });

  // 5. CHEF STATIONS (CPUs: Chef 0 and Chef 1)
  const chef0Id = f.chefs[0];
  const chef1Id = f.chefs[1];
  const p0 = chef0Id ? f.processes.find(p => p.id === chef0Id) : null;
  const p1 = chef1Id ? f.processes.find(p => p.id === chef1Id) : null;

  const chef0Bob = (p0 && p0.state === 'RUNNING') ? (animTick % 2) * 2 : 0;
  const chef1Bob = (p1 && p1.state === 'RUNNING') ? ((animTick + 1) % 2) * 2 : 0;

  const chefW = Math.min(56, Math.max(44, Math.floor(W * 0.08)));
  const chefH = chefW;

  const chef0X = Math.floor(W * 0.22);
  const chef0Y = passY - chefH - 6 + chef0Bob;
  const chef1X = Math.floor(W * 0.54);
  const chef1Y = passY - chefH - 6 + chef1Bob;

  // Chef 0 Sprite
  if (SPRITES.chef0.complete && SPRITES.chef0.naturalWidth > 0) {
    c.drawImage(SPRITES.chef0, chef0X, chef0Y, chefW, chefH);
  }
  // Chef 1 Sprite
  if (SPRITES.chef1.complete && SPRITES.chef1.naturalWidth > 0) {
    c.drawImage(SPRITES.chef1, chef1X, chef1Y, chefW, chefH);
  }

  // Draw Chef Badges
  drawChefHUD(c, chef0X, chef0Y, chefW, chefH, 'CHEF 0', chef0Id, p0, animTick);
  drawChefHUD(c, chef1X, chef1Y, chefW, chefH, 'CHEF 1', chef1Id, p1, animTick);

  // 6. WAITING LOUNGE (SPACE POOL · 6 SEATS)
  const spaceSlots = f.pools.SPACE || [];
  const spaceBaseX = 20;
  const spaceY = passY + 20;
  const chairW = Math.min(38, Math.max(30, Math.floor(W * 0.05)));
  const chairH = chairW;
  const chairGap = Math.min(10, Math.max(4, Math.floor((W * 0.42 - 6 * chairW) / 5)));

  // Lounge rug
  const rugW = (6 * (chairW + chairGap)) + 16;
  c.fillStyle = '#587A78';
  c.fillRect(spaceBaseX - 8, spaceY + 12, rugW, chairH + 34);
  c.fillStyle = '#758B63';
  c.fillRect(spaceBaseX - 6, spaceY + 14, rugW - 4, chairH + 30);

  // Section Header Ribbon
  drawPillBadge(c, '🪑 WAITING LOUNGE (SPACE POOL · 6 SEATS)', spaceBaseX + rugW / 2, spaceY + 4, {
    bg: '#263A34',
    color: '#F3E4BD',
    border: '#A4B47A',
    center: true,
    font: 'bold 11px system-ui, sans-serif'
  });

  spaceSlots.forEach((owner, i) => {
    const cx = spaceBaseX + i * (chairW + chairGap);
    const cy = spaceY + 20;

    // Chair sprite
    if (SPRITES.chair.complete && SPRITES.chair.naturalWidth > 0) {
      c.drawImage(SPRITES.chair, cx, cy, chairW, chairH);
    }

    if (owner) {
      // Seated Customer
      if (SPRITES.diner.complete && SPRITES.diner.naturalWidth > 0) {
        c.drawImage(SPRITES.diner, cx, cy - 8, chairW, chairH);
      }
      // Seat Pill: Occupied
      drawPillBadge(c, `S${i + 1}: ${owner}`, cx + chairW / 2, cy + chairH + 8, {
        bg: '#B95743',
        color: '#FFFFFF',
        border: '#F0C768',
        center: true,
        font: 'bold 11px monospace',
        padX: 4,
        padY: 2
      });
    } else {
      // Seat Pill: Free
      drawPillBadge(c, `S${i + 1} [OPEN]`, cx + chairW / 2, cy + chairH + 8, {
        bg: '#3B3731',
        color: '#A4B47A',
        center: true,
        font: 'bold 10px monospace',
        padX: 4,
        padY: 2
      });
    }
  });

  // 7. DINING ROOM (TABLE POOL · 3 TABLES)
  const tableSlots = f.pools.TABLE || [];
  const tableW = Math.min(64, Math.max(50, Math.floor(W * 0.085)));
  const tableH = tableW;
  const tableBaseX = Math.max(W * 0.52, W - (3 * tableW + 80));
  const tableY = passY + 20;
  const tableGap = Math.min(22, Math.max(12, Math.floor((W - tableBaseX - 3 * tableW - 30) / 2)));

  // Section Header Ribbon
  const diningAreaW = (3 * tableW + 2 * tableGap) + 24;
  drawPillBadge(c, '🍽️ DINING ROOM (TABLE POOL · 3 TABLES)', tableBaseX + diningAreaW / 2, tableY + 4, {
    bg: '#263A34',
    color: '#F3E4BD',
    border: '#C48A56',
    center: true,
    font: 'bold 11px system-ui, sans-serif'
  });

  tableSlots.forEach((owner, i) => {
    const tx = tableBaseX + i * (tableW + tableGap) + 12;
    const ty = tableY + 20;

    if (owner) {
      // Occupied Table: seated customer enjoying meal
      if (SPRITES.diner.complete && SPRITES.diner.naturalWidth > 0) {
        c.drawImage(SPRITES.diner, tx + 6, ty - 12, tableW * 0.8, tableH * 0.8);
      }
      if (SPRITES.tableMeal.complete && SPRITES.tableMeal.naturalWidth > 0) {
        c.drawImage(SPRITES.tableMeal, tx, ty, tableW, tableH);
      }
      // Table Badge: Occupied
      drawPillBadge(c, `T${i + 1}: ${owner} [SERVED]`, tx + tableW / 2, ty + tableH + 8, {
        bg: '#F0C768',
        color: '#263A34',
        border: '#B95743',
        borderWidth: 2,
        center: true,
        font: 'bold 11px monospace'
      });
    } else {
      // Empty Table
      if (SPRITES.tableEmpty.complete && SPRITES.tableEmpty.naturalWidth > 0) {
        c.drawImage(SPRITES.tableEmpty, tx, ty, tableW, tableH);
      }
      // Table Badge: Open
      drawPillBadge(c, `TABLE ${i + 1} [OPEN]`, tx + tableW / 2, ty + tableH + 8, {
        bg: '#3B3731',
        color: '#F3E4BD',
        center: true,
        font: 'bold 10px monospace'
      });
    }
  });

  // 8. ENTRANCE & QUEUE (Top Right)
  const doorW = 32, doorH = 54;
  const doorX = W - doorW - 16;
  const doorY = wallH + 4;

  c.fillStyle = '#684638';
  c.fillRect(doorX, doorY, doorW, doorH);
  c.fillStyle = '#956448';
  c.fillRect(doorX + 2, doorY + 2, doorW - 4, doorH - 4);
  c.fillStyle = PALETTE.hearthGold;
  c.fillRect(doorX + doorW - 8, doorY + doorH * 0.5, 4, 4);

  // Entrance Header
  drawPillBadge(c, '🚪 ENTRANCE', doorX + doorW / 2, doorY - 8, {
    bg: '#263A34',
    color: '#F3E4BD',
    center: true,
    font: 'bold 10px monospace'
  });

  // Memory Queue Badge
  const memQueue = (f.queues && f.queues.memory) ? f.queues.memory : [];
  if (memQueue.length > 0) {
    drawPillBadge(c, `WAITING ADMISSION: ${memQueue.join(', ')}`, doorX - 60, doorY + 24, {
      bg: '#B95743',
      color: '#FFFFFF',
      border: '#F0C768',
      center: true,
      font: 'bold 11px system-ui, monospace'
    });
  }

  // 9. BOTTOM EVENT STATUS TICKER STRIP (Crisp High-Contrast HUD Bar)
  const stripH = 26;
  c.fillStyle = PALETTE.nightPine;
  c.fillRect(0, H - stripH, W, stripH);
  c.fillStyle = PALETTE.hearthGold;
  c.fillRect(0, H - stripH, W, 2); // Gold top border

  const ev = (f.events && f.events.length) ? f.events[f.events.length - 1] : null;
  const evText = ev ? `[${ev.process_id || 'DINER'}] ${NAMES[ev.type] || ev.type}${ev.resource ? ' (' + ev.resource + ')' : ''}` : 'RESTAURANT SERVICE ACTIVE';

  c.font = 'bold 12px system-ui, -apple-system, monospace';
  c.fillStyle = '#F3E4BD';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(`⏱ TICK ${f.time}  │  ${evText}`, 16, H - stripH / 2);

  const activeOrdersCount = f.processes.filter(p => p.state === 'RUNNING' || p.state === 'READY' || p.state === 'BLOCKED_RESOURCE').length;
  c.textAlign = 'right';
  c.fillStyle = '#A4B47A';
  c.fillText(`ACTIVE ORDERS: ${activeOrdersCount} / ${f.processes.length}`, W - 16, H - stripH / 2);

  c.restore();
}

function drawChefHUD(c, x, y, w, h, title, orderId, p, animTick) {
  // Top Title Badge
  drawPillBadge(c, title, x + w / 2, y - 8, {
    bg: '#263A34',
    color: '#F3E4BD',
    border: '#587A78',
    center: true,
    font: 'bold 11px system-ui, monospace',
    padX: 6,
    padY: 2
  });

  const badgeY = y + h + 10;

  if (!orderId) {
    // Idle
    drawPillBadge(c, '● IDLE', x + w / 2, badgeY, {
      bg: '#1C3A2E',
      color: '#81B58B',
      border: '#39775E',
      center: true,
      font: 'bold 11px system-ui, monospace'
    });
  } else if (p && p.state === 'BLOCKED_RESOURCE') {
    // Blocked on equipment
    drawPillBadge(c, `⏳ WAITING: ${p.waits_for || 'EQUIPMENT'}`, x + w / 2, badgeY, {
      bg: '#B95743',
      color: '#FFFFFF',
      border: '#F0C768',
      borderWidth: 2,
      center: true,
      font: 'bold 11px system-ui, monospace'
    });
  } else {
    // Actively cooking
    const cooked = p ? p.executed_service : 0;
    const remaining = p ? p.remaining_service : 0;
    const total = cooked + remaining;
    const progText = total > 0 ? ` (${cooked}/${total})` : '';

    drawPillBadge(c, `🍳 COOKING: ${orderId}${progText}`, x + w / 2, badgeY, {
      bg: '#758B63',
      color: '#FFFFFF',
      border: '#F0C768',
      borderWidth: 1.5,
      center: true,
      font: 'bold 11px system-ui, monospace'
    });

    // Cooking steam puffs rising from pan
    const sx = x + w * 0.75 + (animTick % 3) * 3;
    const sy = y + 16 - ((animTick % 4) * 4);
    c.fillStyle = 'rgba(243, 228, 189, 0.9)';
    c.fillRect(sx, sy, 4, 4);
    c.fillRect(sx + 3, sy - 5, 3, 3);
  }
}

// -----------------------------------------------------------------------------
// Fullscreen Control
// -----------------------------------------------------------------------------
function toggleFullscreen() {
  const scene = $('restaurant-scene');
  const overlay = $('fullscreen-overlay');
  const btn = $('btn-fullscreen');
  if (!scene) return;

  const isFs = document.fullscreenElement || document.webkitFullscreenElement || scene.classList.contains('is-fullscreen');

  if (isFs) {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
    scene.classList.remove('is-fullscreen');
    if (overlay) overlay.classList.add('hidden');
    if (btn) btn.textContent = '⛶ Fullscreen';
  } else {
    if (scene.requestFullscreen) {
      scene.requestFullscreen().catch(() => {
        // Fallback for sandboxed environments
        scene.classList.add('is-fullscreen');
      });
    } else if (scene.webkitRequestFullscreen) {
      scene.webkitRequestFullscreen();
    } else {
      scene.classList.add('is-fullscreen');
    }
    if (overlay) overlay.classList.remove('hidden');
    if (btn) btn.textContent = '✕ Exit Fullscreen';
  }

  setTimeout(() => render(), 150);
}

document.addEventListener('fullscreenchange', () => {
  const scene = $('restaurant-scene');
  const overlay = $('fullscreen-overlay');
  const btn = $('btn-fullscreen');
  const isFs = !!document.fullscreenElement;

  if (scene) scene.classList.toggle('is-fullscreen', isFs);
  if (overlay) overlay.classList.toggle('hidden', !isFs);
  if (btn) btn.textContent = isFs ? '✕ Exit Fullscreen' : '⛶ Fullscreen';

  render();
});


// -----------------------------------------------------------------------------
// Initialization & Event Wiring
// -----------------------------------------------------------------------------
function init() {
  examples();

  // File Inputs
  ['file-input', 'modal-file-input', 'server-file-input'].forEach(id => {
    const el = $(id);
    if (el) {
      el.onchange = e => {
        importFiles(e.target.files);
        e.target.value = '';
      };
    }
  });

  // Workload selection change
  $('sel-workload')?.addEventListener('change', e => {
    if (e.target.value === 'custom') {
      $('server-file-input')?.click();
    }
  });

  // Buttons
  $('btn-start-sim')?.addEventListener('click', triggerStartSimulation);
  $('btn-ws-reconnect')?.addEventListener('click', connectWebSocket);

  $('btn-fullscreen')?.addEventListener('click', toggleFullscreen);
  $('btn-exit-fullscreen')?.addEventListener('click', toggleFullscreen);

  // Fullscreen HUD Buttons
  $('fs-play-btn')?.addEventListener('click', play);
  $('fs-step-btn')?.addEventListener('click', stepForward);
  $('fs-step-back-btn')?.addEventListener('click', stepBackward);
  $('fs-restart-btn')?.addEventListener('click', () => seek(0));
  $('fs-speed-btn')?.addEventListener('click', changeSpeed);

  $('load-more')?.addEventListener('click', showCases);
  $('close-modal')?.addEventListener('click', () => $('case-modal')?.classList.add('hidden'));
  $('case-modal')?.addEventListener('click', e => {
    if (e.target.id === 'case-modal') e.currentTarget.classList.add('hidden');
  });

  $('play-button')?.addEventListener('click', play);
  $('step-button')?.addEventListener('click', stepForward);
  $('step-back-button')?.addEventListener('click', stepBackward);
  $('restart-button')?.addEventListener('click', () => seek(0));
  $('timeline')?.addEventListener('input', e => seek(e.target.value));
  $('speed-button')?.addEventListener('click', changeSpeed);
  $('sort-button')?.addEventListener('click', () => {
    state.arrival = !state.arrival;
    render();
  });
  $('save-button')?.addEventListener('click', download);

  // Keyboard Navigation
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.code === 'Space' && state.runs.length) {
      e.preventDefault();
      play();
    }
    if (e.key === 'ArrowRight' && state.runs.length) stepForward();
    if (e.key === 'ArrowLeft' && state.runs.length) stepBackward();
    if (e.key === 'Escape') $('case-modal')?.classList.add('hidden');
  });

  window.addEventListener('resize', () => {
    if (state.runs.length) render();
  });

  // Auto-connect to WebSocket server
  connectWebSocket();

  // Load first example as default preview
  if (EXAMPLES.length > 0) {
    loadExample(EXAMPLES[0]);
  }
}

document.addEventListener('DOMContentLoaded', init);
