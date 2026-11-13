/* =========================================================================
   THICKET: thicket-forms.js
   The seven compositions. Each one is a fixed, symmetrical plate: the plant
   or tree is the subject, but it is drawn as ornament — engraved ticks,
   concentric rims, flat graphic masses, a pale disc behind.
   ========================================================================= */
(function () {
  "use strict";

  var B = window.ThicketBrush;
  var TAU = Math.PI * 2, HALF = Math.PI / 2;
  var clamp = B.clamp, lerp = B.lerp, rnd = B.rnd, num = B.num;
  var rgba = B.rgba, mixCol = B.mixCol, lighten = B.lighten, darken = B.darken;
  var tone = B.tone, accent = B.accent, over = B.over;

  function backdrop(S, r, col, alpha) {
    var c = S.c;
    B.haze(S, S.cx, S.cy, r, col, alpha);
  }

  /* A thin ornamental ring of light. Sits behind the subject and is the
     cheapest way to make a drawing look composed rather than dropped on a page. */
  function halo(S, r, alpha, w) {
    B.ring(S, S.cx, S.cy, r, w || S.lw * 0.45, accent(S, 0.25), alpha);
  }

  /* =======================================================================
     TREE OF LIFE — a symmetrical bough structure inside a pale disc, with an
     engraved rim. Leaves are flat two-tone shapes at a readable size, so the
     crown reads as a graphic mass rather than texture.
     ======================================================================= */
  function tree(S) {
    var c = S.c;
    c.lineCap = "round"; c.lineJoin = "round";

    var baseY = S.H * 1.015;
    var crownH = S.H * (0.50 + S.reachF * 0.20);
    var trunkH = crownH * 0.40;
    var crownY = baseY - trunkH;
    var wBase = S.lw * (3.4 + S.scale * 1.7);

    var R = Math.min(S.W * 0.385, crownH * 0.62) * (0.80 + S.scale * 0.24);
    var CY = crownY - R * 0.66;
    var levels = 2 + Math.round(S.depth * 0.52);

    /* the disc the tree sits against, with a rim and a tick ring */
    backdrop(S, R * 1.30, mixCol(S.cols[1], S.cols[0], 0.35), 0.13);
    halo(S, R * 1.04, 0.30);
    B.tickRing(S, S.cx, CY, R * 1.06, 96, R * 0.026, Math.max(0.4, S.lw * 0.26),
      accent(S, 0.2), 0.32);

    /* roots, planted in the bottom edge */
    [0.22, 0.62, 1.04].forEach(function (spread, ri) {
      B.mirrorX(S, function () {
        var tip = B.fit(S, S.cx + S.W * (0.09 + spread * 0.085), S.H * (0.958 + ri * 0.012));
        var p = B.bendTo(S.cx, S.H * 0.900, tip[0], tip[1],
          HALF - 0.12 + spread * 0.55, HALF * 0.50 + spread * 0.33);
        B.ribbon(S, B.spine(p[0], p[1], p[2], p[3], 10, 0, S.seed, ri + 3),
          wBase * (0.48 - ri * 0.10), wBase * 0.04, tone(S, 0.03, ri + 1), null, 0.95);
      });
    });

    /* trunk, with an engraved centre line */
    var tPts = B.spine(
      [S.cx, baseY],
      [S.cx - S.W * 0.009, baseY - trunkH * 0.40],
      [S.cx + S.W * 0.010, baseY - trunkH * 0.76],
      [S.cx, crownY],
      18, S.W * 0.004 * (0.3 + S.curl), S.seed, 1
    );
    B.ribbon(S, tPts, wBase, wBase * 0.60, tone(S, 0.04, 0), tone(S, 0.12, 0), 1, 0.65);
    for (var q = 4; q < tPts.length - 2; q += 3) {
      B.ink(S, tPts[q][0] - wBase * 0.10, tPts[q][1],
        tPts[q][0] - wBase * 0.10, tPts[q][1] - wBase * 0.30,
        Math.max(0.4, S.lw * 0.22), lighten(S.cols[3], 0.1), 0.30);
    }

    /* Leaf cluster. Leaves are flat, wide and clearly separated. */
    function rosette(x, y, ang, size, id) {
      var n = 3 + Math.round(S.density * 3);
      for (var k = 0; k < n && !over(S); k++) {
        var around = k / n * TAU + rnd(S.seed, id, 69) * 1.2;
        var rr = size * (0.15 + rnd(S.seed, id * 19 + k, 70) * 0.55);
        var px = x + Math.cos(around) * rr;
        var py = y + Math.sin(around) * rr * 0.8;
        var la = around + (rnd(S.seed, id * 13 + k, 61) - 0.5) * 0.7;
        var ll = size * (1.00 + rnd(S.seed, id * 13 + k, 62) * 0.55);
        var t = 0.35 + rnd(S.seed, id + k, 63) * 0.5;
        B.leaf(S, px, py, la, ll, ll * 0.40,
          tone(S, t, id + k), tone(S, t + 0.18, id + k), 0.96,
          (rnd(S.seed, id + k, 64) - 0.5) * 0.4);
      }
      if (S.p.tips && S.p.tips !== "none") B.tipAt(S, x, y, ang, 1.0);
    }

    function limb(x, y, lean, len, w, level, id) {
      if (over(S) || len < S.lw * 3.0 || w < 0.35) return;

      var tx = x + Math.sin(lean) * len;
      var ty = y - Math.cos(lean) * len;
      var dx = tx - S.cx, dy = ty - CY;
      var dd = Math.sqrt(dx * dx + dy * dy);
      if (dd > R) { tx = S.cx + dx / dd * R; ty = CY + dy / dd * R; }
      ty = Math.min(ty, y - len * 0.14);

      var bow = 0.20 * (lean >= 0 ? 1 : -1);
      var p = B.bendTo(x, y, tx, ty, -HALF + lean, -HALF + lean + bow, 0.42);
      var pts = B.spine(p[0], p[1], p[2], p[3], 11, len * 0.010 * S.curl, S.seed, id);
      var t0 = clamp(0.05 + level * 0.19, 0, 1);
      B.ribbon(S, pts, w, Math.max(0.4, w * 0.55), tone(S, t0, id), tone(S, t0 + 0.16, id), 0.99, 0.65);

      var last = pts[pts.length - 1];
      var prev = pts[pts.length - 2];
      var endA = Math.atan2(last[1] - prev[1], last[0] - prev[0]);

      if (level >= levels) {
        rosette(last[0], last[1], endA, R * (0.085 + S.density * 0.045), id);
        return;
      }

      var fan = lerp(0.26, 0.50, S.density);
      limb(last[0], last[1], clamp(lean - fan * 0.72, 0.02, 1.42),
        len * 0.74, w * 0.62, level + 1, id * 3 + 1);
      limb(last[0], last[1], clamp(lean + fan, 0.02, 1.42),
        len * 0.66, w * 0.52, level + 1, id * 3 + 2);

      /* one leaf per joint, alternating sides — a deliberate rhythm */
      var side = level % 2 ? 1 : -1;
      B.leaf(S, last[0], last[1], endA + side * 1.15,
        R * (0.055 + rnd(S.seed, id, 67) * 0.035), R * 0.024,
        tone(S, 0.62, id), tone(S, 0.80, id), 0.88);
    }

    /* the leader keeps the crown from notching at the top */
    limb(S.cx, crownY, 0.02, R * 0.92, wBase * 0.52, 0, 2);

    B.mirrorX(S, function () {
      var n = 3;
      for (var i = 0; i < n; i++) {
        var f = (i + 1) / (n + 0.6);
        var lean = 0.20 + f * 1.00;
        var len = R * (0.88 - f * 0.24) * (0.82 + S.reachF * 0.24);
        var y0 = crownY + trunkH * (0.01 + f * 0.17);
        limb(S.cx + S.W * 0.004, y0, lean, len, wBase * (0.54 - f * 0.12), 0, 20 + i * 40);
      }
    });

    /* ground: a soft band and a few blades, so the trunk has something to
       stand on */
    B.haze(S, S.cx, S.H * 1.01, S.W * 0.30, S.cols[2], 0.20);
    for (var g = 0; g < 7; g++) {
      var gx = S.cx + (g - 3) * S.W * 0.055;
      B.ink(S, gx, S.H, gx + (g - 3) * S.W * 0.012, S.H - S.H * (0.02 + rnd(S.seed, g, 71) * 0.03),
        Math.max(0.4, S.lw * 0.3), tone(S, 0.35, g), 0.35);
    }
  }

  /* =======================================================================
     GROVE — bamboo culms in front of a pale moon, with mist bands. Reads as a
     woodblock print: flat graphic bands, strong vertical rhythm.
     ======================================================================= */
  function grove(S) {
    var c = S.c;
    c.lineCap = "round"; c.lineJoin = "round";

    var perSide = Math.max(2, Math.round(num(S.p.bambooCount, 5)));
    var total = perSide * 2 - 1;
    var gap = S.W / (total + 0.5);
    var leafLen = S.W * (0.055 + num(S.p.bambooLeafLen, 50) / 100 * 0.075);

    /* moon and mist */
    var moonR = Math.min(S.W, S.H) * (0.30 + S.reachF * 0.10);
    B.haze(S, S.cx, S.H * 0.40, moonR * 1.5, mixCol(S.cols[3], S.cols[1], 0.5), 0.10);
    B.disc = null;
    c.beginPath();
    c.arc(S.cx, S.H * 0.40, moonR, 0, TAU);
    c.fillStyle = rgba(accent(S, 0.55), 0.09);
    c.fill();
    B.ring(S, S.cx, S.H * 0.40, moonR, Math.max(0.5, S.lw * 0.4), accent(S, 0.3), 0.22);

    for (var m = 0; m < 4; m++) {
      var my = S.H * (0.62 + m * 0.10);
      B.ink(S, S.W * 0.06, my, S.W * 0.94, my + (m % 2 ? 4 : -4),
        Math.max(0.4, S.lw * (0.30 - m * 0.05)), accent(S, 0.2), 0.16 - m * 0.03);
    }

    for (var i = 0; i < total && !over(S); i++) {
      var col = i - (perSide - 1);
      var dist = Math.abs(col) / (perSide + 0.4);
      var x = gap * (i + 0.75);
      var hFrac = 0.96 - dist * (0.48 - S.density * 0.22);
      var Ht = S.H * 0.86 * hFrac * (0.58 + S.reachF * 0.48) * (0.76 + S.scale * 0.24);
      var y0 = S.H * 1.012;
      var y1 = y0 - Ht;
      var w = S.lw * lerp(1.8, 6.0, clamp(0.34 + S.scale * 0.3, 0.2, 1)) * (1 - dist * 0.30);
      var lean = (rnd(S.seed, i, 21) - 0.5) * S.curl * S.W * 0.010;
      var tT = 0.16 + (col / (perSide || 1) + 1) * 0.28;

      var bp = B.spine([x, y0], [x + lean * 0.4, lerp(y0, y1, 0.5)],
        [x + lean, lerp(y0, y1, 0.86)], [x + lean * 1.1, y1], 12, 0, S.seed, i);
      B.ribbon(S, bp, w, w * lerp(0.94, 0.70, S.taper),
        tone(S, tT, i), tone(S, tT + 0.14, i), 0.99, 0.8);

      /* a bright rail down one edge: the culm reads as round */
      B.ribbon(S, bp.map(function (p) { return [p[0] - w * 0.26, p[1]]; }),
        w * 0.20, w * 0.08, lighten(tone(S, tT, i), 0.45), null, 0.42);

      /* node collars, double-lined */
      var joint = 0.115 + S.density * 0.045;
      var idx = 1;
      for (var t = joint; t < 0.97 && !over(S); t += joint) {
        var yy = lerp(y0, y1, t);
        var xx = lerp(x, x + lean, Math.pow(t, 1.4));
        var halfW = w * 0.5 * (1 - t * 0.18);
        B.ink(S, xx - halfW, yy, xx + halfW, yy, Math.max(0.9, w * 0.26), accent(S, 0.2), 0.85);
        B.ink(S, xx - halfW * 0.9, yy + w * 0.24, xx + halfW * 0.9, yy + w * 0.24,
          Math.max(0.4, w * 0.10), accent(S, 0.2), 0.35);

        if (t > 0.30 && idx % 2 === 0) {
          var side = (idx % 4 === 0) ? 1 : -1;
          var nL = 2 + Math.round(S.density * 2);
          for (var k = 0; k < nL && !over(S); k++) {
            var la = (side > 0 ? -0.28 : -Math.PI + 0.28) + (k - (nL - 1) / 2) * 0.30;
            var ll = leafLen * (0.60 + rnd(S.seed, i * 7 + idx + k, 30) * 0.55);
            B.leaf(S, xx, yy, la, ll, ll * 0.15,
              tone(S, clamp(t + 0.15, 0, 1), i + k + side),
              tone(S, clamp(t + 0.30, 0, 1), i + k + side), 0.92,
              side * (0.22 + S.curl * 0.30));
          }
        }
        idx++;
      }
      B.tipAt(S, x + lean * 1.1, y1, -HALF, 1.0);
    }

    /* foreground grass so the grove sits in ground, not space */
    for (var g = 0; g < 16; g++) {
      var gx = S.W * (0.02 + g / 16 * 0.96);
      var gh = S.H * (0.03 + rnd(S.seed, g + 90, 72) * 0.05);
      B.ink(S, gx, S.H, gx + (rnd(S.seed, g, 73) - 0.5) * S.W * 0.02, S.H - gh,
        Math.max(0.4, S.lw * 0.3), tone(S, 0.4, g), 0.4);
    }
  }

  /* =======================================================================
     FOUNTAIN — mirrored arching strands from a single base, each ending in a
     fine seed head. Ornamental, near calligraphic.
     ======================================================================= */
  function fountain(S) {
    var c = S.c;
    c.lineCap = "round"; c.lineJoin = "round";

    var arms = 3 + Math.round(S.density * 5);
    var maxH = S.H * (0.44 + S.reachF * 0.32) * (0.78 + S.scale * 0.22);
    var baseY = S.H * 1.004;

    backdrop(S, maxH * 0.95, mixCol(S.cols[1], S.cols[0], 0.4), 0.09);

    B.mirrorX(S, function () {
      for (var i = 1; i <= arms && !over(S); i++) {
        var f = i / arms;
        /* Arms are spread across the span instead of being stacked at
           increasing lengths, so their seed heads land on a clean arc with
           space between them. */
        var Ht = maxH * lerp(0.66, 1, Math.pow(f, 0.55));
        var bend = lerp(0.22, 1.20, f) * (0.55 + S.curl * 0.75);
        var col = tone(S, clamp(f * 0.85, 0, 1), i);
        var p = B.bendTo(S.cx, baseY, S.cx + Math.cos(-HALF + bend) * Ht,
          baseY + Math.sin(-HALF + bend) * Ht, -HALF, -HALF + bend, 0.46);
        var pts = B.spine(p[0], p[1], p[2], p[3], 15, S.W * 0.004 * S.curl, S.seed, i);
        var wIn = S.lw * lerp(2.2, 0.9, f);
        B.ribbon(S, pts, wIn, wIn * lerp(0.55, 0.26, S.taper), col, lighten(col, 0.18), 0.97, 0.72);

        var tp = pts[pts.length - 1];
        var endA = -HALF + bend;

        /* seed head: a small phyllotaxis disc, not a spray of hairs */
        var headR = S.W * (0.010 + S.tipSize * 0.016);
        if (S.p.tips !== "none") {
          B.haze(S, tp[0], tp[1], headR * 2.6, col, 0.16);
          B.phyllo(S, tp[0], tp[1], headR, 18 + Math.round(S.density * 12),
            function (px, py, rr) {
              B.dot(S, px, py, headR * (0.085 - rr * 0.04), accent(S, 0.35), 0.9);
            });
          B.ring(S, tp[0], tp[1], headR, Math.max(0.4, S.lw * 0.22), accent(S, 0.3), 0.35);
        }

        /* two fine filaments trailing from the head: the ornament */
        for (var k = -1; k <= 1; k += 2) {
          var fa = endA + k * 0.62;
          var fl = headR * (2.4 + S.density * 1.2);
          var fx = tp[0] + Math.cos(fa) * fl;
          var fy = tp[1] + Math.sin(fa) * fl;
          B.ink(S, tp[0], tp[1], fx, fy, Math.max(0.35, S.lw * 0.16), accent(S, 0.3), 0.4);
          B.dot(S, fx, fy, Math.max(0.6, S.lw * 0.36 * S.tipSize), accent(S, 0.3), 0.75);
        }
      }
    });

    /* the source: a seed and a splash of light */
    B.haze(S, S.cx, baseY - S.H * 0.02, S.W * 0.055, S.cols[3], 0.16);
    B.bead(S, S.cx, baseY - S.H * 0.012, Math.max(1.6, S.lw * 1.1), accent(S, 0.25), 0.95);

    /* a low arc of ticks under the fountain, like a plinth */
    B.tickRing(S, S.cx, baseY + S.H * 0.02, S.W * 0.30, 46, S.W * 0.012,
      Math.max(0.35, S.lw * 0.2), accent(S, 0.3), 0.20, Math.PI * 0.12);
  }

  /* =======================================================================
     MIRROR LACE — a branching network grown from one point and mirrored four
     ways, over a diagram of concentric rings. Reads as a botanical plate.
     ======================================================================= */
  function lace(S) {
    var c = S.c;
    c.lineCap = "round"; c.lineJoin = "round";

    var roots = 4 + Math.round(S.density * 5);
    var w0 = S.lw * lerp(1.0, 1.8, S.scale);
    var startR = Math.min(S.W, S.H) * 0.050;
    var maxR = Math.min(S.W, S.H) * 0.46 * (0.75 + S.reachF * 0.45);

    backdrop(S, maxR * 1.15, mixCol(S.cols[1], S.cols[2], 0.5), 0.10);

    /* the diagram: faint rings and ticks, drawn first so the web sits on top */
    for (var r = 1; r <= 4; r++) {
      B.ring(S, S.cx, S.cy, maxR * (r / 4), Math.max(0.35, S.lw * 0.16), accent(S, 0.3), 0.12);
    }
    B.tickRing(S, S.cx, S.cy, maxR * 1.02, 72, maxR * 0.020,
      Math.max(0.3, S.lw * 0.18), accent(S, 0.3), 0.20);

    /* Growth keeps its endpoint inside the disc. A branch that would leave it
       is shortened instead of clipped, so the network fills the circle evenly
       and never runs off the edge of the canvas. */
    function grow(S, x, y, ang, len, w, d, id) {
      if (over(S) || len < S.lw * 2.0 || d > S.depth) return;

      var dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
      var ex = x + dx, ey = y + dy;
      var rx = ex - S.cx, ry = ey - S.cy;
      var rr = Math.sqrt(rx * rx + ry * ry);
      if (rr > maxR * 0.97) {
        len *= (maxR * 0.97) / rr;
        if (len < S.lw * 2.0) return;
        dx = Math.cos(ang) * len; dy = Math.sin(ang) * len;
      }

      var bend = (rnd(S.seed, id, 41) - 0.5) * (0.55 + S.curl * 1.4);
      var p = B.bendTo(x, y, x + dx, y + dy, ang, ang + bend, 0.44);
      var pts = B.spine(p[0], p[1], p[2], p[3], 10, len * 0.030 * S.curl, S.seed, id);
      var t = clamp(d / (S.depth + 1.4), 0, 1);
      B.ribbon(S, pts, w, Math.max(0.4, w * lerp(0.78, 0.34, S.taper)),
        tone(S, t, id), tone(S, t + 0.15, id), 0.94, 0.75);

      /* spores, alternating sides */
      for (var i = 3; i < pts.length; i += 3) {
        var side = (i % 6 === 0) ? 1 : -1;
        var perp = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) + HALF;
        var sr = w * 1.5;
        B.bead(S, pts[i][0] + Math.cos(perp) * side * sr,
          pts[i][1] + Math.sin(perp) * side * sr,
          Math.max(0.7, w * 0.50), accent(S, 0.25), 0.88);
      }

      var kids = rnd(S.seed, id, 43) < 0.35 ? 1 : 2;
      for (var k = 0; k < kids && !over(S); k++) {
        var s2 = (k - (kids - 1) / 2) * 2;
        var na = ang + bend * 0.6 + s2 * (0.26 + S.density * 0.30);
        grow(S, pts[pts.length - 1][0], pts[pts.length - 1][1], na, len * 0.64,
          w * lerp(0.60, 0.40, S.taper), d + 1, id * 3 + k + 1);
      }
    }

    /* One wedge is grown, then rotated eight times. Even angular spacing is
       what keeps every branch inside the disc and even, and the half-step
       offset between copies stops the seams lining up into spokes. */
    /* Each copy gets ONE trunk, fanned a little by the two sub-roots, so the
       result reads as a radiating colony with a clear structure instead of a
       starburst of forty spokes. The fan angle is positive so no two
       neighbouring copies can cross. */
    var spokes = 6 + Math.round(S.density * 4);
    var wedge = TAU / spokes;
    B.stampRadial(S, spokes, function (sub) {
      for (var i = 0; i < roots && !over(sub); i++) {
        var f = (i + 0.5) / roots;
        var a = -HALF + (f - 0.5) * wedge * 0.62;
        grow(sub, sub.cx + Math.cos(a) * startR, sub.cy + Math.sin(a) * startR, a,
          maxR * lerp(0.34, 0.56, 1 - Math.abs(f - 0.5) * 1.1),
          w0 * lerp(1, 0.68, f), 0, i + 1);
      }
    });

    /* the heart */
    B.haze(S, S.cx, S.cy, S.lw * (8 + S.density * 14), S.cols[3], 0.14);
    B.bead(S, S.cx, S.cy, Math.max(1.8, S.lw * 1.2), accent(S, 0.3), 1);
    B.ring(S, S.cx, S.cy, startR * 1.25, Math.max(0.4, S.lw * 0.3), accent(S, 0.3), 0.35);
  }

  /* =======================================================================
     CORNER FRAMES — fronds sweep in from the four corners. The leaflets are
     geometric and evenly spaced, so the border reads as a decorated frame.
     ======================================================================= */
  function fronds(S) {
    var c = S.c;
    c.lineCap = "round"; c.lineJoin = "round";

    var per = Math.max(1, Math.round(num(S.p.fernCount, 3)));
    var spacing = clamp(num(S.p.fernSpacing, 50) / 100, 0, 1);
    var L = S.reachLen * 0.80;

    /* a quiet central medallion, so the empty middle is deliberate */
    var medR = Math.min(S.W, S.H) * (0.09 + S.density * 0.05) * (0.8 + S.scale * 0.3);
    backdrop(S, medR * 2.4, mixCol(S.cols[1], S.cols[2], 0.5), 0.07);
    B.ring(S, S.cx, S.cy, medR, Math.max(0.5, S.lw * 0.4), accent(S, 0.3), 0.30);
    B.ring(S, S.cx, S.cy, medR * 0.66, Math.max(0.4, S.lw * 0.25), accent(S, 0.3), 0.20);
    B.tickRing(S, S.cx, S.cy, medR * 0.66, 24, medR * 0.10,
      Math.max(0.35, S.lw * 0.2), accent(S, 0.3), 0.22);

    function frond(x0, y0, a0, bend, ri) {
      if (over(S)) return;
      var tx = x0 + Math.cos(a0 + bend) * L;
      var ty = y0 + Math.sin(a0 + bend) * L;
      var p = B.bendTo(x0, y0, tx, ty, a0, a0 + bend, 0.44);
      var pts = B.spine(p[0], p[1], p[2], p[3], 32, L * 0.02 * S.curl, S.seed, ri);
      var col = tone(S, 0.32, ri);
      B.ribbon(S, pts, S.lw * lerp(1.5, 2.4, S.scale), S.lw * 0.45 * S.taper,
        col, tone(S, 0.55, ri), 0.96, 0.75);

      /* leaflets: paired, evenly spaced, shrinking toward the tip */
      var n = 10 + Math.round(S.density * 9);
      for (var i = 2; i < n && !over(S); i++) {
        var t = i / n;
        var idx = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
        var pt = pts[idx];
        var nx = pts[Math.min(pts.length - 1, idx + 1)];
        var ang = Math.atan2(nx[1] - pt[1], nx[0] - pt[0]);
        var ll = L * (0.185 - 0.105 * t) * (0.65 + spacing * 0.55);
        for (var s = -1; s <= 1; s += 2) {
          var la = ang + s * lerp(1.05, 0.50, spacing);
          B.leaf(S, pt[0], pt[1], la, ll, ll * 0.26,
            tone(S, clamp(0.45 + t * 0.4, 0, 1), ri + i + s),
            tone(S, clamp(0.70 + t * 0.3, 0, 1), ri + i + s), 0.90, s * 0.28);
        }
      }
      var tip = pts[pts.length - 1];
      var tipA = Math.atan2(tip[1] - pts[pts.length - 2][1], tip[0] - pts[pts.length - 2][0]);
      B.tipAt(S, tip[0], tip[1], tipA, 1.1);
    }

    var corners = [
      [0, 0, Math.PI * 0.25], [S.W, 0, Math.PI * 0.75],
      [0, S.H, -Math.PI * 0.25], [S.W, S.H, -Math.PI * 0.75]
    ];
    for (var i = 0; i < corners.length; i++) {
      for (var k = 0; k < per && !over(S); k++) {
        var spread = (k - (per - 1) / 2) * (0.18 + spacing * 0.20);
        frond(corners[i][0], corners[i][1], corners[i][2] + spread,
          (S.curl * 0.45 + 0.22) * (i % 2 ? 1 : -1), i * 11 + k + 1);
      }
    }
  }

  /* =======================================================================
     MANDALA — the most ornamental of the seven. Concentric rings of petals,
     each staggered by half a step, with scalloped rims, tick rings and a
     phyllotaxis core.
     ======================================================================= */
  function mandala(S) {
    var c = S.c;
    c.lineCap = "round"; c.lineJoin = "round";

    var fold = Math.round(clamp(num(S.p.fold, 8), 4, 16));
    var layers = Math.round(clamp(3 + S.depth * 0.75, 4, 9));
    var rMax = Math.min(S.W, S.H) * 0.44 * clamp(0.55 + S.reachF * 0.7, 0.4, 1.2) * (0.76 + S.scale * 0.24);
    var core = rMax * 0.13;

    backdrop(S, rMax * 1.15, mixCol(S.cols[1], S.cols[0], 0.4), 0.11);

    /* outer ornamental rims */
    B.ring(S, S.cx, S.cy, rMax * 1.06, Math.max(0.5, S.lw * 0.40), accent(S, 0.25), 0.30);
    B.tickRing(S, S.cx, S.cy, rMax * 1.07, fold * 8, rMax * 0.022,
      Math.max(0.4, S.lw * 0.24), accent(S, 0.25), 0.28);
    B.scallop(S, S.cx, S.cy, rMax * 0.995, fold * 2, rMax * 0.018,
      Math.max(0.4, S.lw * 0.22), accent(S, 0.3), 0.22);

    for (var layer = layers - 1; layer >= 0 && !over(S); layer--) {
      var rIn = rMax * (0.16 + layer / layers * 0.80);
      var rOut = rMax * (0.16 + (layer + 0.88) / layers * 0.80);
      var stagger = (layer % 2) * 0.5;
      var col = tone(S, clamp(0.12 + layer / layers * 0.8, 0, 1), layer);
      var col2 = lighten(col, 0.28);

      for (var j = 0; j < fold && !over(S); j++) {
        var ang = (j + stagger) / fold * TAU + rnd(S.seed, layer, 70) * 0.10;
        var step = TAU / fold;
        var a0 = ang - step * 0.40;
        var a1 = ang + step * 0.40;

        B.lens(S, S.cx, S.cy, a0, a1, rIn, rOut,
          1.06 + S.density * 0.22, col, col2,
          0.30 + 0.16 * (layer / layers), accent(S, 0.25));

        /* the bead at the tip of each petal */
        B.bead(S, S.cx + Math.cos(ang) * rOut * 1.02,
          S.cy + Math.sin(ang) * rOut * 1.02,
          Math.max(0.8, rMax * 0.014 * (0.6 + S.tipSize)), accent(S, 0.28), 0.95);
      }

      /* hachure between layers adds engraved depth */
      if (layer % 2 === 0) {
        B.hatch(S, S.cx, S.cy, 0, TAU, rIn * 1.00, rIn * 1.03, fold * 2,
          Math.max(0.3, S.lw * 0.16), accent(S, 0.3), 0.16);
      }
    }

    /* centre: a phyllotaxis rosette with a bright heart */
    for (var k = 0; k < fold && !over(S); k++) {
      var a = k / fold * TAU + 0.15;
      B.leaf(S, S.cx, S.cy, a, core * 1.15, core * 0.40,
        tone(S, 0.92, k), accent(S, 0.3), 0.94);
    }
    B.phyllo(S, S.cx, S.cy, core * 0.72, 26 + Math.round(S.density * 22),
      function (px, py, rr) {
        B.dot(S, px, py, core * (0.075 - rr * 0.035), accent(S, 0.35), 0.85);
      });
    B.bead(S, S.cx, S.cy, Math.max(1.6, core * 0.30), accent(S, 0.2), 1);
  }

  /* =======================================================================
     WREATH — a continuous vine wound into a ring, in overlapping strands, with
     thorns, leaves and fruit. The open middle is framed by an ornamental rim.
     ======================================================================= */
  function wreath(S) {
    var c = S.c;
    c.lineCap = "round"; c.lineJoin = "round";

    var fold = Math.round(clamp(num(S.p.fold, 8), 5, 16));
    var rMax = Math.min(S.W, S.H) * 0.40 * clamp(0.55 + S.reachF * 0.6, 0.35, 1) * (0.78 + S.scale * 0.22);
    var rIn = rMax * (0.52 + S.density * 0.10);
    var w = S.lw * lerp(1.7, 3.4, S.scale);

    backdrop(S, rMax * 1.35, mixCol(S.cols[2], S.cols[1], 0.4), 0.10);

    /* ornamental rims either side of the vine band */
    B.ring(S, S.cx, S.cy, rIn * 0.66, Math.max(0.45, S.lw * 0.30), accent(S, 0.3), 0.26);
    B.tickRing(S, S.cx, S.cy, rIn * 0.66, 40, rMax * 0.020,
      Math.max(0.35, S.lw * 0.2), accent(S, 0.3), 0.20);
    B.ring(S, S.cx, S.cy, rMax * 1.10, Math.max(0.4, S.lw * 0.26), accent(S, 0.3), 0.20);

    function ringPath(phaseOff, rBase, amp, waves) {
      var pts = [], steps = 170;
      for (var i = 0; i <= steps; i++) {
        var a = i / steps * TAU;
        var r = rBase + Math.sin(a * waves + phaseOff) * amp +
          Math.sin(a * waves * 2 + phaseOff * 1.7) * amp * 0.20;
        pts.push([S.cx + Math.cos(a) * r, S.cy + Math.sin(a) * r]);
      }
      return pts;
    }

    var bands = 2 + Math.round(S.density * 2);
    for (var b = 0; b < bands && !over(S); b++) {
      var phase = b * 2.1 + rnd(S.seed, b, 90) * 0.8;
      var amp = rMax * (0.030 + S.curl * 0.045);
      var rBase = lerp(rIn, rMax, (b / Math.max(1, bands - 1)) * 0.55 + 0.22);
      var pts = ringPath(phase, rBase, amp, fold);
      var col = tone(S, clamp(0.22 + b * 0.26, 0, 1), b);
      B.ribbon(S, pts, w * (1 - b * 0.10), w * (0.76 - b * 0.10), col, tone(S, clamp(0.45 + b * 0.26, 0, 1), b), 0.96, 0.9);

      var step = Math.max(4, Math.round(pts.length / (fold * 4)));
      for (var k = step; k < pts.length - step; k += step) {
        if (rnd(S.seed, b * 60 + k, 95) > 0.55) continue;
        var p = pts[k];
        var outA = Math.atan2(p[1] - S.cy, p[0] - S.cx);
        var tl = w * lerp(2.4, 4.8, S.tipSize);
        var ta = outA + (k % 2 ? 0.42 : -0.42);
        var b1x = p[0] + Math.cos(outA + HALF) * w * 0.32;
        var b1y = p[1] + Math.sin(outA + HALF) * w * 0.32;
        var b2x = p[0] - Math.cos(outA + HALF) * w * 0.32;
        var b2y = p[1] - Math.sin(outA + HALF) * w * 0.32;
        c.beginPath();
        c.moveTo(b1x, b1y);
        c.lineTo(p[0] + Math.cos(ta) * tl, p[1] + Math.sin(ta) * tl);
        c.lineTo(b2x, b2y);
        c.closePath();
        c.fillStyle = rgba(accent(S, 0.25), 0.94);
        c.fill();
        B.spent(S, 1);
      }

      for (var m = 3; m < pts.length - 3; m += 7) {
        if (rnd(S.seed, b * 70 + m, 96) > 0.38 + S.density * 0.35) continue;
        var q = pts[m];
        var qa = Math.atan2(q[1] - S.cy, q[0] - S.cx);
        var bl = w * lerp(2.2, 4.4, S.tipSize);
        if (m % 14 < 7) {
          B.leaf(S, q[0], q[1], qa + (m % 2 ? 0.95 : -0.95), bl * 2.2, bl * 0.60,
            tone(S, 0.55, b + m), tone(S, 0.75, b + m), 0.92,
            (m % 2 ? 0.36 : -0.36));
        } else {
          var n = 2 + Math.floor(rnd(S.seed, b * 71 + m, 97) * 3);
          for (var z = 0; z < n; z++) {
            var za = qa + (rnd(S.seed, b * 73 + m + z, 98) - 0.5) * 1.1;
            var zr = bl * (0.85 + rnd(S.seed, z + m, 99) * 0.7);
            B.bead(S, q[0] + Math.cos(za) * zr, q[1] + Math.sin(za) * zr,
              Math.max(1.1, w * lerp(0.75, 1.30, S.tipSize)), S.cols[3], 0.97);
          }
        }
      }
    }

    B.haze(S, S.cx, S.cy, rIn * 0.55, S.cols[3], 0.06);
  }


  /* =======================================================================
     MUSHROOM — a stand of caps on thin stalks, spores drifting between them,
     and a pale moon behind. Flat graphic caps with radial gills.
     ======================================================================= */
  function mushroom(S) {
    var c = S.c;
    c.lineCap = "round"; c.lineJoin = "round";

    var stand = 3 + Math.round(S.density * 4);
    var moonR = Math.min(S.W, S.H) * (0.22 + S.reachF * 0.10);
    var moonY = S.H * 0.30;

    B.haze(S, S.cx, moonY, moonR * 1.7, mixCol(S.cols[3], S.cols[1], 0.45), 0.11);
    c.beginPath(); c.arc(S.cx, moonY, moonR, 0, TAU);
    c.fillStyle = rgba(accent(S, 0.55), 0.10); c.fill();
    B.ring(S, S.cx, moonY, moonR, Math.max(0.5, S.lw * 0.4), accent(S, 0.3), 0.24);

    /* ground line */
    var gy = S.H * 0.86;
    B.ink(S, S.W * 0.05, gy, S.W * 0.95, gy, Math.max(0.5, S.lw * 0.4), accent(S, 0.22), 0.35);
    B.haze(S, S.cx, gy, S.W * 0.34, S.cols[2], 0.16);

    /* One mushroom. `h` is the stalk height, `capR` the cap radius. The cap is
       a half-ellipse with a lifted rim, so it reads as a cap and not a dome. */
    function shroom(x, baseY, h, capR, id, lean) {
      if (over(S)) return;
      var topx = x + Math.sin(lean) * h;
      var topy = baseY - Math.cos(lean) * h;
      var wS = S.lw * (1.5 + capR / (S.W * 0.12) * 0.9);
      var col = tone(S, 0.55, id);
      var colTip = lighten(col, 0.22);

      /* stalk, slightly bowed */
      var p = B.bendTo(x, baseY, topx, topy, -HALF + lean * 0.4, -HALF + lean, 0.36);
      B.ribbon(S, B.spine(p[0], p[1], p[2], p[3], 12, h * 0.02 * S.curl, S.seed, id),
        wS, wS * 0.72, tone(S, 0.30, id), colTip, 0.98, 0.8);

      /* ring on the stalk (annulus) — a small ornament, and a real mushroom
         feature that makes the silhouette read at a glance */
      if (capR > S.W * 0.05) {
        var ry = baseY - h * 0.62;
        var rx = x + Math.sin(lean) * h * 0.62;
        c.beginPath();
        c.ellipse(rx, ry, wS * 1.5, wS * 0.55, lean, 0, TAU);
        c.fillStyle = rgba(accent(S, 0.30), 0.55);
        c.fill();
        B.spent(S, 1);
      }

      /* cap */
      var lift = capR * (0.16 + S.curl * 0.14);
      c.beginPath();
      c.moveTo(topx - capR, topy + lift * 0.4);
      c.bezierCurveTo(topx - capR * 0.55, topy - capR * 0.95,
        topx + capR * 0.55, topy - capR * 0.95,
        topx + capR, topy + lift * 0.4);
      c.quadraticCurveTo(topx, topy + capR * 0.30, topx - capR, topy + lift * 0.4);
      c.closePath();
      B.spent(S, 2);

      var g = c.createLinearGradient(topx, topy - capR, topx, topy + capR * 0.3);
      g.addColorStop(0, rgba(lighten(col, 0.30), 0.98));
      g.addColorStop(0.62, rgba(col, 0.98));
      g.addColorStop(1, rgba(darken(col, 0.35), 0.98));
      c.fillStyle = g;
      c.fill();

      /* radial gills under the rim */
      var gills = 9 + Math.round(S.density * 10);
      for (var k = 0; k < gills; k++) {
        var a = Math.PI + k / (gills - 1) * Math.PI;
        B.ink(S, topx + Math.cos(a) * capR * 0.30,
          topy + lift * 0.4 + Math.sin(a) * capR * 0.16,
          topx + Math.cos(a) * capR * 0.98,
          topy + lift * 0.4 + Math.sin(a) * capR * 0.26,
          Math.max(0.35, S.lw * 0.16), darken(col, 0.45), 0.30);
      }

      /* rim line, bright */
      c.beginPath();
      c.moveTo(topx - capR, topy + lift * 0.4);
      c.quadraticCurveTo(topx, topy + capR * 0.30, topx + capR, topy + lift * 0.4);
      c.lineWidth = Math.max(0.5, S.lw * 0.3);
      c.strokeStyle = rgba(accent(S, 0.35), 0.55);
      c.stroke();
      B.spent(S, 1);

      /* spots on the cap */
      if (capR > S.W * 0.05) {
        var n = 3 + Math.round(S.density * 5);
        for (var q = 0; q < n && !over(S); q++) {
          var sa = -Math.PI * 0.86 + rnd(S.seed, id * 7 + q, 80) * Math.PI * 0.72;
          var sr = capR * (0.25 + rnd(S.seed, id * 9 + q, 81) * 0.55);
          B.dot(S, topx + Math.cos(sa) * sr, topy + Math.sin(sa) * sr * 0.75 + lift * 0.2,
            capR * (0.035 + rnd(S.seed, id + q, 82) * 0.035), accent(S, 0.45), 0.65);
        }
      }

      /* spores rising from the gills */
      var ns = 2 + Math.round(S.density * 4);
      for (var sp = 0; sp < ns; sp++) {
        var spa = -HALF + (rnd(S.seed, id * 11 + sp, 83) - 0.5) * 1.7;
        var spd = capR * (0.5 + rnd(S.seed, id * 13 + sp, 84) * 1.1);
        B.dot(S, topx + Math.cos(spa) * spd,
          topy - Math.abs(Math.sin(spa)) * spd * 0.7 - rnd(S.seed, sp, 85) * capR * 0.5,
          Math.max(0.5, S.lw * 0.30 * S.tipSize), accent(S, 0.5), 0.55);
      }
    }

    /* the stand: tallest at the centre, smaller either side, mirrored */
    B.mirrorX(S, function () {
      for (var i = 0; i < stand && !over(S); i++) {
        var f = stand === 1 ? 0 : i / (stand - 1);
        var x = S.cx + S.W * (0.02 + f * 0.30);
        var h = S.H * (0.34 - f * 0.17) * (0.72 + S.reachF * 0.45);
        var capR = S.W * (0.105 - f * 0.048) * (0.80 + S.scale * 0.25);
        var lean = (0.10 + f * 0.16) * (rnd(S.seed, i, 86) < 0.5 ? 1 : 0.6);
        shroom(x, gy + f * S.H * 0.02, h, capR, i + 1, lean);
      }
    });

    /* undergrowth */
    for (var g2 = 0; g2 < 14; g2++) {
      var gx2 = S.W * (0.04 + g2 / 14 * 0.92);
      var gh = S.H * (0.02 + rnd(S.seed, g2 + 40, 87) * 0.035);
      B.ink(S, gx2, gy, gx2 + (rnd(S.seed, g2, 88) - 0.5) * S.W * 0.02, gy - gh,
        Math.max(0.35, S.lw * 0.26), tone(S, 0.42, g2), 0.35);
    }
  }

  /* =======================================================================
     SPORE PRINT — the pattern a mushroom leaves on paper: a burst of fine
     radial lines, denser at the rim, over a soft dark disc. Pure geometry.
     ======================================================================= */
  function sporeprint(S) {
    var c = S.c;
    c.lineCap = "round"; c.lineJoin = "round";

    var rMax = Math.min(S.W, S.H) * 0.44 * (0.72 + S.reachF * 0.42) * (0.80 + S.scale * 0.20);
    var core = rMax * 0.14;

    B.haze(S, S.cx, S.cy, rMax * 1.18, mixCol(S.cols[1], S.cols[0], 0.45), 0.12);

    /* the disc of the print */
    c.beginPath(); c.arc(S.cx, S.cy, rMax * 1.02, 0, TAU);
    c.fillStyle = rgba(S.cols[2], 0.10); c.fill();
    B.spent(S, 1);

    /* Fine radial filaments. Length and weight both grow with the angle's
       deviation from the seed angle, which produces the dense/loose asymmetry
       that a real spore print has, while keeping perfect mirror symmetry. */
    var n = 150 + Math.round(S.density * 220);
    var phase = rnd(S.seed, 1, 30) * TAU;
    for (var i = 0; i < n && !over(S); i++) {
      var a = i / n * TAU;
      var wob = Math.sin(a * 7 + phase) * 0.5 + Math.sin(a * 17 + phase * 1.7) * 0.25;
      var r0 = core * (0.8 + rnd(S.seed, i, 31) * 0.5);
      var r1 = rMax * (0.60 + 0.40 * Math.abs(wob)) * (0.86 + rnd(S.seed, i, 32) * 0.18);
      var alpha = 0.16 + Math.abs(wob) * 0.30;
      var col = tone(S, clamp(r1 / rMax, 0, 1), i);
      B.ink(S, S.cx + Math.cos(a) * r0, S.cy + Math.sin(a) * r0,
        S.cx + Math.cos(a) * r1, S.cy + Math.sin(a) * r1,
        Math.max(0.30, S.lw * (0.20 + rnd(S.seed, i, 33) * 0.22)), col, alpha);
    }

    /* a second, coarser ring of marks near the rim */
    B.tickRing(S, S.cx, S.cy, rMax * 0.98, Math.round(60 + S.density * 60),
      rMax * 0.035, Math.max(0.3, S.lw * 0.2), accent(S, 0.3), 0.22, rnd(S.seed, 2, 34));

    /* centre: a small raised boss */
    B.haze(S, S.cx, S.cy, core * 1.4, S.cols[3], 0.18);
    B.bead(S, S.cx, S.cy, Math.max(1.8, core * 0.34), accent(S, 0.25), 1);
    B.ring(S, S.cx, S.cy, core, Math.max(0.4, S.lw * 0.35), accent(S, 0.3), 0.40);
    B.ring(S, S.cx, S.cy, rMax * 1.02, Math.max(0.45, S.lw * 0.35), accent(S, 0.25), 0.26);
  }

  /* =======================================================================
     BLOOM — a single flower head from above: layered petals, a phyllotaxis
     centre, mirrored exactly, on a stem that runs off the bottom edge.
     ======================================================================= */
  function bloom(S) {
    var c = S.c;
    c.lineCap = "round"; c.lineJoin = "round";

    var headY = S.H * (0.42 + S.reachF * 0.05);
    var R = Math.min(S.W * 0.36, S.H * 0.30) * (0.78 + S.scale * 0.26);
    var rings = 2 + Math.round(S.depth * 0.55);

    B.haze(S, S.cx, headY, R * 1.55, mixCol(S.cols[1], S.cols[0], 0.4), 0.12);
    B.tickRing(S, S.cx, headY, R * 1.20, 84, R * 0.030, Math.max(0.3, S.lw * 0.2),
      accent(S, 0.3), 0.20);
    B.ring(S, S.cx, headY, R * 1.16, Math.max(0.4, S.lw * 0.3), accent(S, 0.3), 0.22);

    /* stem with two leaves, running off the bottom so the head is anchored */
    var stemTop = [S.cx, headY + R * 0.10];
    var stemBot = [S.cx + S.W * 0.05, S.H * 1.02];
    var sp = B.bendTo(stemTop[0], stemTop[1], stemBot[0], stemBot[1], -HALF, -HALF, 0.5);
    B.ribbon(S, B.spine(sp[0], sp[1], sp[2], sp[3], 16, S.W * 0.006 * S.curl, S.seed, 3),
      S.lw * 3.0, S.lw * 1.6, tone(S, 0.05, 0), tone(S, 0.2, 0), 0.98, 0.8);

    for (var lf = 0; lf < 2; lf++) {
      var ly = lerp(headY + R * 0.55, S.H * 0.94, lf / 1.4);
      var side = lf % 2 ? 1 : -1;
      B.leaf(S, S.cx + S.W * (0.01 + lf * 0.02), ly,
        -HALF + side * (0.95 + lf * 0.2), R * (0.42 - lf * 0.08), R * 0.11,
        tone(S, 0.22, lf), tone(S, 0.42, lf), 0.95, side * 0.4);
    }

    /* petals, back ring to front, each ring offset by half a step */
    var petals = Math.round(clamp(num(S.p.fold, 8), 5, 16));
    for (var ring = rings - 1; ring >= 0 && !over(S); ring--) {
      var f = (ring + 1) / rings;
      var len = R * (0.52 + 0.48 * f);
      var wid = len * (0.30 + 0.10 * (1 - f));
      var off = (ring % 2) * 0.5;
      var col = tone(S, clamp(0.20 + (1 - f) * 0.55, 0, 1), ring);

      for (var k = 0; k < petals && !over(S); k++) {
        var a = (k + off) / petals * TAU + Math.PI / petals;
        B.leaf(S, S.cx + Math.cos(a) * len * 0.06, headY + Math.sin(a) * len * 0.06,
          a, len, wid, col, lighten(col, 0.25), 0.90,
          (rnd(S.seed, ring * 20 + k, 89) - 0.5) * 0.22);
      }
    }

    /* centre: phyllotaxis, the real seed-head arrangement */
    var coreR = R * 0.24;
    B.dot(S, S.cx, headY, coreR, darken(tone(S, 0.95, 1), 0.35), 0.75);
    B.phyllo(S, S.cx, headY, coreR * 0.94, 60 + Math.round(S.density * 60),
      function (px, py, rr) {
        B.dot(S, px, py, coreR * (0.075 - rr * 0.03), accent(S, 0.30), 0.85);
      });
    B.ring(S, S.cx, headY, coreR, Math.max(0.5, S.lw * 0.34), accent(S, 0.3), 0.45);

    /* pollen drifting */
    var np = 10 + Math.round(S.density * 16);
    for (var q = 0; q < np && !over(S); q++) {
      var pa = rnd(S.seed, q, 60) * TAU;
      var pr = R * (1.05 + rnd(S.seed, q, 61) * 0.5);
      B.dot(S, S.cx + Math.cos(pa) * pr, headY + Math.sin(pa) * pr,
        Math.max(0.5, S.lw * 0.34 * S.tipSize), accent(S, 0.4), 0.45);
    }
  }

  window.ThicketForms = {
    tree: tree, bamboo: grove, reed: fountain,
    mycelium: lace, fern: fronds, coral: mandala, bramble: wreath,
    mushroom: mushroom, sporeprint: sporeprint, bloom: bloom
  };
})();