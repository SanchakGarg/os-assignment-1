/*
 * Wiring: server connection -> run -> playback clock -> scene, timeline and UI.
 * URL options for repeatable demos and screenshots:
 *   ?scenario=deadlock&sched=FCFS&alloc=BEST_FIT&unsafe=1&speed=0.5&autostart=1&seek=3&phase=0.4
 */
(function () {
  const P = RV.Playback, U = RV.UI, Sc = RV.Scene, G = RV.Gantt, Net = RV.Net;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  let starting = false, autostarted = false;

  function start(settings) {
    if (starting) return;
    starting = true;
    $("btnStart").disabled = true;
    $("btnStart").textContent = "COOKING UP THE SIMULATION…";
    Net.start(settings)
      .then(run => {
        const pools = (Net.hello && Net.hello.pools) || Sc.pools;
        Sc.setPools(pools);
        P.load(run, pools);
        Sc.load(run);
        G.load(run);
        U.onRunLoaded(run);
        U.closeMenu();
        const seek = params.get("seek");
        if (seek !== null && !autostarted) {
          autostarted = true;
          P.seek(+seek);
          if (params.get("phase") !== null) P.phase = +params.get("phase");   /* freeze mid-cycle */
        } else P.restart();
      })
      .catch(err => U.showError(err))
      .finally(() => {
        starting = false;
        $("btnStart").textContent = "▶ START SIMULATION";
        $("btnStart").disabled = Net.status !== "connected";
      });
  }

  P.on("cycle", mode => {
    U.refreshCaption();
    U.refreshLog(mode === "seek");
  });
  P.on("state", () => U.refreshLog(false));
  P.on("end", () => {
    if (P.run.deadlock) U.showDeadlock();
    else if (P.run.results) U.showResults();
  });

  function applyParams() {
    const key = params.get("scenario");
    if (key) U.selectScenario(key);
    const sched = params.get("sched"), alloc = params.get("alloc");
    if (sched) U.settings.scheduler = sched.toUpperCase();
    if (alloc) U.settings.allocator = alloc.toUpperCase();
    if (params.has("unsafe")) U.settings.unsafe = params.get("unsafe") === "1";
    if (params.get("speed")) U.setSpeed(+params.get("speed"));
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    P.tick(dt);
    Sc.render(now / 1000);
    G.render();
    U.updateHud();
    requestAnimationFrame(loop);
  }

  Sc.init($("scene"));
  G.init($("gantt"));
  U.init();
  U.onStart = start;
  applyParams();
  Net.onStatus(status => {
    U.setServerStatus(status);
    if (status === "connected" && Net.hello) {
      Sc.setPools(Net.hello.pools);
      Sc.equipment = Net.hello.equipment || Sc.equipment;
      if (params.get("autostart") === "1" && !autostarted && !P.run)
        start(Object.assign({ orders: $("ordersText").value }, U.settings));
    }
  });
  Net.connect();
  requestAnimationFrame(loop);
})();
