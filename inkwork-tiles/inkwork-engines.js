/* =========================================================================
   INKWORK TILES: inkwork-engines.js
   Six additional pattern engines. Each one registers itself on
   window.InkworkEngines and is called exactly like the four original
   recipes: fn(S), where S carries the context, settings and derived sizes.

   Kept in its own file so inkwork-styles.js stays readable. Load this
   BEFORE inkwork-styles.js.
   ========================================================================= */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var HALF = Math.PI / 2;
  var ENG = {};

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function mod(a, n) { return ((a % n) + n) % n; }

  function hexToRgb(h) {
    h = String(h || "#000000").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    if (isNaN(n)) n = 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
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
    return rgbToHex(c[0] * (1 - f), c[1] * (1 - f), c[2] * (1 - f));
  }
  function lightenHex(hex, f) {
    var c = hexToRgb(hex);
    return rgbToHex(c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f);
  }
  function colsOf(S) {
    var c = (S.cols && S.cols.length) ? S.cols : ["#222222", "#444444", "#666666", "#888888"];
    var out = [];
    for (var i = 0; i < 4; i++) out.push(c[i] || c[c.length - 1] || "#222222");
    return out;
  }
  /* A lone faint mark, so a thread never has a hard cut where it meets a
     join. */
  function capDot(c, x, y, r, col) {
    if (r <= 0.2) return;
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    c.fillStyle = rgba(col, 1); c.fill();
  }

  /* =======================================================================
     INTERLACE — Celtic knotwork.
     Two families of diagonal ribbons crossing at a half-cell offset. The
     over/under alternates on a diagonal parity, which is what makes the
     crossings read as woven rather than merely overlapping.
     ======================================================================= */
  function interlace(S) {
    var c = S.c, p = S.p, T = S.T, lw = S.lw, D = S.D;
    var cols = colsOf(S);
    var w = Math.max(2, Math.min(num(p.interlaceWidth) * (S.k || 1), T * 0.62));
    var o = Math.max(1, lw);
    var K = Math.ceil(D / T) + 2;
    c.lineCap = "butt"; c.lineJoin = "round";

    /* Each family needs its angle AND its normal together; reading
       fam[a1] as an angle produced NaN and the whole engine drew nothing. */
    var sets = [
      [Math.PI / 4, -Math.PI / 4],
      [Math.PI / 6, -Math.PI / 6, HALF]
    ];
    var fam = (p.interlaceShape === "tri" ? sets[1] : sets[0]).map(function (ang) {
      return { ang: ang, u: [Math.cos(ang), Math.sin(ang)], n: [-Math.sin(ang), Math.cos(ang)] };
    });

    /* Draw in two passes: every ribbon, then the "over" patches lifted back
       on top. Because the parity is on (k1 - k2), the weave marches
       diagonally instead of forming a checkerboard of joints. */
    function ribbon(F, k, t0, t1) {
      var ux = F.u[0], uy = F.u[1];
      var bx = F.n[0] * (k * T), by = F.n[1] * (k * T);
      var col = cols[mod(k, 4)];
      c.beginPath();
      c.moveTo(bx + ux * t0, by + uy * t0);
      c.lineTo(bx + ux * t1, by + uy * t1);
      c.lineWidth = w + 2 * o;
      c.strokeStyle = darken(col, 0.60);
      c.stroke();
      c.lineWidth = w;
      c.strokeStyle = rgba(col, 1);
      c.stroke();
      /* a thin light rail down the middle: reads as a rounded cord */
      c.lineWidth = Math.max(0.6, w * 0.16);
      c.strokeStyle = "rgba(255,255,255,0.16)";
      c.stroke();
    }

    for (var a = 0; a < fam.length; a++) {
      for (var k = -K; k <= K; k++) ribbon(fam[a], k, -D, D);
    }


    /* crossings: solve the two-line intersection and lift the over-ribbon */
    for (var a1 = 0; a1 < fam.length; a1++) {
      for (var a2 = a1 + 1; a2 < fam.length; a2++) {
        for (var k1 = -K; k1 <= K; k1++) {
          for (var k2 = -K; k2 <= K; k2++) {
            var u1 = fam[a1].u, n1 = fam[a1].n;
            var u2 = fam[a2].u, n2 = fam[a2].n;
            var det = n1[0] * n2[1] - n1[1] * n2[0];
            if (Math.abs(det) < 0.08) continue;
            var ca = k1 * T, cb = k2 * T;
            var X = (ca * n2[1] - cb * n1[1]) / det;
            var Y = (n1[0] * cb - n2[0] * ca) / det;
            if (X * X + Y * Y > (D + T) * (D + T)) continue;
            var t = X * u1[0] + Y * u1[1];
            var half = (w / 2 + o) / Math.abs(det) + o * 0.6;
            if (mod(k1 - k2, 2) === 0) ribbon(fam[a1], k1, t - half, t + half);
            else ribbon(fam[a2], k2, t - half, t + half);
          }
        }
      }
    }
  }

  /* =======================================================================
     MEANDER — the Greek key.
     One continuous rule that turns back on itself, tiled on a 2x2 cell
     repeat with a finer inner rule offset inside it.
     ======================================================================= */
  function meander(S) {
    var c = S.c, p = S.p, D = S.D, lw = S.lw;
    var cols = colsOf(S);
    var T = Math.max(2, S.T);
    var w = Math.max(1, lw);
    var o = Math.max(1, lw * 0.55);

    /* The classic running key, in cell units. Two lines long (0..1), so the
       NEXT unit starts exactly where this one ends and the chain is unbroken:
         (0,1) (0,0) (1,0) (1,0.55) (0.45,0.55) (0.45,0.30)  -- the inner roll
       followed by the return that hands off to the next unit. */
    var UNIT = [
      [0, 1], [0, 0], [1, 0], [1, 0.56], [0.44, 0.56], [0.44, 0.30]
    ];

    var cells = Math.ceil((D * 2) / T) + 3;
    cells = Math.min(cells, 320);
    c.lineCap = "butt"; c.lineJoin = "miter";

    /* one continuous path per unit, tiled; the under-channel first */
    c.beginPath();
    for (var gy = -cells; gy <= cells; gy++) {
      for (var gx = -cells; gx <= cells; gx++) {
        var ox = gx * T, oy = gy * T;
        for (var i = 0; i < UNIT.length; i++) {
          var x = ox + UNIT[i][0] * T, y = oy + UNIT[i][1] * T;
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
      }
    }
    c.lineWidth = w + 2 * o;
    c.strokeStyle = darken(cols[0], 0.55);
    c.stroke();

    c.lineWidth = w;
    c.strokeStyle = rgba(cols[0], 1);
    c.stroke();

    /* the fine inner rule: the same unit, scaled toward its own corner */
    c.beginPath();
    for (var gy2 = -cells; gy2 <= cells; gy2++) {
      for (var gx2 = -cells; gx2 <= cells; gx2++) {
        var cx = gx2 * T + T * 0.62, cy = gy2 * T + T * 0.52;
        for (var j = 0; j < UNIT.length; j++) {
          var px = gx2 * T + UNIT[j][0] * T;
          var py = gy2 * T + UNIT[j][1] * T;
          var ix = cx + (px - cx) * 0.78;
          var iy = cy + (py - cy) * 0.78;
          if (j === 0) c.moveTo(ix, iy); else c.lineTo(ix, iy);
        }
      }
    }
    c.lineWidth = Math.max(0.7, lw * 0.36);
    c.strokeStyle = rgba(cols[1], 0.80);
    c.stroke();

    /* the small square at each turn, the detail real keys carry */
    if (lw > 1.1) {
      var ks = T * 0.10;
      c.beginPath();
      for (var gy3 = -cells; gy3 <= cells; gy3++) {
        for (var gx3 = -cells; gx3 <= cells; gx3++) {
          var kx = gx3 * T, ky = gy3 * T;
          c.rect(kx - ks, ky - ks, ks * 2, ks * 2);
        }
      }
      c.fillStyle = rgba(cols[2], 0.95);
      c.fill();
    }
  }

  /* =======================================================================
     SCALLOP — overlapping Art Deco fish scales.
     Rows overlap so only the crown of each scale shows; every scale carries
     an inner arc, which is the detail that makes the surface look designed.
     ======================================================================= */
  function scallop(S) {
    var c = S.c, p = S.p, T = S.T, lw = S.lw, D = S.D;
    var cols = colsOf(S);
    var r = Math.max(2, T * 0.5);
    var rowH = r * 0.62;
    var fill = p.scallopFill || "both";
    var o = Math.max(0.8, lw);

    var nRows = Math.ceil((D * 2) / rowH) + 2;
    var nCols = Math.ceil((D * 2) / T) + 2;
    var budget = 1200;
    var drawn = 0;

    c.lineJoin = "round";
    var startY = -D;

    for (var j = 0; j < nRows; j++) {
      var y = startY + j * rowH;
      var off = (j % 2) ? T / 2 : 0;
      for (var i = 0; i < nCols; i++) {
        if (drawn >= budget) break;
        var x = -D + off + i * T;
        var idx = mod(i + j * 2 + Math.floor(i / 3) * 3, 4);
        var col = cols[idx];

        c.beginPath();
        c.arc(x, y, r, Math.PI, TAU);
        c.closePath();

        if (fill !== "outline") {
          /* One hue per scale, shaded from a light crown to a deep base. The
             earlier two-hue gradient turned every scale muddy brown where the
             hues met, which destroyed the flat Art Deco look. */
          var g = c.createLinearGradient(x, y - r, x, y - r * 0.05);
          g.addColorStop(0, rgba(lightenHex(col, 0.34), 0.97));
          g.addColorStop(0.55, rgba(col, 0.97));
          g.addColorStop(1, rgba(darken(col, 0.22), 0.97));
          c.fillStyle = g;
          c.fill();
        }
        if (fill !== "filled") {
          c.strokeStyle = rgba(darken(col, 0.55), 1);
          c.lineWidth = o;
          c.stroke();
        }

        /* inner arc: a pale ridge, in the same hue so the surface stays flat */
        if (fill !== "filled") {
          c.beginPath();
          c.arc(x, y, r * 0.72, Math.PI, TAU);
          c.strokeStyle = rgba(lightenHex(col, 0.62), 0.55);
          c.lineWidth = Math.max(0.6, o * 0.55);
          c.stroke();
        }
        drawn++;
      }
      if (drawn >= budget) break;
    }
  }

  /* =======================================================================
     BLOCKS — herringbone and chevron, the two classic parquet weaves.
     ======================================================================= */
  function blocks(S) {
    var c = S.c, p = S.p, T = S.T, lw = S.lw, D = S.D;
    var cols = colsOf(S);
    var kind = p.blocksStyle || "herringbone";
    var o = Math.max(0.8, lw);
    var ratio = clamp(num(p.blocksWidth) / 60, 0.16, 0.46);

    c.lineCap = "butt"; c.lineJoin = "miter";

    /* One block: a rectangle of length 4u and width u, where u is derived from
       the tile so the brick fills the same space at any setting. */
    function block(x, y, u, ang, col) {
      c.save();
      c.translate(x, y);
      c.rotate(ang);
      c.beginPath();
      c.rect(0, -u / 2, u * 4, u);
      c.fillStyle = rgba(col, 1);
      c.fill();
      c.strokeStyle = rgba(darken(col, 0.50), 1);
      c.lineWidth = o;
      c.stroke();
      /* a seam line across the block, the grain of a parquet tile */
      c.beginPath();
      c.moveTo(u * 1.32, -u / 2);
      c.lineTo(u * 1.32, u / 2);
      c.moveTo(u * 2.64, -u / 2);
      c.lineTo(u * 2.64, u / 2);
      c.strokeStyle = rgba(darken(col, 0.30), 0.55);
      c.lineWidth = Math.max(0.4, o * 0.55);
      c.stroke();
      c.restore();
    }

    /* Herringbone geometry. A herringbone is a set of L-pairs: one block
       lying at -45 degrees and one at +45 sharing a corner. The pair repeats
       on a lattice of step h in both directions, which is what makes the
       classic V rows. Placing pairs on a square lattice (not a sheared one)
       is the detail that stops it turning into a diamond lattice. */
    if (kind === "herringbone") {
      /* Herringbone on a shear lattice. A brick of length 4u and width u at
         45 degrees advances 4u along its own axis; its neighbour, turned the
         opposite way, shares that end. Stepping the lattice by exactly one
         brick length along x and one along y gives the classic V rows with no
         gaps and no gaps doubled. A shear of u*(2+sqrt2) offsets alternate
         rows by half a brick, which is what makes the corners meet. */
      /* A unit is two bricks meeting at a right angle, forming a V. The V
         sits inside a square of side s = 2*u*SQRT2, and those squares tile
         shoulder to shoulder. Overlap is what gives the interlock, so the
         lattice step is slightly less than s. */
      var u = T * 0.30;
      var L = u * 4;
      var s = L / Math.SQRT2;                 /* the V's own square */
      var step = s * 0.82;                    /* overlap */

      var n = Math.ceil(D / step) + 4;
      n = Math.min(n, 160);

      for (var j = -n; j <= n; j++) {
        for (var i = -n; i <= n; i++) {
          var px = i * step + mod(j, 2) * (step * 0.5);
          var py = j * step;
          var cA = cols[mod(i + j, 4)];
          var cB = cols[mod(i + j + 2, 4)];
          /* the V: one brick down-right, one up-right from the same corner */
          block(px, py, u, -Math.PI / 4, cA);
          block(px, py + L * 0.5, u, Math.PI / 4, cB);
        }
      }
      return;
    }

    /* Chevron as solid zigzag bands. Bands of a fixed height zigzag in
       opposite phase, so they nest with no gaps at all. Drawing the bands as
       filled polygons, rather than laying individual bricks and hoping they
       meet, is what guarantees edge-to-edge coverage at any tile size. */
    var bandH = T * 0.42;
    var pitch = T * 1.30;
    var ampV = T * 0.46;

    var nBand = Math.min(Math.ceil(D / bandH) + 3, 200);
    var nZig = Math.min(Math.ceil(D / pitch) + 3, 260);

    for (var b = -nBand; b <= nBand; b++) {
      var baseY = b * bandH;
      var col = cols[mod(b, 4)];
      var flip = mod(b, 2) === 1;

      c.beginPath();
      for (var z = -nZig; z <= nZig; z++) {
        var zx = z * pitch;
        var zy = baseY + (mod(z, 2) ? ampV : -ampV) * (flip ? -1 : 1);
        if (z === -nZig) c.moveTo(zx, zy); else c.lineTo(zx, zy);
      }
      for (var z2 = nZig; z2 >= -nZig; z2--) {
        var zx2 = z2 * pitch;
        var zy2 = baseY + bandH + (mod(z2, 2) ? ampV : -ampV) * (flip ? -1 : 1);
        c.lineTo(zx2, zy2);
      }
      c.closePath();
      c.fillStyle = rgba(col, 1);
      c.fill();
      c.strokeStyle = rgba(darken(col, 0.40), 0.85);
      c.lineWidth = o;
      c.stroke();

      /* a seam down the middle, giving the brick feel */
      c.beginPath();
      for (var z3 = -nZig; z3 <= nZig; z3++) {
        var sx = z3 * pitch;
        var sy = baseY + bandH * 0.5 + (mod(z3, 2) ? ampV : -ampV) * (flip ? -1 : 1);
        if (z3 === -nZig) c.moveTo(sx, sy); else c.lineTo(sx, sy);
      }
      c.strokeStyle = rgba(darken(col, 0.32), 0.50);
      c.lineWidth = Math.max(0.5, o * 0.55);
      c.stroke();
    }
  }

  /* =======================================================================
     GIRIH — Islamic star tessellation.
     An eight-pointed star at every lattice point, with the gaps filled by
     rotated squares and a connecting cross. Strictly geometric, no curves.
     ======================================================================= */
  function girih(S) {
    var c = S.c, p = S.p, T = S.T, lw = S.lw, D = S.D;
    var cols = colsOf(S);
    /* Bound by the real cell count. A fixed ceiling of 90 meant 32,000 stars
       on a 900px canvas with a small tile, which took over two seconds. */
    var n = Math.ceil((D * 2) / T) + 2;
    n = Math.min(n, 90);
    var o = Math.max(0.8, lw);
    var rStar = T * 0.42;
    var rInner = rStar * 0.52;

    c.lineJoin = "miter"; c.lineCap = "butt";

    function star8(x, y, ro, ri, col) {
      c.beginPath();
      for (var k = 0; k < 16; k++) {
        var a = -HALF + k * TAU / 16;
        var r = (k % 2 === 0) ? ro : ri;
        var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      c.fillStyle = rgba(col, 0.92);
      c.fill();
      c.strokeStyle = rgba(darken(col, 0.5), 1);
      c.lineWidth = o;
      c.stroke();
    }

    function squareRot(x, y, r, ang, col) {
      c.save();
      c.translate(x, y); c.rotate(ang);
      c.beginPath();
      c.rect(-r, -r, r * 2, r * 2);
      c.fillStyle = rgba(col, 0.92); c.fill();
      c.strokeStyle = rgba(darken(col, 0.5), 1);
      c.lineWidth = o; c.stroke();
      c.restore();
    }

    /* connecting cross-lines first, so stars sit on top */
    c.beginPath();
    for (var j = -n; j <= n; j++) {
      for (var i = -n; i <= n; i++) {
        var x0 = i * T, y0 = j * T;
        c.moveTo(x0 - T * 0.5, y0);
        c.lineTo(x0 + T * 0.5, y0);
        c.moveTo(x0, y0 - T * 0.5);
        c.lineTo(x0, y0 + T * 0.5);
      }
    }
    c.strokeStyle = rgba(cols[3], 0.30);
    c.lineWidth = Math.max(0.5, lw * 0.5);
    c.stroke();

    for (var j2 = -n; j2 <= n; j2++) {
      for (var i2 = -n; i2 <= n; i2++) {
        var x = i2 * T, y = j2 * T;
        /* Colour by a diagonal band rather than by cell parity: bands read as
           a designed surface, random parities read as confetti. */
        var band = mod(Math.floor((i2 + j2) / 3), 4);
        star8(x, y, rStar, rInner, cols[band]);
        /* The gap square. Only draw the small inner diamond when the tile is
           large enough for it to be visible; below that it is invisible work
           repeated thousands of times. */
        squareRot(x + T * 0.5, y + T * 0.5, T * 0.19, Math.PI / 4, cols[mod(band + 1, 4)]);
        if (T > 70) {
          squareRot(x + T * 0.5, y + T * 0.5, T * 0.10, 0, cols[3]);
        }
        /* the shamse at the heart of the star: pale, so the star reads as
           having a lit centre */
        c.beginPath();
        c.arc(x, y, rInner * 0.55, 0, TAU);
        c.fillStyle = rgba(lightenHex(cols[band], 0.62), 0.95);
        c.fill();
      }
    }
  }

  /* =======================================================================
     VORONOI — irregular cells from scattered sites.
     The cells come from exact half-plane clipping, so they tile with no
     gaps and no overlaps. A mirrored site set keeps the result symmetrical.
     ======================================================================= */
  function clipHalfPlane(poly, si, sj) {
    var dx = sj.x - si.x, dy = sj.y - si.y;
    if (dx === 0 && dy === 0) return poly;
    var cc = (sj.x * sj.x + sj.y * sj.y) - (si.x * si.x + si.y * si.y);
    var out = [];
    var n = poly.length;
    for (var i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n];
      var fa = 2 * (a[0] * dx + a[1] * dy) - cc;
      var fb = 2 * (b[0] * dx + b[1] * dy) - cc;
      if (fa <= 0) out.push(a);
      if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
        var t = fa / (fa - fb);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return out;
  }

  function voronoiCells(sites, W, H) {
    var rect = [[0, 0], [W, 0], [W, H], [0, H]];
    var cells = [];
    var n = sites ? sites.length : 0;
    for (var i = 0; i < n; i++) {
      var poly = (W > 0 && H > 0) ? rect : [];
      for (var j = 0; j < n && poly.length; j++) {
        if (j !== i) poly = clipHalfPlane(poly, sites[i], sites[j]);
      }
      cells.push(poly);
    }
    return cells;
  }

  function voronoi(S) {
    var c = S.c, p = S.p, T = S.T, lw = S.lw, D = S.D;
    var cols = colsOf(S);
    /* The site grid is capped tightly: every cell is clipped against every
       other site, so the cost is the square of the count. 18 per axis is
       enough to read as irregular and keeps the whole picture under a
       quarter second on a phone. */
    var n = Math.ceil((D * 2) / T) + 2;
    var N = Math.min(n, 18);

    /* Sites on a jittered lattice, mirrored about the centre so the picture
       is symmetrical without looking mechanical. */
    var sites = [];
    var spread = T * 0.36;
    for (var j = -N; j <= N; j++) {
      for (var i = -N; i <= N; i++) {
        var h1 = hash2(S.seed, i, j, 1);
        var h2 = hash2(S.seed, i, j, 2);
        sites.push({
          x: i * T + (h1 - 0.5) * spread,
          y: j * T + (h2 - 0.5) * spread,
          ci: i, cj: j
        });
      }
    }

    var size = D * 1.05;
    var cells = voronoiCells(sites, size * 2, size * 2);
    var o = Math.max(0.8, lw);

    for (var k = 0; k < cells.length; k++) {
      var poly = cells[k];
      if (poly.length < 3) continue;
      var site = sites[k];
      var col = cols[mod(site.ci + site.cj * 2, 4)];

      c.beginPath();
      for (var v = 0; v < poly.length; v++) {
        var px = poly[v][0] - size, py = poly[v][1] - size;
        if (v === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();

      if (p.voronoiFill !== "outline") {
        /* shade each cell from its top edge to its bottom edge, so the
           surface has form instead of reading as flat colour chips */
        var minY = 1e9, maxY = -1e9;
        for (var vv = 0; vv < poly.length; vv++) {
          if (poly[vv][1] < minY) minY = poly[vv][1];
          if (poly[vv][1] > maxY) maxY = poly[vv][1];
        }
        var gy0 = minY - size, gy1 = maxY - size;
        if (gy1 - gy0 < 1) gy1 = gy0 + 1;
        var gg = c.createLinearGradient(0, gy0, 0, gy1);
        gg.addColorStop(0, rgba(lightenHex(col, 0.26), 0.92));
        gg.addColorStop(1, rgba(darken(col, 0.14), 0.92));
        c.fillStyle = gg;
        c.fill();
      }
      c.strokeStyle = rgba(darken(col, 0.50), 0.95);
      c.lineWidth = o;
      c.stroke();

      /* a fine inner rule, inset, the way engraved plates double their
         outlines */
      if (poly.length > 3) {
        c.beginPath();
        for (var w2 = 0; w2 < poly.length; w2++) {
          var px2 = poly[w2][0] - size, py2 = poly[w2][1] - size;
          var q2 = poly[(w2 + 1) % poly.length];
          var qx2 = q2[0] - size, qy2 = q2[1] - size;
          var mx2 = (px2 + qx2) / 2, my2 = (py2 + qy2) / 2;
          var ix2 = mx2 + (site.x - mx2) * 0.12, iy2 = my2 + (site.y - my2) * 0.12;
          if (w2 === 0) c.moveTo(ix2, iy2); else c.lineTo(ix2, iy2);
        }
        c.closePath();
        c.strokeStyle = rgba(lightenHex(col, 0.55), 0.28);
        c.lineWidth = Math.max(0.5, o * 0.45);
        c.stroke();
      }

      /* the seed dot */
      capDot(c, site.x, site.y, Math.max(0.7, T * 0.040), darken(col, 0.45));
    }
  }

  function hash2(seed, i, j, s) {
    var h = (seed ^ Math.imul((i | 0) + 1, 374761393) ^ Math.imul((j | 0) + 1, 668265263) ^ Math.imul(s | 0, 1274126177)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /* =======================================================================
     PLAID — overlapping translucent bands, like tartan.
     Two layers of wide stripes at right angles plus a fine twill line. The
     colour where two bands cross comes out naturally darker, which is what
     makes plaid read correctly.
     ======================================================================= */
  function plaid(S) {
    var c = S.c, p = S.p, T = S.T, lw = S.lw, D = S.D;
    var cols = colsOf(S);
    var band = T * clamp(num(p.plaidWidth) / 100, 0.2, 0.9);
    var gap = T - band;
    var step = T;
    var n = Math.ceil(D / step) + 2;
    n = Math.min(n, 160);

    /* base cloth */
    c.fillStyle = rgba(cols[0], 0.16);
    c.fillRect(-D, -D, D * 2, D * 2);

    /* One band in four is a thin "accent" line, as tartan sett does. Without
       it the surface is a plain gingham hoist, not a plaid. */
    var alpha = 0.16 + clamp(num(p.plaidDensity) / 100, 0, 1) * 0.24;

    c.globalCompositeOperation = "source-over";

    for (var i = -n; i <= n; i++) {
      var x = i * step;
      var colA = cols[mod(i, 4)];
      var isAccent = mod(i, 4) === 3;
      /* horizontal band */
      c.fillStyle = rgba(colA, isAccent ? Math.min(1, alpha * 2.1) : alpha);
      c.fillRect(x, -D, isAccent ? band * 0.34 : band, D * 2);
      /* vertical band */
      var colB = cols[mod(i + 1, 4)];
      var isAccent2 = mod(i + 1, 4) === 3;
      c.fillStyle = rgba(colB, isAccent2 ? Math.min(1, alpha * 2.1) : alpha);
      c.fillRect(-D, x, D * 2, isAccent2 ? band * 0.34 : band);
    }

    /* the fine twill line, always on the diagonal, in the palest colour */
    c.beginPath();
    for (var t = -n; t <= n; t++) {
      var off = t * T * 0.5;
      c.moveTo(-D + off, -D);
      c.lineTo(-D + off + D * 2, D);
    }
    c.strokeStyle = rgba(cols[3], 0.14);
    c.lineWidth = Math.max(0.5, lw * 0.4);
    c.stroke();

    /* warp and weft streaks, the fine lines that make cloth read as cloth */
    c.beginPath();
    var step2 = Math.max(2, (band + gap) / 9);
    for (var g = -n * 9; g <= n * 9; g++) {
      var gy = g * step2;
      c.moveTo(-D, gy); c.lineTo(D, gy);
      c.moveTo(gy, -D); c.lineTo(gy, D);
    }
    c.strokeStyle = "rgba(255,255,255,0.055)";
    c.lineWidth = Math.max(0.4, lw * 0.22);
    c.stroke();
  }

  ENG.interlace = interlace;
  ENG.meander = meander;
  ENG.scallop = scallop;
  ENG.blocks = blocks;
  ENG.girih = girih;
  ENG.voronoi = voronoi;
  ENG.plaid = plaid;

  window.InkworkEngines = ENG;
})();