/* =========================================================================
   MANDALA: mandala-app.js
   Controls, randomiser, presets, image saving.
   The drawing itself lives in mandala-engine.js.
   ========================================================================= */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  var canvas = $("mainCanvas");
  var sheet = $("sheet");
  var handle = $("sheetHandle");
  var toastEl = $("toast");

  var CONTROLS = [
    "style", "seed", "palette", "colors", "contrast", "rotation",
    "grain", "vignette", "size", "filename"
  ];

  /* The same size list as the other tools, so a mandala can be used at any
     size the rest of the toolbox saves at. */
  var SIZES = {
    square: [1500, 1500],
    portrait: [1080, 1620],
    a17: [1080, 2340],
    landscape: [1920, 1080],
    large: [3000, 3000],
    print: [4000, 4000],
    phone: [1080, 2400]
  };
  var SIZE_NAMES = {
    square: "Square 1500", portrait: "Portrait 1080×1620", a17: "Samsung A17",
    landscape: "Landscape 1920×1080", large: "Large 3000", print: "Print 4000",
    phone: "My phone 1080×2400"
  };

  var STYLE_NAMES = {
    kaleido: "Kaleido fractal",
    filigree: "Orbit filigree",
    lattice: "Lattice mandala",
    rosette: "Spirograph rosette",
    tunnel: "Tunnel rings",
    bloom: "Bloom field"
  };

  /* Per-style settings. The engine reads these from opts with a default, so
     the default here must match the engine. Only styles with an entry get a
     "Style detail" group. */
  var STYLE_OPTS = {
    kaleido: [
      { key: "fold", label: "Fold", min: 3, max: 24, step: 1, def: 10 },
      { key: "detail", label: "Detail", min: 40, max: 300, step: 10, def: 110 },
      { key: "zoom", label: "Zoom", min: 0, max: 100, step: 5, def: 55 },
      { key: "colour", label: "Colouring", min: 0, max: 3, step: 1, def: 0 },
      { key: "bands", label: "Colour bands", min: 1, max: 12, step: 1, def: 5 },
      { key: "warp", label: "Twist", min: 0, max: 100, step: 5, def: 40 },
      { key: "soft", label: "Softness", min: 0, max: 100, step: 5, def: 45 }
    ],
    filigree: [
      { key: "fold", label: "Fold", min: 3, max: 24, step: 1, def: 12 },
      { key: "detail", label: "Detail", min: 60, max: 400, step: 10, def: 170 },
      { key: "beads", label: "Lace density", min: 0, max: 100, step: 5, def: 50 },
      { key: "glow", label: "Glow", min: 0, max: 100, step: 5, def: 55 },
      { key: "zoom", label: "Zoom", min: 0, max: 100, step: 5, def: 55 },
      { key: "bands", label: "Colour bands", min: 1, max: 10, step: 1, def: 5 }
    ],
    lattice: [
      { key: "fold", label: "Fold", min: 3, max: 24, step: 1, def: 16 },
      { key: "rings", label: "Rings", min: 2, max: 14, step: 1, def: 7 },
      { key: "shape", label: "Ring shape", min: 0, max: 4, step: 1, def: 0 },
      { key: "widen", label: "Width", min: 0, max: 100, step: 5, def: 50 },
      { key: "detail", label: "Layers", min: 1, max: 5, step: 1, def: 3 }
    ],
    rosette: [
      { key: "fold", label: "Fold", min: 3, max: 24, step: 1, def: 9 },
      { key: "curves", label: "Curves", min: 2, max: 36, step: 1, def: 14 },
      { key: "inner", label: "Inner size", min: 0, max: 100, step: 5, def: 55 },
      { key: "wobble", label: "Wobble", min: 0, max: 100, step: 5, def: 35 },
      { key: "weight", label: "Line weight", min: 0, max: 100, step: 5, def: 40 },
      { key: "bands", label: "Colour bands", min: 1, max: 10, step: 1, def: 3 }
    ],
    tunnel: [
      { key: "fold", label: "Fold", min: 3, max: 24, step: 1, def: 8 },
      { key: "rings", label: "Rings", min: 4, max: 60, step: 1, def: 22 },
      { key: "spin", label: "Spiral", min: 0, max: 100, step: 5, def: 45 },
      { key: "mode", label: "Pattern", min: 0, max: 4, step: 1, def: 4 },
      { key: "bands", label: "Colour bands", min: 1, max: 10, step: 1, def: 3 }
    ],
    bloom: [
      { key: "fold", label: "Fold", min: 3, max: 24, step: 1, def: 7 },
      { key: "detail", label: "Detail", min: 30, max: 240, step: 10, def: 90 },
      { key: "petals", label: "Petals", min: 0, max: 100, step: 5, def: 55 },
      { key: "zoom", label: "Zoom", min: 0, max: 100, step: 5, def: 45 },
      { key: "bands", label: "Colour bands", min: 1, max: 12, step: 1, def: 4 },
      { key: "soft", label: "Softness", min: 0, max: 100, step: 5, def: 45 }
    ]
  };

  /* Everything a randomise pulls from. Kept in one place so "Randomise" and
     the opening picture stay in step. */
  var SEED_WORDS = ["rose", "star", "lace", "orbit", "veil", "seed", "tide",
    "bloom", "koi", "silk", "amber", "opal", "drift", "spire", "fern", "coral",
    "quartz", "petal", "ink", "halo"];
  var RECIPE_KEY = "mathgen_mandala_v1";
  var PREVIEW_MAX = 900;

  var optCache = {};

  /* ------------------------------------------------------------- preview */
  function v(id) {
    var el = $(id);
    return el ? el.value : "";
  }

  function readOpts(style) {
    var list = STYLE_OPTS[style];
    if (!list) return {};
    var cache = optCache[style] || (optCache[style] = {});
    var out = {};
    list.forEach(function (o) {
      out[o.key] = cache[o.key] === undefined ? o.def : cache[o.key];
    });
    return out;
  }

  function readRecipe() {
    return {
      style: v("style"),
      seed: v("seed"),
      palette: v("palette"),
      colors: Number(v("colors")),
      contrast: Number(v("contrast")),
      rotation: Number(v("rotation")),
      grain: Number(v("grain")),
      vignette: Number(v("vignette")),
      opts: readOpts(v("style"))
    };
  }

  function drawTo(target, W, H, recipe) {
    target.width = W;
    target.height = H;
    var ctx = target.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    window.Mandala.draw(ctx, W, H, recipe);
  }

  function renderPreview() {
    var r = readRecipe();
    var size = SIZES[v("size")] || SIZES.square;
    var f = Math.min(1, PREVIEW_MAX / Math.max(size[0], size[1]));
    drawTo(canvas, Math.round(size[0] * f), Math.round(size[1] * f), r);
    layoutCanvas();
  }

  function layoutCanvas() {
    var size = SIZES[v("size")] || SIZES.square;
    var ratio = size[1] / size[0];
    canvas.style.aspectRatio = size[0] + " / " + size[1];
    if (ratio > 1.05) {
      canvas.style.width = "min(78vw, 42vh)";
      canvas.style.height = "auto";
    } else if (ratio < 0.95) {
      canvas.style.width = "min(88vw, 68vh)";
      canvas.style.height = "auto";
    } else {
      canvas.style.width = "min(86vw, 56vh)";
      canvas.style.height = "auto";
    }
  }

  var renderTimer = null;
  function schedule() {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderPreview, 40);
  }

  /* -------------------------------------------------------------- badges */
  function syncBadge(id) {
    var el = $(id + "Val");
    if (!el) return;
    var raw = v(id);
    if (id === "style") el.textContent = STYLE_NAMES[raw] || raw;
    else if (id === "size") el.textContent = SIZE_NAMES[raw] || raw;
    else if (id === "rotation") el.textContent = raw + "°";
    else if (id === "seed") el.textContent = raw || "—";
    else if (id === "filename") el.textContent = raw || "—";
    else el.textContent = raw;
  }
  function syncAll() { CONTROLS.forEach(syncBadge); }

  /* ------------------------------------------------------------ swatches */
  function buildSwatches() {
    var grid = $("swatchGrid");
    if (!grid) return;
    grid.innerHTML = "";
    var names = window.Mandala.palettes;
    names.forEach(function (name) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch" + (v("palette") === name ? " on" : "");
      btn.setAttribute("data-palette", name);
      btn.setAttribute("aria-label", name);
      btn.title = name;
      /* a live preview of the ramp: seven stops around the ring */
      for (var i = 0; i < 7; i++) {
        var s = document.createElement("span");
        s.style.background = rampColour(name, i / 7);
        btn.appendChild(s);
      }
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        $("palette").value = name;
        syncBadge("palette");
        buildSwatches();
        schedule();
      });
      grid.appendChild(btn);
    });
  }

  /* A swatch colour from a palette ring, so the button shows the real look.
     The engine owns the ramps; this mirrors its wrap so the button matches. */
  function rampColour(name, t) {
    var stops = PALETTE_STOPS[name];
    if (!stops) return "#555";
    var n = stops.length;
    var x = ((t % 1) + 1) % 1 * n;
    var i0 = Math.floor(x) % n, i1 = (i0 + 1) % n, f = x - Math.floor(x);
    var a = stops[i0], b = stops[i1];
    var dh = b[0] - a[0];
    if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
    var h = a[0] + dh * f;
    var s = a[1] + (b[1] - a[1]) * f;
    var l = a[2] + (b[2] - a[2]) * f;
    return "hsl(" + Math.round(h) + "," + Math.round(s) + "%," + Math.round(l) + "%)";
  }

  /* A copy of the engine's palette rings, for the swatches only. Keep in step
     with PALETTES in mandala-engine.js. */
  var PALETTE_STOPS = {
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

  /* ---------------------------------------------------- per-style detail */
  function buildStyleDetail() {
    var group = $("styleDetailGroup");
    var host = $("styleDetailRows");
    if (!group || !host) return;
    var style = v("style");
    var list = STYLE_OPTS[style];
    host.innerHTML = "";
    if (!list) { group.hidden = true; return; }

    var cache = optCache[style] || (optCache[style] = {});
    group.hidden = false;

    list.forEach(function (o) {
      var row = document.createElement("div");
      row.className = "settingRow";
      row.setAttribute("data-key", "opt-" + o.key);

      var inner = document.createElement("div");
      inner.className = "settingRowInner";
      var name = document.createElement("span");
      name.className = "settingName";
      name.textContent = o.label;
      var val = document.createElement("span");
      val.className = "settingVal";
      val.textContent = cache[o.key] === undefined ? o.def : cache[o.key];
      inner.appendChild(name);
      inner.appendChild(val);

      var control = document.createElement("div");
      control.className = "settingControl";
      var slider = document.createElement("input");
      slider.type = "range";
      slider.className = "bigSlider";
      slider.min = o.min; slider.max = o.max; slider.step = o.step;
      slider.value = cache[o.key] === undefined ? o.def : cache[o.key];
      slider.addEventListener("input", function () {
        cache[o.key] = Number(slider.value);
        val.textContent = slider.value;
        schedule();
      });
      control.appendChild(slider);

      inner.addEventListener("click", function (e) {
        if (e.target === slider) return;
        var wasActive = row.classList.contains("active");
        host.querySelectorAll(".settingRow.active").forEach(function (r) {
          r.classList.remove("active");
        });
        if (!wasActive) row.classList.add("active");
      });

      row.appendChild(inner);
      row.appendChild(control);
      host.appendChild(row);
    });
  }

  /* --------------------------------------------------------------- sheet */
  handle.addEventListener("click", function (e) {
    if (e.target.closest(".generateBtn")) return;
    sheet.classList.toggle("open");
  });
  canvas.addEventListener("click", function () { sheet.classList.remove("open"); });

  document.querySelectorAll(".settingRow").forEach(function (row) {
    row.addEventListener("click", function (e) {
      if (e.target.closest(".settingControl") && row.classList.contains("active")) return;
      var wasActive = row.classList.contains("active");
      document.querySelectorAll(".settingRow.active").forEach(function (r) {
        r.classList.remove("active");
      });
      if (!wasActive) row.classList.add("active");
    });
  });

  /* -------------------------------------------------------------- wiring */
  function onControlChange(id) {
    syncBadge(id);
    if (id === "palette") buildSwatches();
    if (id === "size") layoutCanvas();
    if (id === "style") buildStyleDetail();
    schedule();
  }

  CONTROLS.forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener("input", function () { onControlChange(id); });
    el.addEventListener("change", function () { onControlChange(id); });
  });

  $("btnNewSeed").addEventListener("click", function (e) {
    e.stopPropagation();
    $("seed").value = randomSeed();
    refreshAll();
  });

  $("btnShuffleStyle").addEventListener("click", function (e) {
    e.stopPropagation();
    var names = window.Mandala.styles;
    $("style").value = names[Math.floor(Math.random() * names.length)];
    buildStyleDetail();
    refreshAll();
  });

  /* Randomise is the main way this tool is meant to be used, so it pulls
     everything: style, seed, palette and every setting of that style. */
  $("btnRandomize").addEventListener("click", function () {
    randomiseAll();
  });

  $("btnExport").addEventListener("click", exportImage);
  $("btnSaveWide").addEventListener("click", function (e) { e.stopPropagation(); exportImage(); });

  $("btnGenerate").addEventListener("click", function () {
    saveRecipe();
    sheet.classList.remove("open");
    toast("Look saved");
  });

  function refreshAll() {
    syncAll();
    buildSwatches();
    buildStyleDetail();
    updateHeader();
    schedule();
  }

  function updateHeader() {
    $("sheetLabel").textContent = STYLE_NAMES[v("style")] || "Mandala";
  }

  /* ------------------------------------------------------------ functions */
  function randomSeed() {
    var w = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
    return w + "-" + Math.floor(Math.random() * 9000 + 1000);
  }

  function pickInt(o) {
    var steps = Math.round((o.max - o.min) / o.step);
    return o.min + Math.round(Math.random() * steps) * o.step;
  }

  /* Rich palettes are picked more often than the pale ones. A flat draw over
     all fourteen landed on petal, chalk, orchid and verdigris over half the
     time, which gave soft pastel pictures; the bold ones are what this tool
     is for. */
  var RICH = {
    spectrum: 5, sunrise: 5, ember: 5, neon: 4, acid: 4, gold: 4,
    lagoon: 4, iris: 3, tide: 3, orchid: 3, abyss: 3, verdigris: 2,
    petal: 2, chalk: 1
  };

  function randomPalette() {
    var names = window.Mandala.palettes;
    var total = 0, i;
    for (i = 0; i < names.length; i++) total += RICH[names[i]] || 1;
    var pick = Math.random() * total;
    for (i = 0; i < names.length; i++) {
      pick -= RICH[names[i]] || 1;
      if (pick <= 0) return names[i];
    }
    return names[0];
  }

  function randomiseAll() {
    var styles = window.Mandala.styles;
    var style = styles[Math.floor(Math.random() * styles.length)];
    $("style").value = style;
    $("seed").value = randomSeed();

    $("palette").value = randomPalette();

    $("contrast").value = 55 + Math.floor(Math.random() * 5) * 10;
    $("rotation").value = Math.floor(Math.random() * 12) * 30;
    $("grain").value = Math.floor(Math.random() * 3) * 10;
    $("vignette").value = Math.floor(Math.random() * 3) * 15;

    var list = STYLE_OPTS[style];
    if (list) {
      var cache = optCache[style] || (optCache[style] = {});
      list.forEach(function (o) { cache[o.key] = pickInt(o); });
    }
    buildStyleDetail();
    refreshAll();
  }

  function saveRecipe() {
    try {
      localStorage.setItem(RECIPE_KEY, JSON.stringify(readRecipe()));
    } catch (e) {
      toast("Could not save on this phone.");
    }
  }

  /* Put a saved look back into the controls, so reopening the tool shows the
     picture that was saved. Unknown keys are ignored. */
  function restoreRecipe() {
    var raw = null;
    try { raw = localStorage.getItem(RECIPE_KEY); } catch (e) { return; }
    if (!raw) return;
    var r;
    try { r = JSON.parse(raw); } catch (e) { return; }
    if (!r || typeof r !== "object") return;

    if (r.style && window.Mandala.styles.indexOf(r.style) >= 0) $("style").value = r.style;
    ["seed", "palette", "contrast", "rotation", "grain", "vignette"].forEach(function (k) {
      if (r[k] === undefined || r[k] === null) return;
      var el = $(k);
      if (el) el.value = r[k];
    });
    if (r.opts && typeof r.opts === "object") {
      var style = v("style");
      var list = STYLE_OPTS[style];
      if (list) {
        var cache = optCache[style] || (optCache[style] = {});
        list.forEach(function (o) {
          var n = Number(r.opts[o.key]);
          if (isFinite(n)) cache[o.key] = clamp(n, o.min, o.max);
        });
      }
    }
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(function () { toastEl.classList.remove("show"); }, 1800);
  }

  function cleanName(s) {
    s = String(s || "").replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "-");
    return s || "mandala";
  }

  function exportImage() {
    var size = SIZES[v("size")] || SIZES.square;
    var recipe = readRecipe();
    var out = document.createElement("canvas");
    var btn = $("btnExport");
    btn.classList.add("busy");
    toast("Making " + size[0] + "×" + size[1] + "…");

    setTimeout(function () {
      try {
        drawTo(out, size[0], size[1], recipe);
      } catch (err) {
        btn.classList.remove("busy");
        toast("Could not draw at that size. Try a smaller one.");
        return;
      }
      out.toBlob(function (blob) {
        btn.classList.remove("busy");
        if (!blob) { toast("Could not make the image."); return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = cleanName(v("filename") || v("seed")) + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2500);
        toast("Saved PNG");
      }, "image/png");
    }, 30);
  }

  /* ---------------------------------------------------------------- start */
  restoreRecipe();
  if (!v("seed")) $("seed").value = randomSeed();
  buildSwatches();
  buildStyleDetail();
  syncAll();
  updateHeader();
  renderPreview();
  window.addEventListener("resize", layoutCanvas);
})();