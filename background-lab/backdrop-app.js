/* =========================================================================
   BACKDROP: backdrop-app.js
   Controls, saved recipe, handoff to the three generators, image saving.
   The drawing itself lives in ../shared/backdrop-engine.js.
   ========================================================================= */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  var canvas = $("mainCanvas");
  var sheet = $("sheet");
  var handle = $("sheetHandle");
  var toastEl = $("toast");
  var handoff = $("handoff");

  var CONTROLS = [
    "style", "seed", "scale", "rotation", "palette", "colors", "contrast",
    "grain", "vignette", "size", "filename"
  ];

  /* The same size list as the three generators, so a background saved here can
     be used at any size the artwork can be saved at. */
  var SIZES = {
    square: [1500, 1500],
    portrait: [1080, 1620],
    a17: [1080, 2340],
    landscape: [1920, 1080],
    large: [3000, 3000],
    print: [4000, 4000],
    phone: [1080, 2400]
  };

  var STYLE_NAMES = {
    weave: "Weave", tartan: "Tartan", plaid: "Plaid", herringbone: "Herringbone",
    twill: "Twill", basket: "Basket", ikat: "Ikat", kilim: "Kilim",
    shibori: "Shibori", damask: "Damask", jacquard: "Jacquard",
    cyanotype: "Cyanotype", paper: "Paper", suminagashi: "Suminagashi",
    grid: "Grid", dots: "Dots", glow: "Glow", smoke: "Smoke",
    guilloche: "Guilloche", starquilt: "Star quilt",
    filament: "Filament", moire: "Moiré",
    quasicrystal: "Quasicrystal", hyperbolic: "Hyperbolic tiling",
    cymatic: "Cymatic plate", kaleido: "Kaleidoscope fold",
    rosewindow: "Rose window", peacock: "Peacock plume",
    harmonograph: "Harmonograph rosette", cosmati: "Cosmati floor"
  };

  /* Per-style settings. The engine reads these from R.opts with a default, so
     the default shown here must match the default in the engine. Only styles
     with an entry have a "Style detail" group in the sheet. */
  var STYLE_OPTS = {
    quasicrystal: [
      { key: "fold", label: "Fold", min: 4, max: 14, step: 1, def: 8 },
      { key: "sharp", label: "Band sharpness", min: 0, max: 100, step: 5, def: 55 },
      { key: "bands", label: "Bands", min: 2, max: 10, step: 1, def: 5 },
      { key: "density", label: "Density", min: 0, max: 100, step: 5, def: 55 }
    ],
    hyperbolic: [
      { key: "base", label: "Tiles in the first ring", min: 3, max: 12, step: 1, def: 6 },
      { key: "depth", label: "Rings", min: 3, max: 12, step: 1, def: 7 },
      { key: "curve", label: "Inward curve", min: 0, max: 100, step: 5, def: 60 },
      { key: "grout", label: "Grout", min: 0, max: 100, step: 5, def: 30 }
    ],
    cymatic: [
      { key: "modeA", label: "Mode across", min: 1, max: 14, step: 1, def: 4 },
      { key: "modeB", label: "Mode down", min: 1, max: 14, step: 1, def: 7 },
      { key: "lineWidth", label: "Sand line width", min: 0, max: 100, step: 5, def: 45 },
      { key: "glow", label: "Halo", min: 0, max: 100, step: 5, def: 50 }
    ],
    kaleido: [
      { key: "fold", label: "Mirror fold", min: 3, max: 16, step: 1, def: 8 },
      { key: "shards", label: "Shards", min: 4, max: 48, step: 1, def: 16 },
      { key: "softness", label: "Softness", min: 0, max: 100, step: 5, def: 40 }
    ],
    rosewindow: [
      { key: "rings", label: "Rings", min: 2, max: 6, step: 1, def: 3 },
      { key: "petals", label: "Panes in the first ring", min: 4, max: 24, step: 1, def: 12 },
      { key: "lead", label: "Lead thickness", min: 0, max: 100, step: 5, def: 55 }
    ],
    peacock: [
      { key: "rings", label: "Rings", min: 2, max: 6, step: 1, def: 4 },
      { key: "perRing", label: "Eyes in the first ring", min: 4, max: 20, step: 1, def: 12 },
      { key: "barbs", label: "Feather barbs", min: 0, max: 100, step: 5, def: 55 },
      { key: "iridescence", label: "Iridescence", min: 0, max: 100, step: 5, def: 70 }
    ],
    harmonograph: [
      { key: "curves", label: "Curves", min: 2, max: 20, step: 1, def: 9 },
      { key: "petals", label: "Mirror petals", min: 3, max: 16, step: 1, def: 7 },
      { key: "decay", label: "Damping", min: 0, max: 100, step: 5, def: 40 },
      { key: "fine", label: "Line brightness", min: 0, max: 100, step: 5, def: 60 }
    ],
    cosmati: [
      { key: "rings", label: "Rings", min: 2, max: 7, step: 1, def: 4 },
      { key: "tiles", label: "Tiles in the first ring", min: 6, max: 28, step: 1, def: 16 },
      { key: "grout", label: "Grout gap", min: 0, max: 100, step: 5, def: 40 },
      { key: "spin", label: "Twist between rings", min: 0, max: 100, step: 5, def: 25 }
    ]
  };

  /* Every radial style has an edge fade, so it is offered once for all. The
     default per style matches the default in the engine, so choosing a style
     for the first time looks exactly as it did before these controls existed. */
  var FADE_OPT = { key: "fade", label: "Edge fade", min: 0, max: 100, step: 5, def: 55 };
  var FADE_DEFAULTS = {
    quasicrystal: 65, hyperbolic: 55, cymatic: 45, kaleido: 60,
    rosewindow: 40, peacock: 55, harmonograph: 60, cosmati: 50
  };

  /* Settings are remembered per style in this session, so switching styles
     back and forth does not lose work. */
  var optCache = {};

  var PALETTE_NAMES = {
    ink: "Ink", forest: "Forest", linen: "Linen", indigo: "Indigo",
    clay: "Clay", slate: "Slate", sage: "Sage", plum: "Plum",
    wheat: "Wheat", rust: "Rust", ice: "Ice", paper: "Paper",
    carbon: "Carbon", blush: "Blush"
  };

  var SIZE_NAMES = {
    square: "Square", portrait: "Portrait", a17: "Samsung A17",
    landscape: "Landscape", large: "Large", print: "Print", phone: "My phone"
  };

  /* The recipe key. A tool that opens from here reads the same key, so the
     background is live and is redrawn at whatever size it saves. */
  var RECIPE_KEY = "mathgen_bg_v1";

  /* ------------------------------------------------------------- preview */
  var PREVIEW_MAX = 1100;
  var renderTimer = null;

  function v(id) {
    var el = $(id);
    return el ? el.value : "";
  }

  function readRecipe() {
    return {
      style: v("style"),
      seed: v("seed"),
      scale: Number(v("scale")),
      rotation: Number(v("rotation")),
      palette: v("palette"),
      colors: Number(v("colors")),
      contrast: Number(v("contrast")),
      grain: Number(v("grain")),
      vignette: Number(v("vignette")),
      opts: readOpts(v("style"))
    };
  }

  /* The per-style settings for one style, from the cached values or the
     engine's defaults. Only numbers are stored, so a recipe stays small. */
  function readOpts(style) {
    var list = STYLE_OPTS[style];
    if (!list) return {};
    var cache = optCache[style] || (optCache[style] = {});
    var out = {};
    list.concat(FADE_OPT).forEach(function (o) {
      var v2 = cache[o.key];
      out[o.key] = v2 === undefined ? fadeDefault(style, o) : v2;
    });
    return out;
  }

  function fadeDefault(style, o) {
    if (o.key !== "fade") return o.def;
    var d = FADE_DEFAULTS[style];
    return d !== undefined ? d : o.def;
  }

  function drawTo(target, W, H, recipe) {
    target.width = W;
    target.height = H;
    var ctx = target.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    window.Backdrop.draw(ctx, W, H, recipe);
  }

  function renderPreview() {
    var r = readRecipe();
    var size = SIZES[v("size")] || SIZES.portrait;
    var f = Math.min(1, PREVIEW_MAX / Math.max(size[0], size[1]));
    drawTo(canvas, Math.round(size[0] * f), Math.round(size[1] * f), r);
    layoutCanvas();
  }

  function layoutCanvas() {
    /* Fit the square preview inside the space above the sheet, keeping the
       artwork's own aspect ratio so what you see matches the saved file. */
    var size = SIZES[v("size")] || SIZES.portrait;
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
    else if (id === "palette") el.textContent = PALETTE_NAMES[raw] || raw;
    else if (id === "size") el.textContent = SIZE_NAMES[raw] || raw;
    else if (id === "rotation") el.textContent = raw + "°";
    else if (id === "seed") el.textContent = raw || "—";
    else if (id === "filename") el.textContent = raw || "—";
    else el.textContent = raw;
  }

  function syncAll() {
    CONTROLS.forEach(syncBadge);
  }

  /* ------------------------------------------------------------ swatches */
  function buildSwatches() {
    var grid = $("swatchGrid");
    if (!grid) return;
    grid.innerHTML = "";
    window.Backdrop.paletteNames.forEach(function (name) {
      var cols = window.Backdrop.palettes[name];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch" + (v("palette") === name ? " on" : "");
      btn.setAttribute("data-palette", name);
      btn.setAttribute("aria-label", name);
      cols.slice(0, 4).forEach(function (c) {
        var s = document.createElement("span");
        s.style.background = c;
        btn.appendChild(s);
      });
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

  /* ---------------------------------------------------- per-style detail */
  /* Rebuild the "Style detail" group for the style now chosen. Rows are built
     from STYLE_OPTS, so adding a style's controls is one data entry. */
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

    list.concat(FADE_OPT).forEach(function (o) {
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
      val.id = "opt_" + style + "_" + o.key + "Val";
      val.textContent = cache[o.key] === undefined ? fadeDefault(style, o) : cache[o.key];
      inner.appendChild(name);
      inner.appendChild(val);

      var control = document.createElement("div");
      control.className = "settingControl";
      var slider = document.createElement("input");
      slider.type = "range";
      slider.className = "bigSlider";
      slider.min = o.min; slider.max = o.max; slider.step = o.step;
      slider.value = cache[o.key] === undefined ? fadeDefault(style, o) : cache[o.key];
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
    syncBadge("seed");
    schedule();
  });

  $("btnShuffleStyle").addEventListener("click", function (e) {
    e.stopPropagation();
    var names = Object.keys(window.Backdrop.styles);
    $("style").value = names[Math.floor(Math.random() * names.length)];
    syncBadge("style");
    buildStyleDetail();
    updateHeader();
    schedule();
  });

  $("btnRandomize").addEventListener("click", function () {
    var names = Object.keys(window.Backdrop.styles);
    $("style").value = names[Math.floor(Math.random() * names.length)];
    $("seed").value = randomSeed();
    var pals = window.Backdrop.paletteNames;
    $("palette").value = pals[Math.floor(Math.random() * pals.length)];
    $("scale").value = 20 + Math.floor(Math.random() * 70);
    $("rotation").value = Math.floor(Math.random() * 7) * 15;
    $("colors").value = 2 + Math.floor(Math.random() * 5);
    $("contrast").value = 40 + Math.floor(Math.random() * 4) * 10;
    $("grain").value = Math.floor(Math.random() * 4) * 10;
    $("vignette").value = Math.floor(Math.random() * 3) * 15;
    /* New per-style values too, so randomise gives a genuinely different
       specimen rather than the same default detail every time. */
    var list = STYLE_OPTS[v("style")];
    if (list) {
      var cache = optCache[v("style")] || (optCache[v("style")] = {});
      list.forEach(function (o) {
        var steps = Math.round((o.max - o.min) / o.step);
        cache[o.key] = o.min + Math.round(Math.random() * steps) * o.step;
      });
      buildStyleDetail();
    }
    syncAll();
    buildSwatches();
    updateHeader();
    schedule();
  });

  $("btnExport").addEventListener("click", exportImage);

  $("btnGenerate").addEventListener("click", function () {
    saveRecipe();
    sheet.classList.remove("open");
    handoff.classList.add("show");
  });

  $("handoffClose").addEventListener("click", function () {
    handoff.classList.remove("show");
  });

  handoff.addEventListener("click", function (e) {
    if (e.target === handoff) handoff.classList.remove("show");
  });

  /* Any "open in" button saves the recipe first, then navigates. */
  document.querySelectorAll("[data-open]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      saveRecipe();
      var tool = btn.getAttribute("data-open");
      window.location.href = "../" + tool + "/index.html?bg=1";
    });
  });

  function updateHeader() {
    $("sheetLabel").textContent = PALETTE_NAMES[v("palette")] || "Backdrop";
  }

  /* ------------------------------------------------------------ functions */
  function randomSeed() {
    var words = ["weft", "warp", "loom", "dye", "vat", "reed", "shuttle",
      "indigo", "madder", "woad", "silk", "hemp", "clay", "ash", "lime"];
    var w = words[Math.floor(Math.random() * words.length)];
    return w + "-" + Math.floor(Math.random() * 9000 + 1000);
  }

  function saveRecipe() {
    try {
      localStorage.setItem(RECIPE_KEY, JSON.stringify(readRecipe()));
    } catch (e) {
      toast("Could not save the background on this phone.");
    }
  }

  /* Put a saved recipe back into the controls, so reopening the tool shows
     the background that the generators are using. Unknown style keys are
     ignored rather than clearing the sheet. */
  function restoreRecipe() {
    var raw = null;
    try { raw = localStorage.getItem(RECIPE_KEY); } catch (e) { return; }
    if (!raw) return;
    var r;
    try { r = JSON.parse(raw); } catch (e) { return; }
    if (!r || typeof r !== "object") return;

    if (r.style && window.Backdrop.styles[r.style]) $("style").value = r.style;
    ["seed", "palette", "scale", "rotation", "colors", "contrast",
     "grain", "vignette"].forEach(function (k) {
      if (r[k] === undefined || r[k] === null) return;
      var el = $(k);
      if (!el) return;
      if (k === "palette" && !window.Backdrop.palettes[r.palette]) return;
      el.value = r[k];
    });
    if (r.opts && typeof r.opts === "object") {
      var style = v("style");
      var list = STYLE_OPTS[style];
      if (list) {
        var cache = optCache[style] || (optCache[style] = {});
        list.concat(FADE_OPT).forEach(function (o) {
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
    return s || "backdrop";
  }

  function exportImage() {
    var size = SIZES[v("size")] || SIZES.portrait;
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
        if (!blob) {
          toast("Could not make the image.");
          return;
        }
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = cleanName(v("filename")) + ".png";
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
  syncAll();
  buildSwatches();
  buildStyleDetail();
  updateHeader();
  renderPreview();
  window.addEventListener("resize", layoutCanvas);
})();