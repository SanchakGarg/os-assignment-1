/*
 * Pixel art in the style of a handheld monster-collecting RPG's overworld
 * (original drawings, drawn in code; no image files). Characters are
 * palette-mapped string sprites with 4 facing directions (right = mirrored
 * left), a 2-frame walk and a sitting pose; furniture and machines are drawn
 * with fillRect so they can show state (oven glow, flames, steam).
 */
(function () {
  const S = (RV.Sprites = {});

  /* ---------- characters ---------- */

  /* Customer, 14 x 20: head rows 0-9, body 10-14, legs 15-19. */
  const CUSTOMER = {
    head: {
      down: [
        "....kkkkkk....", "..kkhhhhhhkk..", ".khhhhhhhhhhk.", ".khhhhhhhhhhk.", "khhhhhhhhhhhhk",
        "khsssssssssshk", "kssskssssksssk", "kssskssssksssk", "kSssssssssssSk", ".kSssssssssSk.",
      ],
      up: [
        "....kkkkkk....", "..kkhhhhhhkk..", ".khhhhhhhhhhk.", ".khhhhhhhhhhk.", "khhhhhhhhhhhhk",
        "khhhhhhhhhhhhk", "khhhhhhhhhhhhk", "khHhhhhhhhhHhk", "kSHhhhhhhhhHSk", ".kSHHHHHHHHSk.",
      ],
      left: [
        "....kkkkkk....", "..kkhhhhhhkk..", ".khhhhhhhhhhk.", ".khhhhhhhhhhk.", "khhhhhhhhhhhhk",
        "ksssshhhhhhhhk", "ksskssshhhhhhk", "ksskssssShhhhk", "ksssssssSShhhk", ".kSssssssSkkk.",
      ],
    },
    body: {
      down: ["..kkcccccckk..", ".kcccccccccck.", "ksccccccccccsk", "ksCccccccccCsk", ".kCccccccccCk."],
      up: ["..kkcccccckk..", ".kcccccccccck.", "ksccccccccccsk", "ksCccccccccCsk", ".kCccccccccCk."],
      left: ["..kkcccccckk..", "..kcccccccck..", "..kscccccccck.", "..kCcccccccCk.", "..kCccccccCk.."],
    },
    legs: {
      down: {
        stand: [".kppppppppppk.", ".kpppk..kpppk.", ".kpppk..kpppk.", ".kbbbk..kbbbk.", "..kkk....kkk.."],
        walkA: [".kppppppppppk.", ".kpppk..kpppk.", ".kbbbk..kpppk.", "..kkk...kbbbk.", ".........kkk.."],
        walkB: [".kppppppppppk.", ".kpppk..kpppk.", ".kpppk..kbbbk.", ".kbbbk...kkk..", "..kkk........."],
      },
      left: {
        stand: ["..kppppppppk..", "...kppkppk....", "...kppkppk....", "..kbbbkbbbk...", "..kkkkkkkk...."],
        walkA: ["..kppppppppk..", "..kppk.kppk...", ".kppk...kppk..", "kbbbk...kbbbk.", "kkkk.....kkkk."],
      },
    },
    sit: [".kppppppppppk.", ".kPPPPPPPPPPk.", "..kbbk..kbbk.."],
  };

  /* Chef, 16 x 24: toque rows 0-6, head 7-12, coat 13-19, legs 20-23. */
  const CHEF = {
    hat: [
      ".....kkkkkk.....", "....kwwwwwwk....", "...kwwwwwwwwk...", "..kwwwwwwwwwwk..",
      "..kwwwgwwgwwwk..", "...kwwwwwwwwk...", "...kggggggggk...",
    ],
    head: {
      down: ["..khsssssssshk..", ".kssssssssssssk.", ".kssskssssksssk.", ".kssskssssksssk.", ".kSssssmmssssSk.", "..kSssssssssSk.."],
      up: ["..khhhhhhhhhhk..", ".khhhhhhhhhhhhk.", ".khhhhhhhhhhhhk.", ".khhhhhhhhhhhhk.", ".kShhhhhhhhhhSk.", "..kSSSSSSSSSSk.."],
      left: ["..ksssshhhhhhk..", ".ksssssshhhhhhk.", ".kskssssShhhhhk.", ".kskssssShhhhhk.", ".ksmssssSShhhhk.", "..kSssssSkkkkk.."],
    },
    coat: {
      down: ["...kkwwnnwwkk...", "..kwwwwnnwwwwk..", ".kwwwwwwwwwwwwk.", "kswwwwgwwgwwwwsk", "kswwwwwwwwwwwwsk", ".kwwwwgwwgwwwwk.", ".kggggggggggggk."],
      up: ["...kkwwnnwwkk...", "..kwwwwwwwwwwk..", ".kwwwwwwwwwwwwk.", "kswwwwwwwwwwwwsk", "kswwwwwwwwwwwwsk", ".kwwwwwwwwwwwwk.", ".kggggggggggggk."],
      left: ["...kwnnwwwwkk...", "...kwnnwwwwwk...", "..kwwwwwwwwwk...", "..kswwwwwwwwk...", "..kwwwwwwwwwk...", "..kwwwwwwwwwk...", "..kgggggggggk..."],
    },
    legs: {
      down: {
        stand: [".kppppppppppppk.", ".kppppk..kppppk.", ".kbbbbk..kbbbbk.", "..kkkk....kkkk.."],
        walkA: [".kppppppppppppk.", ".kppppk..kppppk.", ".kbbbbk..kppppk.", "..kkkk...kbbbbk."],
        walkB: [".kppppppppppppk.", ".kppppk..kppppk.", ".kppppk..kbbbbk.", ".kbbbbk...kkkk.."],
      },
      left: {
        stand: ["..kpppppppppk...", "...kppkkppk.....", "...kbbbkbbbk....", "...kkkkkkkk....."],
        walkA: ["..kpppppppppk...", "..kppk..kppk....", ".kbbbk...kbbbk..", ".kkkk.....kkkk.."],
      },
    },
  };

  const BASE = {
    k: "#283040", w: "#fbfbff", g: "#c8cedc", s: "#f8c8a0", S: "#d89a70", m: "#c0504a",
    p: "#4a5078", P: "#3a3f62", b: "#4a3028",
  };
  const HAIR = [["#5a3a28", "#3e2818"], ["#e8b048", "#b88028"], ["#283040", "#181c28"],
                ["#c84830", "#903020"], ["#7860b0", "#504080"], ["#8a8a96", "#5c5c68"]];
  const CHEF_SCARF = ["#e03838", "#3870e0"];

  const cache = new Map();

  function render(rows, palette, mirror) {
    const h = rows.length, w = rows[0].length;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const col = palette[rows[y][mirror ? w - 1 - x : x]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    return c;
  }

  function cached(key, make) {
    let c = cache.get(key);
    if (!c) cache.set(key, (c = make()));
    return c;
  }

  /* dir: down | up | left | right. frame: stand | walkA | walkB | sit. */
  S.person = function (shirt, hair, dir, frame) {
    return cached(`p|${shirt}|${hair}|${dir}|${frame}`, () => {
      const side = dir === "left" || dir === "right";
      const base = side ? "left" : dir;
      let legs;
      if (frame === "sit") legs = CUSTOMER.sit;
      else if (side) legs = CUSTOMER.legs.left[frame === "stand" || frame === "walkB" ? "stand" : "walkA"];
      else legs = CUSTOMER.legs.down[frame];
      const [h, H] = HAIR[hair % HAIR.length];
      const pal = Object.assign({}, BASE, { c: shirt, C: S.shade(shirt, -0.25), h, H });
      return render(CUSTOMER.head[base].concat(CUSTOMER.body[base], legs), pal, dir === "right");
    });
  };
  S.PERSON_W = 14;
  S.PERSON_H = 20;

  /* dir: down | up | left | right. frame: stand | walkA | walkB. */
  S.chef = function (index, dir, frame) {
    return cached(`c|${index}|${dir}|${frame}`, () => {
      const side = dir === "left" || dir === "right";
      const base = side ? "left" : dir;
      const legs = side ? CHEF.legs.left[frame === "walkA" ? "walkA" : "stand"] : CHEF.legs.down[frame];
      const pal = Object.assign({}, BASE, { n: CHEF_SCARF[index % 2], h: "#3e2818" });
      return render(CHEF.hat.concat(CHEF.head[base], CHEF.coat[base], legs), pal, dir === "right");
    });
  };
  S.CHEF_W = 16;
  S.CHEF_H = 24;

  /* For the self-check in the verification step. */
  S._rows = { CUSTOMER, CHEF };

  /* ---------- colour helpers ---------- */

  S.ORDER_COLORS = ["#e83c4c", "#3cb44b", "#4c6ce0", "#f58231", "#a040c8", "#2cb8d8",
                    "#f040b0", "#90c830", "#e8c020", "#309088", "#a0682c", "#e890a8"];

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

  S.ink = function (hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#202030" : "#fff";
  };

  /* ---------- drawing primitives ---------- */

  const OUT = "#283040";
  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }
  S.rect = rect;
  /* Filled box with the dark outline every object in this style has. */
  function box(ctx, x, y, w, h, fill) {
    rect(ctx, x, y, w, h, OUT);
    rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
  }
  S.box = box;

  function steam(ctx, x, y, t) {
    for (let k = 0; k < 3; k++) {
      const ph = (t * 1.4 + k / 3) % 1;
      ctx.globalAlpha = 0.8 * (1 - ph);
      rect(ctx, x + k * 4 + Math.round(Math.sin((ph + k) * 6.28) * 1.5), y - ph * 10, 2, 2, "#ffffff");
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- kitchen machines, 32 x 32 (front view, against the wall) ---------- */

  S.oven = function (ctx, x, y, on, t) {
    box(ctx, x, y + 2, 32, 30, "#8890a0");
    rect(ctx, x + 1, y + 3, 30, 6, "#585f70");
    for (let k = 0; k < 4; k++) rect(ctx, x + 5 + k * 6, y + 5, 3, 2, "#e0e4ec");
    box(ctx, x + 4, y + 11, 24, 16, "#30343c");
    if (on) {
      rect(ctx, x + 5, y + 12, 22, 14, Math.sin(t * 12) > 0 ? "#ff9030" : "#ff7a10");
      rect(ctx, x + 5, y + 12, 22, 3, "#ffd8a0");
      rect(ctx, x + 10, y + 19, 12, 4, "#b83020");
    }
    rect(ctx, x + 7, y + 10, 18, 1, "#c8ccd8");
  };

  S.microwave = function (ctx, x, y, on, t) {
    box(ctx, x + 1, y + 20, 30, 12, "#a07040");
    rect(ctx, x + 2, y + 21, 28, 2, "#c08c58");
    box(ctx, x, y + 4, 32, 18, "#e0e4ec");
    box(ctx, x + 3, y + 7, 18, 12, "#303840");
    if (on) {
      rect(ctx, x + 4, y + 8, 16, 10, "#ffe8a0");
      rect(ctx, x + 11 + Math.round(Math.cos(t * 5) * 4), y + 13, 3, 2, "#e86010");
    }
    for (let r = 0; r < 3; r++) rect(ctx, x + 24, y + 8 + r * 3, 4, 2, "#8890a0");
  };

  S.coffee = function (ctx, x, y, on, t) {
    box(ctx, x + 4, y + 2, 24, 30, "#40444c");
    rect(ctx, x + 5, y + 3, 22, 6, "#d03838");
    rect(ctx, x + 7, y + 11, 18, 12, "#202428");
    rect(ctx, x + 14, y + 11, 4, 4, "#a0a4b0");
    box(ctx, x + 11, y + 17, 9, 6, "#fbfbff");
    if (on) {
      rect(ctx, x + 15, y + 15, 2, 3, "#6a4020");
      steam(ctx, x + 11, y + 15, t);
    }
    rect(ctx, x + 5, y + 25, 22, 6, "#585f70");
  };

  S.stove = function (ctx, x, y, on, t) {
    box(ctx, x, y + 10, 32, 22, "#a8b0bc");
    rect(ctx, x + 1, y + 11, 30, 4, "#40444c");
    for (let k = 0; k < 4; k++) rect(ctx, x + 5 + k * 6, y + 20, 3, 3, on ? "#f06010" : "#585f70");
    box(ctx, x + 6, y + 2, 15, 10, "#585f70");
    rect(ctx, x + 7, y + 3, 13, 3, "#8890a0");
    rect(ctx, x + 4, y + 5, 2, 2, OUT);
    rect(ctx, x + 21, y + 5, 2, 2, OUT);
    if (on) {
      for (let k = 0; k < 4; k++) {
        const f = Math.floor((t * 10 + k * 3) % 3);
        rect(ctx, x + 8 + k * 3, y + 12 - f, 2, 1 + f, k % 2 ? "#ffd040" : "#ff6a00");
      }
      steam(ctx, x + 9, y + 1, t);
    }
    box(ctx, x + 23, y + 7, 8, 4, "#40444c");
  };

  S.machine = function (ctx, id, x, y, on, t) {
    if (id === "OVEN_1" || id === "OVEN_2") S.oven(ctx, x, y, on, t);
    else if (id === "MICROWAVE") S.microwave(ctx, x, y, on, t);
    else S.coffee(ctx, x, y, on, t);
  };

  /* ---------- furniture ---------- */

  /* Chair seen from the front, 16 x 18; the seat is at y + 9. */
  S.chair = function (ctx, x, y) {
    box(ctx, x + 2, y, 12, 10, "#c07838");
    rect(ctx, x + 3, y + 1, 10, 2, "#e09858");
    box(ctx, x, y + 8, 16, 6, "#d08848");
    rect(ctx, x + 1, y + 9, 14, 1, "#f0b070");
    rect(ctx, x + 1, y + 13, 2, 5, OUT);
    rect(ctx, x + 13, y + 13, 2, 5, OUT);
  };

  /* Table 48 x 30 with a name plate; cloth = owner's colour or null. */
  S.table = function (ctx, x, y, cloth) {
    rect(ctx, x + 4, y + 18, 4, 12, OUT);
    rect(ctx, x + 40, y + 18, 4, 12, OUT);
    rect(ctx, x + 5, y + 18, 2, 11, "#8a5428");
    rect(ctx, x + 41, y + 18, 2, 11, "#8a5428");
    box(ctx, x, y, 48, 20, "#c88848");
    rect(ctx, x + 1, y + 1, 46, 13, "#e0a060");
    rect(ctx, x + 1, y + 1, 46, 2, "#f0c088");
    rect(ctx, x + 1, y + 14, 46, 5, "#a86c34");
    if (cloth) {
      rect(ctx, x + 2, y + 1, 44, 15, cloth);
      rect(ctx, x + 2, y + 1, 44, 2, S.shade(cloth, 0.4));
      for (let k = x + 3; k < x + 45; k += 6) rect(ctx, k, y + 16, 3, 3, S.shade(cloth, -0.25));
    }
  };

  /* A little flag stuck in a reserved table, 10 x 14 (pole at x). */
  S.flag = function (ctx, x, y, color) {
    rect(ctx, x, y, 1, 14, OUT);
    box(ctx, x + 1, y, 10, 7, color);
  };

  S.dish = function (ctx, x, y) {
    rect(ctx, x, y + 3, 12, 3, "#f0f2f8");
    rect(ctx, x + 1, y + 5, 10, 1, "#a0a8b8");
    rect(ctx, x + 3, y, 6, 4, "#e07a2d");
    rect(ctx, x + 4, y, 2, 1, "#4caf50");
    rect(ctx, x + 7, y + 1, 1, 1, "#ffd43b");
  };

  S.bag = function (ctx, x, y) {
    box(ctx, x, y + 2, 9, 8, "#d8b080");
    rect(ctx, x + 2, y, 1, 3, "#7a5a36");
    rect(ctx, x + 6, y, 1, 3, "#7a5a36");
    rect(ctx, x + 2, y, 5, 1, "#7a5a36");
    rect(ctx, x + 3, y + 5, 3, 2, "#d93b3b");
  };

  /* Potted plant, 16 x 22. */
  S.plant = function (ctx, x, y) {
    box(ctx, x + 3, y + 14, 10, 8, "#c86838");
    rect(ctx, x + 4, y + 15, 8, 2, "#e08850");
    rect(ctx, x + 2, y + 4, 12, 11, OUT);
    rect(ctx, x + 3, y + 5, 10, 9, "#38a048");
    rect(ctx, x + 5, y + 1, 6, 6, OUT);
    rect(ctx, x + 6, y + 2, 4, 5, "#50c060");
    rect(ctx, x + 4, y + 7, 3, 3, "#70d878");
    rect(ctx, x + 9, y + 9, 2, 2, "#70d878");
  };

  /* Bookshelf against the wall, 32 x 34. */
  S.bookshelf = function (ctx, x, y) {
    box(ctx, x, y, 32, 34, "#8a5428");
    const colors = ["#e04848", "#4870e0", "#48b060", "#e0b040", "#a050c0", "#40b0c0"];
    for (let r = 0; r < 3; r++) {
      rect(ctx, x + 2, y + 2 + r * 10, 28, 9, "#5a3418");
      for (let b = 0; b < 6; b++) rect(ctx, x + 3 + b * 4 + (r % 2), y + 4 + r * 10, 3, 7, colors[(b + r * 2) % 6]);
    }
  };

  /* Window on the back wall, 40 x 22. */
  S.window = function (ctx, x, y) {
    box(ctx, x, y, 40, 22, "#fbfbff");
    rect(ctx, x + 3, y + 3, 15, 16, "#98d0f0");
    rect(ctx, x + 22, y + 3, 15, 16, "#98d0f0");
    rect(ctx, x + 4, y + 4, 6, 2, "#d8f0ff");
    rect(ctx, x + 23, y + 4, 6, 2, "#d8f0ff");
  };

  /* Order ticket, w x h. */
  S.ticket = function (ctx, x, y, color, w, h) {
    w = w || 26;
    h = h || 30;
    rect(ctx, x + 1, y + 1, w, h, "rgba(0,0,0,0.25)");
    box(ctx, x, y, w, h, "#fffdf3");
    rect(ctx, x + 1, y + 1, w - 2, 5, color);
    rect(ctx, x + w / 2 - 1, y - 2, 3, 3, "#d03838");
  };

  /* Wooden sign post, w x 22. */
  S.sign = function (ctx, x, y, w) {
    w = w || 28;
    rect(ctx, x + w / 2 - 2, y + 12, 4, 10, OUT);
    rect(ctx, x + w / 2 - 1, y + 12, 2, 10, "#8a5428");
    box(ctx, x, y, w, 14, "#c88848");
    rect(ctx, x + 1, y + 1, w - 2, 2, "#e0a868");
  };

  /* Round tree, 30 x 34. */
  S.tree = function (ctx, x, y) {
    rect(ctx, x + 12, y + 22, 6, 12, OUT);
    rect(ctx, x + 13, y + 22, 4, 11, "#8a5428");
    rect(ctx, x + 2, y + 2, 26, 22, OUT);
    rect(ctx, x, y + 6, 30, 14, OUT);
    rect(ctx, x + 3, y + 3, 24, 20, "#38a048");
    rect(ctx, x + 1, y + 7, 28, 12, "#38a048");
    rect(ctx, x + 6, y + 5, 10, 6, "#58c868");
    rect(ctx, x + 18, y + 13, 6, 4, "#2a8038");
  };
})();
