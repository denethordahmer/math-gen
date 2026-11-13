/* =========================================================================
   FLOW FIELD: flow-app.js
   Controls, colours, colour picker, saved looks, saving images.
   The drawing itself lives in flow-field.js (window.FlowField).
   ========================================================================= */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  var canvas = $("flowCanvas");
  var backdrop = $("flowBackdrop");
  var sheet = $("sheet");
  var handle = $("sheetHandle");

  /* every control that belongs to a saved look */
  var CONTROLS = [
    "engine", "seed",
    "particles", "featureSize", "curl", "direction", "mirror", "lineWeight", "opacity",
    "steps", "stepSize",
    "engraveGap", "engraveWobble",
    "ribbonWidth",
    "silkLength",
    "contourLevels", "contourBand",
    "tickGap", "tickLength", "tickJitter",
    "vortexTurn", "vortexTurb",
    "colorMode", "color1", "color2", "color3", "color4",
    "bgStyle", "bgColor", "bgColor2", "bgTransparent",
    "finish", "size", "format", "filename"
  ];
  var COLOR_IDS = ["color1", "color2", "color3", "color4", "bgColor", "bgColor2"];
  var BG_ON_KEY = "mathgen_bg_on_flow";

  var SIZES = {
    square:    [1500, 1500],
    portrait:  [1080, 1620],
    landscape: [1920, 1080],
    a17:       [1080, 2340],
    desktop:   [1920, 1080],
    large:     [3000, 3000],
    print:     [4000, 4000]
  };

  var ENGINE_NAMES = {
    flow: "Flow lines", engrave: "Engraving", ribbons: "Ribbons", vortex: "Vortex",
    stipple: "Stipple", ticks: "Ticks", silk: "Silk", contour: "Contour"
  };
  var SELECT_LABELS = {
    colorMode: {
      solid: "Solid", gradient: "Gradient", tricolor: "Tri-colour", multistop: "Multi-stop",
      spectrum: "Spectrum", monochrome: "Monochrome", duotone: "Duotone",
      complementary: "Complementary", splitcomp: "Split-comp", analogous: "Analogous",
      triadic: "Triadic", tetradic: "Tetradic", warm: "Warm", cool: "Cool", noise: "Noise"
    },
    direction: {
      horizontal: "Horizontal", vertical: "Vertical", diagonal: "Diagonal",
      radial: "Radial", chaotic: "Scattered"
    },
    mirror: { none: "None", kaleido: "Four-way" },
    bgStyle: { solid: "Solid", linear: "Vertical", diagonal: "Diagonal", radial: "Radial" },
    finish: { none: "None", grain: "Grain", vignette: "Vignette", both: "Grain and vignette" },
    format: { png: "PNG", jpg: "JPG" },
    size: {
      square: "Square 1500×1500", portrait: "Portrait 1080×1620",
      landscape: "Landscape 1920×1080", a17: "A17 1080×2340",
      desktop: "Desktop 1920×1080", large: "Large 3000×3000",
      print: "Print 4000×4000"
    }
  };

  /* -----------------------------------------------------------------------
     SMALL CONFIRMATION MESSAGE
  ----------------------------------------------------------------------- */
  var toastEl = $("toast"), toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
      toastTimer = null;
    }, 2200);
  }

  /* -----------------------------------------------------------------------
     COLOUR MATHS (shared with the picker only; the engine has its own copy)
  ----------------------------------------------------------------------- */
  function hexToRgb(hex) {
    var h = String(hex || "#000000").replace("#", "");
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
  function hslToRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360; s /= 100; l /= 100;
    if (s === 0) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function hue(t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)];
  }
  function hslHex(h, s, l) {
    var c = hslToRgb(h, s, l);
    return rgbToHex(c[0], c[1], c[2]);
  }
  function hsvToRgb(h, s, v) {
    h = (((h % 360) + 360) % 360) / 60;
    var i = Math.floor(h), f = h - i;
    var p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f)), r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d !== 0) {
      if (mx === r)      h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else               h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, mx === 0 ? 0 : d / mx, mx];
  }

  /* Schemes that build themselves from Colour 1 */
  var BUILD_SCHEMES = ["spectrum", "monochrome", "complementary", "splitcomp",
                       "analogous", "triadic", "tetradic", "warm", "cool"];
  var BASE_MODES = BUILD_SCHEMES.concat(["noise"]);

  function setColor(id, hex) {
    var el = $(id);
    if (el) el.value = hex;
    var dot = $(id + "Dot");
    if (dot) dot.style.background = hex;
  }

  /* Fill Colours 2-4 from a base colour, keeping its shade. */
  function buildScheme(name, c1hex) {
    var hsl = rgbToHsl.apply(null, hexToRgb(c1hex));
    var h = hsl[0], S = Math.max(35, hsl[1]), L = clamp(hsl[2], 25, 72);
    function set(id, col) { setColor(id, rgbToHex(col[0], col[1], col[2])); }
    switch (name) {
      case "complementary":
        set("color2", hslToRgb(h + 180, S, L));
        set("color3", hslToRgb(h + 180, S * 0.7, L * 1.25));
        set("color4", hslToRgb(h, S * 0.8, L * 1.35));
        break;
      case "splitcomp":
        set("color2", hslToRgb(h + 150, S, L));
        set("color3", hslToRgb(h + 210, S, L));
        set("color4", hslToRgb(h, S * 0.7, L * 1.3));
        break;
      case "analogous":
        set("color2", hslToRgb(h - 30, S, L));
        set("color3", hslToRgb(h + 30, S, L));
        set("color4", hslToRgb(h + 60, S * 0.85, L * 1.15));
        break;
      case "triadic":
        set("color2", hslToRgb(h + 120, S, L));
        set("color3", hslToRgb(h + 240, S, L));
        set("color4", hslToRgb(h + 120, S * 0.6, L * 1.35));
        break;
      case "tetradic":
        set("color2", hslToRgb(h + 90, S, L));
        set("color3", hslToRgb(h + 180, S, L));
        set("color4", hslToRgb(h + 270, S, L));
        break;
      case "monochrome":
        set("color2", hslToRgb(h, S * 0.85, clamp(L * 1.4, 8, 92)));
        set("color3", hslToRgb(h, S * 0.6, clamp(L * 0.7, 6, 88)));
        set("color4", hslToRgb(h, S * 0.4, clamp(L * 1.75, 8, 94)));
        break;
      case "spectrum":
      case "warm":
      case "cool":
        set("color2", hslToRgb(h + 60, S, L));
        set("color3", hslToRgb(h + 120, S, L));
        set("color4", hslToRgb(h + 180, S, L));
        break;
      default:
        break;
    }
  }

  /* -----------------------------------------------------------------------
     READ STATE
  ----------------------------------------------------------------------- */
  function n(id) { return parseFloat($(id).value) || 0; }
  function i(id) { return parseInt($(id).value, 10) || 0; }
  function v(id) { return $(id).value; }

  function readState() {
    var sz = SIZES[v("size")] || SIZES.square;
    return {
      engine: v("engine"),
      seed: v("seed"),
      W: sz[0], H: sz[1],
      particles: i("particles"),
      featureSize: i("featureSize"),
      curl: n("curl"),
      lineWeight: n("lineWeight"),
      opacity: n("opacity"),
      direction: v("direction"),
      mirror: v("mirror"),
      steps: i("steps"),
      stepSize: n("stepSize"),
      engraveGap: n("engraveGap"),
      engraveWobble: n("engraveWobble"),
      ribbonWidth: n("ribbonWidth"),
      silkLength: n("silkLength"),
      contourLevels: n("contourLevels"),
      contourBand: n("contourBand"),
      tickGap: n("tickGap"),
      tickLength: n("tickLength"),
      tickJitter: n("tickJitter"),
      vortexTurn: n("vortexTurn"),
      vortexTurb: n("vortexTurb"),
      colorMode: v("colorMode"),
      color1: v("color1"), color2: v("color2"),
      color3: v("color3"), color4: v("color4"),
      bgStyle: v("bgStyle"),
      bgColor: v("bgColor"), bgColor2: v("bgColor2"),
      bgTransparent: v("bgTransparent") === "true",
      finish: v("finish")
    };
  }

  /* -----------------------------------------------------------------------
     BACKGROUND
  ----------------------------------------------------------------------- */
  function paintBackground(ctx, W, H, s) {
    ctx.clearRect(0, 0, W, H);
    if (s.bgTransparent) return;
    if (s.bgStyle === "solid") {
      ctx.fillStyle = s.bgColor;
    } else {
      var g;
      if (s.bgStyle === "radial") {
        g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.62);
      } else if (s.bgStyle === "diagonal") {
        g = ctx.createLinearGradient(0, 0, W, H);
      } else {
        g = ctx.createLinearGradient(0, 0, 0, H);
      }
      g.addColorStop(0, s.bgColor);
      g.addColorStop(1, s.bgColor2);
      ctx.fillStyle = g;
    }
    ctx.fillRect(0, 0, W, H);
  }

  /* -----------------------------------------------------------------------
     RENDER
     Previews are drawn at a capped size and the canvas is then scaled by CSS
     to the space on screen. Saving always redraws at full resolution.
  ----------------------------------------------------------------------- */
  var PREVIEW_MAX = 1100;
  var renderTimer = null;
  var rendering = false;

  function renderTo(target, W, H, s, withBg) {
    target.width = W;
    target.height = H;
    var ctx = target.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    var paintedByHost = withBg && window.BgHost && window.BgHost.enabled("flow") && window.BgHost.paint(ctx, W, H);
    if (withBg && !paintedByHost) paintBackground(ctx, W, H, s);
    /* a touch of easing so background-only changes still clear cleanly */
    ctx.save();
    FlowField.draw(ctx, W, H, s);
    ctx.restore();
  }

  function previewScale(s) {
    return Math.min(1, PREVIEW_MAX / Math.max(s.W, s.H));
  }

  function renderPreview() {
    var s = readState();
    var f = previewScale(s);
    var W = Math.round(s.W * f), H = Math.round(s.H * f);
    renderTo(canvas, W, H, s, true);
    /* the backdrop is a small copy; blurring hides the low resolution */
    backdrop.width = 160;
    backdrop.height = Math.round(160 * s.H / s.W);
    var bc = backdrop.getContext("2d");
    paintBackground(bc, backdrop.width, backdrop.height, s);
    bc.drawImage(canvas, 0, 0, backdrop.width, backdrop.height);
    layoutCanvas();
  }

  function schedule() {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(function () {
      renderTimer = null;
      renderPreview();
    }, 70);
  }

  /* fit the bitmap into the space between the top bar and the sheet */
  function layoutCanvas() {
    var top = 56;
    /* measure the sheet rather than guess, so the two can never overlap */
    var sheetRect = sheet.getBoundingClientRect();
    var bottom = sheetRect.height + 10;
    var availH = Math.max(120, window.innerHeight - top - bottom - 8);
    var availW = Math.max(120, window.innerWidth - 24);
    var s = readState();
    var ar = s.W / s.H;
    var w = availW, h = w / ar;
    if (h > availH) { h = availH; w = h * ar; }
    canvas.style.width = Math.round(w) + "px";
    canvas.style.height = Math.round(h) + "px";
    canvas.style.top = Math.round(top + (availH - h) / 2) + "px";
    canvas.style.left = Math.round((window.innerWidth - w) / 2) + "px";
  }
  window.addEventListener("resize", layoutCanvas);
  /* the sheet animates its height, so re-fit when that animation settles */
  if (window.ResizeObserver) {
    new ResizeObserver(function () { layoutCanvas(); }).observe(sheet);
  }

  /* -----------------------------------------------------------------------
     RANDOMIZE
     Keeps style options that belong to the chosen engine only.
  ----------------------------------------------------------------------- */
  var ENGINE_RANDOM = {
    flow:    ["steps", "stepSize", "curl", "particles"],
    engrave: ["engraveGap", "engraveWobble", "curl", "lineWeight"],
    ribbons: ["ribbonWidth", "steps", "stepSize", "curl"],
    silk:    ["silkLength", "particles", "curl"],
    contour: ["contourLevels", "contourBand", "curl", "featureSize"],
    ticks:   ["tickGap", "tickLength", "tickJitter", "curl"],
    vortex:  ["vortexTurn", "vortexTurb", "steps", "particles"],
    stipple: ["particles", "lineWeight", "curl"]
  };

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function randomizeControl(id) {
    var el = $(id);
    if (!el) return;
    if (el.tagName === "SELECT") {
      el.selectedIndex = Math.floor(Math.random() * el.options.length);
    } else if (el.type === "range") {
      var mn = parseFloat(el.min), mx = parseFloat(el.max), st = parseFloat(el.step) || 1;
      var steps = Math.floor((mx - mn) / st);
      var val = mn + Math.floor(Math.random() * (steps + 1)) * st;
      el.value = String(Math.round(val * 1000) / 1000);
    }
  }

  var SEED_WORDS = ["drift", "ember", "silk", "ridge", "haze", "cirrus", "tidal", "nimbus",
                    "cinder", "atlas", "vellum", "slate", "mica", "aurora", "estuary", "gale"];

  function randomSeed() {
    return pick(SEED_WORDS) + "-" + (100 + Math.floor(Math.random() * 900));
  }

  /* Keeps engine, colour direction, mirror, background, size and file type. */
  function randomizeAll() {
    var engine = v("engine");
    $("seed").value = randomSeed();
    var keys = ENGINE_RANDOM[engine] || [];
    keys.forEach(function (id) {
      /* leave feature size and particle count in a sane usable band */
      if (id === "particles") {
        $("particles").value = String(400 + Math.floor(Math.random() * 26) * 100);
        return;
      }
      randomizeControl(id);
    });
    $("featureSize").value = String(25 + Math.floor(Math.random() * 71));
    $("opacity").value = (0.35 + Math.random() * 0.55).toFixed(2);
    $("colorMode").value = pick(Object.keys(SELECT_LABELS.colorMode));
    $("finish").value = pick(["none", "none", "grain", "vignette", "both"]);

    var c1 = hslHex(Math.random() * 360, 45 + Math.random() * 40, 40 + Math.random() * 22);
    setColor("color1", c1);
    if (BUILD_SCHEMES.indexOf(v("colorMode")) !== -1) {
      buildScheme(v("colorMode"), c1);
    } else {
      setColor("color2", hslHex(Math.random() * 360, 55, 58));
      setColor("color3", hslHex(Math.random() * 360, 55, 64));
      setColor("color4", hslHex(Math.random() * 360, 55, 52));
    }
    setTransparent(false);
    syncAllBadges();
    schedule();
    toast("New picture");
  }

  /* -----------------------------------------------------------------------
     BADGES AND VISIBILITY
  ----------------------------------------------------------------------- */
  function syncBadge(id) {
    var el = $(id), badge = $(id + "Val");
    if (!el || !badge) return;
    if (el.tagName === "SELECT") {
      var map = SELECT_LABELS[id];
      badge.textContent = (map && map[el.value]) || el.options[el.selectedIndex].text;
    } else {
      badge.textContent = el.value;
    }
  }

  function syncAllBadges() {
    "particles featureSize curl lineWeight opacity steps stepSize engraveGap engraveWobble " +
    "ribbonWidth silkLength contourLevels contourBand tickGap tickLength tickJitter " +
    "vortexTurn vortexTurb filename".split(" ").forEach(syncBadge);
    "engine colorMode direction mirror bgStyle finish format size".split(" ").forEach(syncBadge);
  }

  function updateVisibility() {
    var engine = v("engine");
    document.querySelectorAll("[data-engines]").forEach(function (el) {
      var ok = el.getAttribute("data-engines").split(" ").indexOf(engine) !== -1;
      el.classList.toggle("hidden", !ok);
    });
    /* Direction only colours; it is always meaningful, so it stays. */
    var mode = v("colorMode");
    var needs = {
      solid: [1, 0, 0, 0], gradient: [1, 1, 0, 0], tricolor: [1, 1, 1, 0],
      multistop: [1, 1, 1, 1], spectrum: [1, 0, 0, 0], monochrome: [1, 0, 0, 0],
      duotone: [1, 1, 0, 0], complementary: [1, 0, 0, 0], splitcomp: [1, 0, 0, 0],
      analogous: [1, 0, 0, 0], triadic: [1, 0, 0, 0], tetradic: [1, 0, 0, 0],
      warm: [1, 0, 0, 0], cool: [1, 0, 0, 0], noise: [1, 0, 0, 0]
    };
    var show = needs[mode] || [1, 0, 0, 0];
    ["color1Row", "color2Row", "color3Row", "color4Row"].forEach(function (id, k) {
      var row = $(id);
      if (row) row.classList.toggle("hidden", !show[k]);
    });
    var name1 = document.querySelector("#color1Row .settingName");
    if (name1) name1.textContent = BASE_MODES.indexOf(mode) !== -1 ? "Base colour" : "Colour 1";

    $("engineVal").textContent = ENGINE_NAMES[engine] || "Style";
    $("sheetLabel").textContent = ENGINE_NAMES[engine] || "Settings";
    updateBgRows();
  }

  function updateBgRows() {
    var trans = v("bgTransparent") === "true";
    var style = v("bgStyle");
    $("bgColor2Row").classList.toggle("hidden", style === "solid");
    ["bgStyle", "bgColor", "bgColor2"].forEach(function (key) {
      var row = document.querySelector('.settingRow[data-key="' + key + '"]');
      if (!row) return;
      row.classList.toggle("dimmed", trans);
      if (trans) row.setAttribute("data-note", "Transparent is on");
      else row.removeAttribute("data-note");
    });
  }

  function setTransparent(on) {
    $("bgTransparent").value = on ? "true" : "false";
    var tg = $("bgTransparentToggle");
    tg.setAttribute("data-on", on ? "true" : "false");
    tg.textContent = on ? "On" : "Off";
    $("bgTransparentVal").textContent = on ? "On" : "Off";
    updateBgRows();
  }

  /* The row shows the switch itself: stored choice first, then a ?bg=1 visit. */
  function hostOn() {
    var saved = null;
    try { saved = localStorage.getItem(BG_ON_KEY); } catch (e) { saved = null; }
    if (saved === "1") return true;
    if (saved === "0") return false;
    return (window.location.search || "").indexOf("bg=1") !== -1;
  }

  function setHost(on, persist) {
    if (persist !== false) {
      try {
        if (on) localStorage.setItem(BG_ON_KEY, "1");
        else localStorage.setItem(BG_ON_KEY, "0");
      } catch (e) { /* storage may be unavailable; the row still switches */ }
    }
    var tg = $("bgHostToggle");
    if (!tg) return;
    tg.setAttribute("data-on", on ? "true" : "false");
    tg.textContent = on ? "Backdrop: on" : "Backdrop: off";
    $("bgHostVal").textContent = on ? "On" : "Off";
  }

  /* -----------------------------------------------------------------------
     SHEET AND ROWS
  ----------------------------------------------------------------------- */
  handle.addEventListener("click", function (e) {
    if (e.target.closest(".generateBtn")) return;
    sheet.classList.toggle("open");
    layoutCanvas();
  });

  /* tapping the artwork dismisses the sheet, like the other tools */
  canvas.addEventListener("click", function () {
    if (sheet.classList.contains("open")) {
      sheet.classList.remove("open");
      layoutCanvas();
    }
  });

  document.querySelectorAll(".settingRow").forEach(function (row) {
    row.addEventListener("click", function (e) {
      var wasActive = row.classList.contains("active");
      if (e.target.closest(".settingControl") && wasActive) return;
      var key = row.getAttribute("data-key");
      document.querySelectorAll(".settingRow.active").forEach(function (r) { r.classList.remove("active"); });
      if (COLOR_IDS.indexOf(key) !== -1) {
        var nm = row.querySelector(".settingName");
        openPicker(key, nm ? nm.textContent : key);
        return;
      }
      if (!wasActive) row.classList.add("active");
    });
  });

  /* -----------------------------------------------------------------------
     WIRE CONTROLS
  ----------------------------------------------------------------------- */
  function onControlChange(id) {
    syncBadge(id);
    if (id === "engine") updateVisibility();
    if (id === "colorMode") updateVisibility();
    if (id === "bgStyle" || id === "bgTransparent") updateBgRows();
    if (id === "size") layoutCanvas();
    schedule();
  }

  CONTROLS.forEach(function (id) {
    var el = $(id);
    if (!el || el.type === "hidden") return;
    el.addEventListener("input", function () { onControlChange(id); });
    el.addEventListener("change", function () { onControlChange(id); });
  });

  $("bgTransparentToggle").addEventListener("click", function (e) {
    e.stopPropagation();
    setTransparent(v("bgTransparent") !== "true");
    schedule();
  });

  $("bgHostToggle").addEventListener("click", function (e) {
    e.stopPropagation();
    setHost(!hostOn());
    schedule();
  });

  $("btnNewSeed").addEventListener("click", function (e) {
    e.stopPropagation();
    $("seed").value = randomSeed();
    syncBadge("seed");
    schedule();
  });

  $("btnRandomize").addEventListener("click", randomizeAll);

  $("btnGenerate").addEventListener("click", function () {
    sheet.classList.remove("open");
    layoutCanvas();
    schedule();
    toast("Drawn");
  });

  /* -----------------------------------------------------------------------
     SAVING
  ----------------------------------------------------------------------- */
  function cleanName(s) {
    s = String(s || "").replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "-");
    return s || "flowfield";
  }

  function exportImage() {
    var jpg = v("format") === "jpg";
    var s = readState();
    var withBg = jpg || !s.bgTransparent;
    var out = document.createElement("canvas");
    var btn = $("btnExport");
    btn.classList.add("busy");
    toast("Making " + s.W + "×" + s.H + "…");

    /* give the browser a frame to show the message before the heavy work */
    setTimeout(function () {
      try {
        renderTo(out, s.W, s.H, s, withBg);
      } catch (err) {
        btn.classList.remove("busy");
        toast("Could not draw at that size. Try a smaller one.");
        return;
      }
      out.toBlob(function (blob) {
        btn.classList.remove("busy");
        if (!blob) {
          toast("Could not make the image. Try a smaller size.");
          return;
        }
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = cleanName(v("filename")) + (jpg ? ".jpg" : ".png");
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2500);
        toast(jpg ? "Saved JPG" : "Saved PNG");
      }, jpg ? "image/jpeg" : "image/png", 0.92);
    }, 30);
  }

  $("btnExport").addEventListener("click", exportImage);

  /* -----------------------------------------------------------------------
     SAVED LOOKS
  ----------------------------------------------------------------------- */
  var PRESET_KEY = "flow_field_presets_v1";

  function loadPresets() {
    try { return JSON.parse(localStorage.getItem(PRESET_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function storePresets(obj) {
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(obj)); }
    catch (e) { toast("Could not save on this phone."); }
  }
  function refreshPresetList() {
    var presets = loadPresets();
    var list = $("presetList");
    list.innerHTML = '<option value="">— none saved —</option>';
    var names = Object.keys(presets).sort();
    names.forEach(function (nm) {
      var o = document.createElement("option");
      o.value = nm; o.textContent = nm;
      list.appendChild(o);
    });
    $("presetCountVal").textContent = String(names.length);
  }

  $("btnSavePreset").addEventListener("click", function (e) {
    e.stopPropagation();
    var name = prompt("Name this look:");
    if (!name) return;
    name = name.trim();
    if (!name) return;
    var data = {};
    CONTROLS.forEach(function (id) { data[id] = $(id).value; });
    var presets = loadPresets();
    presets[name] = data;
    storePresets(presets);
    refreshPresetList();
    $("presetList").value = name;
    toast('Saved "' + name + '"');
  });

  $("btnLoadPreset").addEventListener("click", function (e) {
    e.stopPropagation();
    var name = $("presetList").value;
    if (!name) { toast("Choose a saved look first."); return; }
    var data = loadPresets()[name];
    if (!data) return;
    CONTROLS.forEach(function (id) {
      var el = $(id);
      if (el && data[id] !== undefined) el.value = data[id];
    });
    COLOR_IDS.forEach(function (id) { setColor(id, $(id).value); });
    setTransparent(v("bgTransparent") === "true");
    syncAllBadges();
    updateVisibility();
    schedule();
    toast('Loaded "' + name + '"');
  });

  $("btnDeletePreset").addEventListener("click", function (e) {
    e.stopPropagation();
    var name = $("presetList").value;
    if (!name) { toast("Choose a saved look first."); return; }
    if (!confirm('Delete "' + name + '"?')) return;
    var presets = loadPresets();
    delete presets[name];
    storePresets(presets);
    refreshPresetList();
    toast('Deleted "' + name + '"');
  });

  /* -----------------------------------------------------------------------
     CUSTOM COLOUR PICKER
  ----------------------------------------------------------------------- */
  var CP = {
    overlay: $("colorPickerOverlay"),
    slCanvas: $("cpSLCanvas"),
    hueCanvas: $("cpHueCanvas"),
    slCursor: $("cpSLCursor"),
    hueCursor: $("cpHueCursor"),
    hexInput: $("cpHexInput"),
    hexPreview: $("cpHexPreview"),
    presetsEl: $("cpPresets"),
    title: $("cpTitle"),
    h: 210, s: 0.76, v: 0.96,
    target: null,
    PRESETS: [
      "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#f43f5e",
      "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
      "#ffffff", "#94a3b8", "#475569", "#1e293b", "#000000",
      "#fde68a", "#bbf7d0", "#bfdbfe", "#ddd6fe", "#fce7f3"
    ]
  };

  function cpSetHex(hex) {
    var c = hexToRgb(hex);
    var hsv = rgbToHsv(c[0], c[1], c[2]);
    if (hsv[1] > 0.001 && hsv[2] > 0.001) CP.h = hsv[0];
    CP.s = hsv[1]; CP.v = hsv[2];
  }
  function cpHex() {
    var c = hsvToRgb(CP.h, CP.s, CP.v);
    return rgbToHex(c[0], c[1], c[2]);
  }
  function cpDrawHue() {
    var c = CP.hueCanvas;
    c.width = c.offsetWidth || 300; c.height = c.offsetHeight || 28;
    var cx = c.getContext("2d");
    var g = cx.createLinearGradient(0, 0, c.width, 0);
    for (var k = 0; k <= 12; k++) g.addColorStop(k / 12, "hsl(" + (k / 12 * 360) + ",100%,50%)");
    cx.fillStyle = g; cx.fillRect(0, 0, c.width, c.height);
  }
  function cpDrawSL() {
    var c = CP.slCanvas;
    c.width = c.offsetWidth || 300; c.height = c.offsetHeight || 180;
    var cx = c.getContext("2d");
    var gH = cx.createLinearGradient(0, 0, c.width, 0);
    gH.addColorStop(0, "#ffffff");
    gH.addColorStop(1, "hsl(" + CP.h + ",100%,50%)");
    cx.fillStyle = gH; cx.fillRect(0, 0, c.width, c.height);
    var gV = cx.createLinearGradient(0, 0, 0, c.height);
    gV.addColorStop(0, "rgba(0,0,0,0)");
    gV.addColorStop(1, "rgba(0,0,0,1)");
    cx.fillStyle = gV; cx.fillRect(0, 0, c.width, c.height);
  }
  function cpMoveCursors() {
    var hw = CP.hueCanvas.width || 300;
    var w = CP.slCanvas.width || 300, h = CP.slCanvas.height || 180;
    CP.hueCursor.style.left = (CP.h / 360 * hw) + "px";
    CP.slCursor.style.left = (CP.s * w) + "px";
    CP.slCursor.style.top = ((1 - CP.v) * h) + "px";
  }
  function cpUpdate() {
    cpMoveCursors();
    CP.hexInput.value = cpHex().slice(1).toUpperCase();
    CP.hexPreview.style.background = cpHex();
  }
  function cpBuildPresets() {
    CP.presetsEl.innerHTML = "";
    CP.PRESETS.forEach(function (hex) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cpPresetSwatch";
      btn.style.background = hex;
      btn.addEventListener("click", function () {
        cpSetHex(hex); cpDrawSL(); cpUpdate();
      });
      CP.presetsEl.appendChild(btn);
    });
  }
  function openPicker(targetId, label) {
    CP.target = targetId;
    CP.title.textContent = "Pick: " + label;
    cpSetHex($(targetId).value);
    CP.overlay.classList.remove("hidden");
    requestAnimationFrame(function () {
      cpDrawHue(); cpDrawSL(); cpUpdate(); cpBuildPresets();
    });
  }
  function cpClose() { CP.overlay.classList.add("hidden"); }

  function hueX(e) {
    var rect = CP.hueCanvas.getBoundingClientRect();
    var cx = e.touches ? e.touches[0].clientX : e.clientX;
    return clamp((cx - rect.left) / rect.width, 0, 1);
  }
  function onHue(e) { e.preventDefault(); CP.h = hueX(e) * 360; cpDrawSL(); cpUpdate(); }
  function slXY(e) {
    var rect = CP.slCanvas.getBoundingClientRect();
    var cx = e.touches ? e.touches[0].clientX : e.clientX;
    var cy = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clamp((cx - rect.left) / rect.width, 0, 1),
      y: clamp((cy - rect.top) / rect.height, 0, 1)
    };
  }
  function onSL(e) {
    e.preventDefault();
    var p = slXY(e);
    CP.s = p.x; CP.v = 1 - p.y;
    cpUpdate();
  }

  CP.hueCanvas.addEventListener("mousedown", function (e) { onHue(e); CP.hueCanvas.addEventListener("mousemove", onHue); });
  CP.hueCanvas.addEventListener("touchstart", function (e) { onHue(e); CP.hueCanvas.addEventListener("touchmove", onHue, { passive: false }); }, { passive: false });
  CP.slCanvas.addEventListener("mousedown", function (e) { onSL(e); CP.slCanvas.addEventListener("mousemove", onSL); });
  CP.slCanvas.addEventListener("touchstart", function (e) { onSL(e); CP.slCanvas.addEventListener("touchmove", onSL, { passive: false }); }, { passive: false });
  document.addEventListener("mouseup", function () {
    CP.hueCanvas.removeEventListener("mousemove", onHue);
    CP.slCanvas.removeEventListener("mousemove", onSL);
  });
  document.addEventListener("touchend", function () {
    CP.hueCanvas.removeEventListener("touchmove", onHue);
    CP.slCanvas.removeEventListener("touchmove", onSL);
  });

  CP.hexInput.addEventListener("input", function () {
    var t = CP.hexInput.value.replace(/[^0-9a-fA-F]/g, "");
    if (t.length === 6) {
      cpSetHex("#" + t);
      cpDrawSL();
      cpMoveCursors();
      CP.hexPreview.style.background = "#" + t;
    }
  });

  $("cpApply").addEventListener("click", function () {
    var hex = cpHex();
    var id = CP.target;
    if (id) {
      setColor(id, hex);
      if (id === "color1" && BUILD_SCHEMES.indexOf(v("colorMode")) !== -1) {
        buildScheme(v("colorMode"), hex);
      } else if (id === "color1") {
        /* a fixed colour mode keeps its own stops */
      }
      syncAllBadges();
      schedule();
    }
    cpClose();
  });
  $("cpCancel").addEventListener("click", cpClose);
  CP.overlay.addEventListener("click", function (e) {
    if (e.target === CP.overlay) cpClose();
  });

  /* -----------------------------------------------------------------------
     START
  ----------------------------------------------------------------------- */
  COLOR_IDS.forEach(function (id) { setColor(id, $(id).value); });
  setTransparent(false);
  setHost(hostOn(), false);
  refreshPresetList();
  syncAllBadges();
  updateVisibility();
  layoutCanvas();
  renderPreview();
})();