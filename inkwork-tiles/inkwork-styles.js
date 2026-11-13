/* =========================================================================
   INKWORK TILES: inkwork-styles.js
   The four drawing recipes: Motif Grid, Lattice, Hex Weave, Truchet.
   inkwork-app.js calls InkworkStyles.draw(context, width, height, settings).
   This file only draws the pattern. The app paints the background first.
   Every recipe fills the whole picture, at any size and rotation.
   ========================================================================= */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var HALF = Math.PI / 2;

  /* ---------- small helpers ---------- */
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function mod(a, n) { return ((a % n) + n) % n; }

  function hash(str) {
    var h = 2166136261 >>> 0;
    str = String(str || "inkwork");
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* A repeatable random number for one tile. The same seed and the same
     tile position always give the same answer, so changing Rotation or
     Tile size never reshuffles the dice in a confusing way. */
  function cr(seed, i, j, s) {
    var h = (seed ^ Math.imul(i + 1013, 374761393) ^ Math.imul(j + 7919, 668265263) ^ Math.imul(s + 1, 2147483647)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function hexToRgb(h) {
    h = String(h || "#000000").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    if (isNaN(n)) n = 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(r, g, b) {
    return "#" + [r, g, b].map(function (v) {
      return ("0" + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2);
    }).join("");
  }
  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + clamp(a, 0, 1) + ")";
  }
  function darken(hex, f) {
    var c = hexToRgb(hex);
    return toHex(c[0] * (1 - f), c[1] * (1 - f), c[2] * (1 - f));
  }

  /* paints the shape already in the path: outline, filled, or both */
  function paintShape(c, mode, col, lw) {
    if (mode === "filled") {
      c.fillStyle = rgba(col, 0.95); c.fill();
    } else if (mode === "both") {
      c.fillStyle = rgba(col, 0.4); c.fill();
      c.strokeStyle = rgba(col, 1); c.lineWidth = lw; c.stroke();
    } else {
      c.strokeStyle = rgba(col, 1); c.lineWidth = lw; c.stroke();
    }
  }

  function starPath(c, x, y, pts, outer, inner) {
    c.beginPath();
    for (var i = 0; i < pts * 2; i++) {
      var a = -HALF + i * Math.PI / pts;
      var r = i % 2 === 0 ? outer : inner;
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }

  /* =======================================================================
     MOTIF GRID
     One small shape repeated on a grid, turned and coloured tile by tile.
     ======================================================================= */
  function motif(S) {
    var c = S.c, p = S.p, cols = S.cols, T = S.T, lw = S.lw;
    var n = Math.ceil(S.D / T) + 2;
    var s = T * 0.5 * clamp(num(p.motifSize), 30, 100) / 100;
    var type = p.motifType, fill = p.motifFill;
    c.lineJoin = "round"; c.lineCap = "round";

    for (var j = -n; j <= n; j++) {
      for (var i = -n; i <= n; i++) {
        /* Placement decides whether motifs float in their own cell or meet
           their neighbours. Meeting at the cell borders is what turns a grid
           of shapes into one continuous pattern. */
        var cx, cy;
        if (p.motifPlace === "cross") { cx = i * T; cy = j * T; }
        else if (p.motifPlace === "half") { cx = i * T + T / 2; cy = j * T; }
        else { cx = i * T + T / 2; cy = j * T + T / 2; }
        if (p.tileOffset === "brick") cx += mod(j, 2) * T / 2;
        else if (p.tileOffset === "drop") cy += mod(i, 2) * T / 2;

        var turn = 0;
        if (p.tileTurn === "quarter") turn = mod(i + j, 4) * HALF;
        else if (p.tileTurn === "half") turn = mod(i + j, 2) * Math.PI;
        else if (p.tileTurn === "random") turn = Math.floor(cr(S.seed, i, j, 1) * 4) * HALF;

        var idx;
        if (p.motifColour === "row") idx = mod(j, 4);
        else if (p.motifColour === "column") idx = mod(i, 4);
        else if (p.motifColour === "random") idx = Math.floor(cr(S.seed, i, j, 2) * 4) % 4;
        else idx = mod(i, 2) + 2 * mod(j, 2);
        var col = cols[idx];

        c.save();
        c.translate(cx, cy);
        c.rotate(turn);

        /* Mirror symmetry. Flipping every other column makes neighbouring
           motifs face each other, which is the difference between a scatter
           of shapes and an ornament. `quad` mirrors the motif inside its own
           cell for a four-fold rosette. */
        if (p.motifSymmetry === "mirror" && mod(i, 2) === 1) c.scale(-1, 1);
        else if (p.motifSymmetry === "mirrorV" && mod(j, 2) === 1) c.scale(1, -1);

        if (type === "dot") {
          c.beginPath(); c.arc(0, 0, s, 0, TAU);
          paintShape(c, fill, col, lw);
        } else if (type === "diamond") {
          c.beginPath();
          c.moveTo(0, -s); c.lineTo(s * 0.8, 0); c.lineTo(0, s); c.lineTo(-s * 0.8, 0);
          c.closePath();
          paintShape(c, fill, col, lw);
        } else if (type === "petal") {
          c.beginPath();
          c.moveTo(-s, 0);
          c.quadraticCurveTo(0, -s * 1.1, s, 0);
          c.quadraticCurveTo(0, s * 1.1, -s, 0);
          c.closePath();
          paintShape(c, fill, col, lw);
        } else if (type === "arrow") {
          c.beginPath();
          c.moveTo(0, -s); c.lineTo(s * 0.75, s * 0.7); c.lineTo(0, s * 0.3); c.lineTo(-s * 0.75, s * 0.7);
          c.closePath();
          paintShape(c, fill, col, lw);
        } else if (type === "eye") {
          c.beginPath();
          c.moveTo(-s, 0);
          c.quadraticCurveTo(0, -s * 1.05, s, 0);
          c.quadraticCurveTo(0, s * 1.05, -s, 0);
          c.closePath();
          paintShape(c, fill, col, lw);
          c.beginPath(); c.arc(0, 0, s * 0.3, 0, TAU);
          c.fillStyle = rgba(col, 1); c.fill();
        } else if (type === "crescent") {
          c.beginPath();
          c.arc(0, 0, s, 0.35, TAU - 0.35);
          c.arc(s * 0.42, 0, s * 0.94, TAU - 0.62, 0.62, true);
          c.closePath();
          paintShape(c, fill, col, lw);
        } else if (type === "trefoil") {
          c.beginPath();
          for (var tf = 0; tf < 3; tf++) {
            var ta = -HALF + tf * TAU / 3;
            var tx = Math.cos(ta) * s * 0.42, ty = Math.sin(ta) * s * 0.42;
            c.moveTo(tx + s * 0.58, ty);
            c.arc(tx, ty, s * 0.58, 0, TAU);
          }
          paintShape(c, fill, col, lw);
        } else if (type === "spiral") {
          c.beginPath();
          var turns = 2.6, steps = 46;
          for (var si = 0; si <= steps; si++) {
            var st2 = si / steps;
            var sa = st2 * turns * TAU;
            var sr = s * (0.12 + 0.88 * st2);
            var sx = Math.cos(sa) * sr, sy = Math.sin(sa) * sr;
            if (si === 0) c.moveTo(sx, sy); else c.lineTo(sx, sy);
          }
          c.lineCap = "round";
          c.strokeStyle = rgba(col, 1);
          c.lineWidth = lw;
          c.stroke();
          if (fill !== "outline") {
            c.beginPath(); c.arc(0, 0, s * 0.10, 0, TAU);
            c.fillStyle = rgba(col, 1); c.fill();
          }
        } else if (type === "rune") {
          /* an angular glyph: a vertical stem with two bars and a foot */
          c.beginPath();
          c.moveTo(0, -s); c.lineTo(0, s);
          c.moveTo(0, -s * 0.42); c.lineTo(s * 0.62, -s * 0.78);
          c.moveTo(0, s * 0.10); c.lineTo(s * 0.62, -s * 0.26);
          c.moveTo(0, s); c.lineTo(s * 0.52, s * 0.44);
          c.lineCap = "butt"; c.lineJoin = "miter";
          c.strokeStyle = rgba(col, 1); c.lineWidth = lw;
          c.stroke();
        } else if (type === "key") {
          /* a squared hook, the Greek key motif on its own */
          c.beginPath();
          c.moveTo(-s, s);
          c.lineTo(-s, -s);
          c.lineTo(s * 0.55, -s);
          c.lineTo(s * 0.55, s * 0.30);
          c.lineTo(-s * 0.10, s * 0.30);
          c.lineJoin = "miter"; c.lineCap = "butt";
          c.strokeStyle = rgba(col, 1); c.lineWidth = lw;
          c.stroke();
        } else {
          starPath(c, 0, 0, 8, s, s * 0.5);
          paintShape(c, fill, col, lw);
        }
        c.restore();
      }
    }
  }

  /* =======================================================================
     LATTICE
     Straight ribbons in two or three directions, woven over and under.
     Over-under: every crossing alternates which ribbon is on top.
     Gapped: the ribbon underneath is broken at each crossing.
     Flat: all ribbons simply lie on top of each other.
     ======================================================================= */
  function lattice(S) {
    var c = S.c, p = S.p, cols = S.cols, T = S.T, D = S.D;
    var shape = p.latticeShape, weave = p.latticeWeave;
    var angles, offs;
    if (shape === "square") { angles = [0, HALF]; offs = [0, 0]; }
    else if (shape === "triangle") { angles = [0, Math.PI / 3, 2 * Math.PI / 3]; offs = [0, 0, 0.33]; }
    else { angles = [Math.PI / 4, 3 * Math.PI / 4]; offs = [0, 0]; }

    var P = T * 0.75;
    var tri = angles.length === 3;
    var w = Math.min(num(p.strandWidth) * S.k, P * (tri ? 0.5 : 0.8));
    w = Math.max(w, 2);
    var o = weave === "flat" ? 0 : Math.max(1, S.lw);
    var K = Math.ceil(D / P) + 1;
    c.lineCap = "butt"; c.lineJoin = "round";

    var fam = angles.map(function (a, f) {
      return { u: [Math.cos(a), Math.sin(a)], nv: [-Math.sin(a), Math.cos(a)], off: offs[f] * P };
    });

    function strandCol(f, k) {
      return p.latticeColour === "strand" ? cols[mod(k + f, 4)] : cols[f % 4];
    }

    /* draw part of a strand from distance t0 to t1 along it */
    function seg(f, k, t0, t1) {
      var F = fam[f], base = k * P + F.off;
      var bx = F.nv[0] * base, by = F.nv[1] * base;
      var col = strandCol(f, k);
      c.beginPath();
      c.moveTo(bx + F.u[0] * t0, by + F.u[1] * t0);
      c.lineTo(bx + F.u[0] * t1, by + F.u[1] * t1);
      if (o > 0) {
        c.lineWidth = w + 2 * o;
        c.strokeStyle = darken(col, 0.55);
        c.stroke();
      }
      c.lineWidth = w;
      c.strokeStyle = rgba(col, 1);
      c.stroke();
    }

    /* where strand (fa,ka) crosses strand (fb,kb): distance along strand a */
    function cross(fa, ka, fb, kb) {
      var A = fam[fa], B = fam[fb];
      var ca = ka * P + A.off, cb = kb * P + B.off;
      var det = A.nv[0] * B.nv[1] - A.nv[1] * B.nv[0];
      if (Math.abs(det) < 0.05) return null;
      var X = (ca * B.nv[1] - cb * A.nv[1]) / det;
      var Y = (A.nv[0] * cb - B.nv[0] * ca) / det;
      return { t: X * A.u[0] + Y * A.u[1], sin: Math.abs(det), r2: X * X + Y * Y };
    }

    var f, k, g, kb;

    if (weave === "gap") {
      for (f = 0; f < fam.length; f++) {
        for (k = -K; k <= K; k++) {
          var unders = [];
          for (g = 0; g < fam.length; g++) {
            if (g === f) continue;
            for (kb = -K; kb <= K; kb++) {
              var X = cross(f, k, g, kb);
              if (!X || Math.abs(X.t) > D) continue;
              var odd = mod(k + kb, 2) === 1;
              var under = f < g ? odd : !odd;
              if (under) unders.push({ t: X.t, h: (w / 2 + o) / X.sin + w * 0.3 });
            }
          }
          unders.sort(function (a, b) { return a.t - b.t; });
          var start = -D;
          for (var u = 0; u < unders.length; u++) {
            var end = unders[u].t - unders[u].h;
            if (end > start) seg(f, k, start, end);
            start = Math.max(start, unders[u].t + unders[u].h);
          }
          if (D > start) seg(f, k, start, D);
        }
      }
      return;
    }

    /* flat and over-under: draw every strand, later directions on top */
    for (f = 0; f < fam.length; f++) {
      for (k = -K; k <= K; k++) seg(f, k, -D, D);
    }
    if (weave !== "over") return;

    /* then lift the earlier strand back on top at every second crossing */
    for (f = 0; f < fam.length; f++) {
      for (g = f + 1; g < fam.length; g++) {
        for (k = -K; k <= K; k++) {
          for (kb = -K; kb <= K; kb++) {
            if (mod(k + kb, 2) !== 0) continue;
            var X2 = cross(f, k, g, kb);
            if (!X2 || X2.r2 > (D + T) * (D + T)) continue;
            var h = (w / 2 + o) / X2.sin + o + 1;
            seg(f, k, X2.t - h, X2.t + h);
          }
        }
      }
    }
  }

  /* =======================================================================
     HEX WEAVE
     Honeycomb. Outline and Filled draw one hexagon per cell. Woven bands
     draw every honeycomb edge as a ribbon and alternate which ribbon is
     on top where three of them meet.
     ======================================================================= */
  function hexPath(c, x, y, r) {
    c.beginPath();
    for (var m = 0; m < 6; m++) {
      var a = -HALF + m * Math.PI / 3;
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (m === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }

  function hex(S) {
    var c = S.c, p = S.p, cols = S.cols, T = S.T, D = S.D, lw = S.lw;
    var R = T / Math.sqrt(3);
    var rowH = R * 1.5;
    var J = Math.ceil(D / rowH) + 2;
    var I = Math.ceil(D / T) + 2;
    var style = p.hexStyle;
    var gap = clamp(num(p.hexGap), 0, 30) / 100;
    c.lineJoin = "round"; c.lineCap = "round";

    function cell(i, j) {
      var q = i - (j - mod(j, 2)) / 2, r = j;
      return {
        x: (i + mod(j, 2) * 0.5) * T,
        y: j * rowH,
        q: q, r: r
      };
    }
    function colourOf(i, j, q, r) {
      var idx;
      if (p.hexColour === "rings") idx = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) % 4;
      else if (p.hexColour === "random") idx = Math.floor(cr(S.seed, i, j, 3) * 4) % 4;
      else idx = mod(q, 4);
      return cols[idx];
    }

    var i, j, m, ce, col;

    if (style !== "woven") {
      var rr = R * (1 - gap);
      for (j = -J; j <= J; j++) {
        for (i = -I; i <= I; i++) {
          ce = cell(i, j);
          col = colourOf(i, j, ce.q, ce.r);
          hexPath(c, ce.x, ce.y, rr);
          if (style === "filled") {
            c.fillStyle = rgba(col, 0.95); c.fill();
            c.strokeStyle = rgba(col, 1); c.lineWidth = 1; c.stroke();
          } else {
            c.strokeStyle = rgba(col, 1); c.lineWidth = lw; c.stroke();
          }
        }
      }
      return;
    }

    /* woven bands: edges 0, 1 and 2 of every cell cover each edge once */
    var bw = Math.max(R * 0.34, lw * 1.5);
    var o = Math.max(1, lw * 0.5);
    for (var pass = 0; pass < 2; pass++) {
      for (j = -J; j <= J; j++) {
        for (i = -I; i <= I; i++) {
          ce = cell(i, j);
          col = colourOf(i, j, ce.q, ce.r);
          for (m = 0; m < 3; m++) {
            if (mod(i + j + m, 2) !== pass) continue;
            var a0 = -HALF + m * Math.PI / 3, a1 = a0 + Math.PI / 3;
            var x0 = ce.x + Math.cos(a0) * R, y0 = ce.y + Math.sin(a0) * R;
            var x1 = ce.x + Math.cos(a1) * R, y1 = ce.y + Math.sin(a1) * R;
            c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
            c.lineWidth = bw + 2 * o; c.strokeStyle = darken(col, 0.55); c.stroke();
            c.lineWidth = bw; c.strokeStyle = rgba(col, 1); c.stroke();
          }
        }
      }
    }
  }

  /* =======================================================================
     TRUCHET
     Square tiles, each flipped one of two ways. Where lines meet at tile
     edges they always join up, so the tiles form flowing paths.
     ======================================================================= */
  function arcs(c, x0, y0, T, flip, r) {
    c.beginPath();
    if (!flip) {
      c.moveTo(x0 + r, y0); c.arc(x0, y0, r, 0, HALF);
      c.moveTo(x0 + T - r, y0 + T); c.arc(x0 + T, y0 + T, r, Math.PI, Math.PI * 1.5);
    } else {
      c.moveTo(x0 + T, y0 + r); c.arc(x0 + T, y0, r, HALF, Math.PI);
      c.moveTo(x0, y0 + T - r); c.arc(x0, y0 + T, r, Math.PI * 1.5, TAU);
    }
  }

  function truchet(S) {
    var c = S.c, p = S.p, cols = S.cols, T = S.T, lw = S.lw;
    var n = Math.ceil(S.D / T) + 2;
    var mix = clamp(num(p.truchetMix), 0, 100) / 100;
    var style = p.truchetStyle;
    var d = T * 0.14;
    c.lineCap = "butt"; c.lineJoin = "round";

    for (var j = -n; j <= n; j++) {
      for (var i = -n; i <= n; i++) {
        var x0 = i * T, y0 = j * T;
        var flip = mod(i + j, 2) === 1;
        if (cr(S.seed, i, j, 4) < mix) flip = cr(S.seed, i, j, 5) < 0.5;

        var col;
        if (p.truchetColour === "row") col = cols[mod(j, 4)];
        else if (p.truchetColour === "diagonal") col = cols[mod(i + j, 4)];
        else if (p.truchetColour === "single") col = cols[0];
        else col = cols[Math.floor(cr(S.seed, i, j, 6) * 4) % 4];

        if (style === "diagonal") {
          c.beginPath();
          if (!flip) { c.moveTo(x0, y0); c.lineTo(x0 + T, y0 + T); }
          else { c.moveTo(x0 + T, y0); c.lineTo(x0, y0 + T); }
          c.lineCap = "round";
          c.lineWidth = lw; c.strokeStyle = rgba(col, 1); c.stroke();
          c.lineCap = "butt";
        } else if (style === "double") {
          var wd = Math.min(lw, d * 1.6);
          [T / 2 - d, T / 2 + d].forEach(function (r) {
            arcs(c, x0, y0, T, flip, r);
            c.lineWidth = wd; c.strokeStyle = rgba(col, 1); c.stroke();
          });
        } else if (style === "band") {
          var bw = Math.max(lw, T * 0.22);
          var o = Math.max(1, lw * 0.5);
          arcs(c, x0, y0, T, flip, T / 2);
          c.lineWidth = bw + 2 * o; c.strokeStyle = darken(col, 0.55); c.stroke();
          c.lineWidth = bw; c.strokeStyle = rgba(col, 1); c.stroke();
        } else {
          arcs(c, x0, y0, T, flip, T / 2);
          c.lineWidth = lw; c.strokeStyle = rgba(col, 1); c.stroke();
        }
      }
    }
  }

  /* =======================================================================
     MAIN ENTRY
     Draws the pattern on a spare canvas (turned by Rotation and big enough
     to reach every corner), then lays it on the real one at the chosen
     opacity. This keeps overlaps clean at any opacity.
     ======================================================================= */
  /* =======================================================================
     FINISH — paper grain and a vignette.
     Applied to the pattern canvas before it is laid down, so it reads as
     printed ink on stock rather than flat vector art.
     ======================================================================= */
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

  function finish(S, W, H) {
    var c = S.c, kind = S.p.paperFinish;
    if (!kind || kind === "none") return;

    if (kind === "grain" || kind === "both") {
      if (!grainTile) makeGrain();
      if (grainTile) {
        c.save();
        c.globalAlpha = 0.055;
        c.globalCompositeOperation = "overlay";
        var pat = c.createPattern(grainTile, "repeat");
        if (pat) { c.fillStyle = pat; c.fillRect(-S.D, -S.D, S.D * 2, S.D * 2); }
        c.restore();
      }
    }

    if (kind === "vignette" || kind === "both") {
      c.save();
      /* drawn in local coordinates, so it follows the canvas centre */
      var r0 = Math.min(W, H) * 0.18;
      var r1 = S.D;
      var g = c.createRadialGradient(0, 0, r0, 0, 0, r1);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.66, "rgba(0,0,0,0.10)");
      g.addColorStop(1, "rgba(0,0,0,0.42)");
      c.fillStyle = g;
      c.fillRect(-S.D, -S.D, S.D * 2, S.D * 2);
      c.restore();
    }
  }

  /* =======================================================================
     KALEIDOSCOPE
     Draw the pattern once into a buffer, then stamp it back four ways,
     mirrored. This is a whole-picture effect, so it wraps the engine call
     rather than living inside any one recipe.
     ======================================================================= */
  function kaleido(S) {
    var c = S.c, W = S.W, H = S.H, p = S.p;
    var style = p.style;
    var qw = Math.ceil(W / 2), qh = Math.ceil(H / 2);

    var off = document.createElement("canvas");
    off.width = qw; off.height = qh;
    var oc = off.getContext("2d");

    var sub = {};
    for (var key in S) if (Object.prototype.hasOwnProperty.call(S, key)) sub[key] = S[key];
    sub.c = oc;
    sub.W = qw; sub.H = qh;
    sub.D = Math.sqrt(qw * qw + qh * qh) / 2 + S.T * 2;

    /* Draw the quadrant with the pattern's origin at the quadrant's centre.
       Rotating that origin around the picture centre for each stamp is what
       produces genuine four-fold symmetry; plain copying produces a repeat,
       which is what made the first version look unchanged. */
    oc.save();
    oc.translate(qw / 2, qh / 2);
    oc.rotate(num(p.rotation) * Math.PI / 180);
    runEngine(sub, style);
    oc.restore();

    /* four stamps, each the quadrant turned a quarter and mirrored, so the
       seams read as folds rather than as a tiling */
    /* Each stamp pushes the quadrant's own centre out from the picture centre
       by half a quadrant, then turns it. Translation after the rotation
       rotates the offset, which is what makes the four corners meet on the
       two mid-lines. */
    var dx = qw / 2, dy = qh / 2;
    c.save();
    for (var k = 0; k < 4; k++) {
      var ang = k * HALF;
      var ox = Math.cos(ang) * dx - Math.sin(ang) * dy;
      var oy = Math.sin(ang) * dx + Math.cos(ang) * dy;
      c.save();
      c.translate(W / 2 + ox, H / 2 + oy);
      c.rotate(ang);
      if (k % 2 === 1) c.scale(-1, 1);
      c.drawImage(off, -qw / 2, -qh / 2);
      c.restore();
    }
    c.restore();
  }

  function runEngine(S, style) {
    var E = window.InkworkEngines || {};
    if (style === "lattice") lattice(S);
    else if (style === "hex") hex(S);
    else if (style === "truchet") truchet(S);
    else if (style === "motif") motif(S);
    else if (E[style]) E[style](S);
    else motif(S);
  }

  function draw(target, W, H, p) {
    var off = document.createElement("canvas");
    off.width = W; off.height = H;
    var c = off.getContext("2d");
    var k = Math.min(W, H) / 1500;
    var T = Math.max(8, num(p.tileSize) * k);

    var S = {
      c: c, p: p, k: k, T: T, W: W, H: H,
      lw: Math.max(1, num(p.lineWeight) * k),
      D: Math.sqrt(W * W + H * H) / 2 + T * 2,
      cols: (p.colors || ["#e63b2e", "#1d3557", "#f2a900", "#2a9d8f"]).slice(0, 4),
      seed: hash(p.seed)
    };

    if (p.symmetry === "kaleido") {
      /* absolute pixels: the four mirrored stamps must align to the picture's
         own mid-lines, which a rotated frame would move */
      kaleido(S);
      c.save();
      c.translate(W / 2, H / 2);
      finish(S, W, H);
      c.restore();
    } else {
      c.save();
      c.translate(W / 2, H / 2);
      c.rotate(num(p.rotation) * Math.PI / 180);
      runEngine(S, p.style);
      finish(S, W, H);
      c.restore();
    }

    target.save();
    target.globalAlpha = clamp(num(p.opacity) || 1, 0, 1);
    target.drawImage(off, 0, 0);
    target.restore();
  }

  window.InkworkStyles = { draw: draw };
})();