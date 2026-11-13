/* Backdrop engine — the background drawing shared by the Backdrop tool and by
   the three generators. No page code, no DOM lookups: give it a context and a
   recipe, and it paints.

   A "recipe" is plain JSON so it can be stored in localStorage and handed
   between tools:

     { style: "weave", seed: "abc", palette: [...], scale: 50, rotation: 0,
       colors: 3, drift: 20, contrast: 60, grain: 0, softness: 0, ... }

   The same recipe must always paint the same picture, so every random choice
   comes from `rng`, never Math.random().

   Draw contract: Backdrop.draw(ctx, W, H, recipe) clears nothing; the caller
   clears. It paints the full rectangle it is given, at any size, so a preview
   and a 4000 px export match.

   Global: window.Backdrop
*/
(function (root) {
  "use strict";

  /* ---------------------------------------------------------------- random */
  /* Small, fast, seeded PRNG. xmur3 for string hashing, mulberry32 for output.
     Same seed string always gives the same stream. */
  function hashSeed(str) {
    var h = 1779033703 ^ String(str).length;
    for (var i = 0; i < String(str).length; i++) {
      h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  function rngFrom(seed) {
    var a = hashSeed(seed);
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------------------------------------------------------- colour */
  function toRgb(hex) {
    var h = String(hex || "#000").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function css(rgb, a) {
    return "rgba(" + Math.round(rgb[0]) + "," + Math.round(rgb[1]) + "," +
      Math.round(rgb[2]) + "," + (a === undefined ? 1 : a) + ")";
  }

  function shiftRgb(rgb, rnd, amount) {
    /* Nudge a colour by a random amount, keeping it in range. 16 is the
       midpoint so a drift of 0 leaves the colour untouched. */
    var d = (rnd() - 0.5) * 2 * amount;
    return [
      Math.max(0, Math.min(255, rgb[0] + d)),
      Math.max(0, Math.min(255, rgb[1] + d)),
      Math.max(0, Math.min(255, rgb[2] + d))
    ];
  }

  function mixRgb(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
  }

  /* HSL to RGB, h in degrees, s and l from 0 to 1. */
  function hslRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    if (s === 0) return [l * 255, l * 255, l * 255];
    function hue2rgb(p1, q1, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p1 + (q1 - p1) * 6 * t;
      if (t < 1 / 2) return q1;
      if (t < 2 / 3) return p1 + (q1 - p1) * (2 / 3 - t) * 6;
      return p1;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p1 = 2 * l - q;
    return [hue2rgb(p1, q, h + 1 / 3) * 255,
            hue2rgb(p1, q, h) * 255,
            hue2rgb(p1, q, h - 1 / 3) * 255];
  }

  /* Rotate a colour's hue, keeping its lightness and saturation. Used by the
     iridescent styles, where one palette colour has to read as several. */
  function hueShift(rgb, deg) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var l = (mx + mn) / 2, h = 0, sat = 0;
    if (mx !== mn) {
      var d = mx - mn;
      sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    h = (h + deg / 360) % 1;
    if (h < 0) h += 1;
    function hue2rgb(p1, q1, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p1 + (q1 - p1) * 6 * t;
      if (t < 1 / 2) return q1;
      if (t < 2 / 3) return p1 + (q1 - p1) * (2 / 3 - t) * 6;
      return p1;
    }
    var q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    var p2 = 2 * l - q;
    return [hue2rgb(p2, q, h + 1 / 3) * 255,
            hue2rgb(p2, q, h) * 255,
            hue2rgb(p2, q, h - 1 / 3) * 255];
  }

  function luma(rgb) {
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  }

  /* Pull a colour toward a neutral so fine line art stays readable on top. */
  function tame(rgb, contrast) {
    var c = Math.max(0, Math.min(1, contrast));
    var mid = 128;
    return [
      mid + (rgb[0] - mid) * c,
      mid + (rgb[1] - mid) * c,
      mid + (rgb[2] - mid) * c
    ];
  }

  function lum(hex) { return luma(toRgb(hex)); }

  /* ------------------------------------------------------------- palettes */
  /* Named sets. Each is a base list; `colors` trims it and `drift` spreads it. */
  var PALETTES = {
    forest:   ["#0e130e", "#1c2a1b", "#34502c", "#6b8f4e", "#c9a24a", "#e8d28a"],
    ink:      ["#0b0d12", "#1a1e28", "#2c3242", "#4a5266", "#8b93a8", "#e8ecf5"],
    linen:    ["#e8e0cf", "#d9cdb4", "#c2b092", "#a08f6f", "#7a6a4f", "#4c4132"],
    indigo:   ["#101a2c", "#1b2d4d", "#2f4a75", "#54739f", "#9db3d0", "#e2e9f4"],
    clay:     ["#2a1a14", "#4d2c22", "#7a4630", "#a86a45", "#c99a6b", "#e8c9a0"],
    slate:    ["#141821", "#232a36", "#39424f", "#5a6577", "#8b95a5", "#cfd6e0"],
    sage:     ["#1a2117", "#2f3a27", "#4d5c3a", "#7b8f5c", "#aebf92", "#e0e8d2"],
    plum:     ["#170f1c", "#2d1a36", "#4a2a56", "#714379", "#a06fa6", "#d3aed6"],
    wheat:    ["#2a2416", "#463a22", "#6e5a33", "#9c8449", "#c9b478", "#efe4c2"],
    rust:     ["#1f0e0a", "#3d1a12", "#6b2c1c", "#9c4426", "#c9703d", "#eda57a"],
    ice:      ["#0d1518", "#1b2a2e", "#2f474d", "#587c84", "#95b6bd", "#dceef1"],
    paper:    ["#f5f1e6", "#e6dfcd", "#d3c8b0", "#b8a98c", "#8f7f63", "#5f5340"],
    carbon:   ["#08090b", "#15171b", "#262a30", "#3d434b", "#5f6771", "#9aa2ac"],
    blush:    ["#2a1a1c", "#4a2a2e", "#7a4448", "#a8666a", "#d09a9a", "#f0cfcf"]
  };

  function palette(recipe) {
    var base = PALETTES[recipe.palette] || PALETTES.ink;
    var n = Math.max(1, Math.min(6, Number(recipe.colors || base.length)));
    var out = [];
    for (var i = 0; i < n; i++) {
      /* Spread the picks across the whole set so 2 colours are far apart. */
      var idx = n === 1 ? 0 : Math.round(i * (base.length - 1) / (n - 1));
      out.push(toRgb(base[idx]));
    }
    return out;
  }

  /* --------------------------------------------------------------- helpers */
  function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function scaleOf(recipe) {
    /* 0..100 -> a pixel step relative to the canvas, so a small preview and a
       huge export keep the same pattern density. */
    return 0.35 + clamp(num(recipe.scale, 50), 0, 100) / 100 * 2.65;
  }

  /* Fine-grain overlay, shared by every style. */
  function addGrain(ctx, W, H, amount, seed) {
    var strength = clamp(num(amount, 0), 0, 100) / 100;
    if (strength <= 0) return;
    var rnd = rngFrom(seed + "-grain");
    var tile = document.createElement("canvas");
    tile.width = tile.height = 128;
    var tc = tile.getContext("2d");
    var img = tc.createImageData(128, 128);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 128 + (rnd() - 0.5) * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    tc.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = strength * 0.28;
    var pat = ctx.createPattern(tile, "repeat");
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function addVignette(ctx, W, H, amount) {
    var a = clamp(num(amount, 0), 0, 100) / 100;
    if (a <= 0) return;
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25,
      W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0," + (a * 0.55).toFixed(3) + ")");
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* ---------------------------------------------------------------- styles */
  /* Every style is function (ctx, W, H, R) where R is the resolved recipe:
       R.rnd    seeded random, 0..1
       R.cols   colour list, rgb arrays, already contrast-tamed
       R.p      pixel step for the pattern
       R.seed   the raw seed string
     Styles must paint edge to edge and must not assume a size. */
  var STYLES = {};

  /* ---- family: woven ---- */

  /* Multicolour weave: a plain over-under warp and weft, each thread its own
     hue, with a soft shadow where threads cross. */
  STYLES.weave = function (ctx, W, H, R) {
    var step = Math.max(6, R.p * 0.5);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);

    /* warp (vertical) */
    for (var x = -step; x < W + step; x += step) {
      var c = shiftRgb(R.cols[1 + Math.floor(R.rnd() * (R.cols.length - 1))] || R.cols[0], R.rnd, 26);
      ctx.fillStyle = css(c);
      ctx.fillRect(x, 0, step * 0.78, H);
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(x + step * 0.72, 0, step * 0.08, H);
    }

    /* weft (horizontal), drawn in short runs so it passes under and over */
    for (var y = -step; y < H + step; y += step) {
      var c2 = shiftRgb(R.cols[1 + Math.floor(R.rnd() * (R.cols.length - 1))] || R.cols[0], R.rnd, 26);
      for (var xx = 0; xx < W; xx += step * 2) {
        ctx.fillStyle = css(c2, 0.92);
        ctx.fillRect(xx, y, step, step * 0.74);
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(xx, y + step * 0.68, step, step * 0.08);
      }
    }
    ctx.restore();
  };

  /* Tartan: a registered sett of crossed bands, mirrored so it reads as cloth. */
  STYLES.tartan = function (ctx, W, H, R) {
    var step = Math.max(10, R.p * 1.1);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    var bands = [];
    for (var i = 0; i < 4; i++) {
      bands.push({
        w: step * (0.25 + R.rnd() * 0.9),
        c: R.cols[(i + 1) % R.cols.length],
        a: 0.35 + R.rnd() * 0.4
      });
    }
    function drawAxis(horizontal) {
      var at = 0, k = 0;
      while (at < (horizontal ? W : H)) {
        var b = bands[k % bands.length];
        ctx.fillStyle = css(b.c, b.a);
        if (horizontal) ctx.fillRect(at, 0, b.w, H);
        else ctx.fillRect(0, at, W, b.w);
        at += b.w + step * 0.55;
        k++;
      }
    }
    drawAxis(true);
    ctx.globalCompositeOperation = "multiply";
    drawAxis(false);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#fff";
    /* the fine overcheck thread */
    for (var y = 0; y < H; y += step * 4) ctx.fillRect(0, y, W, 1.5);
    ctx.restore();
  };

  /* Plaid: wide soft bands, low contrast, blurred edges. */
  STYLES.plaid = function (ctx, W, H, R) {
    var step = Math.max(24, R.p * 3.2);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    ctx.filter = "blur(" + Math.max(2, step * 0.12).toFixed(1) + "px)";
    for (var i = 0; i < 6; i++) {
      var c = R.cols[1 + (i % Math.max(1, R.cols.length - 1))];
      var w = step * (0.5 + R.rnd() * 1.6);
      var at = R.rnd() * W;
      ctx.fillStyle = css(c, 0.28);
      ctx.fillRect(at, -step, w, H + step * 2);
    }
    for (var j = 0; j < 5; j++) {
      var c2 = R.cols[1 + (j % Math.max(1, R.cols.length - 1))];
      var h2 = step * (0.4 + R.rnd() * 1.4);
      var y = R.rnd() * H;
      ctx.fillStyle = css(c2, 0.24);
      ctx.fillRect(-step, y, W + step * 2, h2);
    }
    ctx.filter = "none";
    ctx.restore();
  };

  /* Herringbone: broken zigzag columns, the twill direction alternates. */
  STYLES.herringbone = function (ctx, W, H, R) {
    var step = Math.max(8, R.p * 0.8);
    var run = step * 4;
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = Math.max(1.2, step * 0.22);
    for (var col = 0; col < W + run; col += run) {
      var up = (col / run) % 2 === 0;
      ctx.strokeStyle = css(R.cols[1 + (Math.floor(col / run) % Math.max(1, R.cols.length - 1))] || R.cols[1], 0.85);
      ctx.beginPath();
      var y0 = up ? 0 : H;
      ctx.moveTo(col, y0);
      ctx.lineTo(col + run, up ? H : 0);
      ctx.stroke();
    }
    /* merge the strokes into a woven rib with a soft overlay */
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.25;
    for (var x = 0; x < W; x += step) {
      ctx.fillStyle = R.rnd() > 0.5 ? "#ffffff" : "#000000";
      ctx.fillRect(x, 0, step * 0.5, H);
    }
    ctx.restore();
  };

  /* Twill: a diagonal float, near-flat, with a raised rib every few threads. */
  STYLES.twill = function (ctx, W, H, R) {
    var step = Math.max(5, R.p * 0.45);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    for (var y = -step * 4; y < H + step * 4; y += step) {
      for (var x = -step * 4; x < W + step * 4; x += step * 2) {
        var off = (y / step) % 4 * step;
        var c = R.cols[1 + (Math.floor((x + off) / step) % Math.max(1, R.cols.length - 1))] || R.cols[1];
        ctx.fillStyle = css(c, 0.5);
        ctx.fillRect(x + off, y, step * 0.9, step * 0.45);
      }
    }
    ctx.restore();
  };

  /* Basket weave: chunky two-over-two blocks, a coarse lattice. */
  STYLES.basket = function (ctx, W, H, R) {
    var step = Math.max(14, R.p * 1.6);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    for (var row = 0; row * step < H; row++) {
      for (var col = 0; col * step < W; col++) {
        var horizontal = (row + col) % 2 === 0;
        var c = R.cols[1 + ((row * 3 + col) % Math.max(1, R.cols.length - 1))] || R.cols[1];
        var pad = step * 0.06;
        ctx.fillStyle = css(shiftRgb(c, R.rnd, 18));
        if (horizontal) ctx.fillRect(col * step + pad, row * step + pad, step - pad * 2, step * 0.44);
        else ctx.fillRect(col * step + pad, row * step + pad, step * 0.44, step - pad * 2);
        ctx.fillStyle = "rgba(0,0,0,0.1)";
        if (horizontal) ctx.fillRect(col * step, row * step + step * 0.5, step, step * 0.06);
        else ctx.fillRect(col * step + step * 0.5, row * step, step * 0.06, step);
      }
    }
    ctx.restore();
  };

  /* Ikat: feathered dye blur along one axis, so every motif edge bleeds. */
  STYLES.ikat = function (ctx, W, H, R) {
    var step = Math.max(18, R.p * 2.2);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < Math.ceil(W / step) + 1; i++) {
      var c = R.cols[1 + (i % Math.max(1, R.cols.length - 1))];
      var w = step * (0.3 + R.rnd() * 0.5);
      var x = i * step;
      for (var band = 0; band < 4; band++) {
        var y = R.rnd() * H;
        var h = step * (0.5 + R.rnd() * 2.4);
        ctx.filter = "blur(" + (2 + R.rnd() * step * 0.16).toFixed(1) + "px)";
        ctx.fillStyle = css(c, 0.55);
        ctx.fillRect(x, y, w, h);
      }
    }
    ctx.filter = "none";
    ctx.restore();
  };

  /* Kilim: flat stepped motifs in an earth palette, with slit-tapestry gaps. */
  STYLES.kilim = function (ctx, W, H, R) {
    var step = Math.max(16, R.p * 1.9);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    for (var row = 0; row * step < H + step; row++) {
      for (var col = 0; col * step < W + step; col++) {
        var c = R.cols[1 + ((row + col * 2) % Math.max(1, R.cols.length - 1))] || R.cols[1];
        var cx = col * step, cy = row * step;
        ctx.fillStyle = css(c, 0.9);
        /* stepped diamond, built from squares so the edge stays crisp */
        var layers = [
          [0.5, 0.5, 0.34],
          [0.5, 0.5, 0.22],
          [0.34, 0.34, 0.14]
        ];
        for (var l = 0; l < layers.length; l++) {
          var L = layers[l];
          ctx.fillRect(cx + step * (L[0] - L[2] / 2), cy + step * (L[1] - L[2] / 2), step * L[2], step * L[2]);
        }
        ctx.fillStyle = "rgba(0,0,0,0.14)";
        ctx.fillRect(cx, cy + step * 0.94, step, step * 0.06);
        ctx.fillRect(cx + step * 0.94, cy, step * 0.06, step);
      }
    }
    ctx.restore();
  };

  /* Shibori: bound-resist indigo rosettes, soft bleed, indigo base. */
  STYLES.shibori = function (ctx, W, H, R) {
    var step = Math.max(30, R.p * 3.4);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    for (var row = -1; row * step < H + step; row++) {
      for (var col = -1; col * step < W + step; col++) {
        var cx = col * step + (row % 2 ? step / 2 : 0);
        var cy = row * step;
        var r = step * (0.24 + R.rnd() * 0.24);
        var g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
        g.addColorStop(0, css(R.cols[R.cols.length - 1], 0.85));
        g.addColorStop(0.65, css(R.cols[Math.min(1, R.cols.length - 1)], 0.35));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        /* bound-resist creases radiating from the tie */
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        for (var k = 0; k < 7; k++) {
          var a = (k / 7) * Math.PI * 2 + R.rnd();
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r * 0.15, cy + Math.sin(a) * r * 0.15);
          ctx.lineTo(cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r * 1.6);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  };

  /* Damask: tone-on-tone figured ground, very low contrast, woven sheen. */
  STYLES.damask = function (ctx, W, H, R) {
    var step = Math.max(20, R.p * 2.4);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    var ink = R.cols[Math.min(1, R.cols.length - 1)];
    for (var row = -1; row * step * 1.3 < H + step; row++) {
      for (var col = -1; col * step < W + step; col++) {
        var cx = col * step + (row % 2 ? step / 2 : 0);
        var cy = row * step * 1.3;
        ctx.fillStyle = css(mixRgb(R.cols[0], ink, 0.22));
        /* an ogee leaf, mirrored */
        ctx.beginPath();
        ctx.moveTo(cx, cy - step * 0.42);
        ctx.bezierCurveTo(cx + step * 0.3, cy - step * 0.2, cx + step * 0.3, cy + step * 0.2, cx, cy + step * 0.42);
        ctx.bezierCurveTo(cx - step * 0.3, cy + step * 0.2, cx - step * 0.3, cy - step * 0.2, cx, cy - step * 0.42);
        ctx.fill();
        ctx.strokeStyle = css(ink, 0.18);
        ctx.lineWidth = Math.max(0.8, step * 0.02);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  /* Jacquard: a figured cloth where every cell is a woven pixel. */
  STYLES.jacquard = function (ctx, W, H, R) {
    var step = Math.max(4, R.p * 0.32);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    for (var y = 0; y * step < H; y++) {
      for (var x = 0; x * step < W; x++) {
        var n = R.rnd();
        var c = R.cols[1 + Math.floor(n * Math.max(1, R.cols.length - 1))] || R.cols[1];
        ctx.fillStyle = css(c, 0.35 + (n > 0.5 ? 0.3 : 0.05));
        ctx.fillRect(x * step, y * step, step * 0.94, step * 0.94);
      }
    }
    /* the weave grid on top keeps it from reading as noise */
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (var yy = 0; yy < H; yy += step * 3) ctx.fillRect(0, yy, W, Math.max(1, step * 0.3));
    for (var xx = 0; xx < W; xx += step * 3) ctx.fillRect(xx, 0, Math.max(1, step * 0.3), H);
    ctx.restore();
  };

  /* ---- family: paper & print ---- */

  /* Cyanotype: sun-blue ground with bleached, uneven highlights. */
  STYLES.cyanotype = function (ctx, W, H, R) {
    var step = Math.max(20, R.p * 2.6);
    ctx.save();
    var base = R.cols[0];
    var g = ctx.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, css(mixRgb(base, [20, 40, 90], 0.55)));
    g.addColorStop(0.55, css(mixRgb(base, [30, 70, 140], 0.35)));
    g.addColorStop(1, css(mixRgb(base, [10, 24, 56], 0.6)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* bleached wash patches, big and soft */
    for (var i = 0; i < 14; i++) {
      var cx = R.rnd() * W, cy = R.rnd() * H, r = step * (1.4 + R.rnd() * 4);
      var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, "rgba(225,238,255,0.20)");
      rg.addColorStop(1, "rgba(225,238,255,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    /* fine chemical speckle */
    ctx.fillStyle = "rgba(240,248,255,0.18)";
    for (var s = 0; s < W * H / 2600; s++) {
      ctx.fillRect(R.rnd() * W, R.rnd() * H, 1.3, 1.3);
    }
    ctx.restore();
  };

  /* Cold-press paper: pebbled tooth with a broad raking light. */
  STYLES.paper = function (ctx, W, H, R) {
    var step = Math.max(3, R.p * 0.22);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    for (var y = 0; y < H; y += step) {
      for (var x = 0; x < W; x += step) {
        var n = R.rnd();
        if (n > 0.55) {
          ctx.fillStyle = "rgba(0,0,0," + (0.02 + n * 0.05).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(x + R.rnd() * step, y + R.rnd() * step, step * (0.2 + R.rnd() * 0.45), 0, Math.PI * 2);
          ctx.fill();
        } else if (n < 0.25) {
          ctx.fillStyle = "rgba(255,255,255,0.05)";
          ctx.fillRect(x, y, step * 0.7, step * 0.7);
        }
      }
    }
    var g = ctx.createLinearGradient(0, 0, W * 0.6, H);
    g.addColorStop(0, "rgba(255,255,255,0.10)");
    g.addColorStop(0.5, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.08)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  };

  /* Suminagashi: concentric ink rings floated on water, never repeating. */
  STYLES.suminagashi = function (ctx, W, H, R) {
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    var rings = 26;
    for (var i = 0; i < rings; i++) {
      var cx = W * (0.15 + R.rnd() * 0.7);
      var cy = H * (0.15 + R.rnd() * 0.7);
      var c = R.cols[1 + Math.floor(R.rnd() * Math.max(1, R.cols.length - 1))] || R.cols[1];
      ctx.strokeStyle = css(c, 0.28 + R.rnd() * 0.3);
      ctx.lineWidth = Math.max(1, Math.min(W, H) * (0.002 + R.rnd() * 0.006));
      /* ellipse, not circle: the water tray is shallow and the rings wander */
      var rx = Math.min(W, H) * (0.08 + R.rnd() * 0.42);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, rx * (0.72 + R.rnd() * 0.5), R.rnd() * Math.PI, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* ---- family: geometric ---- */

  /* Grid: a precise modular lattice, with a little weight variation. */
  STYLES.grid = function (ctx, W, H, R) {
    var step = Math.max(12, R.p * 1.4);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    var c = R.cols[Math.min(1, R.cols.length - 1)];
    ctx.strokeStyle = css(c, 0.4);
    for (var x = 0; x <= W; x += step) {
      ctx.lineWidth = (x / step) % 5 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (var y = 0; y <= H; y += step) {
      ctx.lineWidth = (y / step) % 5 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* Dot screen: a regular halftone lattice with soft dot edges. */
  STYLES.dots = function (ctx, W, H, R) {
    var step = Math.max(6, R.p * 0.7);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    var c = R.cols[1 + (R.cols.length > 2 ? 1 : 0)] || R.cols[0];
    ctx.fillStyle = css(c, 0.55);
    for (var y = 0; y < H + step; y += step) {
      for (var x = 0; x < W + step; x += step) {
        var r = step * (0.16 + R.rnd() * 0.2);
        ctx.beginPath();
        ctx.arc(x + (y / step % 2 ? step / 2 : 0), y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  /* ---- family: light ---- */

  /* Radial glow: a central bloom fading to the edges. */
  STYLES.glow = function (ctx, W, H, R) {
    ctx.save();
    var base = R.cols[0];
    var light = R.cols[R.cols.length - 1];
    ctx.fillStyle = css(base);
    ctx.fillRect(0, 0, W, H);
    var g = ctx.createRadialGradient(W * 0.5, H * 0.42, 0,
      W * 0.5, H * 0.42, Math.max(W, H) * 0.78);
    g.addColorStop(0, css(light, 0.5));
    g.addColorStop(0.45, css(mixRgb(base, light, 0.4), 0.24));
    g.addColorStop(1, css(base, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  };

  /* Smoke: curling plumes over a dark base, thinning as they rise. */
  STYLES.smoke = function (ctx, W, H, R) {
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    var light = R.cols[R.cols.length - 1];
    ctx.globalCompositeOperation = "screen";
    for (var i = 0; i < 22; i++) {
      var x = W * (0.2 + R.rnd() * 0.6);
      var y = H * (0.35 + R.rnd() * 0.7);
      var r = Math.min(W, H) * (0.08 + R.rnd() * 0.22);
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, css(light, 0.055));
      g.addColorStop(0.6, css(light, 0.02));
      g.addColorStop(1, css(light, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  };

  /* ---- family: intricate (the showpieces) ---- */

  /* Guilloche: the engine-turned engraving on banknotes and watch dials. Rings
     of interleaved sine lobes, every ring rotated and phase-shifted, drawn with
     a hairline so the overdraw builds a moire shimmer. */
  STYLES.guilloche = function (ctx, W, H, R) {
    var min = Math.min(W, H);
    var cx = W / 2, cy = H / 2;
    var rings = Math.round(16 + R.rnd() * 18);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = Math.max(0.6, min * 0.0016);
    for (var i = 0; i < rings; i++) {
      var t = i / rings;
      var rad = min * (0.06 + t * 0.72);
      var lobes = 5 + Math.floor(R.rnd() * 17);
      var amp = min * (0.004 + R.rnd() * 0.028);
      var c = R.cols[1 + (i % Math.max(1, R.cols.length - 1))] || R.cols[1];
      ctx.strokeStyle = css(c, 0.26 + R.rnd() * 0.3);
      ctx.beginPath();
      var steps = Math.max(180, lobes * 26);
      for (var s = 0; s <= steps; s++) {
        var a = (s / steps) * Math.PI * 2;
        var rr = rad + Math.sin(a * lobes + i * 0.7) * amp;
        var x = cx + Math.cos(a) * rr;
        var y = cy + Math.sin(a) * rr * 0.995;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    /* the fine radial hairlines that make it read as engraving, not wire */
    ctx.strokeStyle = css(R.cols[R.cols.length - 1], 0.1);
    for (var k = 0; k < 90; k++) {
      var ang = (k / 90) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * min * 0.07, cy + Math.sin(ang) * min * 0.07);
      ctx.lineTo(cx + Math.cos(ang) * min * 0.8, cy + Math.sin(ang) * min * 0.8);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* Star quilt: overlapping girih-style star rosettes on a fine lattice. Each
     rosette is a real eight-point star with an inner octagon, and the lattice
     threads behind them, so the density changes with scale. */
  STYLES.starquilt = function (ctx, W, H, R) {
    var step = Math.max(26, R.p * 2.8);
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);

    /* the underlying diagonal lattice */
    ctx.strokeStyle = css(R.cols[Math.min(1, R.cols.length - 1)], 0.18);
    ctx.lineWidth = Math.max(0.7, step * 0.018);
    for (var d = -H; d < W; d += step) {
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + H, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(d, H); ctx.lineTo(d + H, 0); ctx.stroke();
    }

    function rosette(cx, cy, rad, cols, alpha) {
      var points = 8;
      ctx.beginPath();
      for (var i = 0; i < points * 2; i++) {
        var a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
        var rr = i % 2 === 0 ? rad : rad * 0.46;
        var x = cx + Math.cos(a) * rr;
        var y = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = css(cols, alpha);
      ctx.fill();
      ctx.strokeStyle = css(R.cols[R.cols.length - 1], Math.min(1, alpha + 0.15));
      ctx.stroke();
      /* inner octagon */
      ctx.beginPath();
      for (var j = 0; j < points; j++) {
        var b = (j / points) * Math.PI * 2;
        var x2 = cx + Math.cos(b) * rad * 0.27;
        var y2 = cy + Math.sin(b) * rad * 0.27;
        if (j === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
      }
      ctx.closePath();
      ctx.stroke();
    }

    var rowStep = step * 0.87;
    for (var row = -1; row * rowStep < H + step * 2; row++) {
      for (var col = -1; col * step < W + step * 3; col++) {
        var cx = col * step + (row % 2 ? step / 2 : 0);
        var cy = row * rowStep;
        var c = R.cols[1 + ((row + col) % Math.max(1, R.cols.length - 1))] || R.cols[1];
        rosette(cx, cy, step * 0.42, c, 0.55);
      }
    }
    ctx.restore();
  };

  /* Fluid marbling: real domain-warped noise, so the veins curl like ink in a
     bath. Two warped fields at different frequencies give the fine secondary
     filaments that read as expensive rather than blobby. */
  STYLES.filament = function (ctx, W, H, R) {
    var gw = 180, gh = Math.max(120, Math.round(180 * H / W));
    var base = document.createElement("canvas");
    base.width = gw; base.height = gh;
    var bc = base.getContext("2d");
    var img = bc.createImageData(gw, gh);

    function noiseGrid(nx, ny) {
      var g = new Float32Array(nx * ny);
      for (var i = 0; i < g.length; i++) g[i] = R.rnd();
      return g;
    }
    function sample(g, nx, ny, x, y) {
      var x0 = Math.floor(x), y0 = Math.floor(y);
      var fx = x - x0, fy = y - y0;
      var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      function at(ix, iy) {
        var ax = ((ix % nx) + nx) % nx, ay = ((iy % ny) + ny) % ny;
        return g[ay * nx + ax];
      }
      var a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }

    var A = noiseGrid(6, 6);
    var B = noiseGrid(4, 4);
    var C = noiseGrid(9, 9);
    var n = R.cols.length;

    for (var y = 0; y < gh; y++) {
      for (var x = 0; x < gw; x++) {
        var u = x / gw * 6, v = y / gh * 6;
        /* two-stage warp: the second pass is what turns blobs into veins */
        var wx = sample(B, 4, 4, x / gw * 4, y / gh * 4) - 0.5;
        var wy = sample(B, 4, 4, x / gw * 4 + 2.3, y / gh * 4 + 1.7) - 0.5;
        var u2 = u + wx * 2.6, v2 = v + wy * 2.6;
        var val = sample(A, 6, 6, u2, v2);
        /* band it hard: a marbled vein is a narrow edge, not a soft gradient */
        var band = Math.abs(val - 0.5) * 2;
        band = Math.pow(1 - band, 6);
        var fine = sample(C, 9, 9, x / gw * 9 + wx * 3, y / gh * 9 + wy * 3);
        var t = clamp(band * 0.75 + fine * 0.35, 0, 0.999);
        var c = R.cols[Math.floor(t * n)];
        var o = (y * gw + x) * 4;
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
    }
    bc.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.18);
    ctx.translate(-W / 2, -H / 2);
    ctx.drawImage(base, -W * 0.08, -H * 0.08, W * 1.16, H * 1.16);
    ctx.restore();
  };

  /* Moire: two fine line gratings laid at a small angle to each other. Where
     the lines cross they interfere, and the eye reads broad curved bands that
     were never drawn. This is the classic engraving trick and costs almost
     nothing: two loops of straight lines. */
  STYLES.moire = function (ctx, W, H, R) {
    var diag = Math.sqrt(W * W + H * H) * 1.2;
    var step = Math.max(3.5, R.p * 0.28);
    var a1 = -0.5 + R.rnd() * 0.3;
    var a2 = a1 + (0.035 + R.rnd() * 0.06);
    var c1 = R.cols[1 + (R.cols.length > 2 ? 1 : 0)] || R.cols[0];
    var c2 = R.cols[R.cols.length - 1];
    var lw = Math.max(0.6, Math.min(W, H) * 0.0018);

    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);

    /* first grating */
    ctx.save();
    ctx.rotate(a1);
    ctx.strokeStyle = css(c1, 0.34);
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (var i = -diag / 2; i < diag / 2; i += step) {
      ctx.moveTo(-diag / 2, i);
      ctx.lineTo(diag / 2, i);
    }
    ctx.stroke();
    ctx.restore();

    /* second grating, a hair off the first */
    ctx.save();
    ctx.rotate(a2);
    ctx.strokeStyle = css(c2, 0.22);
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (var j = -diag / 2; j < diag / 2; j += step * 1.02) {
      ctx.moveTo(-diag / 2, j);
      ctx.lineTo(diag / 2, j);
    }
    ctx.stroke();
    ctx.restore();

    /* a third, radial set: the bands curve instead of running straight */
    var spokes = Math.round(48 + R.rnd() * 40);
    ctx.strokeStyle = css(c2, 0.14);
    ctx.lineWidth = lw;
    for (var k = 0; k < spokes; k++) {
      var a = (k / spokes) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * diag * 0.06, Math.sin(a) * diag * 0.06);
      ctx.lineTo(Math.cos(a) * diag * 0.5, Math.sin(a) * diag * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* ---- family: impact (strict symmetry, high detail) ---- */

  /* Soft radial falloff to the base colour. Every radial style ends with this,
     so the middle stays rich while the edges go quiet under other artwork. */
  function radialFade(ctx, W, H, base, strength) {
    var a = clamp(num(strength, 70), 0, 100) / 100;
    if (a <= 0) return;
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22,
      W / 2, H / 2, Math.max(W, H) * 0.74);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.55, css(base, a * 0.30));
    g.addColorStop(1, css(base, a * 0.92));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* Radius for a radial style. Using the shortest side would shrink the disc
     to a stamp in the middle of a tall or wide frame, so this follows the
     diagonal instead: the pattern always fills the picture and crops at the
     edges, which is what a background needs. */
  function radialR(W, H, share) {
    return Math.sqrt(W * W + H * H) * 0.5 * (share || 0.70);
  }

  /* Read a per-style setting with a default, so older recipes still draw. */
  function opt(R, key, dflt) {
    var v = R.opts ? R.opts[key] : undefined;
    return v === undefined || v === null || v === "" ? dflt : v;
  }

  /* 1. Quasicrystal: two rings of plane waves at a golden-ratio spacing, so
        the rosettes never repeat. Symmetry is exact because each ring is a
        rotated set: turn the picture by 360/fold degrees and the rings map
        onto themselves. The seed only turns the whole thing. */
  STYLES.quasicrystal = function (ctx, W, H, R) {
    var fold = clamp(Math.round(num(opt(R, "fold", 8), 8)), 4, 14);
    var sharp = clamp(num(opt(R, "sharp", 55), 55), 0, 100) / 100;
    var bands = clamp(Math.round(num(opt(R, "bands", 5), 5)), 2, 10);
    var density = clamp(num(opt(R, "density", 55), 55), 0, 100) / 100;

    /* The pattern is summed at this resolution, then scaled up. It is much
       cheaper than a per-pixel pass at export size, and the bands are smooth
       enough that the upscale is invisible. */
    var gw = clamp(Math.round(Math.min(W, H) / 0.92), 320, 1100);
    var gh = Math.max(160, Math.round(gw * H / W));
    var cv = document.createElement("canvas");
    cv.width = gw; cv.height = gh;
    var cc = cv.getContext("2d");
    var img = cc.createImageData(gw, gh);

    /* Two concentric rings of waves. The second is at 1.618 (the golden
       ratio) times the frequency, which is incommensurate with the first, so
       the two never line up twice. Both rings step by 360/fold.
       cos(d.x) repeats for the opposite direction, so only the first half of
       each ring is needed; the other half is the same wave again. */
    var PHI = 1.6180339887;
    var dirs = [];
    var a0 = R.rnd() * Math.PI * 2;
    var k1 = 9 + density * 26;
    var half = Math.floor(fold / 2);
    for (var i = 0; i <= half; i++) {
      var a = a0 + (i / fold) * Math.PI * 2;
      /* the two axes of the ring are single waves, the rest are pairs */
      var wgt = (i === 0 || (fold % 2 === 0 && i === half)) ? 1 : 2;
      dirs.push({ x: Math.cos(a) * k1, y: Math.sin(a) * k1, w: wgt });
    }
    for (var j = 0; j * 2 < fold; j++) {
      var b = a0 + ((j + 0.5) / fold) * Math.PI * 2;
      dirs.push({ x: Math.cos(b) * k1 * PHI, y: Math.sin(b) * k1 * PHI, w: 1.44 });
    }

    var gain = 2.5 + sharp * 8;
    var weights = 0;
    for (var d0 = 0; d0 < dirs.length; d0++) weights += dirs[d0].w;

    var n = R.cols.length;
    /* Keep the square picture square: use the shorter side as the unit. */
    var unit = 1 / Math.min(gw, gh);

    /* Each wave is a cosine of a phase that advances by a fixed amount as x
       moves one pixel, so the cosines are carried with a rotation instead of
       being recalculated per pixel. That is most of the speed. */
    var nd = dirs.length;
    var cosv = new Float64Array(nd), sinv = new Float64Array(nd);
    var dcos = new Float64Array(nd), dsin = new Float64Array(nd);
    for (var q0 = 0; q0 < nd; q0++) {
      var step = dirs[q0].x * unit;
      dcos[q0] = Math.cos(step); dsin[q0] = Math.sin(step);
    }

    var lineCol = R.cols[0];
    for (var y = 0; y < gh; y++) {
      var py = (y - gh / 2) * unit;
      var v, o, c, d;
      for (d = 0; d < nd; d++) {
        var ph = dirs[d].x * (-gw / 2 * unit) + dirs[d].y * py;
        cosv[d] = Math.cos(ph); sinv[d] = Math.sin(ph);
      }
      for (var x = 0; x < gw; x++) {
        v = 0;
        for (d = 0; d < nd; d++) {
          v += cosv[d] * dirs[d].w;
          /* advance this wave by one pixel */
          var nc = cosv[d] * dcos[d] - sinv[d] * dsin[d];
          sinv[d] = sinv[d] * dcos[d] + cosv[d] * dsin[d];
          cosv[d] = nc;
        }
        /* renorm now and then so rounding cannot drift over a long row */
        if ((x & 15) === 15) {
          for (d = 0; d < nd; d++) {
            var m = 1 / Math.sqrt(cosv[d] * cosv[d] + sinv[d] * sinv[d] || 1);
            cosv[d] *= m; sinv[d] *= m;
          }
        }
        /* a cubic instead of tanh: nearly the same shape, much cheaper */
        var u = v / weights * gain * 0.5;
        u = u < -1 ? -1 : (u > 1 ? 1 : u);
        v = 0.5 + 0.5 * u * (1.5 - 0.5 * u * u);
        var band = Math.min(1, Math.max(0, v));
        /* Contour lines: the distance from this point to the nearest band edge,
           measured in the value itself, so the line follows the curve instead
           of the pixel grid. */
        var f = band * (bands - 1);
        var edge = Math.min(f - Math.floor(f), Math.ceil(f) - f);
        c = edge < 0.022 && bands > 2 ? lineCol
          : R.cols[Math.min(n - 1, Math.floor(band * n))];
        o = (y * gw + x) * 4;
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
    }
    cc.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cv, 0, 0, W, H);
    ctx.restore();
    radialFade(ctx, W, H, R.cols[0], opt(R, "fade", 65));
  };

  /* 2. Hyperbolic tiling: an Escher disc. Rings of tiles whose angular width
        shrinks toward the rim, so the pattern appears to run to infinity. */
  STYLES.hyperbolic = function (ctx, W, H, R) {
    var base = clamp(Math.round(num(opt(R, "base", 6), 6)), 3, 12);
    var depth = clamp(Math.round(num(opt(R, "depth", 7), 7)), 3, 12);
    var curve = clamp(num(opt(R, "curve", 60), 60), 0, 100) / 100;
    var grout = clamp(num(opt(R, "grout", 30), 30), 0, 100) / 100;

    var cx = W / 2, cy = H / 2;
    var Rmax = radialR(W, H, 0.72);

    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);

    /* the ground of the disc, a shade lighter than the page */
    ctx.beginPath();
    ctx.arc(cx, cy, Rmax, 0, Math.PI * 2);
    ctx.fillStyle = css(R.cols[Math.min(1, R.cols.length - 1)], 0.42);
    ctx.fill();

    var lw = Math.max(0.7, Math.min(W, H) * 0.0022) * (0.55 + grout * 1.3);
    var compress = 0.62 + curve * 1.05;

    /* Rings of tiles. Each ring holds about 1.5 times the tiles of the one
       inside it, and each ring is turned half a tile from the last. That is
       what an Escher disc looks like: tiles shrink as they crowd the rim. */
    var running = base;
    for (var k = 1; k <= depth; k++) {
      var t0 = (k - 1) / depth, t1 = k / depth;
      var r0 = Math.pow(t0, compress) * Rmax;
      var r1 = Math.pow(t1, compress) * Rmax;
      var tiles = Math.round(running);
      running *= 1.52;
      tiles = clamp(tiles, 3, 700);

      var band = Math.max(r1 - r0, 0.5);
      var bowAmt = Math.min(band * (0.10 + curve * 0.20), r0 * 0.35);
      var offset = (k % 2) * (Math.PI / tiles);
      var cA = R.cols[1 + (k % Math.max(1, R.cols.length - 1))] || R.cols[1];
      var cB = R.cols[1 + ((k + 1) % Math.max(1, R.cols.length - 1))] || cA;

      for (var j = 0; j < tiles; j++) {
        var a0 = (j / tiles) * Math.PI * 2 + offset;
        var a1 = ((j + 1) / tiles) * Math.PI * 2 + offset;
        var am = (a0 + a1) / 2;
        /* the pair of edges bow outward, so the tile reads as a curved shard
           rather than a straight wedge; alternate the bow to interlock */
        var bow = (j % 2 ? -bowAmt : bowAmt);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0);
        ctx.quadraticCurveTo(
          cx + Math.cos(am) * (r0 + bow + band * 0.5),
          cy + Math.sin(am) * (r0 + bow + band * 0.5),
          cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0);
        ctx.quadraticCurveTo(
          cx + Math.cos(am) * (r1 + bow * 0.55),
          cy + Math.sin(am) * (r1 + bow * 0.55),
          cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1);
        ctx.lineTo(cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1);
        ctx.quadraticCurveTo(
          cx + Math.cos(am) * (r1 + bow * 0.55),
          cy + Math.sin(am) * (r1 + bow * 0.55),
          cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0);
        ctx.closePath();
        ctx.fillStyle = css((j % 2 ? cA : cB), 0.34 + ((j * 5 + k * 3) % 3) * 0.16);
        ctx.fill();
        ctx.strokeStyle = css(R.cols[0], 0.45 + grout * 0.5);
        ctx.lineWidth = lw;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r1, 0, Math.PI * 2);
      ctx.strokeStyle = css(R.cols[R.cols.length - 1], 0.18 + grout * 0.30);
      ctx.lineWidth = lw * 0.9;
      ctx.stroke();
    }

    /* the rim */
    ctx.beginPath();
    ctx.arc(cx, cy, Rmax, 0, Math.PI * 2);
    ctx.strokeStyle = css(R.cols[R.cols.length - 1], 0.55);
    ctx.lineWidth = lw * 1.8;
    ctx.stroke();
    ctx.restore();
    radialFade(ctx, W, H, R.cols[0], opt(R, "fade", 55));
  };

  /* 3. Cymatic plate: Chladni figures, the shapes sand makes on a vibrating
        plate. Mirror-symmetric in both axes by the formula itself. */
  STYLES.cymatic = function (ctx, W, H, R) {
    var m = clamp(Math.round(num(opt(R, "modeA", 4), 4)), 1, 14);
    var n = clamp(Math.round(num(opt(R, "modeB", 7), 7)), 1, 14);
    var width = clamp(num(opt(R, "lineWidth", 45), 45), 0, 100) / 100;
    var glow = clamp(num(opt(R, "glow", 50), 50), 0, 100) / 100;

    var gw = clamp(Math.round(Math.min(W, H) / 2), 200, 700);
    var gh = Math.max(140, Math.round(gw * H / W));
    var cv = document.createElement("canvas");
    cv.width = gw; cv.height = gh;
    var cc = cv.getContext("2d");
    var img = cc.createImageData(gw, gh);
    var nCol = R.cols.length;
    var thr = 0.040 + width * 0.26;

    for (var y = 0; y < gh; y++) {
      for (var x = 0; x < gw; x++) {
        var px = x / (gw - 1), py = y / (gh - 1);
        /* Chladni's equation, centred so the figure sits in the middle */
        var f = Math.cos(n * Math.PI * px) * Math.cos(m * Math.PI * py) -
                Math.cos(m * Math.PI * px) * Math.cos(n * Math.PI * py);
        var v = Math.abs(f);
        var o = (y * gw + x) * 4;
        if (v < thr) {
          /* the nodal line: bright, with a soft halo either side */
          var t = 1 - v / thr;
          var c = R.cols[Math.min(nCol - 1, Math.floor(t * nCol))];
          img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2];
        } else {
          /* the plate itself, darkest, lifted a little near the nodes */
          var base = R.cols[0];
          var lift = Math.pow(1 - Math.min(1, v), 3) * glow * 0.14;
          img.data[o] = base[0] + (255 - base[0]) * lift * 0.25;
          img.data[o + 1] = base[1] + (255 - base[1]) * lift * 0.25;
          img.data[o + 2] = base[2] + (255 - base[2]) * lift * 0.25;
        }
        img.data[o + 3] = 255;
      }
    }
    cc.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cv, 0, 0, W, H);
    ctx.restore();
    radialFade(ctx, W, H, R.cols[0], opt(R, "fade", 45));
  };

  /* 4. Kaleidoscope fold: one wedge of faceted shards, mirrored round the
        centre. Every copy is the same pixels, so the seams meet exactly. */
  STYLES.kaleido = function (ctx, W, H, R) {
    var fold = clamp(Math.round(num(opt(R, "fold", 8), 8)), 3, 16);
    var shards = clamp(Math.round(num(opt(R, "shards", 16), 16)), 4, 48);
    var soft = clamp(num(opt(R, "softness", 40), 40), 0, 100) / 100;

    var cx = W / 2, cy = H / 2;
    var span = Math.max(W, H) * 0.78;      /* how far the wedge reaches */
    var wedge = (Math.PI * 2) / fold;

    /* Build one wedge in its own square canvas. Angled at -wedge/2, so the
       centreline runs along +x. */
    var size = Math.ceil(span * 2.1);
    var cv = document.createElement("canvas");
    cv.width = cv.height = size;
    var cc = cv.getContext("2d");
    var mid = size / 2;
    cc.translate(mid, mid);
    cc.beginPath();
    cc.moveTo(0, 0);
    cc.arc(0, 0, span, -wedge / 2, wedge / 2);
    cc.closePath();
    cc.clip();
    cc.fillStyle = css(R.cols[0]);
    cc.fillRect(-mid, -mid, size, size);

    /* Shards sit on a jittered polar grid, so the wedge is filled edge to
       edge instead of leaving gaps. Each shard is a polygon with one bright
       facet and one dark facet, so it reads as cut glass. */
    var ringsN = Math.max(2, Math.round(Math.sqrt(shards * 0.62)));
    var cellArea = (wedge * span * span * 0.5) / shards;
    for (var ring = 0; ring < ringsN; ring++) {
      var t0 = ring / ringsN, t1 = (ring + 1) / ringsN;
      var rr0 = Math.pow(t0, 0.92) * span;
      var rr1 = Math.pow(t1, 0.92) * span;
      var rMid = (rr0 + rr1) / 2;
      var bandW = rr1 - rr0;
      var cells = Math.max(1, Math.round((shards / ringsN) * (0.55 + t0 * 0.9)));
      for (var cell = 0; cell < cells; cell++) {
        var ca = -wedge / 2 + ((cell + 0.5) / cells) * wedge;
        ca += (R.rnd() - 0.5) * (wedge / cells) * 0.55;
        var cr = rMid + (R.rnd() - 0.5) * bandW * 0.45;
        var px0 = Math.cos(ca) * cr, py0 = Math.sin(ca) * cr;
        /* a shard that just about fills its cell */
        var cellH = Math.max(bandW * 0.9, 4);
        var cellW = Math.max(2 * cr * Math.sin(wedge / cells / 2) * 0.92, 4);
        var shardR = Math.max(cellH, cellW) * (0.52 + R.rnd() * 0.20);

        var sides = 3 + Math.floor(R.rnd() * 4);
        var rot = R.rnd() * Math.PI * 2;
        var col = R.cols[1 + Math.floor(R.rnd() * Math.max(1, R.cols.length - 1))] || R.cols[1];

        var poly = [];
        for (var s1 = 0; s1 < sides; s1++) {
          var aa = rot + (s1 / sides) * Math.PI * 2;
          var rr = shardR * (0.80 + R.rnd() * 0.42);
          poly.push([Math.cos(aa) * rr, Math.sin(aa) * rr]);
        }
        cc.beginPath();
        for (var s2 = 0; s2 < poly.length; s2++) {
          var qx = px0 + poly[s2][0], qy = py0 + poly[s2][1];
          if (s2 === 0) cc.moveTo(qx, qy); else cc.lineTo(qx, qy);
        }
        cc.closePath();
        cc.fillStyle = css(shiftRgb(col, R.rnd, 12), 0.34 + R.rnd() * 0.30);
        cc.fill();

        /* one bright facet and one dark facet, splitting the polygon down a
           line through its centre */
        if (soft < 0.94) {
          var fa = rot + R.rnd() * Math.PI;
          var fx = Math.cos(fa) * shardR, fy = Math.sin(fa) * shardR;
          var nx = -Math.sin(fa), ny = Math.cos(fa);
          cc.save();
          cc.clip();
          cc.beginPath();
          cc.moveTo(px0 + nx * shardR * 2, py0 + ny * shardR * 2);
          cc.lineTo(px0 - nx * shardR * 2, py0 - ny * shardR * 2);
          cc.lineTo(px0 - nx * shardR * 2 + fx, py0 - ny * shardR * 2 + fy);
          cc.lineTo(px0 + nx * shardR * 2 + fx, py0 + ny * shardR * 2 + fy);
          cc.closePath();
          cc.fillStyle = css(R.cols[R.cols.length - 1], 0.09 + soft * 0.15);
          cc.fill();
          cc.restore();
          cc.save();
          cc.clip();
          cc.beginPath();
          cc.moveTo(px0 + nx * shardR * 2, py0 + ny * shardR * 2);
          cc.lineTo(px0 - nx * shardR * 2, py0 - ny * shardR * 2);
          cc.lineTo(px0 - nx * shardR * 2 - fx, py0 - ny * shardR * 2 - fy);
          cc.lineTo(px0 + nx * shardR * 2 - fx, py0 + ny * shardR * 2 - fy);
          cc.closePath();
          cc.fillStyle = css(R.cols[0], 0.12 + soft * 0.20);
          cc.fill();
          cc.restore();
        }
        /* a thin bright edge catches the light along one side */
        cc.beginPath();
        for (var s3 = 0; s3 < poly.length; s3++) {
          var ex = px0 + poly[s3][0], ey = py0 + poly[s3][1];
          if (s3 === 0) cc.moveTo(ex, ey); else cc.lineTo(ex, ey);
        }
        cc.closePath();
        cc.strokeStyle = css(R.cols[R.cols.length - 1], 0.14 + soft * 0.10);
        cc.lineWidth = Math.max(0.7, span * 0.0014);
        cc.stroke();
      }
    }

    /* stamp the wedge round the centre, mirroring every other copy so the
       edges meet rather than step */
    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    ctx.translate(cx, cy);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    for (var k = 0; k < fold; k++) {
      ctx.save();
      ctx.rotate((k / fold) * Math.PI * 2);
      if (k % 2 === 1) ctx.scale(1, -1);
      ctx.drawImage(cv, -mid, -mid);
      ctx.restore();
    }
    ctx.restore();
    radialFade(ctx, W, H, R.cols[0], opt(R, "fade", 60));
  };

  /* 5. Rose window: stained glass. Rings of panes, a lead grid over them, a
        ring of small round lights, and a quatrefoil medallion at the heart. */
  STYLES.rosewindow = function (ctx, W, H, R) {
    var rings = clamp(Math.round(num(opt(R, "rings", 3), 3)), 2, 6);
    var panes = clamp(Math.round(num(opt(R, "petals", 12), 12)), 4, 24);
    var lead = clamp(num(opt(R, "lead", 55), 55), 0, 100) / 100;

    var cx = W / 2, cy = H / 2;
    var Rmax = radialR(W, H, 0.66);
    var stone = R.cols[Math.min(1, R.cols.length - 1)];
    var jewelN = Math.max(1, R.cols.length - 2);
    /* Lead never drops to nothing: at 0 it is a fine engraved line, and the
       window still reads as leaded glass. */
    var lw = Math.max(1.0, Math.min(W, H) * 0.0030) * (1.0 + lead * 1.7);
    var leadCol = R.cols[0];
    var coreR = Rmax * 0.20;
    /* the outermost band is a ring of round lights, not of panes */
    var paneRings = rings - 1;

    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);

    /* stone surround */
    ctx.beginPath();
    ctx.arc(cx, cy, Rmax * 1.045, 0, Math.PI * 2);
    ctx.fillStyle = css(stone, 0.72);
    ctx.fill();

    function ringR(k) { return coreR + (Rmax - coreR) * (k / rings); }

    /* glass: plain annular sectors, so every band closes with no gaps */
    for (var k = 1; k <= paneRings; k++) {
      var r0 = ringR(k - 1), r1 = ringR(k);
      for (var j = 0; j < panes; j++) {
        var a0 = (j / panes) * Math.PI * 2;
        var a1 = ((j + 1) / panes) * Math.PI * 2;
        var glass = R.cols[2 + ((j * 3 + k * 5) % jewelN)] || R.cols[R.cols.length - 1];
        ctx.beginPath();
        ctx.arc(cx, cy, r1, a0, a1);
        ctx.arc(cx, cy, r0, a1, a0, true);
        ctx.closePath();
        /* a slightly different tone per pane, as cut glass varies */
        /* the pane tone varies around a mid value, so pale palettes still
           give panes you can tell apart */
        ctx.fillStyle = css(shiftRgb(glass, R.rnd, 10), 0.60 + ((j * 7 + k * 3) % 3) * 0.13);
        ctx.fill();
        /* a soft radial shimmer inside each pane, brighter toward the rim */
        var pa = (a0 + a1) / 2, pm = (r0 + r1) / 2;
        var pg = ctx.createRadialGradient(
          cx + Math.cos(pa) * pm, cy + Math.sin(pa) * pm, 0,
          cx + Math.cos(pa) * pm, cy + Math.sin(pa) * pm, (r1 - r0) * 0.72);
        pg.addColorStop(0, css(R.cols[R.cols.length - 1], 0.16));
        pg.addColorStop(1, css(glass, 0));
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r1, a0, a1);
        ctx.arc(cx, cy, r0, a1, a0, true);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = pg;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    /* the outer ring: a lantern band with small round lights */
    var lr0 = ringR(paneRings), lr1 = ringR(rings);
    ctx.beginPath();
    ctx.arc(cx, cy, lr1, 0, Math.PI * 2);
    ctx.arc(cx, cy, lr0, 0, Math.PI * 2, true);
    ctx.fillStyle = css(stone, 0.55);
    ctx.fill();

    var lightCount = panes * 2;
    var lightMid = (lr0 + lr1) / 2;
    var lightRad = Math.min(Math.PI * lightMid / lightCount * 0.80,
                            (lr1 - lr0) * 0.34);
    for (var o = 0; o < lightCount; o++) {
      var oa = (o / lightCount) * Math.PI * 2 + Math.PI / lightCount;
      var ox = cx + Math.cos(oa) * lightMid, oy = cy + Math.sin(oa) * lightMid;
      ctx.beginPath();
      ctx.arc(ox, oy, lightRad, 0, Math.PI * 2);
      ctx.fillStyle = css(shiftRgb(R.cols[2 + (o % jewelN)] || stone, R.rnd, 12), 0.70);
      ctx.fill();
      ctx.strokeStyle = css(leadCol, 0.92);
      ctx.lineWidth = Math.max(0.9, lw * 0.8);
      ctx.stroke();
    }

    /* lead grid: hoops and spokes, drawn over everything so it reads as one
       continuous structure */
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, Rmax, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = css(leadCol, 0.9);
    ctx.lineCap = "round";
    for (var b = 0; b <= paneRings; b++) {
      ctx.beginPath();
      ctx.arc(cx, cy, ringR(b), 0, Math.PI * 2);
      ctx.lineWidth = lw * (b === 0 ? 1.35 : 1.10);
      ctx.stroke();
    }
    for (var sp = 0; sp < panes; sp++) {
      var sa = (sp / panes) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(sa) * coreR, cy + Math.sin(sa) * coreR);
      ctx.lineTo(cx + Math.cos(sa) * (Rmax), cy + Math.sin(sa) * (Rmax));
      ctx.lineWidth = lw * 0.85;
      ctx.stroke();
    }
    ctx.restore();

    /* medallion: dark ring, four jewel lobes, bright centre */
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = css(stone, 0.95);
    ctx.fill();
    ctx.strokeStyle = css(leadCol, 0.9);
    ctx.lineWidth = lw * 1.25;
    ctx.stroke();

    var lobe = coreR * 0.42;
    for (var q = 0; q < 4; q++) {
      var qa = (q / 4) * Math.PI * 2 + Math.PI / 4;
      var lx = cx + Math.cos(qa) * coreR * 0.42;
      var ly = cy + Math.sin(qa) * coreR * 0.42;
      ctx.beginPath();
      ctx.arc(lx, ly, lobe, 0, Math.PI * 2);
      ctx.fillStyle = css(R.cols[2 + (q % jewelN)] || stone, 0.78);
      ctx.fill();
      ctx.strokeStyle = css(leadCol, 0.88);
      ctx.lineWidth = Math.max(0.9, lw * 0.9);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 0.19, 0, Math.PI * 2);
    ctx.fillStyle = css(R.cols[R.cols.length - 1], 0.95);
    ctx.fill();
    ctx.strokeStyle = css(leadCol, 0.88);
    ctx.lineWidth = Math.max(0.8, lw * 0.75);
    ctx.stroke();

    /* rim: heavy stone edge, then a thin carved line outside it */
    ctx.beginPath();
    ctx.arc(cx, cy, Rmax, 0, Math.PI * 2);
    ctx.strokeStyle = css(leadCol, 0.9);
    ctx.lineWidth = Math.max(1.8, Math.min(W, H) * 0.0070) * (0.4 + lead * 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, Rmax * 1.048, 0, Math.PI * 2);
    ctx.strokeStyle = css(stone, 0.65);
    ctx.lineWidth = Math.max(0.8, lw * 0.8);
    ctx.stroke();
    ctx.restore();
    radialFade(ctx, W, H, R.cols[0], opt(R, "fade", 40));
  };

  /* 6. Peacock plume: rings of overlapping feather eyes with fine barbs. */
  STYLES.peacock = function (ctx, W, H, R) {
    var rings = clamp(Math.round(num(opt(R, "rings", 4), 4)), 2, 6);
    var per = clamp(Math.round(num(opt(R, "perRing", 12), 12)), 4, 20);
    var barb = clamp(num(opt(R, "barbs", 55), 55), 0, 100) / 100;
    var irid = clamp(num(opt(R, "iridescence", 70), 70), 0, 100) / 100;

    var cx = W / 2, cy = H / 2;
    var Rmax = radialR(W, H, 0.82);
    var palLight = luma(R.cols[1] || R.cols[0]);

    /* The fan runs from green through teal and cobalt to violet, with bronze
       catching the light, exactly as a real train of feathers does. The
       palette sets how far round that run the whole fan travels. */
    var FAN = [150, 172, 194, 216, 238, 258, 40];
    var travel = 0.25 + irid * 0.75;
    /* the eye itself is a peacock eye: a bronze rim round a teal core */
    var coreHue = 168 + (R.rnd() - 0.5) * 16;

    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);

    /* Draw from the outside in, so each ring of eyes rests on the one behind
       and the fan reads as layered feathers. */
    for (var k = rings; k >= 1; k--) {
      var rad = Rmax * (0.13 + (k / rings) * 0.87);
      var count = Math.round(per * (0.45 + (k / rings) * 0.95));
      var slot = Math.round(((k - 1) / Math.max(1, rings - 1)) * travel * (FAN.length - 1));
      var ringHue = FAN[Math.min(FAN.length - 1, slot)];
      /* eyes are sized so neighbours just overlap: a dense fan, not a scatter */
      var size = (Math.PI * rad / count) * 1.18;

      for (var j = 0; j < count; j++) {
        var a = (j / count) * Math.PI * 2 + k * 0.23;
        var ex = cx + Math.cos(a) * rad;
        var ey = cy + Math.sin(a) * rad;
        var h0 = ringHue + Math.sin(j * 2.1 + k * 1.7) * 8;

        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(a);

        /* the feather's soft sheen: a wide halo in the ring's own colour */
        var halo = hslRgb(h0, 0.5, 0.34 + palLight * 0.08);
        var gg = ctx.createRadialGradient(0, 0, size * 0.35, 0, 0, size * 1.9);
        gg.addColorStop(0, css(halo, 0.30));
        gg.addColorStop(1, css(halo, 0));
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.9, 0, Math.PI * 2);
        ctx.fillStyle = gg;
        ctx.fill();

        /* bronze outer ring */
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 1.00, size * 0.80, 0, 0, Math.PI * 2);
        ctx.fillStyle = css(hslRgb(h0, 0.55, 0.30 + palLight * 0.10), 0.94);
        ctx.fill();

        /* the deep collar: the ring hue at its darkest */
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.80, size * 0.63, 0, 0, Math.PI * 2);
        ctx.fillStyle = css(hslRgb(h0, 0.68, 0.20 + palLight * 0.06), 0.96);
        ctx.fill();

        /* teal core: the same family, pulled toward the bird's own green-blue */
        var core = mixRgb(hslRgb(h0, 0.70, 0.40 + palLight * 0.05),
                          hslRgb(coreHue, 0.72, 0.40 + palLight * 0.05), 0.55);
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.54, size * 0.42, 0, 0, Math.PI * 2);
        ctx.fillStyle = css(core, 0.97);
        ctx.fill();

        /* the bright arc that gives a real eye its glint */
        var glint = mixRgb(core, [255, 255, 255], 0.35);
        ctx.beginPath();
        ctx.ellipse(-size * 0.10, -size * 0.09, size * 0.30, size * 0.21,
                    -0.35, 0, Math.PI * 2);
        ctx.fillStyle = css(glint, 0.34 + irid * 0.18);
        ctx.fill();

        /* pupil */
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 0.20, size * 0.17, 0, 0, Math.PI * 2);
        ctx.fillStyle = css(hslRgb(coreHue, 0.55, 0.07), 0.97);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-size * 0.06, -size * 0.06, size * 0.05, 0, Math.PI * 2);
        ctx.fillStyle = css([255, 255, 255], 0.55);
        ctx.fill();

        /* barbs: fine filaments round the eye, the fuzz of the feather */
        if (barb > 0) {
          ctx.strokeStyle = css(hslRgb(h0, 0.50, 0.42 + palLight * 0.06), 0.14 + barb * 0.30);
          ctx.lineWidth = Math.max(0.5, size * 0.018);
          var lines = Math.round(16 + barb * 22);
          for (var b = 0; b < lines; b++) {
            var ba = (b / lines) * Math.PI * 2;
            var r0b = size * 0.86, r1b = size * (1.10 + (b % 3) * 0.12);
            ctx.beginPath();
            ctx.moveTo(Math.cos(ba) * r0b, Math.sin(ba) * r0b * 0.82);
            ctx.lineTo(Math.cos(ba) * r1b, Math.sin(ba) * r1b * 0.82);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }
    ctx.restore();
    radialFade(ctx, W, H, R.cols[0], opt(R, "fade", 55));
  };

  /* 7. Harmonograph rosette: layered pen curves. Each layer is a closed loop
        whose radius swells `petals` times round the turn, so the whole drawing
        has exact rotational symmetry and every seed reads as a rosette. */
  STYLES.harmonograph = function (ctx, W, H, R) {
    var curves = clamp(Math.round(num(opt(R, "curves", 9), 9)), 2, 20);
    var petals = clamp(Math.round(num(opt(R, "petals", 7), 7)), 3, 16);
    var decay = clamp(num(opt(R, "decay", 40), 40), 0, 100) / 100;
    var fine = clamp(num(opt(R, "fine", 60), 60), 0, 100) / 100;

    var cx = W / 2, cy = H / 2;
    var Rmax = radialR(W, H, 0.95);
    var steps = 900;

    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);
    ctx.translate(cx, cy);
    /* The pen is bright on dark paper and dark on light paper. Without this
       the drawing vanished on the paper and linen palettes, because a
       screen blend of a near-white line over near-white ground is invisible. */
    var onLight = luma(R.cols[0]) > 0.55;
    var ink = onLight ? [20, 18, 16] : [255, 255, 255];
    ctx.globalCompositeOperation = onLight ? "source-over" : "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(0.6, Math.min(W, H) * 0.0017);

    for (var c = 0; c < curves; c++) {
      var col = R.cols[1 + (c % Math.max(1, R.cols.length - 1))] || R.cols[1];
      /* Each layer differs only in its numbers, never in its symmetry, so a
         random seed can never produce an off-centre scribble. */
      var base = 0.40 + R.rnd() * 0.30;
      var amp = 0.10 + R.rnd() * 0.20;
      var phase = R.rnd() * Math.PI * 2;
      var harmonic = petals * (1 + Math.floor(R.rnd() * 3));
      var wob = R.rnd() * 0.05;
      var wobPhase = R.rnd() * Math.PI * 2;
      /* a touch of inward drift per layer, like a pen slowing down */
      var drift = 1 - decay * (0.10 + R.rnd() * 0.22);

      /* Lift the line toward the pen colour: bright on dark paper, dark on
         light paper, so it shows on every palette. */
      ctx.strokeStyle = css(mixRgb(col, ink, 0.80), 0.55 + fine * 0.35);
      ctx.beginPath();
      for (var s = 0; s <= steps; s++) {
        var t = (s / steps) * Math.PI * 2;
        var rr = Rmax * (base + amp * Math.cos(petals * t + phase)) * drift;
        rr += Rmax * wob * Math.cos(harmonic * t + wobPhase);
        var x = Math.cos(t) * rr, y = Math.sin(t) * rr;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    /* a bright centre knot and a fine crown, both symmetric by construction */
    ctx.globalCompositeOperation = onLight ? "source-over" : "lighter";
    ctx.strokeStyle = css(mixRgb(R.cols[R.cols.length - 1], ink, 0.45), 0.18 + fine * 0.22);
    for (var g = 0; g < 3; g++) {
      ctx.beginPath();
      ctx.arc(0, 0, Rmax * (0.05 + g * 0.04), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    for (var p2 = 0; p2 <= petals; p2++) {
      var pa = (p2 / petals) * Math.PI * 2;
      var px2 = Math.cos(pa) * Rmax * 0.93;
      var py2 = Math.sin(pa) * Rmax * 0.93;
      if (p2 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.strokeStyle = css(R.cols[R.cols.length - 1], 0.07 + fine * 0.10);
    ctx.stroke();
    ctx.restore();
    radialFade(ctx, W, H, R.cols[0], opt(R, "fade", 60));
  };

  /* 8. Cosmati floor: a medieval mosaic pavement. Central disc, concentric
        rings of tiles, mirrored borders, and tiny grout gaps. */
  STYLES.cosmati = function (ctx, W, H, R) {
    var rings = clamp(Math.round(num(opt(R, "rings", 4), 4)), 2, 7);
    var tile = clamp(Math.round(num(opt(R, "tiles", 16), 16)), 6, 28);
    var grout = clamp(num(opt(R, "grout", 40), 40), 0, 100) / 100;
    var spin = clamp(num(opt(R, "spin", 25), 25), 0, 100) / 100;
    var cx = W / 2, cy = H / 2;
    var Rmax = radialR(W, H, 0.72);
    var ns = R.cols.length;
    var stone = R.cols[Math.min(1, ns - 1)];

    ctx.save();
    ctx.fillStyle = css(R.cols[0]);
    ctx.fillRect(0, 0, W, H);

    /* the mortar bed, and a grout gap that never vanishes completely */
    var gap = Math.max(0.8, Math.min(W, H) * 0.0035) * (0.35 + grout * 2.4);

    ctx.beginPath();
    ctx.arc(cx, cy, Rmax, 0, Math.PI * 2);
    ctx.fillStyle = css(stone, 0.55);
    ctx.fill();

    var core = Rmax * 0.17;
    var inner = core;                     /* tiles start at the medallion */
    var span = Rmax * 0.92 - inner;
    var firstOut = inner + span / rings;  /* the ring the Tiles slider names */

    for (var k = 1; k <= rings; k++) {
      var rIn = inner + span * ((k - 1) / rings);
      var rOut = inner + span * (k / rings);
      /* tiles per ring follow the circumference, so the rim stays as fine as
         the inner ring is coarse; the first ring gets exactly the slider's
         count, which is what its label promises */
      var count = Math.round(tile * (rOut / firstOut));
      count = clamp(count, 6, 140);
      var rot = spin * (k % 2 ? 0.10 : -0.10) + (k * 0.13);
      for (var j = 0; j < count; j++) {
        var a0 = (j / count) * Math.PI * 2 + rot;
        var a1 = ((j + 1) / count) * Math.PI * 2 + rot;
        /* four-colour checkerboard round the ring: the striped look of a
           real Cosmati pavement */
        var c = R.cols[1 + ((j * 3 + k * 2) % Math.max(1, ns - 1))] || stone;
        ctx.beginPath();
        ctx.arc(cx, cy, rOut - gap, a0 + gap / rOut * 1.4, a1 - gap / rOut * 1.4);
        ctx.arc(cx, cy, rIn + gap, a1 - gap / rOut * 1.4, a0 + gap / rOut * 1.4, true);
        ctx.closePath();
        ctx.fillStyle = css(c, 0.50 + ((j + k) % 3) * 0.13);
        ctx.fill();
      }

      /* a border line between rings, drawn in the darkest colour */
      ctx.beginPath();
      ctx.arc(cx, cy, rOut - gap * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = css(R.cols[0], 0.55);
      ctx.lineWidth = Math.max(0.9, gap * 0.8);
      ctx.stroke();
    }

    /* central medallion: a stone disc with a quatrefoil inlay */
    ctx.beginPath();
    ctx.arc(cx, cy, core, 0, Math.PI * 2);
    ctx.fillStyle = css(R.cols[ns - 1], 0.70);
    ctx.fill();
    ctx.strokeStyle = css(R.cols[0], 0.8);
    ctx.lineWidth = Math.max(1.2, gap * 1.4);
    ctx.stroke();
    for (var q = 0; q < 4; q++) {
      var qa = (q / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(qa) * core * 0.50, cy + Math.sin(qa) * core * 0.50,
        core * 0.40, 0, Math.PI * 2);
      ctx.fillStyle = css(R.cols[1 + (q % Math.max(1, ns - 1))], 0.55);
      ctx.fill();
      ctx.strokeStyle = css(R.cols[0], 0.7);
      ctx.lineWidth = Math.max(0.9, gap);
      ctx.stroke();
    }

    /* outer border band: a ring of small square blocks */
    var bandW = Rmax * 0.055;
    ctx.beginPath();
    ctx.arc(cx, cy, Rmax, 0, Math.PI * 2);
    ctx.arc(cx, cy, Rmax - bandW, 0, Math.PI * 2, true);
    ctx.fillStyle = css(stone, 0.75);
    ctx.fill();
    /* the border blocks line up with the outermost ring of tiles */
    var blocks = clamp(Math.round(tile * 2.2), 8, 90);
    for (var b = 0; b < blocks; b++) {
      var ba = (b / blocks) * Math.PI * 2;
      var bc = R.cols[1 + (b % Math.max(1, ns - 1))];
      /* alternate the block colour, and inset every other one */
      ctx.beginPath();
      ctx.arc(cx, cy, Rmax - gap * 0.6, ba + gap / Rmax, ba + (Math.PI * 2 / blocks) - gap / Rmax);
      ctx.arc(cx, cy, Rmax - bandW + gap * 0.6,
              ba + (Math.PI * 2 / blocks) - gap / Rmax, ba + gap / Rmax, true);
      ctx.closePath();
      ctx.fillStyle = css(bc, 0.42 + (b % 2) * 0.22);
      ctx.fill();
    }
    ctx.restore();
    radialFade(ctx, W, H, R.cols[0], opt(R, "fade", 50));
  };

  /* --------------------------------------------------------------- drawing */
  function draw(ctx, W, H, recipe) {
    var R = recipe || {};
    var rnd = rngFrom(String(R.seed || "backdrop"));
    var cols = palette(R);
    var contrast = 0.35 + clamp(num(R.contrast, 60), 0, 100) / 100 * 0.65;

    var resolved = {
      rnd: rnd,
      seed: String(R.seed || "backdrop"),
      cols: cols.map(function (c) { return tame(c, contrast); }),
      p: Math.max(4, Math.min(W, H) / 40 * scaleOf(R)),
      /* Per-style settings live in R.opts, a plain object of numbers and
         strings. Every style reads its own keys with a default, so a recipe
         written before a setting existed still draws. */
      opts: R.opts || {}
    };

    var style = STYLES[R.style] || STYLES.weave;

    ctx.save();
    if (num(R.rotation, 0) !== 0) {
      /* Rotate about the centre and oversize the box so corners stay filled. */
      var diag = Math.sqrt(W * W + H * H);
      ctx.translate(W / 2, H / 2);
      ctx.rotate(num(R.rotation, 0) * Math.PI / 180);
      ctx.translate(-diag / 2, -diag / 2);
      style(ctx, diag, diag, resolved);
      ctx.restore();
      ctx.save();
    } else {
      style(ctx, W, H, resolved);
    }
    ctx.restore();

    ctx.save();
    addVignette(ctx, W, H, R.vignette);
    addGrain(ctx, W, H, R.grain, resolved.seed);
    ctx.restore();
  }

  /* --------------------------------------------------------------- exports */
  root.Backdrop = {
    draw: draw,
    styles: STYLES,
    families: {
      woven: ["weave", "tartan", "plaid", "herringbone", "twill", "basket", "ikat", "kilim", "shibori", "damask", "jacquard"],
      paper: ["cyanotype", "paper", "suminagashi"],
      geometric: ["grid", "dots"],
      light: ["glow", "smoke"],
      intricate: ["guilloche", "starquilt", "filament", "moire"],
      impact: ["quasicrystal", "hyperbolic", "cymatic", "kaleido",
               "rosewindow", "peacock", "harmonograph", "cosmati"]
    },
    palettes: PALETTES,
    paletteNames: Object.keys(PALETTES),
    hashSeed: hashSeed,
    lum: lum,
    toRgb: toRgb,
    css: css
  };
})(window);