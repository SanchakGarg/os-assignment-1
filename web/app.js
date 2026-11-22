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

  $('run-title').textContent = r.run.id || 'Dinner service';
  $('origin-badge').textContent = r.run.origin === 'SYNTHETIC' ? 'SYNTHETIC EXAMPLE' : 'RECORDED RUN';
  $('origin-badge').classList.toggle('recorded', r.run.origin === 'RECORDED');
  $('run-meta').textContent = `${r.run.phase || 'A3'} · ${r.run.scheduler} · ${r.run.allocator} · ${r.model.processes.length} orders`;

  if (f) {
    $('time-chip').textContent = `TICK ${f.time}`;
    $('time-display').textContent = String(f.time).padStart(2, '0');
  }

  $('frame-count').textContent = `FRAME ${state.frame + 1} / ${Math.max(1, r.frames.length)}`;
  $('timeline').max = Math.max(0, r.frames.length - 1);
  $('timeline').value = state.frame;
  $('timeline-end').textContent = `TICK ${r.run.end_time || (f ? f.time : 0)}`;
  $('order-count').textContent = r.model.processes.length;

  $('play-button').textContent = state.playing ? 'Ⅱ' : '▶';
  $('speed-button').textContent = `${state.speed}×`;

  if (f) {
    drawRestaurant($('game-canvas'), r, f);
    orders(r, f);
    events(r, f);
    memory(f);
    equipment(r, f);
  }
  results(r);
}

function orders(r, f) {
  const list = [...f.processes];
  list.sort((a, b) => {
    if (state.arrival) {
      const sa = r.model.processes.find(x => x.id === a.id)?.arrival ?? 0;
      const sb = r.model.processes.find(x => x.id === b.id)?.arrival ?? 0;
      return sa - sb;
    }
    return a.id.localeCompare(b.id);
  });

  $('sort-button').textContent = state.arrival ? 'BY ARRIVAL ↕' : 'BY ID ↕';
  $('order-list').replaceChildren(...list.map(p => {
    const spec = r.model.processes.find(x => x.id === p.id) || { category: 'NORMAL', service: p.executed_service + p.remaining_service };
    const row = document.createElement('div');
    row.className = 'order-row';

    const s1 = document.createElement('span');
    s1.className = 'order-stamp';
    s1.textContent = p.id;

    const s2 = document.createElement('span');
    s2.className = 'order-detail';
    const holdsText = p.holds && p.holds.length ? ` · holding ${p.holds.join(',')}` : '';
    const waitText = p.waits_for ? ` · waiting ${p.waits_for}` : '';
    s2.textContent = `${spec.category} · ${p.executed_service}/${spec.service} cooked${holdsText}${waitText}`;

    const s3 = document.createElement('span');
    s3.className = 'state-badge state-' + p.state;
    s3.textContent = p.state.replace('BLOCKED_', 'WAIT ');

    row.append(s1, s2, s3);
    return row;
  }));
}

function events(r, f) {
  const recent = [];
  for (let i = state.frame; i >= 0 && recent.length < 7; i--) {
    const fr = r.frames[i];
    if (fr && fr.events) {
      for (const e of [...fr.events].reverse()) {
        recent.push({ time: fr.time, event: e });
      }
    }
  }
  if (!recent.length) {
    recent.push({ time: f.time, event: { type: 'ARRIVE', reason: 'The dining room is ready.' } });
  }

  $('event-list').replaceChildren(...recent.slice(0, 7).map(x => {
    const row = document.createElement('div');
    row.className = 'event-row';

    const tm = document.createElement('span');
    tm.className = 'event-time';
    tm.textContent = String(x.time).padStart(2, '0');

    const body = document.createElement('span');
    const type = document.createElement('span');
    type.className = 'event-type';
    type.textContent = (NAMES[x.event.type] || x.event.type || 'Update').toUpperCase();

    body.append(
      type,
      document.createElement('br'),
      document.createTextNode(`${x.event.process_id ? x.event.process_id + ' · ' : ''}${x.event.resource ? '[' + x.event.resource + '] ' : ''}${x.event.reason || NAMES[x.event.type] || 'Restaurant updated'}`)
    );

    row.append(tm, body);
    return row;
  }));
}

