/*
 * Pixel art, drawn in code (no image files). Characters are palette-mapped
 * string sprites rendered once into small canvases; furniture and machines are
 * drawn with fillRect so they can show state (oven glow, flames, steam).
 * Everything is in world pixels; the scene scales the whole picture up.
 */
(function () {
  const S = (RV.Sprites = {});

  /* ---------- palette sprites ---------- */

  const CHEF_ROWS = {
    head: [
      "..wwwwww..",
      ".wwwwwwww.",
      ".wwwwwwww.",
      "..gwwwwg..",
      "..gggggg..",
      "..ssssss..",
      "..sesses..",
      "..ssmmss..",
      "...ssss...",
      "..wwnnww..",
    ],
    idle: [
      ".wwwnnwww.",
      "swwwwwwwws",
      "swwwgwwwws",
      ".wwwgwwww.",
      ".wwwwwwww.",
      ".pppppppp.",
      ".pp....pp.",
      ".bb....bb.",
    ],
    walkA: [
      ".wwwnnwww.",
      "swwwwwwwws",
      "swwwgwwwws",
      ".wwwgwwww.",
      ".wwwwwwww.",
      ".pppppppp.",
      ".pp...pp..",
      "bb....bb..",
    ],
    walkB: [
      ".wwwnnwww.",
      "swwwwwwwws",
      "swwwgwwwws",
      ".wwwgwwww.",
      ".wwwwwwww.",
      ".pppppppp.",
      "..pp...pp.",
      "..bb....bb",
    ],
    cookA: [
      ".wwwnnwwws",
      "swwwwwwww.",
      ".wwwgwwww.",
      ".wwwgwwww.",
      ".wwwwwwww.",
      ".pppppppp.",
      ".pp....pp.",
      ".bb....bb.",
    ],
    cookB: [
      "swwwnnwww.",
      ".wwwwwwwws",
      ".wwwgwwww.",
      ".wwwgwwww.",
      ".wwwwwwww.",
      ".pppppppp.",
      ".pp....pp.",
      ".bb....bb.",
    ],
  };

  const PERSON_HEAD = [
    "..hhhh..",
    ".hhhhhh.",
    ".hsssss.",
    ".sesses.",
    ".ssssss.",
    "..ssss..",
  ];
  const PERSON_ROWS = {
    idle: [".cccccc.", "cccccccc", "sCccccCs", ".cccccc.", ".pppppp.", ".pp..pp.", ".pp..pp.", ".bb..bb."],
    walkA: [".cccccc.", "cccccccc", "sCccccCs", ".cccccc.", ".pppppp.", ".pp.pp..", "pp...pp.", "bb...bb."],
    walkB: [".cccccc.", "cccccccc", "sCccccCs", ".cccccc.", ".pppppp.", "..pp.pp.", ".pp...pp", ".bb...bb"],
    sit: [".cccccc.", "cccccccc", "sCccccCs", ".pppppp.", ".pppppp.", ".bb..bb."],
  };

  const BASE_PALETTE = {
    w: "#f7f7f7", g: "#c3c9d3", s: "#f1c27d", e: "#1b1b1b", m: "#c2554a",
    p: "#2f3445", b: "#191920",
  };
  const HAIR = ["#3b2a20", "#7a4a2a", "#d9b25b", "#1b1b1b", "#a33b2a", "#5a5a5a"];
  const CHEF_SCARF = ["#d93b3b", "#3b7bd9"];

  const cache = new Map();

  function render(rows, palette) {
    const h = rows.length, w = rows[0].length;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const col = palette[rows[y][x]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    return c;
  }

  function cached(key, make) {
    let c = cache.get(key);
    if (!c) {
      c = make();
      cache.set(key, c);
    }
    return c;
  }

  /* Chef: frame is idle, walkA, walkB, cookA or cookB. 10 x 18. */
  S.chef = function (index, frame) {
    return cached(`chef${index}${frame}`, () =>
      render(CHEF_ROWS.head.concat(CHEF_ROWS[frame]),
             Object.assign({}, BASE_PALETTE, { n: CHEF_SCARF[index % 2] })));
  };
  S.CHEF_W = 10;
  S.CHEF_H = 18;

  /* Customer: frame is idle, walkA, walkB or sit. 8 x 14 standing, 8 x 12 sitting. */
  S.person = function (shirt, hair, frame) {
    return cached(`p${shirt}${hair}${frame}`, () =>
      render(PERSON_HEAD.concat(PERSON_ROWS[frame]),
             Object.assign({}, BASE_PALETTE, { c: shirt, C: S.shade(shirt, -0.25), h: HAIR[hair % HAIR.length] })));
  };
  S.PERSON_W = 8;
  S.PERSON_H = 14;

  /* ---------- colour helpers ---------- */

  S.ORDER_COLORS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#42d4f4",
                    "#f032e6", "#bfef45", "#ffe119", "#469990", "#9a6324", "#fabed4"];

  S.shade = function (hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = amount < 0 ? 1 + amount : 1 - amount;
    const t = amount < 0 ? 0 : 255;
    r = Math.round(t + (r - t) * f);
    g = Math.round(t + (g - t) * f);
    b = Math.round(t + (b - t) * f);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  };

  /* Black or white text, whichever reads better on hex. */
  S.ink = function (hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111" : "#fff";
  };

  /* ---------- furniture and machines (fillRect) ---------- */

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }
  S.rect = rect;

  /* 20 x 22, seat top at y+9. */
  S.chair = function (ctx, x, y) {
    rect(ctx, x + 3, y, 14, 10, "#6e4429");
    rect(ctx, x + 4, y + 1, 12, 7, "#9a6338");
    rect(ctx, x + 5, y + 2, 10, 1, "#b77a48");
    rect(ctx, x + 1, y + 9, 18, 5, "#a86d3f");
    rect(ctx, x + 1, y + 9, 18, 1, "#c88b55");
    rect(ctx, x + 1, y + 13, 18, 1, "#6e4429");
    rect(ctx, x + 2, y + 14, 2, 8, "#5a3620");
    rect(ctx, x + 16, y + 14, 2, 8, "#5a3620");
  };

  /* w x 28; top at y. cloth = owner's colour or null. */
  S.table = function (ctx, x, y, w, cloth) {
    rect(ctx, x + 4, y + 13, 4, 15, "#5a3620");
    rect(ctx, x + w - 8, y + 13, 4, 15, "#5a3620");
    rect(ctx, x, y, w, 14, "#7a4f2c");
    rect(ctx, x + 1, y + 1, w - 2, 11, "#b07a4a");
    rect(ctx, x + 1, y + 1, w - 2, 1, "#c99260");
    if (cloth) {
      rect(ctx, x + 2, y + 1, w - 4, 13, cloth);
      rect(ctx, x + 2, y + 1, w - 4, 1, S.shade(cloth, 0.35));
      rect(ctx, x + 2, y + 13, w - 4, 2, S.shade(cloth, -0.3));
      for (let k = x + 4; k < x + w - 4; k += 6) rect(ctx, k, y + 14, 3, 2, S.shade(cloth, -0.3));
    }
  };

  /* Plate with food, 12 x 6. */
  S.dish = function (ctx, x, y) {
    rect(ctx, x, y + 3, 12, 3, "#e9ecef");
    rect(ctx, x + 1, y + 5, 10, 1, "#adb5bd");
    rect(ctx, x + 3, y, 6, 4, "#e07a2d");
    rect(ctx, x + 4, y, 2, 1, "#4caf50");
    rect(ctx, x + 7, y + 1, 1, 1, "#ffd43b");
  };

  /* Paper takeaway bag, 9 x 10. */
  S.bag = function (ctx, x, y) {
    rect(ctx, x, y + 2, 9, 8, "#c8a272");
    rect(ctx, x, y + 2, 9, 1, "#e0bf8f");
    rect(ctx, x + 2, y, 1, 3, "#7a5a36");
    rect(ctx, x + 6, y, 1, 3, "#7a5a36");
    rect(ctx, x + 2, y, 5, 1, "#7a5a36");
    rect(ctx, x + 3, y + 5, 3, 2, "#d93b3b");
  };

  function steam(ctx, x, y, t) {
    for (let k = 0; k < 3; k++) {
      const phase = (t * 1.6 + k / 3) % 1;
      const yy = y - phase * 10;
      const xx = x + k * 4 + Math.round(Math.sin((phase + k) * 6.28) * 1.5);
      ctx.globalAlpha = 0.75 * (1 - phase);
      rect(ctx, xx, yy, 2, 2, "#f1f3f5");
    }
    ctx.globalAlpha = 1;
  }

  /* Stove with a pot, 40 x 26 (y = top of the pot). */
  S.stove = function (ctx, x, y, on, t) {
    rect(ctx, x, y + 10, 40, 16, "#8d96a0");
    rect(ctx, x, y + 10, 40, 3, "#3a3f46");
    rect(ctx, x + 2, y + 15, 36, 9, "#a7b0ba");
    for (let k = 0; k < 4; k++) rect(ctx, x + 6 + k * 8, y + 17, 3, 3, on ? "#e8590c" : "#495057");
    // pot
    rect(ctx, x + 8, y + 2, 16, 9, "#495057");
    rect(ctx, x + 9, y + 3, 14, 7, "#6c757d");
    rect(ctx, x + 6, y + 4, 2, 2, "#343a40");
    rect(ctx, x + 24, y + 4, 2, 2, "#343a40");
    if (on) {
      for (let k = 0; k < 5; k++) {
        const f = Math.floor((t * 10 + k * 3) % 3);
        rect(ctx, x + 9 + k * 3, y + 10 - f, 2, 1 + f, k % 2 ? "#ffd43b" : "#ff6b00");
      }
      steam(ctx, x + 11, y, t);
    }
    // small pan on the right burner
    rect(ctx, x + 28, y + 7, 9, 3, "#343a40");
  };

  /* Oven, 40 x 28. */
  S.oven = function (ctx, x, y, on, t) {
    rect(ctx, x, y, 40, 28, "#495057");
    rect(ctx, x + 1, y + 1, 38, 26, "#6c757d");
    rect(ctx, x + 1, y + 1, 38, 5, "#343a40");
    for (let k = 0; k < 4; k++) rect(ctx, x + 6 + k * 8, y + 2, 3, 3, "#ced4da");
    rect(ctx, x + 5, y + 9, 30, 15, "#212529");
    if (on) {
      const flick = Math.sin(t * 12) > 0 ? "#ff922b" : "#ff8000";
      rect(ctx, x + 6, y + 10, 28, 13, flick);
      rect(ctx, x + 6, y + 10, 28, 3, "#ffd8a8");
      rect(ctx, x + 12, y + 17, 16, 3, "#c0392b");
    } else {
      rect(ctx, x + 6, y + 10, 28, 13, "#343a40");
    }
    rect(ctx, x + 8, y + 8, 24, 1, "#adb5bd");
  };

  /* Microwave on a stand, 40 x 28. */
  S.microwave = function (ctx, x, y, on, t) {
    rect(ctx, x + 2, y + 22, 36, 6, "#868e96");
    rect(ctx, x, y + 2, 40, 21, "#adb5bd");
    rect(ctx, x + 1, y + 3, 38, 19, "#dee2e6");
    rect(ctx, x + 4, y + 6, 24, 13, "#2b3036");
    if (on) {
      rect(ctx, x + 5, y + 7, 22, 11, "#ffe8a3");
      const ang = t * 5;
      rect(ctx, x + 15 + Math.round(Math.cos(ang) * 5), y + 14, 3, 2, "#e8590c");
    }
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 2; c++) rect(ctx, x + 31 + c * 3, y + 7 + r * 3, 2, 2, "#868e96");
  };

  /* Coffee machine, 40 x 28. */
  S.coffee = function (ctx, x, y, on, t) {
    rect(ctx, x + 6, y, 28, 28, "#343a40");
    rect(ctx, x + 7, y + 1, 26, 6, "#c92a2a");
    rect(ctx, x + 9, y + 9, 22, 12, "#212529");
    rect(ctx, x + 17, y + 9, 6, 4, "#868e96");
    rect(ctx, x + 15, y + 16, 10, 5, "#f8f9fa");
    rect(ctx, x + 25, y + 17, 2, 3, "#f8f9fa");
    if (on) {
      rect(ctx, x + 19, y + 13, 2, 3, "#5c3b1e");
      steam(ctx, x + 15, y + 15, t);
    }
    rect(ctx, x + 6, y + 23, 28, 5, "#495057");
  };

  S.machine = function (ctx, id, x, y, on, t) {
    if (id === "OVEN_1" || id === "OVEN_2") S.oven(ctx, x, y, on, t);
    else if (id === "MICROWAVE") S.microwave(ctx, x, y, on, t);
    else S.coffee(ctx, x, y, on, t);
  };

  /* Potted plant, 12 x 20. */
  S.plant = function (ctx, x, y) {
    rect(ctx, x + 2, y + 13, 8, 7, "#a0522d");
    rect(ctx, x + 1, y + 12, 10, 2, "#c46a3c");
    rect(ctx, x + 4, y + 2, 4, 11, "#2f9e44");
    rect(ctx, x, y + 5, 5, 4, "#40c057");
    rect(ctx, x + 7, y + 3, 5, 4, "#40c057");
    rect(ctx, x + 3, y, 4, 4, "#51cf66");
  };

  /* Order ticket, 30 x 34. */
  S.ticket = function (ctx, x, y, color, w, h) {
    w = w || 30;
    h = h || 34;
    rect(ctx, x + 1, y + 1, w, h, "rgba(0,0,0,0.25)");
    rect(ctx, x, y, w, h, "#fffdf3");
    rect(ctx, x, y, w, 6, color);
    rect(ctx, x + w / 2 - 1, y - 2, 3, 3, "#495057");
  };
})();
