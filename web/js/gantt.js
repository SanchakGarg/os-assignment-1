/*
 * Timeline strip under the scene: one row per chef (CPU) and per declared
 * piece of equipment, coloured by the order using it, filled up to the
 * current cycle. Clicking a column jumps there.
 */
(function () {
  const P = RV.Playback;
  const G = (RV.Gantt = {});
  let canvas, ctx, rows = [];
  const LABEL_W = 108, ROW_H = 18, TOP = 16;
  const FONT = '"Jersey 10", ui-monospace, monospace';

  G.init = function (el) {
    canvas = el;
    ctx = canvas.getContext("2d");
    new ResizeObserver(resize).observe(canvas.parentElement);
    canvas.addEventListener("click", e => {
      if (!P.run) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const cell = (r.width - LABEL_W - 8) / (P.endTime + 1);
      if (x > LABEL_W) P.seek(Math.floor((x - LABEL_W) / cell));
    });
    resize();
  };

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    canvas.style.width = r.width + "px";
    canvas.style.height = r.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  G.load = function (run) {
    rows = [{ name: "CHEF 0 (CPU)", at: F => F.chefs[0] }, { name: "CHEF 1 (CPU)", at: F => F.chefs[1] }];
    for (const r of run.started.resources)
      rows.push({ name: r.id.replace("_", " "), at: F => (F.resources.find(x => x.id === r.id) || {}).holder });
  };

  G.render = function () {
    if (!ctx) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fbfbfb";
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = "middle";
    if (!P.run) {
      ctx.fillStyle = "#686878";
      ctx.font = `19px ${FONT}`;
      ctx.fillText("Timeline: who uses each chef and machine, cycle by cycle", 12, h / 2);
      return;
    }
    const end = P.endTime;
    const cell = (w - LABEL_W - 8) / (end + 1);
    const rowH = Math.min(ROW_H, (h - TOP - 4) / rows.length);
    const now = P.t + Math.min(1, P.phase);

    // time axis
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = "#686878";
    const every = Math.max(1, Math.ceil(28 / cell));
    for (let u = 0; u <= end; u += every) ctx.fillText(String(u), LABEL_W + u * cell + 2, 8);

    rows.forEach((row, k) => {
      const y = TOP + k * rowH;
      ctx.fillStyle = k % 2 ? "#eef1f8" : "#ffffff";
      ctx.fillRect(0, y, w, rowH - 1);
      ctx.fillStyle = "#303040";
      ctx.font = `16px ${FONT}`;
      ctx.fillText(row.name, 8, y + rowH / 2);
      // merge consecutive cycles used by the same order
      let u = 0;
      while (u <= end && u < now) {
        const id = row.at(P.frameAt(u));
        let v = u + 1;
        while (v <= end && v < now && row.at(P.frameAt(v)) === id) v++;
        if (id) {
          const x0 = LABEL_W + u * cell, x1 = LABEL_W + Math.min(v, now) * cell;
          const col = RV.Scene.colorOf(id);
          ctx.fillStyle = col;
          ctx.fillRect(x0 + 1, y + 2, Math.max(1, x1 - x0 - 2), rowH - 5);
          if (x1 - x0 > 22) {
            ctx.fillStyle = RV.Sprites.ink(col);
            ctx.font = `${Math.min(17, rowH)}px ${FONT}`;
            ctx.fillText(id, x0 + 4, y + rowH / 2);
          }
        }
        u = v;
      }
    });

    // cursor
    const cx = LABEL_W + now * cell;
    ctx.fillStyle = "#e04848";
    ctx.fillRect(Math.round(cx) - 1, TOP - 4, 2, rows.length * rowH + 4);
  };
})();