function memory(f) {
  $('memory-pools').replaceChildren(...[['SPACE', f.pools.SPACE], ['TABLE', f.pools.TABLE]].map(([name, slots]) => {
    const wrap = document.createElement('div');
    const title = document.createElement('div');
    const cells = document.createElement('div');

    title.className = 'pool-name';
    title.innerHTML = `<strong>${name}</strong><span>${slots.filter(Boolean).length}/${slots.length} IN USE</span>`;
    cells.className = 'pool-slots';

    cells.replaceChildren(...slots.map((owner, i) => {
      const e = document.createElement('div');
      e.className = 'memory-slot' + (owner ? (name === 'TABLE' ? ' table-owned' : ' owned') : '');
      e.title = `${name} slot ${i + 1}: ${owner || 'free'}`;
      e.textContent = i;
      const sub = document.createElement('span');
      sub.textContent = owner || 'free';
      e.append(sub);
      return e;
    }));

    wrap.append(title, cells);
    return wrap;
  }));
}

function equipment(r, f) {
  const list = f.resources || [];
  $('resource-summary').textContent = r.run.phase === 'A2' ? 'Equipment added in A3' : `${list.length} DECLARED ITEMS`;

  $('resource-list').replaceChildren(...list.map(x => {
    const e = document.createElement('div');
    e.className = 'resource-tile' + (x.holder ? ' held' : '');

    const n = document.createElement('div');
    n.className = 'resource-name';
    n.textContent = x.id.replace('_', ' ');

    const o = document.createElement('div');
    o.className = 'resource-owner';
    const waitingList = x.waiting && x.waiting.length ? ` (Queue: ${x.waiting.join(', ')})` : '';
    o.textContent = x.holder ? `In use by ${x.holder}${waitingList}` : 'Ready for cooking';

    e.append(n, o);
    return e;
  }));
}

function results(r) {
  const s = r.results.summary;
  const values = [
    ['AVG WAIT', s.average_waiting],
    ['AVG TURNAROUND', s.average_turnaround],
    ['CHEF USE', s.service_utilization_pct != null ? `${s.service_utilization_pct}%` : '...'],
    ['THROUGHPUT', s.throughput],
    ['MEM WAIT', s.average_memory_wait ?? '...'],
    ['RES WAIT', s.average_resource_wait ?? '0.00']
  ];

  $('summary-stats').replaceChildren(...values.map(([label, value]) => {
    const e = document.createElement('div');
    e.className = 'stat';
    const a = document.createElement('span');
    const b = document.createElement('strong');
    a.textContent = label;
    b.textContent = typeof value === 'number' ? Number(value.toFixed(2)) : value;
    e.append(a, b);
    return e;
  }));
}

function showCases() {
  $('case-modal').classList.remove('hidden');
  const choices = [];

  for (const x of EXAMPLES) {
    const b = document.createElement('button');
    b.className = 'case-choice';
    b.textContent = x.name;
    const sm = document.createElement('small');
    sm.textContent = 'OPEN PRESET RECORDING';
    b.append(sm);
    b.onclick = () => {
      stop();
      loadExample(x);
      $('case-modal').classList.add('hidden');
    };
    choices.push(b);
  }

  for (const [i, r] of state.runs.entries()) {
    const b = document.createElement('button');
    b.className = 'case-choice';
    b.textContent = `${r.run.id}${i === state.active ? ' · ACTIVE' : ''}`;
    const sm = document.createElement('small');
    sm.textContent = `${r.run.phase} · ${r.run.scheduler} · ${r.run.allocator} · ${r.model.processes.length} orders`;
    b.append(sm);
    b.onclick = () => {
      stop();
      state.active = i;
      state.frame = 0;
      $('case-modal').classList.add('hidden');
      render();
    };
    choices.push(b);
  }

  $('case-list').replaceChildren(...choices);
}

