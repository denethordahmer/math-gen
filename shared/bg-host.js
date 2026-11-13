/* Backdrop host — lets any generator paint the recipe saved by the Backdrop
   tool behind its own artwork.

   Load order: backdrop-engine.js, then this file, then the app.

   Paths: generator pages are expected to sit beside the `shared/` folder, so
   the engine is always at `../shared/backdrop-engine.js` from `<app>/index.html`.

   The recipe itself lives in localStorage under `mathgen_bg_v1`; whether a
   given app uses it is stored per app under `mathgen_bg_on_<appname>`.

   Global: window.BgHost
*/
(function (root) {
  "use strict";

  var RECIPE_KEY = "mathgen_bg_v1";
  var ENGINE_SRC = "../shared/backdrop-engine.js";

  function store() {
    try { return root.localStorage; } catch (e) { return null; }
  }

  function recipe() {
    try {
      var raw = store() && store().getItem(RECIPE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  function switchKey(appname) {
    return "mathgen_bg_on_" + String(appname || "app");
  }

  /* The URL flag turns it on for one visit; an explicit stored choice wins. */
  function enabled(appname) {
    if (!recipe()) return false;
    var saved = null;
    try { saved = store() && store().getItem(switchKey(appname)); } catch (e) { saved = null; }
    if (saved === "1") return true;
    if (saved === "0") return false;
    return String(root.location && root.location.search || "").indexOf("bg=1") !== -1;
  }

  function script() {
    if (!recipe()) return null;
    return '<script src="' + ENGINE_SRC + '"><\/script>';
  }

  /* Returns true only when something was actually painted. Callers check
     enabled(appname) themselves. */
  function paint(ctx, W, H) {
    if (!recipe()) return false;
    if (!root.Backdrop || typeof root.Backdrop.draw !== "function") return false;
    root.Backdrop.draw(ctx, W, H, recipe());
    return true;
  }

  function titleCase(s) {
    s = String(s || "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* Display names for the styles whose plain key reads badly ("starquilt"). */
  var STYLE_LABELS = {
    starquilt: "Star quilt",
    suminagashi: "Suminagashi",
    herringbone: "Herringbone",
    cyanotype: "Cyanotype",
    guilloche: "Guilloche",
    filament: "Marbled filament",
    moire: "Moiré",
    jacquard: "Jacquard",
    shibori: "Shibori",
    dots: "Dot screen",
    quasicrystal: "Quasicrystal",
    hyperbolic: "Hyperbolic tiling",
    cymatic: "Cymatic plate",
    kaleido: "Kaleidoscope fold",
    rosewindow: "Rose window",
    peacock: "Peacock plume",
    harmonograph: "Harmonograph rosette",
    cosmati: "Cosmati floor"
  };

  function summary() {
    var r = recipe();
    if (!r) return "";
    var parts = [];
    if (r.style) parts.push(STYLE_LABELS[r.style] || titleCase(r.style));
    if (r.palette) parts.push(titleCase(r.palette));
    return parts.join(" · ");
  }

  root.BgHost = {
    recipe: recipe,
    enabled: enabled,
    script: script,
    paint: paint,
    summary: summary,
    switchKey: switchKey
  };
})(window);