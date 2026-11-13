/* =========================================================================
   FLOW FIELD: flow-field.js
   The noise field, the colour engine and the eight drawing engines.
   flow-app.js owns the controls and calls FlowField.draw().

   Every engine receives the same context and a plain settings object and
   draws into it. Nothing here touches the DOM.
   ========================================================================= */
(function () {
  "use strict";

  var TWO_PI = Math.PI * 2;

  /* -----------------------------------------------------------------------
     SEEDED RANDOM
     Strings are hashed to a 32-bit integer, so a typed seed is reproducible.
  ----------------------------------------------------------------------- */
  function hashSeed(s) {
    s = String(s == null ? "" : s).trim();
    if (!s) s = "flow";
    /* a plain number stays itself, so old numeric seeds still match */
    if (/^\d{1,9}$/.test(s)) return parseInt(s, 10) >>> 0;
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* -----------------------------------------------------------------------
     PERLIN NOISE
  ----------------------------------------------------------------------- */
  function makePerlin(rand) {
    var perm = new Uint8Array(256), i;
    for (i = 0; i < 256; i++) perm[i] = i;
    for (i = 255; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
    }
    var p = new Uint8Array(512);
    for (i = 0; i < 512; i++) p[i] = perm[i & 255];

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + t * (b - a); }
    function grad(h, x, y) {
      switch (h & 7) {
        case 0: return  x + y; case 1: return -x + y;
        case 2: return  x - y; case 3: return -x - y;
        case 4: return  x;     case 5: return -x;
        case 6: return  y;     default: return -y;
      }
    }
    return function (x, y) {
      var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      var u = fade(x), v = fade(y);
      var A = p[X] + Y, B = p[X + 1] + Y;
      return lerp(
        lerp(grad(p[A], x, y),     grad(p[B], x - 1, y),     u),
        lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u), v
      );
    };
  }

  /* -----------------------------------------------------------------------
     COLOUR MATHS
  ----------------------------------------------------------------------- */
  function hexToRgb(hex) {
    var h = String(hex || "#000").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    if (isNaN(n)) n = 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hslToRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360; s /= 100; l /= 100;
    if (s === 0) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p2 = 2 * l - q;
    function hue(t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p2 + (q - p2) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p2 + (q - p2) * (2 / 3 - t) * 6;
      return p2;
    }
    return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)];
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r)      h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else               h = (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }
  function lerpRgb(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function multiLerp(stops, t) {
    if (t <= 0) return stops[0];
    if (t >= 1) return stops[stops.length - 1];
    var seg = (stops.length - 1) * t, i = Math.floor(seg);
    return lerpRgb(stops[i], stops[i + 1], seg - i);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function smooth(a, b, t) { var x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function css(col, alpha) {
    return "rgba(" + Math.round(col[0]) + "," + Math.round(col[1]) + "," + Math.round(col[2]) + "," + alpha + ")";
  }

  /* -----------------------------------------------------------------------
     COLOUR MODES
     Auto modes read hue, saturation and lightness from Color 1 (the base
     colour). Hue rotates; saturation and lightness stay as picked.
  ----------------------------------------------------------------------- */
  function pickColor(mode, t, c1, c2, c3, c4, nv, seedOffset) {
    var hsl1 = rgbToHsl(c1[0], c1[1], c1[2]);
    var h1 = hsl1[0];
    /* a grey/white/black base has no real hue: give it a usable saturation */
    var S = hsl1[1] < 6 ? 65 : hsl1[1];
    var L = clamp(hsl1[2], 12, 88);

    switch (mode) {
      case "solid":         return c1;
      case "gradient":      return lerpRgb(c1, c2, t);
      case "tricolor":      return t < 0.5 ? lerpRgb(c1, c2, t * 2) : lerpRgb(c2, c3, (t - 0.5) * 2);
      case "multistop":     return multiLerp([c1, c2, c3, c4], t);
      case "spectrum":      return hslToRgb(h1 + t * 360, S, L);
      case "monochrome":    return hslToRgb(h1, hsl1[1], clamp(hsl1[2] - 35 + t * 70, 4, 96));
      case "duotone":       return lerpRgb(c1, c2, smooth(0.35, 0.65, t));
      case "complementary": return hslToRgb(t < 0.5 ? h1 : h1 + 180, S, L);
      case "splitcomp":  { var hs = [h1, h1 + 150, h1 + 210]; return hslToRgb(hs[Math.min(2, Math.floor(t * 3))], S, L); }
      case "analogous":     return hslToRgb(h1 - 30 + t * 60, S, L);
      case "triadic":    { var ht = [h1, h1 + 120, h1 + 240]; return hslToRgb(ht[Math.min(2, Math.floor(t * 3))], S, L); }
      case "tetradic":   { var hq = [h1, h1 + 90, h1 + 180, h1 + 270]; return hslToRgb(hq[Math.min(3, Math.floor(t * 4))], S, L); }
      case "warm": {
        /* warm range is red to yellow (0-60). Base hue pulls the centre. */
        var wc = (h1 >= 0 && h1 <= 60) ? h1 : (h1 >= 210 ? 0 : 60);
        return hslToRgb(wc - 30 + ((seedOffset + t * 60) % 60), S, L);
      }
      case "cool": {
        /* cool range is cyan to violet. Base hue pulls the centre. */
        var cc = (h1 >= 150 && h1 <= 330) ? clamp(h1, 200, 260) : 230;
        return hslToRgb(cc - 50 + ((seedOffset + t * 100) % 100), S, L);
      }
      case "noise":         return hslToRgb(((nv + 1) / 2) * 360 + h1, S, L);
      default:              return c1;
    }
  }

  /* -----------------------------------------------------------------------
     SHARED FIELD HELPERS
  ----------------------------------------------------------------------- */
  function noiseScale(fs) { return 0.0065 - (fs - 1) * (0.0065 - 0.0006) / 99; }

  /* t is the colour position, 0..1, taken along the chosen direction */
  function posT(direction, x, y, W, H, rand) {
    switch (direction) {
      case "vertical":  return y / H;
      case "diagonal":  return (x / W + y / H) / 2;
      case "radial": {
        var dx = x / W - 0.5, dy = y / H - 0.5;
        return Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      }
      case "chaotic":   return rand();
      default:          return x / W;
    }
  }

  /* Mirror four ways by drawing into an offscreen half and compositing it.
     Splitting the work keeps the particle count honest rather than doubling
     it, and gives exactly the symmetry the eye expects. */
  function withMirror(ctx, W, H, mirror, paint) {
    if (mirror === "none") { paint(ctx, W, H); return; }
    var hw = Math.ceil(W / 2), hh = Math.ceil(H / 2);
    var off = document.createElement("canvas");
    off.width = hw; off.height = hh;
    var oc = off.getContext("2d");
    paint(oc, hw, hh);
    ctx.drawImage(off, 0, 0);
    ctx.save();
    ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(off, 0, 0); ctx.restore();
    ctx.save();
    ctx.translate(0, H); ctx.scale(1, -1); ctx.drawImage(off, 0, 0); ctx.restore();
    ctx.save();
    ctx.translate(W, H); ctx.scale(-1, -1); ctx.drawImage(off, 0, 0); ctx.restore();
  }

  /* -----------------------------------------------------------------------
     ENGINES
     Each one: function (ctx, W, H, S)
     S carries every setting, already parsed, plus:
       noise  - the perlin function
       rand   - the seeded random function
       scale  - noise scale
       colAt  - colour at a position and noise value
  ----------------------------------------------------------------------- */

  /* ---- 1. Flow lines: the original engine ---- */
  function flowLines(ctx, W, H, S) {
    var cols = Math.max(1, Math.ceil(Math.sqrt(S.particles * (W / H))));
    var rows = Math.max(1, Math.ceil(S.particles / cols));
    var cellW = W / cols, cellH = H / rows;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineWidth = S.lineWeight * S.k;
    ctx.strokeStyle = "#fff";
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var px = c * cellW + S.rand() * cellW;
        var py = r * cellH + S.rand() * cellH;
        var nv = S.noise(px * S.scale, py * S.scale);
        ctx.strokeStyle = S.ink(S.colAt(px, py, nv));
        ctx.beginPath();
        var x = px, y = py;
        ctx.moveTo(x, y);
        for (var i = 0; i < S.steps; i++) {
          var angle = S.noise(x * S.scale, y * S.scale) * TWO_PI * S.curl;
          x += Math.cos(angle) * S.stepSize * S.k;
          y += Math.sin(angle) * S.stepSize * S.k;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }

  /* ---- 2. Engraving: evenly ruled lines that wave, like a cut plate ---- */
  function engraving(ctx, W, H, S) {
    var gap = Math.max(2, S.engraveGap * S.k);
    var amp = (S.engraveWobble / 100) * gap * 5;
    var step = Math.max(2, gap * 0.5);
    var slow = S.scale * (1.4 + S.featureSize / 55);
    /* One displacement per x, shared by every rule. That keeps the rules
       exactly parallel, so a strong wave can never make them cross. */
    var count = Math.ceil((W + step * 2) / step) + 1;
    var wave = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var x0 = -step + i * step;
      /* two octaves: a broad swell with a smaller ripple on top */
      wave[i] = (S.noise(x0 * slow, 4.7) + S.noise(x0 * slow * 2.7, 19.3) * 0.35) * amp;
    }
    ctx.lineWidth = Math.max(0.7, S.lineWeight * S.k);
    ctx.lineCap = "butt"; ctx.lineJoin = "round";
    for (var y = -gap; y < H + gap; y += gap) {
      ctx.beginPath();
      for (i = 0; i < count; i++) {
        var xx = -step + i * step;
        var yy = y + wave[i];
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.strokeStyle = S.ink(S.colAt(W / 2, y, (y / H) * 2 - 1));
      ctx.stroke();
    }
  }

  /* ---- 3. Stipple: dots that thicken where the field is dense ---- */
  function stipple(ctx, W, H, S) {
    var count = S.particles * 4;
    var cols = Math.max(1, Math.ceil(Math.sqrt(count * (W / H))));
    var rows = Math.max(1, Math.ceil(count / cols));
    var cw = W / cols, ch = H / rows;
    var base = Math.max(0.9, S.lineWeight * 1.6 * S.k);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = (c + S.rand()) * cw;
        var y = (r + S.rand()) * ch;
        var nv = S.noise(x * S.scale, y * S.scale);
        var gate = (nv + 1) / 2;
        /* the field decides whether a dot lands, and how big it is */
        if (S.rand() > 0.45 + gate * 0.75) continue;
        var rad = base * (0.5 + gate * 1.8) * (0.7 + S.rand() * 0.6);
        ctx.fillStyle = S.ink(S.colAt(x, y, nv));
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, TWO_PI);
        ctx.fill();
      }
    }
  }

  /* ---- 4. Ribbons: filled strokes, thick core, tapered ends ---- */
  function ribbons(ctx, W, H, S) {
    var count = Math.max(4, Math.round(S.particles / 7));
    var cols = Math.max(1, Math.ceil(Math.sqrt(count * (W / H))));
    var rows = Math.max(1, Math.ceil(count / cols));
    var cw = W / cols, ch = H / rows;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var px = (c + S.rand()) * cw, py = (r + S.rand()) * ch;
        var nv = S.noise(px * S.scale, py * S.scale);
        var col = S.colAt(px, py, nv);
        var width = S.ribbonWidth * S.k * (0.6 + S.rand() * 0.9);
        /* walk the path once, then draw it three times: wide faint to
           narrow bright, which gives the flat band a lit core */
        var pts = [], x = px, y = py;
        for (var i = 0; i < S.steps; i++) {
          pts.push([x, y]);
          var angle = S.noise(x * S.scale, y * S.scale) * TWO_PI * S.curl;
          x += Math.cos(angle) * S.stepSize * S.k;
          y += Math.sin(angle) * S.stepSize * S.k;
        }
        var passes = [[1, 0.42], [0.62, 0.7], [0.3, 1]];
        for (var p = 0; p < passes.length; p++) {
          ctx.lineWidth = width * passes[p][0];
          ctx.strokeStyle = S.ink(col, passes[p][1]);
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
          ctx.stroke();
        }
      }
    }
  }

  /* ---- 5. Silk: many short faint strokes, smoke-like ---- */
  function silk(ctx, W, H, S) {
    var count = S.particles * 4;
    ctx.lineCap = "round";
    for (var i = 0; i < count; i++) {
      var x = S.rand() * W, y = S.rand() * H;
      var nv = S.noise(x * S.scale, y * S.scale);
      var col = S.colAt(x, y, nv);
      var angle = nv * TWO_PI * S.curl;
      var len = (6 + S.rand() * 26) * S.silkLength * S.k;
      ctx.lineWidth = Math.max(0.8, S.lineWeight * (0.7 + S.rand() * 1.1) * S.k);
      ctx.strokeStyle = S.ink(col, 0.6 + S.rand() * 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(angle) * len * 0.5 - Math.sin(angle) * len * 0.22,
        y + Math.sin(angle) * len * 0.5 + Math.cos(angle) * len * 0.22,
        x + Math.cos(angle) * len,
        y + Math.sin(angle) * len
      );
      ctx.stroke();
    }
  }

  /* ---- 6. Contour: topographic bands from the noise ---- */
  function contour(ctx, W, H, S) {
    var levels = Math.max(3, Math.round(S.contourLevels));
    var bands = S.contourBand;
    var stepPx = Math.max(2, 3 * S.k);
    /* classify every sample on a coarse grid, then march the cells */
    var gw = Math.ceil(W / stepPx) + 2, gh = Math.ceil(H / stepPx) + 2;
    var grid = new Float32Array(gw * gh);
    var lo = Infinity, hi = -Infinity, gy, gx;
    for (gy = 0; gy < gh; gy++) {
      for (gx = 0; gx < gw; gx++) {
        var raw = S.noise((gx * stepPx) * S.scale, (gy * stepPx) * S.scale);
        grid[gy * gw + gx] = raw;
        if (raw < lo) lo = raw;
        if (raw > hi) hi = raw;
      }
    }
    /* stretch to the field's actual range, or the outer levels never appear */
    var span = (hi - lo) || 1;
    for (var q = 0; q < grid.length; q++) {
      grid[q] = (grid[q] - lo) / span * levels;
    }

    /* a soft wash under the lines: peaks pale, hollows dark, like a map */
    if (bands > 0) {
      var wash = document.createElement("canvas");
      wash.width = gw - 1; wash.height = gh - 1;
      var wc = wash.getContext("2d");
      var img = wc.createImageData(wash.width, wash.height);
      for (gy = 0; gy < wash.height; gy++) {
        for (gx = 0; gx < wash.width; gx++) {
          var hgt = grid[gy * gw + gx] / levels;
          var col = S.colAt(gx * stepPx, gy * stepPx, hgt * 2 - 1, hgt);
          var o = (gy * wash.width + gx) * 4;
          img.data[o]     = col[0];
          img.data[o + 1] = col[1];
          img.data[o + 2] = col[2];
          /* peaks get more ink, hollows stay dark */
          var stepN = Math.round(hgt * 6) / 6;
          img.data[o + 3] = Math.round(225 * Math.pow(stepN, 1.8));
        }
      }
      wc.putImageData(img, 0, 0);
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(wash, 0, 0, W, H);
      ctx.restore();
    }

    ctx.lineWidth = S.lineWeight * S.k;
    ctx.lineCap = "butt"; ctx.lineJoin = "round";
    for (var L = 1; L < levels; L++) {
      ctx.beginPath();
      for (gy = 0; gy < gh - 1; gy++) {
        for (gx = 0; gx < gw - 1; gx++) {
          var a = grid[gy * gw + gx], b = grid[gy * gw + gx + 1];
          var c2 = grid[(gy + 1) * gw + gx + 1], d = grid[(gy + 1) * gw + gx];
          var edge = marchCell(a, b, c2, d, L, gx * stepPx, gy * stepPx, stepPx);
          for (var e = 0; e < edge.length; e += 4) {
            ctx.moveTo(edge[e], edge[e + 1]);
            ctx.lineTo(edge[e + 2], edge[e + 3]);
          }
        }
      }
      var tt = L / levels;
      ctx.strokeStyle = S.ink(S.colAt(W * 0.5, H * 0.5, tt * 2 - 1, tt));
      ctx.stroke();
    }
  }

  /* marching-squares cell: returns [x1,y1,x2,y2, ...] line segments */
  function marchCell(a, b, c, d, level, ox, oy, s) {
    var out = [];
    var v = [a, b, c, d];
    var idx = 0;
    for (var i = 0; i < 4; i++) if (v[i] > level) idx |= (1 << i);
    if (idx === 0 || idx === 15) return out;
    /* corner points: 0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left */
    var edgePt = function (e) {
      switch (e) {
        case 0: return [ox + s * ((level - a) / (b - a)), oy];
        case 1: return [ox + s, oy + s * ((level - b) / (c - b))];
        case 2: return [ox + s * ((level - d) / (c - d)), oy + s];
        default: return [ox, oy + s * ((level - a) / (d - a))];
      }
    };
    var TABLE = {
      1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
      5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]],
      9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]],
      13: [[0, 1]], 14: [[3, 0]], 15: []
    };
    var pairs = TABLE[idx] || [];
    for (var p = 0; p < pairs.length; p++) {
      var e1 = edgePt(pairs[p][0]), e2 = edgePt(pairs[p][1]);
      if (isFinite(e1[0]) && isFinite(e1[1]) && isFinite(e2[0]) && isFinite(e2[1])) {
        out.push(e1[0], e1[1], e2[0], e2[1]);
      }
    }
    return out;
  }

  /* ---- 7. Ticks: short dashes that show which way the field runs ---- */
  function ticks(ctx, W, H, S) {
    var gap = Math.max(6, S.tickGap * S.k);
    var len = Math.max(3, S.tickLength * S.k);
    var lw = Math.max(0.6, S.lineWeight * S.k);
    ctx.lineCap = "round";
    ctx.lineWidth = lw;
    for (var y = gap / 2; y < H; y += gap) {
      for (var x = gap / 2; x < W; x += gap) {
        var nv = S.noise(x * S.scale, y * S.scale);
        var angle = nv * TWO_PI * S.curl;
        var jitter = S.tickJitter / 100;
        var jx = x + (S.rand() - 0.5) * gap * jitter;
        var jy = y + (S.rand() - 0.5) * gap * jitter;
        var half = len * 0.5;
        ctx.strokeStyle = S.ink(S.colAt(jx, jy, nv));
        ctx.beginPath();
        ctx.moveTo(jx - Math.cos(angle) * half, jy - Math.sin(angle) * half);
        ctx.lineTo(jx + Math.cos(angle) * half, jy + Math.sin(angle) * half);
        ctx.stroke();
      }
    }
  }

  /* ---- 8. Vortex: strands spiralling out of a turning core ---- */
  function vortex(ctx, W, H, S) {
    var count = Math.max(8, Math.round(S.particles / 9));
    var cx = W / 2, cy = H / 2;
    var maxR = Math.sqrt(cx * cx + cy * cy);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (var i = 0; i < count; i++) {
      var start = S.rand() * TWO_PI;
      var wobble = 0.3 + S.rand() * 1.4;
      var x = cx + Math.cos(start) * maxR * 0.02;
      var y = cy + Math.sin(start) * maxR * 0.02;
      var nv = S.noise(x * S.scale, y * S.scale);
      ctx.strokeStyle = S.ink(S.colAt(x, y, nv));
      ctx.lineWidth = Math.max(0.5, S.lineWeight * (0.5 + S.rand() * 0.9) * S.k);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (var s = 1; s <= S.steps * 2; s++) {
        var rad = (s / (S.steps * 2)) * maxR * 1.05;
        var ang = start + rad * (S.vortexTurn / maxR) + Math.sin(rad * S.scale * 2) * wobble * S.vortexTurb;
        x = cx + Math.cos(ang) * rad;
        y = cy + Math.sin(ang) * rad;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  var ENGINES = {
    flow: flowLines,
    engrave: engraving,
    stipple: stipple,
    ribbons: ribbons,
    silk: silk,
    contour: contour,
    ticks: ticks,
    vortex: vortex
  };

  /* -----------------------------------------------------------------------
     FINISH
     Grain and vignette are painted after the artwork, in screen space, so
     they sit on top of whatever engine ran.
  ----------------------------------------------------------------------- */
  function paintFinish(ctx, W, H, finish, seed) {
    if (finish === "grain" || finish === "both") {
      /* a small noise tile repeated is far cheaper than per-pixel loops */
      var t = document.createElement("canvas");
      var size = 128;
      t.width = size; t.height = size;
      var tc = t.getContext("2d");
      var img = tc.createImageData(size, size);
      var rand = mulberry32(seed ^ 0x9e3779b9);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = 128 + (rand() - 0.5) * 150;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      tc.putImageData(img, 0, 0);
      ctx.save();
      ctx.globalAlpha = 0.075;
      ctx.globalCompositeOperation = "overlay";
      var pat = ctx.createPattern(t, "repeat");
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (finish === "vignette" || finish === "both") {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.78);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  /* -----------------------------------------------------------------------
     PUBLIC
  ----------------------------------------------------------------------- */
  function draw(ctx, W, H, s) {
    var seedInt = hashSeed(s.seed);
    var rand = mulberry32(seedInt);
    var noise = makePerlin(mulberry32(seedInt ^ 0x5bd1e995));
    var k = Math.min(W, H) / 1500;
    var scale = noiseScale(s.featureSize);
    var c1 = hexToRgb(s.color1), c2 = hexToRgb(s.color2);
    var c3 = hexToRgb(s.color3), c4 = hexToRgb(s.color4);
    var seedOffset = seedInt % 60;

    function colAt(x, y, nv, forceT) {
      var t = forceT === undefined ? posT(s.direction, x, y, W, H, rand) : forceT;
      return pickColor(s.colorMode, t, c1, c2, c3, c4, nv, seedOffset);
    }

    /* engines turn a colour into a paintable string with this, so opacity
       is applied once and an extra fade can be layered on top */
    function ink(col, extra) {
      return css(col, clamp(s.opacity * (extra === undefined ? 1 : extra), 0, 1));
    }

    var S = {
      particles: s.particles, steps: s.steps, stepSize: s.stepSize,
      featureSize: s.featureSize, curl: s.curl, lineWeight: s.lineWeight,
      opacity: s.opacity, direction: s.direction, mirror: s.mirror,
      engraveGap: s.engraveGap, engraveWobble: s.engraveWobble,
      ribbonWidth: s.ribbonWidth, silkLength: s.silkLength,
      contourLevels: s.contourLevels, contourBand: s.contourBand,
      tickGap: s.tickGap, tickLength: s.tickLength, tickJitter: s.tickJitter,
      vortexTurn: s.vortexTurn, vortexTurb: s.vortexTurb,
      noise: noise, rand: rand, scale: scale, k: k, colAt: colAt, ink: ink,
      seed: seedInt
    };

    ctx.save();
    ctx.globalAlpha = 1;
    withMirror(ctx, W, H, s.mirror, function (c, w, h) {
      var engine = ENGINES[s.engine] || flowLines;
      engine(c, w, h, S);
    });
    ctx.restore();

    paintFinish(ctx, W, H, s.finish, seedInt);
  }

  window.FlowField = {
    draw: draw,
    hashSeed: hashSeed,
    ENGINES: ENGINES
  };
})();