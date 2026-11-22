/*
 * WebSocket client for restaurant_server (protocol: docs/server.md).
 * Connects on load, reconnects if the server restarts, and turns one `start`
 * into a promise that resolves with the whole run once `done` arrives.
 */
(function () {
  const N = (RV.Net = { hello: null, status: "offline", url: null });
  let sock = null, pending = null, run = null, retry = null;
  const listeners = [];

  N.onStatus = fn => listeners.push(fn);
  const setStatus = s => {
    N.status = s;
    listeners.forEach(fn => fn(s));
  };

  N.defaultUrl = function () {
    if (location.protocol === "http:" || location.protocol === "https:")
      return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
    return "ws://127.0.0.1:8080";
  };

  N.connect = function (url) {
    N.url = url || N.url || N.defaultUrl();
    clearTimeout(retry);
    if (sock) {
      sock.onclose = null;
      sock.close();
    }
    setStatus("connecting");
    try {
      sock = new WebSocket(N.url);
    } catch (e) {
      setStatus("offline");
      return;
    }
    sock.onopen = () => setStatus("connected");
    sock.onclose = () => {
      setStatus("offline");
      if (pending) {
        pending.reject({ message: "Lost the connection to the server." });
        pending = null;
      }
      retry = setTimeout(() => N.connect(), 2000);
    };
    sock.onmessage = e => handle(JSON.parse(e.data));
  };

  function handle(m) {
    switch (m.type) {
    case "hello":
      N.hello = m;
      setStatus("connected");
      break;
    case "error":
      if (pending) {
        pending.reject(m);
        pending = null;
      }
      break;
    case "started":
      run = { started: m, frames: [], results: null, deadlock: null };
      break;
    case "frame":
      if (run) run.frames.push(m);
      break;
    case "results":
      if (run) run.results = m;
      break;
    case "deadlock":
      if (run) run.deadlock = m;
      break;
    case "done":
      if (pending && run) pending.resolve(run);
      pending = null;
      run = null;
      break;
    }
  }

  /* Runs the simulation on the server; resolves with { started, frames, results | deadlock }. */
  N.start = function (opts) {
    return new Promise((resolve, reject) => {
      if (!sock || sock.readyState !== 1)
        return reject({ message: "Not connected to the server. Start it with: make server && ./restaurant_server" });
      pending = { resolve, reject };
      run = null;
      sock.send(JSON.stringify({
        type: "start", scheduler: opts.scheduler, allocator: opts.allocator,
        orders: opts.orders, unsafe_demo: !!opts.unsafe, tick_ms: 0,
      }));
    });
  };
})();
