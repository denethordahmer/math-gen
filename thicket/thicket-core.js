/* =========================================================================
   THICKET: thicket-core.js
   Shared drawing language for every style: colour, symmetry, the ornamented
   primitives, the paper texture, and the dispatcher.

   Design rules this file exists to enforce:
   - Colour is an [r,g,b] array from first parse to canvas. The old code built
     "rgb(...)" strings and fed them to a hex-only helper, which painted every
     shape black on a black background. That cannot happen here.
   - Stems are filled tapered ribbons, not constant-width strokes.
   - Foliage is a designed shape with a vein, never a dot pretending to be one.
   - Every style is symmetric, bounded, and deliberately patterned.
   The seven compositions live in thicket-forms.js and register themselves.
   ========================================================================= */
(function () {
  "use strict";

  var TAU = Math.PI * 2, HALF = Math.PI / 2;
  /* 137.5 degrees. The angle plants actually use to place leaves, and the
     reason a golden-angle spiral never lines up with itself. */
  var GOLDEN = Math.PI * (3 - Math.sqrt(5));

  /* ---------------- maths ---------------- */
  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? (d === undefined ? 0 : d) : n; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  /* Deterministic noise. Same seed and settings give the same picture. */
  function hash(str) {
    var h = 2166136261 >>> 0;
    str = String(str || "thicket");
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rnd(seed, i, s) {
    var h = (seed ^ Math.imul((Math.floor(i) | 0) + 1, 374761393) ^ Math.imul((s | 0) + 1, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /* ---------------- colour ----------------
     One parser, arrays everywhere after it. */
  function parseColor(v) {
    if (Array.isArray(v)) return [+v[0] || 0, +v[1] || 0, +v[2] || 0];
    var s = String(v === undefined || v === null ? "#000000" : v).trim();
    var m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      var p = m[1].split(",");
      return [parseFloat(p[0]) || 0, parseFloat(p[1]) || 0, parseFloat(p[2]) || 0];
    }
    var h = s.replace(/^#/, "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length === 8) h = h.slice(0, 6);
    var n = parseInt(h, 16);
    if (isNaN(n)) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(col, a) {
    var p = parseColor(col);
    return "rgba(" + Math.round(p[0]) + "," + Math.round(p[1]) + "," + Math.round(p[2]) + "," +
      clamp(a === undefined ? 1 : a, 0, 1) + ")";
  }
  function mixCol(a, b, t) {
    var A = parseColor(a), B = parseColor(b);
    return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
  }
  function lighten(c, t) { return mixCol(c, [255, 255, 255], t); }
  function darken(c, t) { return mixCol(c, [8, 12, 8], t); }
  function rampCol(cols, t) {
    t = clamp(t, 0, 1) * (cols.length - 1);
    var i = Math.min(cols.length - 2, Math.floor(t));
    return mixCol(cols[i], cols[i + 1], t - i);
  }
  /* Which colour one element wears. `t` runs along the form, `i` identifies
     the element so per-strand and random modes stay stable. */
  function tone(S, t, i) {
    if (S.colourStyle === "limb") return S.cols[((Math.floor(i) % 4) + 4) % 4];
    if (S.colourStyle === "random") return S.cols[Math.floor(rnd(S.seed, i, 91) * 4) % 4];
    return rampCol(S.cols, clamp(t, 0, 1));
  }

  /* The pale accent used for speckles, berry highlights and tick marks. */
  function accent(S, t) { return mixCol(S.cols[3], [255, 252, 235], t === undefined ? 0.35 : t); }

  /* ---------------- budget ----------------
     Every primitive reports its cost. Heavy settings stop cleanly instead of
     freezing a phone. */
  function spent(S, n) { S.marks += n; return S.marks > S.budget; }
  function over(S) { return S.marks > S.budget; }

  /* =======================================================================
     PRIMITIVES
     ======================================================================= */

  /* A tapered stem: a spine whose width changes along its length, filled as one
     closed shape. `cA` and `cB` shade it from root to tip. */
  function ribbon(S, pts, w0, w1, cA, cB, alpha, pow) {
    var c = S.c, n = pts.length;
    if (n < 2) return;
    pow = pow === undefined ? 1 : pow;
    alpha = alpha === undefined ? 1 : alpha;
    var A = [], B = [], i, p, q, o, dx, dy, d, nx, ny, t, w;
    for (i = 0; i < n; i++) {
      p = pts[i];
      q = pts[Math.min(n - 1, i + 1)];
      o = pts[Math.max(0, i - 1)];
      dx = q[0] - o[0]; dy = q[1] - o[1];
      d = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = -dy / d; ny = dx / d;
      t = i / (n - 1);
      w = Math.max(0.15, lerp(w0, w1, Math.pow(t, pow))) * 0.5;
      A.push([p[0] + nx * w, p[1] + ny * w]);
      B.push([p[0] - nx * w, p[1] - ny * w]);
    }
    c.beginPath();
    c.moveTo(A[0][0], A[0][1]);
    for (i = 1; i < n - 1; i++) {
      c.quadraticCurveTo(A[i][0], A[i][1], (A[i][0] + A[i + 1][0]) / 2, (A[i][1] + A[i + 1][1]) / 2);
    }
    c.lineTo(A[n - 1][0], A[n - 1][1]);
    for (i = n - 2; i > 0; i--) {
      c.quadraticCurveTo(B[i][0], B[i][1], (B[i][0] + B[i - 1][0]) / 2, (B[i][1] + B[i - 1][1]) / 2);
    }
    c.lineTo(B[0][0], B[0][1]);
    c.closePath();

    if (cB) {
      var g = c.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
      g.addColorStop(0, rgba(cA, alpha));
      g.addColorStop(1, rgba(cB, alpha));
      c.fillStyle = g;
    } else {
      c.fillStyle = rgba(cA, alpha);
    }
    c.fill();

    /* round the ends so joins do not show a notch */
    c.fillStyle = rgba(cA, alpha);
    c.beginPath(); c.arc(pts[0][0], pts[0][1], Math.max(0.2, w0 * 0.5), 0, TAU); c.fill();
    c.fillStyle = rgba(cB || cA, alpha);
    c.beginPath(); c.arc(pts[n - 1][0], pts[n - 1][1], Math.max(0.2, w1 * 0.5), 0, TAU); c.fill();
    spent(S, n);
  }

  /* Constant-width round line, for fine detail. */
  function ink(S, x0, y0, x1, y1, w, col, alpha) {
    var c = S.c;
    c.beginPath();
    c.moveTo(x0, y0); c.lineTo(x1, y1);
    c.lineCap = "round";
    c.lineWidth = Math.max(0.4, w);
    c.strokeStyle = rgba(col, alpha === undefined ? 1 : alpha);
    c.stroke();
    spent(S, 1);
  }

  /* A designed leaf: two arcs to a point, a raised midrib, and a hint of a
     shaded half so it has a light side. */
  function leaf(S, x, y, ang, len, wid, cA, cB, alpha, bend) {
    if (len < 0.8) return;
    var c = S.c;
    bend = bend || 0;
    alpha = alpha === undefined ? 0.95 : alpha;
    var mid = ang + bend * 0.5;
    var tipx = x + Math.cos(mid) * len;
    var tipy = y + Math.sin(mid) * len;
    var perp = mid + HALF;
    var ca = Math.cos(perp), sa = Math.sin(perp);
    var mx = x + Math.cos(ang) * len * 0.44;
    var my = y + Math.sin(ang) * len * 0.44;

    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(mx + ca * wid, my + sa * wid, tipx, tipy);
    c.quadraticCurveTo(mx - ca * wid, my - sa * wid, x, y);
    c.closePath();
    c.fillStyle = rgba(cB || cA, alpha);
    c.fill();

    /* shaded half */
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(mx - ca * wid * 0.92, my - sa * wid * 0.92, tipx, tipy);
    c.quadraticCurveTo(mx, my, x, y);
    c.closePath();
    c.fillStyle = rgba(darken(cB || cA, 0.22), alpha * 0.55);
    c.fill();

    if (len > S.lw * 2.4) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(tipx, tipy);
      c.lineWidth = Math.max(0.35, wid * 0.11);
      c.strokeStyle = rgba(lighten(cA, 0.35), alpha * 0.55);
      c.stroke();
    }
    spent(S, 4);
  }

  /* The lens that makes a petal or a coral polyp. Two bulges, pointed at both
     ends, optionally with a rim. */
  function petal(S, cx, cy, a0, a1, bulge, cIn, cOut, alpha, steps) {
    var c = S.c;
    steps = steps || 1;
    var x0 = cx + Math.cos(a0) * 0, y0 = cy + Math.sin(a0) * 0;
    var x1 = cx + Math.cos(a1), y1 = cy + Math.sin(a1);
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo(x1, y1, cx, cy);
    c.closePath();
    c.fillStyle = rgba(cIn, alpha);
    c.fill();
    spent(S, 1);
  }

  /* Filled lens between two radii of a disc, bulging outward. The workhorse of
     the mandala. */
  function lens(S, cx, cy, a0, a1, rIn, rOut, bulge, cA, cB, alpha, rim) {
    var c = S.c;
    var midA = (a0 + a1) / 2;
    var x0 = cx + Math.cos(a0) * rIn, y0 = cy + Math.sin(a0) * rIn;
    var x1 = cx + Math.cos(a1) * rIn, y1 = cy + Math.sin(a1) * rIn;
    var mx = cx + Math.cos(midA) * (rOut * bulge);
    var my = cy + Math.sin(midA) * (rOut * bulge);
    c.beginPath();
    c.moveTo(x0, y0);
    c.quadraticCurveTo(mx, my, x1, y1);
    c.quadraticCurveTo(cx + Math.cos(midA) * rIn * 0.78, cy + Math.sin(midA) * rIn * 0.78, x0, y0);
    c.closePath();
    if (cB) {
      var g = c.createLinearGradient(cx + Math.cos(midA) * rIn, cy + Math.sin(midA) * rIn,
        cx + Math.cos(midA) * rOut, cy + Math.sin(midA) * rOut);
      g.addColorStop(0, rgba(cA, alpha));
      g.addColorStop(1, rgba(cB, alpha));
      c.fillStyle = g;
    } else {
      c.fillStyle = rgba(cA, alpha);
    }
    c.fill();
    if (rim) {
      c.strokeStyle = rgba(rim, Math.min(1, alpha * 1.4));
      c.lineWidth = Math.max(0.5, S.lw * 0.28);
      c.stroke();
    }
    spent(S, 2);
  }

  function dot(S, x, y, r, col, alpha) {
    if (r < 0.12) return;
    var c = S.c;
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    c.fillStyle = rgba(col, alpha === undefined ? 1 : alpha);
    c.fill();
    spent(S, 1);
  }

  /* Bead with a highlight, so buds read as round and lit. */
  function bead(S, x, y, r, col, alpha) {
    dot(S, x, y, r, col, alpha === undefined ? 0.98 : alpha);
    dot(S, x - r * 0.30, y - r * 0.32, r * 0.36, lighten(col, 0.75), 0.55);
  }

  /* Soft out-of-focus glow. A flat disc reads as a sticker, so the edge fades
     to nothing. */
  function haze(S, x, y, r, col, alpha) {
    var c = S.c;
    var g = c.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
    g.addColorStop(0, rgba(col, alpha));
    g.addColorStop(0.55, rgba(col, alpha * 0.5));
    g.addColorStop(1, rgba(col, 0));
    c.beginPath(); c.arc(x, y, Math.max(1, r), 0, TAU);
    c.fillStyle = g;
    c.fill();
    spent(S, 1);
  }

  function ring(S, x, y, r, w, col, alpha) {
    var c = S.c;
    c.beginPath(); c.arc(x, y, Math.max(0.5, r), 0, TAU);
    c.lineWidth = Math.max(0.4, w);
    c.strokeStyle = rgba(col, alpha === undefined ? 1 : alpha);
    c.stroke();
    spent(S, 1);
  }

  /* A ring of ticks. Pure maths, and the single cheapest way to make a drawing
     read as an engraved plate rather than a sketch. */
  function tickRing(S, x, y, r, n, len, w, col, alpha, phase) {
    phase = phase || 0;
    for (var i = 0; i < n && !over(S); i++) {
      var a = phase + i / n * TAU;
      var c = Math.cos(a), s = Math.sin(a);
      ink(S, x + c * r, y + s * r, x + c * (r + len), y + s * (r + len), w, col, alpha);
    }
  }

  /* Points on a golden-angle spiral. The phyllotaxis pattern of a sunflower,
     used for the fountain seed head. */
  function phyllo(S, x, y, rMax, count, cb) {
    for (var i = 0; i < count && !over(S); i++) {
      var a = i * GOLDEN;
      var r = rMax * Math.sqrt((i + 0.5) / count);
      cb(x + Math.cos(a) * r, y + Math.sin(a) * r, r / rMax, i);
    }
  }

  /* A scalloped arc: repeated small arcs along a circle. Used as an ornamental
     rim on the mandala and the wreath. */
  function scallop(S, x, y, r, n, depth, w, col, alpha) {
    var c = S.c;
    var step = TAU / n;
    c.strokeStyle = rgba(col, alpha === undefined ? 1 : alpha);
    c.lineWidth = Math.max(0.4, w);
    for (var i = 0; i < n && !over(S); i++) {
      var a0 = i * step, a1 = a0 + step;
      var am = (a0 + a1) / 2;
      c.beginPath();
      c.arc(x + Math.cos(am) * (r + depth), y + Math.sin(am) * (r + depth), r, a0 + Math.PI, a1 + Math.PI);
      c.stroke();
      spent(S, 1);
    }
  }

  /* Parallel hachure inside a wedge, for engraved shadow. */
  function hatch(S, x, y, a0, a1, rIn, rOut, n, w, col, alpha) {
    for (var i = 0; i < n && !over(S); i++) {
      var a = lerp(a0, a1, i / Math.max(1, n - 1));
      ink(S, x + Math.cos(a) * rIn, y + Math.sin(a) * rIn,
        x + Math.cos(a) * rOut, y + Math.sin(a) * rOut, w, col, alpha);
    }
  }

  /* What sits on the end of a strand (the Tips setting). */
  function tipAt(S, x, y, ang, scale) {
    var kind = S.p.tips || "buds";
    if (kind === "none") return;
    var r = Math.max(1, S.tipSize * S.lw * 2.4) * (scale === undefined ? 1 : scale);
    if (kind === "dots") {
      dot(S, x, y, r * 0.62, tone(S, 0.92, 2), 0.95);
    } else if (kind === "buds") {
      bead(S, x, y, r * 0.78, tone(S, 0.85, 1), 0.97);
      bead(S, x + Math.cos(ang) * r * 0.58, y + Math.sin(ang) * r * 0.58, r * 0.44,
        accent(S, 0.25), 0.95);
    } else {
      leaf(S, x, y, ang - 0.55, r * 3.2, r * 0.85, tone(S, 0.8, 1), tone(S, 0.95, 2), 0.92);
      leaf(S, x, y, ang + 0.62, r * 2.7, r * 0.72, tone(S, 0.9, 2), accent(S, 0.2), 0.88);
      leaf(S, x, y, ang + 0.04, r * 2.0, r * 0.45, lighten(tone(S, 1, 3), 0.15), null, 0.7);
    }
  }

  /* =======================================================================
     CURVES
     ======================================================================= */

  function spine(p0, p1, p2, p3, steps, waver, seed, id) {
    var pts = [], i, t, mt, x, y;
    for (i = 0; i <= steps; i++) {
      t = i / steps;
      mt = 1 - t;
      x = mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0];
      y = mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1];
      pts.push([x, y]);
    }
    if (waver) {
      var phase = rnd(seed, id, 17) * TAU;
      for (i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i];
        var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy) || 1;
        var w = Math.sin(phase + (i / pts.length) * Math.PI * 2.4) * waver * (i / pts.length);
        pts[i] = [b[0] - dy / d * w, b[1] + dx / d * w];
      }
    }
    return pts;
  }

  /* Control points that leave x,y heading at a0 and arrive at tx,ty heading at
     a1. Aiming at absolute directions is what stops repeated branching from
     curling back on itself. */
  function bendTo(x, y, tx, ty, a0, a1, pull) {
    var d = Math.sqrt((tx - x) * (tx - x) + (ty - y) * (ty - y));
    pull = pull === undefined ? 0.42 : pull;
    return [
      [x, y],
      [x + Math.cos(a0) * d * pull, y + Math.sin(a0) * d * pull],
      [tx - Math.cos(a1) * d * pull, ty - Math.sin(a1) * d * pull],
      [tx, ty]
    ];
  }

  function fit(S, x, y, m) {
    m = m === undefined ? S.W * 0.045 : m;
    return [clamp(x, m, S.W - m), clamp(y, m, S.H - m)];
  }

  /* Mirror everything fn draws across the vertical centre. The budget is split
     evenly: without that, a heavy first half exhausts it and the mirrored half
     comes out empty, which is what made the old tree lopsided. */
  function mirrorX(S, fn) {
    var c = S.c;
    var base = S.marks;
    var room = Math.max(0, S.budget - base);

    S.budget = base + room * 0.5;
    fn();

    S.marks = base;
    S.budget = base + room;
    c.save();
    c.translate(S.W, 0);
    c.scale(-1, 1);
    fn();
    c.restore();
  }

  /* Draw fn once, then again for each of the other `n` rotations. The budget is
     divided evenly so the first copy cannot exhaust it. */
  function radial(S, n, fn) {
    var c = S.c;
    var base = S.marks;
    var room = Math.max(0, S.budget - base);
    for (var i = 0; i < n; i++) {
      S.marks = base;
      S.budget = base + room * ((i + 1) / n);
      c.save();
      c.translate(S.cx, S.cy);
      c.rotate((i / n) * TAU);
      c.translate(-S.cx, -S.cy);
      fn(i);
      c.restore();
    }
    S.budget = base + room;
  }

  /* Draw a wedge once into a buffer, then stamp that same buffer around n
     times. Re-running the drawing code per rotation never gives an identical
     result — the noise keeps marching — so one wedge is rendered and copied.
     The result is exactly symmetric and every wedge has identical density. */
  function stampRadial(S, n, fn) {
    var c = S.c;
    var off = document.createElement("canvas");
    off.width = S.W; off.height = S.H;
    var oc = off.getContext("2d");

    /* a shallow copy of the state that draws into the buffer instead */
    var sub = {};
    for (var key in S) if (Object.prototype.hasOwnProperty.call(S, key)) sub[key] = S[key];
    sub.c = oc;
    sub.buffer = true;

    fn(sub);

    for (var i = 0; i < n; i++) {
      c.save();
      c.translate(S.cx, S.cy);
      c.rotate((i / n) * TAU);
      c.translate(-S.cx, -S.cy);
      c.drawImage(off, 0, 0);
      c.restore();
    }
    spent(S, sub.marks || 1);
  }

  /* =======================================================================
     PAPER: vignette and grain.
     Both are what separate a print from a screenshot. Skipped when the
     background is transparent so an exported PNG keeps clean edges.
     ======================================================================= */
  function vignette(S, W, H) {
    var c = S.c;
    var g = c.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.15,
      W / 2, H * 0.5, Math.max(W, H) * 0.78);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.62, "rgba(0,0,0,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0.46)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  var grainTile = null;
  function makeGrain() {
    try {
      var t = document.createElement("canvas");
      t.width = t.height = 140;
      var g = t.getContext("2d");
      var img = g.createImageData(140, 140);
      var d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        var v = 108 + Math.floor(Math.random() * 92);
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      grainTile = t;
    } catch (e) { grainTile = null; }
  }

  function grain(S, W, H) {
    if (!grainTile) makeGrain();
    if (!grainTile) return;
    var c = S.c;
    c.save();
    c.globalAlpha = 0.05;
    c.globalCompositeOperation = "overlay";
    var pat = c.createPattern(grainTile, "repeat");
    if (pat) { c.fillStyle = pat; c.fillRect(0, 0, W, H); }
    c.restore();
  }

  /* =======================================================================
     ENTRY
     ======================================================================= */
  function buildState(c, W, H, p) {
    var raw = (p && p.colors && p.colors.length) ? p.colors
      : ["#c9a24a", "#9bcf7a", "#4f7a3a", "#e8d28a"];
    var cols = [];
    for (var i = 0; i < 4; i++) cols.push(parseColor(raw[i] || raw[raw.length - 1]));
    var k = Math.min(W, H) / 900;
    return {
      c: c, p: p, W: W, H: H, cx: W / 2, cy: H / 2, k: k,
      lw: Math.max(0.75, num(p.lineWeight, 5) * k),
      seed: hash(p.seed),
      cols: cols,
      colourStyle: p.colourStyle || "fade",
      density: clamp(num(p.density, 50) / 100, 0, 1),
      depth: clamp(Math.round(num(p.depth, 5)), 2, 8),
      curl: clamp(num(p.curl, 30) / 100, 0, 1),
      taper: clamp(num(p.taper, 50) / 100, 0, 1),
      tipSize: clamp(num(p.tipSize, 50) / 100, 0.1, 1),
      reachF: clamp(num(p.reach, 70) / 100, 0.15, 1.2),
      scale: clamp(num(p.scale, 1), 0.5, 2),
      reachLen: Math.max(W, H) * 0.5 * clamp(num(p.reach, 70) / 100, 0.15, 1.2) * clamp(num(p.scale, 1), 0.5, 2),
      marks: 0,
      budget: 4600,
      style: p.growthStyle || "tree"
    };
  }

  function draw(target, W, H, p) {
    p = p || {};
    var off = document.createElement("canvas");
    off.width = W; off.height = H;
    var c = off.getContext("2d");

    var S = buildState(c, W, H, p);
    var forms = window.ThicketForms || {};
    var form = forms[S.style] || forms.tree;

    if (typeof form === "function") form(S);

    var transparent = (p.bgTransparent === true || p.bgTransparent === "true");
    if (!transparent) {
      vignette(S, W, H);
      grain(S, W, H);
    }

    target.save();
    if (target.globalAlpha !== undefined) {
      target.globalAlpha = clamp(num(p.opacity, 1) || 1, 0, 1);
    }
    target.drawImage(off, 0, 0);
    target.restore();
  }

  var B = {
    TAU: TAU, HALF: HALF, GOLDEN: GOLDEN,
    num: num, clamp: clamp, lerp: lerp, sstep: sstep,
    hash: hash, rnd: rnd,
    parseColor: parseColor, rgba: rgba, mixCol: mixCol,
    lighten: lighten, darken: darken, rampCol: rampCol, tone: tone, accent: accent,
    spent: spent, over: over,
    ribbon: ribbon, ink: ink, leaf: leaf, lens: lens, petal: petal,
    dot: dot, bead: bead, haze: haze, ring: ring,
    tickRing: tickRing, phyllo: phyllo, scallop: scallop, hatch: hatch,
    tipAt: tipAt, spine: spine, bendTo: bendTo, fit: fit, mirrorX: mirrorX,
    radial: radial, stampRadial: stampRadial
  };

  window.ThicketBrush = B;
  window.ThicketStyles = { draw: draw, version: 5 };
})();