// -----------------------------------------------------------------------------
// The Pixel-Art Canvas Scene Renderer
// -----------------------------------------------------------------------------
function drawRestaurant(canvas, r, f) {
  if (!canvas) return;
  const box = canvas.getBoundingClientRect();
  if (!box.width || !box.height) return;

  const scale = 2; // integer pixel scale
  const W = Math.max(1, Math.floor(box.width / scale));
  const H = Math.max(1, Math.floor(box.height / scale));

  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }

  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;

  const now = performance.now();
  const animTick = Math.floor(now / 180);

  // 1. DINING ROOM & KITCHEN FLOORING
  // Checkerboard floor for kitchen (top half)
  const kitchenH = Math.floor(H * 0.48);
  const tileSize = 16;

  for (let y = 0; y < kitchenH; y += tileSize) {
    for (let x = 0; x < W; x += tileSize) {
      c.fillStyle = ((x / tileSize + y / tileSize) % 2 === 0) ? '#D0B27B' : '#C3A36D';
      c.fillRect(x, y, tileSize, tileSize);
    }
  }

  // Oak plank floor for dining area (bottom half)
  for (let y = kitchenH; y < H; y += 8) {
    c.fillStyle = (Math.floor(y / 8) % 2 === 0) ? '#956448' : '#87573E';
    c.fillRect(0, y, W, 8);
    // Plank joint lines
    c.fillStyle = '#684638';
    c.fillRect(0, y, W, 1);
    for (let x = (y * 5) % 32; x < W; x += 32) {
      c.fillRect(x, y, 1, 8);
    }
  }

  // 2. REAR KITCHEN WALL
  c.fillStyle = '#684638';
  c.fillRect(0, 0, W, 32);
  c.fillStyle = '#956448';
  c.fillRect(0, 30, W, 3);
  c.fillStyle = '#3B3731';
  c.fillRect(0, 32, W, 2);

  // Decorative Wall Shelf with Spices & Vintage Copper Pot
  c.fillStyle = '#3B3731';
  c.fillRect(16, 12, W - 32, 3);
  for (let x = 24; x < W - 32; x += 22) {
    // Spice jar
    const colors = [PALETTE.leaf, PALETTE.hearthGold, PALETTE.tomato, PALETTE.tealSlate];
    c.fillStyle = colors[(x * 7) % colors.length];
    c.fillRect(x, 6, 7, 6);
    c.fillStyle = PALETTE.linen;
    c.fillRect(x + 1, 5, 5, 2);
  }

  // Vintage wall clock in center
  const clockX = Math.floor(W * 0.5);
  c.fillStyle = PALETTE.warmInk;
  c.fillRect(clockX - 7, 4, 14, 14);
  c.fillStyle = PALETTE.linen;
  c.fillRect(clockX - 5, 6, 10, 10);
  c.fillStyle = PALETTE.warmInk;
  c.fillRect(clockX - 1, 10, 3, 2); // Hands
  c.fillRect(clockX, 8, 1, 3);

  // 3. SERVICE PASS COUNTER (separates kitchen from dining room)
  const passY = kitchenH - 6;
  c.fillStyle = '#684638';
  c.fillRect(0, passY, W, 10);
  c.fillStyle = '#956448';
  c.fillRect(0, passY + 2, W, 6);
  c.fillStyle = '#C48A56';
  c.fillRect(0, passY + 2, W, 1); // Counter edge highlight

  // Service pickup bell on counter
  c.fillStyle = PALETTE.hearthGold;
  c.fillRect(W - 40, passY - 3, 7, 5);
  c.fillStyle = PALETTE.warmInk;
  c.fillRect(W - 38, passY - 5, 3, 2);

  // 4. KITCHEN APPLIANCES (A3 Shared Equipment)
  // Placement: OVEN_1, OVEN_2, MICROWAVE, COFFEE_MACHINE
  const appY = 32;
  const appliances = [
    { id: 'OVEN_1', name: 'OVEN 1', img: SPRITES.oven, x: 20 },
    { id: 'OVEN_2', name: 'OVEN 2', img: SPRITES.oven, x: 90 },
    { id: 'MICROWAVE', name: 'MICROWAVE', img: SPRITES.microwave, x: 160 },
    { id: 'COFFEE_MACHINE', name: 'COFFEE', img: SPRITES.coffeemachine, x: 230 }
  ];

  appliances.forEach(app => {
    const resData = f.resources ? f.resources.find(r => r.id === app.id) : null;
    const isHeld = !!(resData && resData.holder);
    const waitingOrders = resData && resData.waiting ? resData.waiting : [];

    // Draw sprite (64x64 scaled to 48x48)
    const dw = 48, dh = 48;
    if (app.img && app.img.complete && app.img.naturalWidth > 0) {
      c.drawImage(app.img, app.x, appY, dw, dh);
    }

    // Active cooking glow effect when held
    if (isHeld) {
      // Warm glow behind/around
      c.fillStyle = (animTick % 2 === 0) ? 'rgba(240, 199, 104, 0.45)' : 'rgba(224, 180, 119, 0.35)';
      c.fillRect(app.x + 8, appY + 26, dw - 16, 14);

      // Steam / flame puffs
      const puffX = app.x + 20 + ((animTick % 3) * 3);
      const puffY = appY + 14 - ((animTick % 4) * 2);
      c.fillStyle = 'rgba(243, 228, 189, 0.8)';
      c.fillRect(puffX, puffY, 3, 3);
    }

    // Badge showing Holder
    const labelY = appY + dh + 1;
    c.font = 'bold 6px monospace';
    if (isHeld) {
      c.fillStyle = PALETTE.tomato;
      c.fillRect(app.x + 4, labelY, dw - 8, 8);
      c.fillStyle = PALETTE.linen;
      c.fillText(`USE: ${resData.holder}`, app.x + 6, labelY + 6);
    } else {
      c.fillStyle = PALETTE.warmInk;
      c.fillRect(app.x + 6, labelY, dw - 12, 7);
      c.fillStyle = PALETTE.leaf;
      c.fillText('READY', app.x + 14, labelY + 6);
    }

    // Wait queue badge if orders are waiting
    if (waitingOrders.length > 0) {
      c.fillStyle = '#E0B477';
      c.fillRect(app.x + 4, labelY + 9, dw - 8, 7);
      c.fillStyle = '#263A34';
      c.fillText(`WAIT: ${waitingOrders.join(',')}`, app.x + 6, labelY + 15);
    }
  });

  // 5. CHEF STATIONS (CPUs: Chef 0 and Chef 1)
  const chef0Id = f.chefs[0];
  const chef1Id = f.chefs[1];
  const p0 = chef0Id ? f.processes.find(p => p.id === chef0Id) : null;
  const p1 = chef1Id ? f.processes.find(p => p.id === chef1Id) : null;

  const chef0Bob = (p0 && p0.state === 'RUNNING') ? (animTick % 2) : 0;
  const chef1Bob = (p1 && p1.state === 'RUNNING') ? ((animTick + 1) % 2) : 0;

  // Station positions
  const chef0X = 60, chef0Y = passY - 38 + chef0Bob;
  const chef1X = 135, chef1Y = passY - 38 + chef1Bob;

  // Draw Chef 0 (chef-cook-01.png)
  if (SPRITES.chef0.complete && SPRITES.chef0.naturalWidth > 0) {
    c.drawImage(SPRITES.chef0, chef0X, chef0Y, 44, 44);
  }
  // Draw Chef 1 (chef-cook-02.png)
  if (SPRITES.chef1.complete && SPRITES.chef1.naturalWidth > 0) {
    c.drawImage(SPRITES.chef1, chef1X, chef1Y, 44, 44);
  }

  // Chef labels & state tags
  drawChefTag(c, chef0X, chef0Y, 'CHEF 0', chef0Id, p0, animTick);
  drawChefTag(c, chef1X, chef1Y, 'CHEF 1', chef1Id, p1, animTick);

  // 6. WAITING LOUNGE (SPACE POOL - 6 Seats)
  // Drawn on the bottom left (x: 10..180, y: passY + 24)
  const spaceSlots = f.pools.SPACE || [];
  const spaceBaseX = 14;
  const spaceY = passY + 22;

  // Lounge rug under chairs
  c.fillStyle = '#587A78';
  c.fillRect(spaceBaseX - 4, spaceY + 4, (6 * 26) + 8, 38);
  c.fillStyle = '#758B63';
  c.fillRect(spaceBaseX - 2, spaceY + 6, (6 * 26) + 4, 34);

  // Label
  c.font = 'bold 6px monospace';
  c.fillStyle = PALETTE.linen;
  c.fillText('WAITING SEATS (SPACE POOL · 6 SLOTS)', spaceBaseX, spaceY + 2);

  spaceSlots.forEach((owner, i) => {
    const chairX = spaceBaseX + (i * 26);
    const chairY = spaceY + 8;

    // Draw chair sprite (32x32)
    if (SPRITES.chair.complete && SPRITES.chair.naturalWidth > 0) {
      c.drawImage(SPRITES.chair, chairX, chairY, 26, 26);
    }

    // If occupied by an order, draw seated diner sprite!
    if (owner) {
      if (SPRITES.diner.complete && SPRITES.diner.naturalWidth > 0) {
        c.drawImage(SPRITES.diner, chairX, chairY - 6, 26, 26);
      }
      // Order tag pill
      c.fillStyle = PALETTE.tomato;
      c.fillRect(chairX + 2, chairY + 22, 22, 7);
      c.fillStyle = PALETTE.linen;
      c.fillText(owner, chairX + 4, chairY + 28);
    } else {
      // Free seat marker
      c.fillStyle = PALETTE.warmInk;
      c.fillRect(chairX + 4, chairY + 23, 18, 6);
      c.fillStyle = PALETTE.leaf;
      c.fillText(`S${i+1}`, chairX + 6, chairY + 28);
    }
  });

  // 7. DINING ROOM (TABLE POOL - 3 Tables)
  // Drawn on the bottom right (x: 190..W-20, y: passY + 20)
  const tableSlots = f.pools.TABLE || [];
  const tableBaseX = Math.max(195, W - 180);
  const tableY = passY + 18;

  c.font = 'bold 6px monospace';
  c.fillStyle = PALETTE.warmInk;
  c.fillText('DINING ROOM (TABLE POOL · 3 TABLES)', tableBaseX, tableY);

  tableSlots.forEach((owner, i) => {
    const tx = tableBaseX + (i * 54);
    const ty = tableY + 6;

    if (owner) {
      // Occupied: draw customer diner enjoying dinner + table with hearty meal!
      if (SPRITES.diner.complete && SPRITES.diner.naturalWidth > 0) {
        c.drawImage(SPRITES.diner, tx + 8, ty - 10, 36, 36);
      }
      if (SPRITES.tableMeal.complete && SPRITES.tableMeal.naturalWidth > 0) {
        c.drawImage(SPRITES.tableMeal, tx, ty + 2, 48, 48);
      }
      // Order tag
      c.fillStyle = PALETTE.hearthGold;
      c.fillRect(tx + 8, ty + 42, 32, 8);
      c.fillStyle = PALETTE.warmInk;
      c.fillText(`T${i+1}: ${owner}`, tx + 10, ty + 48);
    } else {
      // Empty table
      if (SPRITES.tableEmpty.complete && SPRITES.tableEmpty.naturalWidth > 0) {
        c.drawImage(SPRITES.tableEmpty, tx, ty + 2, 48, 48);
      }
      c.fillStyle = PALETTE.warmInk;
      c.fillRect(tx + 10, ty + 42, 28, 7);
      c.fillStyle = PALETTE.linen;
      c.fillText(`T${i+1} OPEN`, tx + 12, ty + 48);
    }
  });

  // 8. RESTAURANT ENTRANCE & MEMORY QUEUE (top right)
  const doorX = W - 32;
  const doorY = 32;
  c.fillStyle = '#684638';
  c.fillRect(doorX, doorY, 26, 46);
  c.fillStyle = '#956448';
  c.fillRect(doorX + 2, doorY + 2, 22, 42);
  c.fillStyle = PALETTE.hearthGold;
  c.fillRect(doorX + 20, doorY + 22, 3, 3); // Knob

  // Welcome mat
  c.fillStyle = PALETTE.warmInk;
  c.fillRect(doorX - 2, doorY + 44, 28, 6);
  c.fillStyle = PALETTE.linen;
  c.font = '5px monospace';
  c.fillText('DOOR', doorX + 4, doorY + 48);

  // Queue of customers waiting for memory admission (outside door)
  const memQueue = (f.queues && f.queues.memory) ? f.queues.memory : [];
  if (memQueue.length > 0) {
    c.font = 'bold 5px monospace';
    c.fillStyle = PALETTE.tomato;
    c.fillText(`QUEUE (${memQueue.length})`, doorX - 34, doorY + 6);

    memQueue.slice(0, 3).forEach((id, qIdx) => {
      const qx = doorX - 16 - (qIdx * 14);
      const qy = doorY + 12;
      if (SPRITES.diner.complete && SPRITES.diner.naturalWidth > 0) {
        c.drawImage(SPRITES.diner, qx, qy, 18, 18);
      }
      c.fillStyle = PALETTE.warmInk;
      c.fillRect(qx, qy + 16, 14, 5);
      c.fillStyle = PALETTE.linen;
      c.fillText(id, qx + 1, qy + 20);
    });
  }

  // 9. BOTTOM EVENT STATUS TICKER STRIP
  c.fillStyle = PALETTE.nightPine;
  c.fillRect(0, H - 12, W, 12);
  c.fillStyle = PALETTE.linen;
  c.font = 'bold 7px monospace';

  const ev = (f.events && f.events.length) ? f.events[f.events.length - 1] : null;
  const evText = ev ? `TICK ${f.time} · [${ev.process_id || 'RESTAURANT'}] ${NAMES[ev.type] || ev.type}${ev.resource ? ' (' + ev.resource + ')' : ''}` : `TICK ${f.time} · SERVICE RUNNING`;
  c.fillText(evText, 8, H - 3);
}

