/*
 * Everything around the scene: the start menu, the HUD controls, the caption
 * of what happens this cycle, the log drawer, and the results and deadlock
 * screens. main.js wires these to the playback clock and the server.
 */
(function () {
  const P = RV.Playback, Nr = RV.Narrate;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const U = (RV.UI = {
    settings: { scenario: null, scheduler: "FCFS", allocator: "FIRST_FIT", unsafe: false, speed: 1 },
    onStart: null,
  });

  /* ---------- menu (option windows with a ▶ cursor) ---------- */

  const PICKS = ["scenario", "scheduler", "allocator", "deadlock"];
  let activePick = "scenario";
  const secs = v => `${+v.toFixed(2)} s`;

  function setChoice(group, value) {
    document.querySelectorAll(`.pk-list[data-group=${group}] li`).forEach(li =>
      li.classList.toggle("on", li.dataset.value === value));
  }

  function currentValue(group) {
    const s = U.settings;
    return group === "scenario" ? s.scenario : group === "deadlock" ? (s.unsafe ? "off" : "on") : s[group];
  }

  function applySettingsToMenu() {
    for (const g of PICKS) setChoice(g, currentValue(g));
    document.querySelectorAll(".pick").forEach(w => w.classList.toggle("active", w.dataset.pick === activePick));
    $("menuSpeed").value = U.settings.speed;
    $("menuSpeedVal").textContent = `${secs(U.settings.speed)} per cycle`;
  }

  function describe(li) {
    if (li) $("menuDesc").textContent = li.dataset.desc;
  }

  function choose(group, value) {
    if (group === "scenario") return U.selectScenario(value);
    if (group === "deadlock") U.settings.unsafe = value === "off";
    else U.settings[group] = value;
    applySettingsToMenu();
  }

  /* ↑ ↓ moves the cursor in the active window, ← → switches window. */
  function menuKey(e) {
    const k = e.key;
    if (k === "Enter") { e.preventDefault(); $("btnStart").click(); return; }
    if (k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      const i = PICKS.indexOf(activePick) + (k === "ArrowRight" ? 1 : -1);
      activePick = PICKS[(i + PICKS.length) % PICKS.length];
      applySettingsToMenu();
      describe(document.querySelector(`.pk-list[data-group=${activePick}] li.on`));
      return;
    }
    if (k !== "ArrowUp" && k !== "ArrowDown") return;
    e.preventDefault();
    const items = [...document.querySelectorAll(`.pk-list[data-group=${activePick}] li`)];
    const i = items.findIndex(li => li.classList.contains("on"));
    const next = items[(i + (k === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    choose(activePick, next.dataset.value);
    describe(next);
  }

  U.selectScenario = function (key, keepSettings) {
    const sc = RV.SCENARIOS.find(s => s.key === key);
    if (!sc) return;
    U.settings.scenario = key;
    $("menuDesc").textContent = `${sc.title.toUpperCase()} — ${sc.about}`;
    $("ordersText").value = sc.text;
    if (!keepSettings) {
      U.settings.scheduler = sc.suggest.scheduler;
      U.settings.allocator = sc.suggest.allocator;
      U.settings.unsafe = sc.suggest.unsafe;
    }
    updateLineNumbers();
    hideError();
    applySettingsToMenu();
  };

  function updateLineNumbers(bad) {
    const n = $("ordersText").value.split("\n").length;
    let html = "";
    for (let i = 1; i <= n; i++) html += i === bad ? `<span class="bad">${i}</span>\n` : `${i}\n`;
    $("lineNos").innerHTML = html;
    const ta = $("ordersText");
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }

  function hideError() {
    $("inputError").hidden = true;
    updateLineNumbers();
  }

  U.showError = function (err) {
    const where = err.line ? `Line ${err.line}: ` : "";
    $("inputError").textContent = `${where}${err.message}`;
    $("inputError").hidden = false;
    $("editorBox").open = true;
    updateLineNumbers(err.line || 0);
    U.openMenu();
  };

  U.openMenu = function () {
    P.pause();
    applySettingsToMenu();
    $("menu").hidden = false;
  };
  U.closeMenu = function () {
    if (!P.run) return;
    $("menu").hidden = true;
  };
  U.menuOpen = () => !$("menu").hidden;

  U.setServerStatus = function (status) {
    $("srvDot").className = "dot " + status;
    const h = RV.Net.hello;
    $("srvText").textContent =
      status === "connected" ? `Connected: ${h ? h.chefs : 2} chefs, ${h ? h.pools.SPACE : 6} chairs, ${h ? h.pools.TABLE : 3} tables`
      : status === "connecting" ? "Connecting to the simulator…"
      : "Server offline. Run: make server && ./restaurant_server";
    $("btnStart").disabled = status !== "connected";
    $("startNote").textContent = status === "connected" ? "↑ ↓ choose · ← → switch window · Enter start"
                                                        : "Start the server to run a simulation.";
  };

  function buildMenu() {
    const list = $("scenarioList");
    for (const sc of RV.SCENARIOS) {
      const li = document.createElement("li");
      li.dataset.value = sc.key;
      li.dataset.desc = `${sc.title.toUpperCase()} — ${sc.about} (${sc.source})`;
      li.textContent = sc.title;
      list.appendChild(li);
    }
    document.querySelectorAll(".pk-list").forEach(ul => {
      const group = ul.dataset.group;
      ul.querySelectorAll("li").forEach(li => {
        li.onmouseenter = () => describe(li);
        li.onclick = () => {
          activePick = group;
          choose(group, li.dataset.value);
          describe(li);
        };
      });
    });
    $("menu").addEventListener("mouseleave", () => describe(document.querySelector(`.pk-list[data-group=${activePick}] li.on`)));
    $("ordersText").addEventListener("input", () => {
      U.settings.scenario = null;
      applySettingsToMenu();
      hideError();
    });
    $("fileInput").onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      $("ordersText").value = await f.text();
      U.settings.scenario = null;
      applySettingsToMenu();
      hideError();
      e.target.value = "";
    };
    $("menuSpeed").oninput = e => U.setSpeed(+e.target.value);
    $("srvUrl").value = RV.Net.defaultUrl();
    $("srvConnect").onclick = () => RV.Net.connect($("srvUrl").value.trim());
    $("btnStart").onclick = () => U.onStart && U.onStart(Object.assign({ orders: $("ordersText").value }, U.settings));
  }

  /* ---------- HUD ---------- */

  U.setSpeed = function (sec) {
    U.settings.speed = sec;
    P.setSpeed(sec);
    $("speed").value = sec;
    $("speedVal").textContent = secs(sec);
    $("menuSpeed").value = sec;
    $("menuSpeedVal").textContent = `${secs(sec)} per cycle`;
  };

  U.updateHud = function () {
    $("clockT").textContent = String(P.t);
    $("clockEnd").textContent = P.run ? `/ ${P.endTime}` : "";
    $("cycleFill").style.width = `${Math.round(Math.min(1, P.phase) * 100)}%`;
    $("btnPlay").textContent = P.playing ? "❚❚" : "▶";
    $("btnPlay").setAttribute("aria-label", P.playing ? "Pause" : "Play");
  };

  function setBadges(run) {
    const s = run.started;
    $("badges").innerHTML =
      `<span class="badge cpu"><i>CPU</i>${esc(s.scheduler)}</span>` +
      `<span class="badge mem"><i>MEMORY</i>${esc(s.allocator.replace("_", " "))}</span>` +
      `<span class="badge ${s.unsafe_demo ? "warn" : "on"}"><i>DEADLOCK PREVENTION</i>${s.unsafe_demo ? "OFF" : "ON"}</span>`;
  }

  function toggleDrawer(force) {
    const d = $("drawer");
    d.hidden = force === undefined ? !d.hidden : !force;
    $("btnLog").classList.toggle("on", !d.hidden);
    if (!d.hidden) U.refreshLog(true);
  }

  function toggleGantt() {
    const g = $("ganttWrap");
    g.classList.toggle("hide");
    $("btnGantt").classList.toggle("on", !g.classList.contains("hide"));
  }

  function buildHud() {
    $("btnPlay").onclick = () => P.toggle();
    $("btnStep").onclick = () => P.step();
    $("btnBack").onclick = () => P.back();
    $("btnRestart").onclick = () => P.restart();
    $("speed").oninput = e => U.setSpeed(+e.target.value);
    $("btnMenu").onclick = () => U.openMenu();
    $("btnLog").onclick = () => toggleDrawer();
    $("btnGantt").onclick = toggleGantt;
    document.querySelectorAll(".tabs button").forEach(b => {
      b.onclick = () => {
        document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
        document.querySelectorAll(".tab").forEach(t => (t.hidden = t.id !== "tab-" + b.dataset.tab));
        U.refreshLog(true);
      };
    });
    document.addEventListener("keydown", e => {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      const modalOpen = !$("results").hidden || !$("deadlockModal").hidden;
      if (e.key === "Escape") {
        if (!$("results").hidden) $("results").hidden = true;
        else if (!$("deadlockModal").hidden) $("deadlockModal").hidden = true;
        else if (U.menuOpen()) U.closeMenu();
        return;
      }
      if (U.menuOpen()) return menuKey(e);
      if (modalOpen) return;
      const k = e.key.toLowerCase();
      if (k === " ") { e.preventDefault(); P.toggle(); }
      else if (k === "arrowright") P.step();
      else if (k === "arrowleft") P.back();
      else if (k === "r") P.restart();
      else if (k === "m") U.openMenu();
      else if (k === "l") toggleDrawer();
      else if (k === "g") toggleGantt();
      else if (k === "+" || k === "=") U.setSpeed(Math.max(0.25, U.settings.speed - 0.25));
      else if (k === "-" || k === "_") U.setSpeed(Math.min(3, U.settings.speed + 0.25));
    });
  }

  /* ---------- caption, log, orders ---------- */

  function narrationAt(t) {
    const run = P.run;
    const cur = P.frameAt(t), prev = t > 0 ? P.frameAt(t - 1) : P.empty;
    const events = P.eventsAt(t);
    return events.map((ev, index) =>
      Nr.describe(ev, { meta: run.meta, frame: cur, prev, run: run.started, events, index }));
  }

  /* The dialog box types the cycle's lines out, paced to the cycle length. */
  let dialog = null;

  U.refreshCaption = function () {
    if (!P.run) return;
    const t = P.t;
    $("captionHead").textContent = `CYCLE ${t}`;
    const found = narrationAt(t);
    const lines = found.length ? found : [{ text: Nr.quiet(P.frameAt(t)), tag: null, kind: "quiet" }];
    const key = lines.map(n => `${n.tag}|${n.text}`).join("\n");
    if (dialog && dialog.key === key) return;        /* same words as before: don't retype them */
    dialog = { lines, key, start: performance.now(), shown: -1 };
    dialog.total = lines.reduce((a, n) => a + n.text.length, 0);
    U.tickDialog(performance.now());
    $("captionList").scrollTop = 0;
  };

  U.tickDialog = function (now) {
    if (!dialog) return;
    const dur = Math.max(250, P.secPerCycle * 1000 * 0.55);
    const chars = P.playing ? Math.floor((dialog.total * (now - dialog.start)) / dur) : dialog.total;
    const shown = Math.min(dialog.total, chars);
    if (shown === dialog.shown) return;
    dialog.shown = shown;
    let left = shown;
    /* The untyped rest is already there, invisible, so lines never reflow. */
    $("captionList").innerHTML = dialog.lines.map(n => {
      const cut = Math.max(0, Math.min(n.text.length, left));
      left -= n.text.length;
      const text = `${esc(n.text.slice(0, cut))}<span class="ghost">${esc(n.text.slice(cut))}</span>`;
      if (!n.tag) return `<li class="quiet">${text}</li>`;
      return `<li class="k-${n.kind}"><span class="tag">${esc(n.tag)}</span>${text}</li>`;
    }).join("");
    $("dialogMore").hidden = shown < dialog.total;
  };

  let loggedUpTo = -1;
  U.refreshLog = function (rebuild) {
    if (!P.run || $("drawer").hidden) return;
    const tab = document.querySelector(".tabs button.on").dataset.tab;
    if (tab === "orders") return renderOrders();
    if (tab !== "log") return;
    const box = $("tab-log");
    if (rebuild || P.t < loggedUpTo) {
      box.innerHTML = "";
      loggedUpTo = -1;
    }
    box.querySelectorAll(".now").forEach(el => el.classList.remove("now"));
    let html = "";
    for (const f of P.run.frames) {
      if (f.time <= loggedUpTo || f.time > P.t) continue;
      html += `<div class="log-t">CYCLE ${f.time}</div>`;
      html += narrationAt(f.time).map(n =>
        `<div class="log-line k-${n.kind}${f.time === P.t ? " now" : ""}"><span class="tag">${esc(n.tag)}</span>${esc(n.text)}</div>`).join("");
    }
    if (html) box.insertAdjacentHTML("beforeend", html);
    loggedUpTo = P.t;
    box.scrollTop = box.scrollHeight;
  };

  function renderOrders() {
    const F = P.frameAt(P.t);
    const rows = P.run.started.processes.map(m => {
      const p = F.byId[m.id];
      const chairs = F.pools.SPACE.filter(o => o === m.id).length;
      const tables = F.pools.TABLE.map((o, i) => (o === m.id ? `T${i + 1}` : null)).filter(Boolean);
      const equip = p.waits_for ? `waits ${p.waits_for}` + (p.holds.length ? `, holds ${p.holds.join(" ")}` : "")
                  : p.holds.join(" ");
      return `<tr><td><span class="swatch" style="background:${RV.Scene.colorOf(m.id)}"></span>${esc(m.id)}</td>` +
             `<td><span class="state st-${p.state}">${p.state.replace("BLOCKED_", "WAIT ")}</span></td>` +
             `<td>${chairs || "–"}</td><td>${tables.join(" ") || "–"}</td>` +
             `<td>${Math.floor(P.progress(m.id, P.t, P.phase))}/${m.service}</td><td>${esc(equip || "–")}</td></tr>`;
    });
    $("tab-orders").innerHTML =
      `<table class="orders-table"><tr><th>ORDER</th><th>STATE</th><th>CHAIRS</th><th>TABLE</th><th>COOKED</th><th>MACHINES</th></tr>${rows.join("")}</table>`;
  }

  /* ---------- results and deadlock ---------- */

  const fmt = v => (Number.isInteger(v) ? String(v) : (+v).toFixed(2));

  U.showResults = function () {
    const run = P.run, r = run.results, s = r.summary;
    $("resultsSub").textContent =
      `${run.started.scheduler} scheduling · ${run.started.allocator.replace("_", " ")} · ${r.processes.length} orders served in ${P.endTime} cycles.`;
    const cards = [
      [fmt(s.average_waiting), "avg waiting"], [fmt(s.average_turnaround), "avg turnaround"],
      [fmt(s.average_response), "avg response"], [fmt(s.throughput), "orders per cycle"],
      [fmt(s.service_utilization_pct) + "%", "chef utilization"], [fmt(s.average_memory_wait), "avg wait outside"],
      [s.blocked_for_memory_count, "had to wait outside"], [r.checks.exclusivity_violations, "exclusivity violations"],
    ];
    $("summaryCards").innerHTML = cards.map(([v, l]) => `<div class="card"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join("");
    const cols = ["id", "arrival", "priority", "service", "start", "completion", "waiting", "turnaround", "response", "mem_wait", "ready_wait", "resource_wait"];
    const head = ["ORDER", "ARRIVE", "PRIO", "COOK", "START", "DONE", "WAIT", "TURN", "RESP", "OUTSIDE", "READY Q", "MACHINE"];
    const sorted = r.processes.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    $("resultsTable").innerHTML = `<tr>${head.map(h => `<th>${h}</th>`).join("")}</tr>` +
      sorted.map(p => `<tr>${cols.map((c, i) => `<td>${i === 0 ? `<span class="swatch" style="background:${RV.Scene.colorOf(p.id)}"></span>` : ""}${esc(p[c])}</td>`).join("")}</tr>`).join("");
    $("poolTable").innerHTML = `<tr><th>POOL</th><th>SLOTS</th><th>PEAK</th><th>USE %</th><th>MAX FRAG</th></tr>` +
      r.pools.map(p => `<tr><td>${p.id === "SPACE" ? "CHAIRS (SPACE)" : "TABLES (TABLE)"}</td><td>${p.capacity}</td><td>${p.peak_occupied}</td><td>${fmt(p.utilization_pct)}</td><td>${p.max_ext_frag_slots}</td></tr>`).join("");
    $("resTable").innerHTML = r.resources.length
      ? `<tr><th>MACHINE</th><th>USES</th><th>WAITS</th><th>MAX USERS</th></tr>` +
        r.resources.map(x => `<tr><td>${esc(x.id.replace("_", " "))}</td><td>${x.acquisitions}</td><td>${x.wait_events}</td><td>${x.max_simultaneous_holders}</td></tr>`).join("")
      : `<tr><td>No machines in this scenario.</td></tr>`;
    $("results").hidden = false;
  };

  U.showDeadlock = function () {
    const run = P.run;
    const F = P.frameAt(P.endTime);
    $("dlMessage").textContent = run.deadlock.message;
    // follow order -> holder of the machine it waits for, until we loop
    const next = {};
    for (const r of F.resources) for (const o of r.waiting) next[o] = { res: r.id, holder: r.holder };
    let start = Object.keys(next)[0], seen = new Set(), o = start;
    while (o && !seen.has(o)) { seen.add(o); o = next[o] && next[o].holder; }
    let html = "";
    if (o) {
      const first = o;
      do {
        html += `<span class="node" style="background:${RV.Scene.colorOf(o)};color:${RV.Sprites.ink(RV.Scene.colorOf(o))}">${esc(o)}</span>` +
                `<span class="arrow">waits for</span><span class="node res">${esc(next[o].res.replace("_", " "))}</span><span class="arrow">held by</span>`;
        o = next[o].holder;
      } while (o !== first);
      html += `<span class="node" style="background:${RV.Scene.colorOf(first)};color:${RV.Sprites.ink(RV.Scene.colorOf(first))}">${esc(first)}</span>`;
    }
    $("dlCycle").innerHTML = html;
    $("deadlockModal").hidden = false;
  };

  function buildModals() {
    $("btnCsv").onclick = () => {
      const run = P.run;
      const blob = new Blob([run.results.csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `result_${run.started.scheduler}_${run.started.allocator}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $("btnReplay").onclick = () => { $("results").hidden = true; P.restart(); };
    $("btnExplore").onclick = () => ($("results").hidden = true);
    $("btnChange").onclick = () => { $("results").hidden = true; U.openMenu(); };
    $("dlExplore").onclick = () => ($("deadlockModal").hidden = true);
    $("dlRerun").onclick = () => {
      $("deadlockModal").hidden = true;
      U.settings.unsafe = false;
      U.onStart && U.onStart(Object.assign({ orders: $("ordersText").value }, U.settings));
    };
  }

  U.onRunLoaded = function (run) {
    dialog = null;
    setBadges(run);
    $("results").hidden = true;
    $("deadlockModal").hidden = true;
    loggedUpTo = -1;
    U.refreshCaption();
    U.refreshLog(true);
  };

  U.init = function () {
    buildMenu();
    buildHud();
    buildModals();
    U.selectScenario(RV.SCENARIOS[0].key);
    U.setSpeed(1);
  };
})();
