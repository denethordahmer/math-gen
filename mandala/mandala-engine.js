/* =========================================================================
   MANDALA: mandala-engine.js
   Six drawing styles, all built around a folded wedge so every picture is
   symmetric. window.Mandala.draw(ctx, W, H, recipe) is the only entry point.

   The recipe is a plain object, like Backdrop's: style, seed, palette,
   colors, contrast, grain, vignette, rotation and opts. Every setting is read
   with a default, so an older recipe still draws.

   The per-pixel styles (kaleido, filigree, bloom) compute a float "field"
   first and colour it second. The colouring stretches the field to its own
   2nd-98th percentile band, so a picture can never come out flat or washed
   out, which is what a fixed mapping kept doing on random settings.
   ========================================================================= */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------- randomness */
  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  /* mulberry32: small, fast, and the same seed always gives the same picture */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function opt(R, key, d) { return R.opts && R.opts[key] !== undefined ? R.opts[key] : d; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function mix(a, b, t) { return a + (b - a) * t; }

  /* ----------------------------------------------------------------- colour */
  /* Each palette is a ring of hsl stops. Multi-hue, because the examples are
     multi-hue; the ramps wrap, so a colouring value can run past 1. */
  var PALETTES = {
    spectrum: [[265, 90, 58], [200, 95, 60], [150, 85, 55], [55, 95, 62], [20, 95, 58], [330, 90, 62]],
    sunrise: [[275, 70, 42], [330, 85, 58], [10, 95, 62], [40, 100, 66], [55, 95, 74], [200, 60, 55]],
    lagoon: [[210, 90, 30], [190, 90, 46], [165, 85, 56], [80, 65, 60], [40, 90, 64], [320, 60, 52]],
    orchid: [[280, 70, 40], [300, 85, 54], [325, 90, 64], [350, 70, 60], [30, 70, 64], [250, 65, 52]],
    ember: [[350, 85, 22], [10, 92, 40], [25, 96, 54], [42, 100, 64], [55, 92, 74], [205, 45, 30]],
    iris: [[250, 80, 32], [265, 85, 46], [285, 90, 58], [310, 80, 66], [200, 75, 56], [160, 60, 50]],
    acid: [[95, 85, 38], [70, 95, 50], [45, 100, 58], [20, 98, 56], [200, 90, 50], [280, 90, 48]],
    tide: [[200, 90, 24], [180, 88, 40], [160, 70, 50], [95, 55, 54], [45, 85, 62], [330, 60, 50]],
    gold: [[26, 75, 20], [35, 88, 36], [45, 96, 52], [52, 100, 66], [200, 50, 42], [280, 55, 36]],
    neon: [[300, 100, 55], [265, 100, 60], [210, 100, 58], [160, 100, 52], [60, 100, 58], [330, 100, 60]],
    petal: [[340, 65, 52], [355, 78, 66], [25, 85, 74], [200, 60, 66], [275, 60, 60], [150, 45, 56]],
    abyss: [[240, 85, 10], [255, 88, 24], [280, 85, 40], [200, 90, 50], [160, 80, 46], [45, 95, 64]],
    verdigris: [[172, 65, 18], [165, 70, 32], [155, 58, 46], [45, 75, 54], [30, 85, 60], [210, 55, 38]],
    chalk: [[32, 25, 86], [200, 30, 68], [330, 35, 64], [160, 25, 58], [45, 50, 76], [270, 25, 50]]
  };
  /* Saturation multiplier and lightness cap per palette. Chalk is meant to be
     muted; neon is not. */
  var MOOD = {
    spectrum: [1, 1], sunrise: [1, 1], lagoon: [0.95, 1], orchid: [0.95, 1],
    ember: [1, 1], iris: [0.95, 1], acid: [1, 1], tide: [0.9, 1], gold: [1, 1],
    neon: [1, 1], petal: [0.8, 1.06], abyss: [1, 0.96], verdigris: [0.85, 0.98],
    chalk: [0.6, 1.1]
  };

  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    var c = (1 - Math.abs(2 * l / 100 - 1)) * (s / 100);
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l / 100 - c / 2;
    var r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function css(rgb, a) {
    var r = Math.round(clamp(rgb[0], 0, 255));
    var g = Math.round(clamp(rgb[1], 0, 255));
    var b = Math.round(clamp(rgb[2], 0, 255));
    return a === undefined ? "rgb(" + r + "," + g + "," + b + ")"
      : "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }

  /* A 1024-entry ramp, so the pixel loops never do colour maths. */
  function buildLut(name, contrast, drift) {
    var stops = PALETTES[name] || PALETTES.spectrum;
    var mood = MOOD[name] || [1, 1];
    /* A saturation floor of 0.62: below that the ramps turn to grey, and grey
       was what made the pale palettes read as washed out. */
    var satK = mix(0.62, 1.15, clamp(contrast, 0, 100) / 100) * mood[0];
    var lut = new Array(1024);
    var n = stops.length;
    for (var i = 0; i < 1024; i++) {
      var t = (i / 1024) * n + drift;
      var i0 = Math.floor(t) % n, i1 = (i0 + 1) % n;
      var f = t - Math.floor(t);
      var a = stops[i0], b = stops[i1];
      var dh = b[0] - a[0];
      if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
      var h = a[0] + dh * f;
      var s = clamp(mix(a[1], b[1], f) * satK, 0, 100);
      var l = clamp(mix(a[2], b[2], f) * mood[1], 3, 96);
      var c = hsl(h, s, l);
      lut[i] = [c[0] | 0, c[1] | 0, c[2] | 0];
    }
    lut.bands = clamp(contrast, 0, 100) / 100;
    return lut;
  }
  function lutAt(lut, t, out) {
    var i = (t * 1024) | 0;
    i = ((i % 1024) + 1024) % 1024;
    var e = lut[i];
    out[0] = e[0]; out[1] = e[1]; out[2] = e[2];
    return out;
  }

  /* --------------------------------------------------------------- symmetry */
  /* Fold a point into one wedge of the picture. That is what makes every
     style a mandala: the field is computed once per wedge and the fold makes
     the rest of the frame match it. */
  function foldX(x, y, n, mirror, out) {
    var a = Math.atan2(y, x);
    var r = Math.sqrt(x * x + y * y);
    var seg = Math.PI * 2 / n;
    var k = Math.floor((a + Math.PI) / seg);
    var t = (a + Math.PI) - k * seg;
    if (mirror && (k & 1)) t = seg - t;
    out[0] = Math.cos(t) * r;
    out[1] = Math.sin(t) * r;
    out[2] = seg;
    return out;
  }

  /* ------------------------------------------------------------ field render */
  /* Run a sampler over every pixel and return a Float32Array. Points that hit
     "inside" get the sentinel value -1.
     The sampler is given a point in frame coordinates, with the centre of the
     frame at (0, 0), so each style reads the frame the same way at preview and
     export size. */
  function renderField(W, H, sampler) {
    var buf = new Float32Array(W * H);
    for (var y = 0, i = 0; y < H; y++) {
      var py = y - H / 2;
      for (var x = 0; x < W; x++, i++) buf[i] = sampler(x - W / 2, py);
    }
    return buf;
  }

  /* Tone mapping. A percentile stretch fails on trap fields, which are
     heavily zero-inflated: three quarters of the pixels sit near zero, so the
     2-98 band collapses and the picture goes flat. Ranking the values instead
     (a 256-bin histogram equalisation) always spreads the picture over the
     full ramp, so no setting can come out as a plain colour wash. The blend
     keeps some of the raw tone, so equalised detail still reads as depth. */
  var BINS = 256;
  function toneMap(buf, blend) {
    var n = buf.length;
    var hist = new Int32Array(BINS);
    var count = 0, lo = Infinity, hi = -Infinity;
    for (var i = 0; i < n; i++) {
      var v = buf[i];
      if (v < 0) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      count++;
    }
    if (!count || !(hi > lo)) return { eq: false, lo: 0, hi: 1 };
    var span = (BINS - 1) / (hi - lo);
    for (var j = 0; j < n; j++) {
      var w = buf[j];
      if (w < 0) continue;
      hist[((w - lo) * span) | 0]++;
    }
    /* cumulative, then normalised to 0..1 */
    var cum = new Float32Array(BINS);
    var run = 0, inv = 1 / count;
    for (var b = 0; b < BINS; b++) {
      run += hist[b];
      cum[b] = run * inv;
    }
    return { eq: true, lo: lo, hi: hi, span: span, cum: cum, blend: blend };
  }

  /* How much of the frame sits in one tone? Two ways a flat picture happens: a
     mostly-inside fill, or escape times that all saturate at the same number.
     Both give one colour across the picture, so both count. */
  function isValid(f) { return f >= 0; }
  function flatShare(buf) {
    var n = buf.length, inside = 0, min = Infinity, max = -Infinity;
    for (var i = 0; i < n; i++) {
      var v = buf[i];
      if (!isValid(v)) { inside++; continue; }
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (inside / n > 0.55) return inside / n;
    /* A narrow value range is equally flat: less than 4% of the largest value */
    if (max > 0 && (max - min) / max < 0.04) return 1;
    return 0;
  }

  /* After tone mapping, the worst case is a value range that survives that
     check but still covers a couple of histogram bins, which colours almost
     the whole frame one way. Rank the values and measure the largest bin
     share; anything over half the frame in one bin is a flat picture. */
  function dominantShare(buf) {
    var n = buf.length, count = 0, lo = Infinity, hi = -Infinity;
    var i, v;
    for (i = 0; i < n; i++) {
      v = buf[i];
      if (!isValid(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      count++;
    }
    if (count < 2 || !(hi > lo)) return 1;
    var hist = new Int32Array(64);
    var span = 63 / (hi - lo);
    for (i = 0; i < n; i++) {
      v = buf[i];
      if (!isValid(v)) continue;
      var b = ((v - lo) * span) | 0;
      hist[b < 0 ? 0 : b > 63 ? 63 : b]++;
    }
    var top = 0;
    for (i = 0; i < 64; i++) if (hist[i] > top) top = hist[i];
    return top / count;
  }

  function paintField(ctx, W, H, buf, o) {
    var lut = o.lut;
    var tm = toneMap(buf, o.blend === undefined ? 0.78 : o.blend);
    var img = ctx.createImageData(W, H);
    var d = img.data;
    var col = [0, 0, 0];
    var bands = o.bands || 1;
    var gamma = o.gamma || 1;
    var insideT = o.insideT === undefined ? 0.06 : o.insideT;
    var n = W * H;
    var invSpan = tm.eq ? 1 / (tm.hi - tm.lo) : 1;
    var ratio = tm.eq ? (BINS - 1) / (tm.hi - tm.lo) : 1;

    for (var i = 0, o4 = 0; i < n; i++, o4 += 4) {
      var v = buf[i];
      var t;
      if (v < 0) {
        t = insideT;
      } else {
        if (tm.eq) {
          var bin = ((v - tm.lo) * ratio) | 0;
          if (bin < 0) bin = 0; else if (bin > BINS - 1) bin = BINS - 1;
          var lin = (v - tm.lo) * invSpan;
          t = tm.cum[bin] * tm.blend + lin * (1 - tm.blend);
        } else {
          t = (v - tm.lo) * invSpan;
        }
        if (gamma !== 1) t = Math.pow(t, gamma);
        t = t * bands;
      }
      lutAt(lut, t, col);
      d[o4] = col[0]; d[o4 + 1] = col[1]; d[o4 + 2] = col[2]; d[o4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  /* --------------------------------------------------------------- maths */
  /* Smooth escape time. Returns -1 when the point did not escape. */
  function escape(cr, ci, maxIter, bail) {
    var zr = 0, zi = 0, i = 0, zr2 = 0, zi2 = 0;
    while (i < maxIter && zr2 + zi2 <= bail) {
      zi = 2 * zr * zi + ci;
      zr = zr2 - zi2 + cr;
      zr2 = zr * zr; zi2 = zi * zi;
      i++;
    }
    if (i >= maxIter) return -1;
    var lg = Math.log(zr2 + zi2) * 0.5;
    return i + 1 - Math.log(lg / Math.LN2) / Math.LN2;
  }
  function escapeJulia(cr, ci, jr, ji, maxIter) {
    var zr = cr, zi = ci, i = 0, zr2 = zr * zr, zi2 = zi * zi;
    while (i < maxIter && zr2 + zi2 <= 64) {
      zi = 2 * zr * zi + ji;
      zr = zr2 - zi2 + jr;
      zr2 = zr * zr; zi2 = zi * zi;
      i++;
    }
    if (i >= maxIter) return -1;
    var lg = Math.log(zr2 + zi2) * 0.5;
    return i + 1 - Math.log(lg / Math.LN2) / Math.LN2;
  }

  function addGrain(ctx, W, H, amount) {
    if (!amount) return;
    var img = ctx.getImageData(0, 0, W, H);
    var d = img.data, a = amount / 100 * 80;
    for (var i = 0; i < d.length; i += 4) {
      var n = (Math.random() - 0.5) * a;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  function addVignette(ctx, W, H, amount, base) {
    if (!amount) return;
    var a = clamp(amount, 0, 100) / 100;
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.30,
      W / 2, H / 2, Math.max(W, H) * 0.78);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, css(base, a * 0.85));
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /* ------------------------------------------------------------- style one */
  /* kaleido: a fractal field seen through the fold. Four colourings, because
     on this style the colouring changes the look more than the shape does. */
  function kaleido(ctx, W, H, R) {
    var foldN = clamp(Math.round(num(opt(R, "fold", 10), 10)), 3, 32);
    var mirror = opt(R, "mirror", true) !== false;
    var detail = clamp(Math.round(num(opt(R, "detail", 110), 110)), 24, 320);
    var zoom = clamp(num(opt(R, "zoom", 55), 55), 0, 100) / 100;
    var colouring = Math.round(num(opt(R, "colour", 0), 0));
    var warp = clamp(num(opt(R, "warp", 40), 40), 0, 100) / 100;
    var bands = clamp(num(opt(R, "bands", 5), 5), 1, 12);
    var soft = clamp(num(opt(R, "soft", 45), 45), 0, 100) / 100;

    var lut = buildLut(R.palName, R.contrast, R.drift);
    var cx = W / 2, cy = H / 2;
    /* Zoom is capped: past about 0.62 the frame sits wholly inside the set and
       the picture is one flat colour, which random draws kept hitting. */
    var scale = Math.min(W, H) * (0.30 + (1 - clamp(zoom, 0, 0.62) / 0.62) * 0.40);
    /* Frame on the boundary rather than the middle, which is a black blob. The
       anchor follows the boundary of the set, where all the detail lives. */
    var ax = mix(-1.15, -0.35, R.anchor);
    var ay = mix(-0.42, 0.42, R.anchor2);
    var ang = R.angle, ca = Math.cos(ang), sa = Math.sin(ang);
    var f = [0, 0, 0];
    var jr = mix(-0.82, 0.26, R.rnd()), ji = mix(-0.68, 0.68, R.rnd2());
    var trapRing = 0.25 + R.trapK * 0.9;

    function sample(px, py) {
      var rx = px * ca - py * sa, ry = px * sa + py * ca;
      foldX(rx, ry, foldN, mirror, f);
      var ux = f[0], uy = f[1];
      if (warp > 0.01) {
        /* a slow twist around the fold, so rings are never plain circles */
        var rr0 = Math.sqrt(ux * ux + uy * uy);
        var tw = Math.sin(rr0 * 5.5 + R.phase) * warp * 0.16;
        var cw = Math.cos(tw), sw = Math.sin(tw);
        var tx = ux * cw - uy * sw;
        uy = ux * sw + uy * cw;
        ux = tx;
      }
      var v;
      if (colouring === 0) {
        v = escape(ux + ax, uy + ay, detail, 64);
        if (v >= 0) v += Math.sin(v * 0.7 * soft * 6 + R.phase) * soft * 2.2;
      } else if (colouring === 1) {
        v = escape(ux + ax, uy + ay, detail, 64);
        if (v >= 0) v = Math.abs(Math.sin(v * 0.11 * (1 + soft * 7) + R.phase));
      } else if (colouring === 2) {
        v = orbitTrap(ux + ax, uy + ay, detail, trapRing);
      } else {
        v = escapeJulia(ux, uy, jr, ji, detail);
        if (v >= 0) v += Math.sin(v * soft * 8 + R.phase) * soft * 1.6;
      }
      return v;
    }

    function fieldAt(sc) {
      return renderField(W, H, function (px, py) { return sample(px / sc, py / sc); });
    }

    var fld = fieldAt(scale);
    /* Some seeds frame the set's interior, or land on a narrow band of escape
       times, which would be almost one colour. Pull back and resample a few
       times rather than shipping that: random draws used to hit it about one
       time in twelve. */
    var tries = 0;
    while (tries < 3 && (flatShare(fld) || dominantShare(fld) > 0.5)) {
      tries++;
      scale *= 1.35;
      fld = fieldAt(scale);
    }

    paintField(ctx, W, H, fld, {
      lut: lut, bands: bands,
      /* the inside of a set is the dark heart of the picture, so it stays at
         the low end of the ramp; a pale fill here flooded whole frames */
      insideT: 0.015 + R.inside * 0.06,
      gamma: 0.75
    });
  }

  /* Closest approach of a Mandelbrot orbit to a ring. The nearer the miss,
     the larger the value; "outside" returns -1. */
  function orbitTrap(cr, ci, maxIter, ring) {
    var zr = 0, zi = 0, best = 1e9, i = 0, zr2 = 0, zi2 = 0;
    while (i < maxIter && zr2 + zi2 <= 64) {
      zi = 2 * zr * zi + ci;
      zr = zr2 - zi2 + cr;
      zr2 = zr * zr; zi2 = zi * zi;
      i++;
      var d = Math.abs(Math.sqrt(zr2 + zi2) - ring);
      if (d < best) best = d;
    }
    if (i >= maxIter) return -1;
    return best;
  }

  /* ------------------------------------------------------------- style two */
  /* filigree: every pixel runs a Julia orbit and records WHEN the orbit first
     came within a small radius of the origin. Points that are hit early are
     bright; points never hit fall back to the escape time. That "first hit"
     field is what draws lace: the orbits wrap the set, and the time they take
     to come back near zero traces the fold lines. */
  function filigree(ctx, W, H, R) {
    var foldN = clamp(Math.round(num(opt(R, "fold", 12), 12)), 3, 32);
    var mirror = opt(R, "mirror", true) !== false;
    var detail = clamp(Math.round(num(opt(R, "detail", 170), 170)), 30, 420);
    var tight = clamp(num(opt(R, "beads", 55), 55), 0, 100) / 100;
    var glow = clamp(num(opt(R, "glow", 50), 50), 0, 100) / 100;
    var zoom = clamp(num(opt(R, "zoom", 55), 55), 0, 100) / 100;
    var bands = clamp(num(opt(R, "bands", 3), 3), 1, 10);

    var lut = buildLut(R.palName, R.contrast, R.drift);
    var cx = W / 2, cy = H / 2;
    var scale = Math.min(W, H) * (0.36 + (1 - zoom) * 0.42);
    /* Julia constants just inside the boundary: close enough to give the
       spiral arms, not so close that the set fills the frame. */
    var angJ = R.rnd() * Math.PI * 2;
    var magJ = 0.66 + R.rnd2() * 0.14;
    var jr = Math.cos(angJ) * magJ, ji = Math.sin(angJ) * magJ;
    /* The trap radius is what sets the density of the lace. */
    /* The trap radius has to stay small: at 0.5 the ring sits where the orbit
       spends most of its time and the whole picture floods. 0.02-0.12 keeps it
       to the fold lines, which is the lace. */
    var ring = 0.015 + tight * 0.10;
    var ang = R.angle, ca = Math.cos(ang), sa = Math.sin(ang);
    var f = [0, 0, 0];

    var fld = renderField(W, H, function (fpx, fpy) {
      var px = fpx / scale, py = fpy / scale;
      var rx = px * ca - py * sa, ry = px * sa + py * ca;
      foldX(rx, ry, foldN, mirror, f);
      var zr = f[0], zi = f[1], zr2 = zr * zr, zi2 = zi * zi;
      var hit = -1, i = 0, escaped = false, minMag = 1e9;
      while (i < detail) {
        if (zr2 + zi2 <= ring * ring) { hit = i; break; }
        if (zr2 + zi2 > 16) { escaped = true; break; }
        zi = 2 * zr * zi + ji;
        zr = zr2 - zi2 + jr;
        zr2 = zr * zr; zi2 = zi * zi;
        var mg = Math.sqrt(zr2 + zi2);
        if (mg < minMag) minMag = mg;
        i++;
      }
      var v;
      if (!escaped) {
        /* Never escaped. A flat fill here left big dead patches in random
           draws, so use how close the orbit came to the origin instead: it
           varies across the basin and gives the core its own structure. */
        v = 0.06 + Math.exp(-Math.pow(minMag - 0.12, 2) * 22) * 0.5;
      } else {
        /* Two layers, both needed. The escape time gives the broad soft
           shading that stops the lobes going flat; the trap hit gives the
           fine lace where an orbit came back near the origin. Used alone,
           either one leaves big dead patches. */
        var base = Math.pow(1 - i / detail, 1.8) * 0.55;
        var lace = hit >= 0
          ? Math.pow(1 - hit / detail, 0.6 + glow * 1.2) * (0.5 + glow * 0.5)
          : 0;
        v = base + lace * 0.9;
      }
      return v;
    });
    paintField(ctx, W, H, fld, {
      lut: lut, bands: bands,
      insideT: 0.02,
      gamma: 1,
      blend: 0.45          /* more linear, so the ground stays dark */
    });
  }

  /* ----------------------------------------------------------- style three */
  /* lattice: a flat vector mandala. Rings of petals, chevrons, stones or
     rays, each ring turned against the next. */
  function lattice(ctx, W, H, R) {
    var foldN = clamp(Math.round(num(opt(R, "fold", 16), 16)), 3, 32);
    var rings = clamp(Math.round(num(opt(R, "rings", 7), 7)), 2, 14);
    var wideness = clamp(num(opt(R, "widen", 50), 50), 0, 100) / 100;
    var layers = clamp(Math.round(num(opt(R, "detail", 3), 3)), 1, 5);
    var shape = Math.round(num(opt(R, "shape", 0), 0)) % 5;
    var spin = clamp(num(opt(R, "spin", 45), 45), 0, 100) / 100;

    var lut = buildLut(R.palName, R.contrast, R.drift);
    var cx = W / 2, cy = H / 2;
    var Rmax = Math.sqrt(W * W + H * H) * 0.5 * 0.96;
    var seg = Math.PI * 2 / foldN;
    var col = [0, 0, 0];

    ctx.save();
    ctx.fillStyle = css(R.bg);
    ctx.fillRect(0, 0, W, H);

    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rmax);
    lutAt(lut, 0.05 + R.phase, col);
    g.addColorStop(0, css(col, 0.5));
    lutAt(lut, 0.9, col);
    g.addColorStop(1, css(col, 0.05));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (var k = 0; k < foldN; k++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(k * seg);
      for (var r = rings; r >= 1; r--) {
        var tR = r / rings;
        var r0 = Rmax * Math.pow(tR, 1.25) * 0.74;
        var r1 = Rmax * Math.pow(Math.min(1, (r + 0.72) / rings), 1.25) * 0.74;
        lutAt(lut, tR * 1.35 + R.phase + (r % 2) * 0.12, col);
        var alpha = clamp(0.72 + 0.28 * Math.sin(r * 1.9 + R.phase), 0.45, 1);
        ctx.fillStyle = css(col, alpha);
        ctx.strokeStyle = css(col, 0.85);
        ctx.lineWidth = Math.max(0.7, Math.min(W, H) * 0.0016);

        var halfW = seg * (0.34 + wideness * 0.58);
        var mid = (r0 + r1) / 2;
        var depth = r1 - r0;

        if (shape === 0) {
          /* petals: a pointed leaf, one per fold, repeated in bands */
          for (var L = 0; L < layers; L++) {
            var a0 = r0 + depth * (L / layers) * 0.5;
            var a1 = r0 + depth * (0.6 + 0.4 * (L + 1) / layers);
            ctx.beginPath();
            ctx.moveTo(0, -a0);
            ctx.quadraticCurveTo(Math.sin(halfW * 0.9) * a1 * 0.85, -mid,
              Math.sin(halfW) * a1, -a1);
            ctx.quadraticCurveTo(0, -a1 * 0.95, 0, -a0);
            ctx.closePath();
            ctx.fill();
          }
        } else if (shape === 1) {
          /* chevrons: zig-zag bands */
          for (var c2 = 0; c2 < 3; c2++) {
            var ra = r0 + depth * (c2 / 3), rb = r0 + depth * ((c2 + 1) / 3);
            ctx.beginPath();
            ctx.moveTo(0, -ra);
            ctx.lineTo(Math.sin(halfW * 0.7) * rb, -rb * Math.cos(halfW * 0.7));
            ctx.lineTo(Math.sin(halfW * 1.4) * rb, -rb * Math.cos(halfW * 1.4));
            ctx.lineTo(Math.sin(halfW * 0.7) * ra, -ra * Math.cos(halfW * 0.7));
            ctx.closePath();
            ctx.fill();
          }
        } else if (shape === 2) {
          /* stones: beads and diamonds on the ring */
          var count = 1 + (r % 3);
          for (var d2 = 0; d2 < count; d2++) {
            var aa = halfW * (d2 + 0.5) / count;
            var bx = Math.sin(aa) * mid, by = -Math.cos(aa) * mid;
            var s2 = depth * (0.16 + wideness * 0.18);
            ctx.beginPath();
            if ((r + d2) % 2) ctx.arc(bx, by, s2, 0, Math.PI * 2);
            else {
              ctx.moveTo(bx, by - s2); ctx.lineTo(bx + s2, by);
              ctx.lineTo(bx, by + s2); ctx.lineTo(bx - s2, by);
              ctx.closePath();
            }
            ctx.fill();
          }
        } else if (shape === 3) {
          /* rays: spokes with a knob at the tip */
          ctx.beginPath();
          ctx.moveTo(0, -r0);
          ctx.lineTo(0, -r1);
          ctx.lineWidth = Math.max(1, depth * 0.10);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, -r1, depth * (0.10 + wideness * 0.22), 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = Math.max(0.7, Math.min(W, H) * 0.0016);
        } else {
          /* rings: a band, grooved twice and split into segments, so a wide
             setting cannot collapse into one plain colour block */
          for (var seg2 = 0; seg2 < 2; seg2++) {
            var sa0 = -halfW + (seg2 * halfW) - halfW * 0.10;
            var sa1 = sa0 + halfW * 0.82;
            ctx.beginPath();
            ctx.arc(0, 0, r1, sa0, sa1);
            ctx.arc(0, 0, r0, sa1, sa0, true);
            ctx.closePath();
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(0, 0, (r0 + r1) / 2, -halfW, halfW);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, r0 + depth * 0.18, -halfW * 0.85, halfW * 0.85);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    /* medallion */
    lutAt(lut, 0.12 + R.phase, col);
    ctx.beginPath();
    ctx.arc(cx, cy, Rmax * 0.075, 0, Math.PI * 2);
    ctx.fillStyle = css(col, 0.95);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, Rmax * 0.045, 0, Math.PI * 2);
    lutAt(lut, 0.45 + R.phase, col);
    ctx.fillStyle = css(col, 0.9);
    ctx.fill();
    ctx.restore();
  }

  /* ------------------------------------------------------------ style four */
  /* rosette: spirograph curves drawn from one wedge and mirrored. Fine
     pen-work rather than filled shapes. */
  function rosette(ctx, W, H, R) {
    var foldN = clamp(Math.round(num(opt(R, "fold", 9), 9)), 3, 32);
    var curves = clamp(Math.round(num(opt(R, "curves", 14), 14)), 2, 40);
    var inner = clamp(num(opt(R, "inner", 55), 55), 0, 100) / 100;
    var wobble = clamp(num(opt(R, "wobble", 35), 35), 0, 100) / 100;
    var weight = clamp(num(opt(R, "weight", 40), 40), 0, 100) / 100;
    var bands = clamp(num(opt(R, "bands", 3), 3), 1, 10);

    var lut = buildLut(R.palName, R.contrast, R.drift);
    var cx = W / 2, cy = H / 2;
    var Rmax = Math.sqrt(W * W + H * H) * 0.5 * 0.92;
    var seg = Math.PI * 2 / foldN;
    var col = [0, 0, 0];

    ctx.save();
    ctx.fillStyle = css(R.bg);
    ctx.fillRect(0, 0, W, H);
    /* a soft ground tint: thin additive lines on a near-black palette read as
       almost nothing, so the paper carries a little of the palette first */
    var ground = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rmax);
    var gc = [0, 0, 0];
    lutAt(lut, 0.42 + R.phase, gc);
    ground.addColorStop(0, css(gc, 0.7));
    lutAt(lut, 0.75, gc);
    ground.addColorStop(1, css(gc, 0.10));
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (var k = 0; k < foldN; k++) {
      ctx.save();
      ctx.rotate(k * seg);
      if (k & 1) ctx.scale(1, -1);
      for (var c = 0; c < curves; c++) {
        var fq = c / curves;
        var a = Rmax * (0.10 + inner * 0.26) * (0.55 + fq * 0.9);
        var b = Rmax * (0.50 + fq * 0.42);
        var h = Math.round(3 + fq * 11 + Math.floor(R.rnd() * 4));
        var rot = R.phase + fq * Math.PI * 2;
        var steps = 420;
        lutAt(lut, fq * bands * 0.28 + R.phase, col);
        ctx.strokeStyle = css(col, 0.16 + 0.22 * (1 - fq) + weight * 0.18);
        ctx.lineWidth = Math.max(0.5, Math.min(W, H) * 0.0010 * (1 + weight * 2.4));

        ctx.beginPath();
        for (var s = 0; s <= steps; s++) {
          var t = (s / steps) * Math.PI * 2;
          var rr = a + (b - a) * (0.5 + 0.5 * Math.sin(h * t + rot));
          rr *= 1 + Math.sin(t * 3 + R.phase) * wobble * 0.2;
          var x = Math.cos(t) * rr, y = Math.sin(t) * rr;
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    for (var g = 0; g < 3; g++) {
      lutAt(lut, 0.08 + g * 0.1 + R.phase, col);
      ctx.beginPath();
      ctx.arc(0, 0, Rmax * (0.02 + g * 0.022), 0, Math.PI * 2);
      ctx.fillStyle = css(col, 0.45 - g * 0.1);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------ style five */
  /* tunnel: a polar field with four distinct modes, chosen by the seed as
     well as the settings. Without modes every random draw came out as the
     same contour map, which defeats the point of the tool. */
  function tunnel(ctx, W, H, R) {
    var foldN = clamp(Math.round(num(opt(R, "fold", 8), 8)), 3, 32);
    var rings = clamp(Math.round(num(opt(R, "rings", 22), 22)), 4, 60);
    var spin = clamp(num(opt(R, "spin", 45), 45), 0, 100) / 100;
    var tooth = clamp(num(opt(R, "warp", 40), 40), 0, 100) / 100;
    var bands = clamp(num(opt(R, "bands", 3), 3), 1, 10);
    var mode = Math.round(num(opt(R, "mode", -1), -1));
    if (mode < 0) mode = Math.floor(R.rnd3() * 4) % 4;

    var lut = buildLut(R.palName, R.contrast, R.drift);
    var cx = W / 2, cy = H / 2;
    var Rmax = Math.sqrt(W * W + H * H) * 0.5;
    var seg = Math.PI * 2 / foldN;
    var ang = R.angle, ca = Math.cos(ang), sa = Math.sin(ang);
    var f = [0, 0, 0];
    var twist = 0.3 + spin * 2.6;
    var depthWave = 2 + Math.floor(R.rnd() * 4);

    var fld = renderField(W, H, function (fpx, fpy) {
      var py = fpy, px = fpx;
        var rx = px * ca - py * sa, ry = px * sa + py * ca;
        var r = Math.sqrt(rx * rx + ry * ry) / Rmax;
        foldX(rx, ry, foldN, true, f);
        var th = Math.atan2(f[1], f[0]);
        /* the wedge index drives the alternating colour of the blades */
        var wedge = Math.floor((th + Math.PI) / seg);
        var lr = Math.log(1 + r * 6) / Math.log(7);
        var v;
        if (mode === 0) {
          /* spiral blades: the twist grows with depth, so the arms curl in */
          v = Math.sin((th / seg + lr * twist + (wedge % 2) * 0.5) * Math.PI * 2);
          v = v * 0.75 + Math.sin(lr * rings * 0.30 + R.phase) * 0.25;
        } else if (mode === 1) {
          /* concentric terraces: flat steps down the well */
          var step = Math.floor(lr * rings * 0.5 + th / seg * 0.4);
          v = (step % 2) ? 0.82 : 0.18;
          v += Math.sin(th * depthWave + R.phase) * tooth * 0.18;
        } else if (mode === 2) {
          /* starburst: rays widening outward, with a soft rim band */
          v = 0.5 + 0.5 * Math.cos(th * foldN * 2 + R.phase) * (0.4 + tooth * 0.5);
          v = v * (0.35 + lr * 0.9);
          v += Math.sin(r * (3 + tooth * 12) - R.phase) * 0.18;
        } else {
          /* nested polygons: the radius is quantised to a polygon per ring */
          var polyR = Math.cos(((th + R.phase) % (seg * 2)) - seg) ;
          var rr2 = r / (0.55 + 0.45 * Math.abs(polyR));
          v = Math.cos(rr2 * rings * 0.7 + R.phase) * 0.5 + 0.5;
          v = v * 0.8 + lr * 0.2;
        }
        v = v * 0.5 + 0.5;
        if (r > 0.98) v = 0.02;              /* a defined outer edge */
        return v;
    });
    paintField(ctx, W, H, fld, {
      lut: lut, bands: bands,
      insideT: 0.02,
      gamma: 0.95,
      blend: 0.30          /* keep the flat blade faces flat */
    });
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rmax * 0.12);
    g.addColorStop(0, css(R.bg, 0.95));
    g.addColorStop(1, css(R.bg, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ------------------------------------------------------------ style six */
  /* bloom: a Julia field seen through the fold. Julia sets centred on the
     origin are themselves symmetric, so the fold joins up cleanly. */
  function bloom(ctx, W, H, R) {
    var foldN = clamp(Math.round(num(opt(R, "fold", 7), 7)), 3, 32);
    var detail = clamp(Math.round(num(opt(R, "detail", 90), 90)), 24, 260);
    var petals = clamp(num(opt(R, "petals", 55), 55), 0, 100) / 100;
    var zoom = clamp(num(opt(R, "zoom", 45), 45), 0, 100) / 100;
    var bands = clamp(num(opt(R, "bands", 4), 4), 1, 12);
    var soft = clamp(num(opt(R, "soft", 45), 45), 0, 100) / 100;

    var lut = buildLut(R.palName, R.contrast, R.drift);
    var cx = W / 2, cy = H / 2;
    var scale = Math.min(W, H) * (0.36 + (1 - zoom) * 0.45);
    var angJ = R.rnd() * Math.PI * 2;
    var magJ = 0.72 + R.rnd2() * 0.12;
    var jr = Math.cos(angJ) * magJ, ji = Math.sin(angJ) * magJ;
    var ang = R.angle, ca = Math.cos(ang), sa = Math.sin(ang);
    var f = [0, 0, 0];

    var fld = renderField(W, H, function (fpx, fpy) {
      var px = fpx / scale, py = fpy / scale;
      var rx = px * ca - py * sa, ry = px * sa + py * ca;
      foldX(rx, ry, foldN, true, f);
      var v = escapeJulia(f[0], f[1], jr, ji, detail);
      if (v >= 0) {
        var rr = Math.sqrt(f[0] * f[0] + f[1] * f[1]);
        v = Math.sin(v * bands * 0.20 + rr * (2 + petals * 12) + R.phase) * 0.5 + 0.5;
        v += soft * 0.4;
      }
      return v;
    });
    paintField(ctx, W, H, fld, {
      lut: lut, bands: bands,
      insideT: 0.02 + R.inside * 0.05,
      gamma: 1
    });
  }

  var STYLES = {
    kaleido: { fn: kaleido, label: "Kaleido fractal" },
    filigree: { fn: filigree, label: "Orbit filigree" },
    lattice: { fn: lattice, label: "Lattice mandala" },
    rosette: { fn: rosette, label: "Spirograph rosette" },
    tunnel: { fn: tunnel, label: "Tunnel rings" },
    bloom: { fn: bloom, label: "Bloom field" }
  };

  /* --------------------------------------------------------------- drawing */
  function draw(ctx, W, H, recipe) {
    var R0 = recipe || {};
    var seed = String(R0.seed || "mandala");
    var rnd = rng(hash(seed));
    var rnd2 = rng(hash(seed + "#2"));
    var rnd3 = rng(hash(seed + "#3"));

    var palName = R0.palette && PALETTES[R0.palette] ? R0.palette : "spectrum";
    var contrast = clamp(num(R0.contrast, 70), 0, 100);
    var stops = PALETTES[palName];
    var bg = hsl(stops[0][0], stops[0][1] * 0.5, Math.max(3, stops[0][2] * 0.18));

    var resolved = {
      rnd: rnd, rnd2: rnd2, rnd3: rnd3,
      seed: seed,
      palName: palName,
      contrast: contrast,
      drift: rnd(),
      angle: (num(R0.rotation, 0) + rnd2() * 360) * Math.PI / 180,
      phase: rnd3() * Math.PI * 2,
      inside: 0.06 + rnd() * 0.22,
      trapK: rnd2(),
      anchor: rnd(),
      anchor2: rnd2(),
      bg: bg,
      cols: stops,
      opts: R0.opts || {}
    };

    /* A frame that is mostly one flat colour reads as a failure, and random
       settings hit it. The per-style draw handles most of that; this is the
       last guard, for recipes saved before the fix. */
    var entry = STYLES[R0.style] || STYLES.kaleido;
    ctx.save();
    entry.fn(ctx, W, H, resolved);
    ctx.restore();

    ctx.save();
    addGrain(ctx, W, H, num(R0.grain, 0));
    addVignette(ctx, W, H, num(R0.vignette, 0), bg);
    ctx.restore();
  }

  root.Mandala = {
    draw: draw,
    styles: Object.keys(STYLES),
    labels: (function () {
      var o = {};
      Object.keys(STYLES).forEach(function (k) { o[k] = STYLES[k].label; });
      return o;
    })(),
    palettes: Object.keys(PALETTES),
    hashSeed: hash
  };
})(typeof window !== "undefined" ? window : this);