function drawChefTag(c, x, y, title, orderId, p, animTick) {
  c.font = 'bold 6px monospace';

  if (!orderId) {
    // Idle chef
    c.fillStyle = PALETTE.warmInk;
    c.fillRect(x + 2, y + 42, 40, 7);
    c.fillStyle = PALETTE.linen;
    c.fillText(`${title}: IDLE`, x + 4, y + 48);
  } else if (p && p.state === 'BLOCKED_RESOURCE') {
    // Blocked on equipment
    c.fillStyle = '#B95743';
    c.fillRect(x - 2, y + 42, 48, 8);
    c.fillStyle = '#FFFFFF';
    c.fillText(`⏳ ${orderId} WAIT`, x, y + 48);

    // Thought bubble
    c.fillStyle = PALETTE.linen;
    c.fillRect(x + 36, y + 2, 18, 10);
    c.fillStyle = PALETTE.warmInk;
    c.fillText(p.waits_for ? p.waits_for.slice(0, 4) : 'GEAR', x + 38, y + 9);
  } else {
    // Actively cooking
    c.fillStyle = PALETTE.sage;
    c.fillRect(x - 4, y + 42, 52, 8);
    c.fillStyle = PALETTE.linen;
    c.fillText(`${title}: ${orderId}`, x - 2, y + 48);

    // Steam particles rising from pan
    const sx = x + 34 + (animTick % 3);
    const sy = y + 18 - ((animTick % 4) * 3);
    c.fillStyle = 'rgba(243, 228, 189, 0.85)';
    c.fillRect(sx, sy, 3, 3);
    c.fillRect(sx + 3, sy - 4, 2, 2);
  }
}

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
