/* Math Gen app kit: the small pieces every generator used to carry its own copy of.

   Load order: this file before the tool's own app script.
   Global: window.AppKit

   - cleanName       safe file name
   - makeToast       small confirmation message
   - progressive     preview renderer: quick low-res pass first, sharp pass once things settle
   - exportImage     full-size draw and save, with busy state and error messages
   - presets         saved looks in localStorage
   - hostSwitch      the "Backdrop: on/off" row
*/
(function (root) {
  "use strict";

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------- names */
  function cleanName(s, fallback) {
    s = String(s || "").replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "-");
    return s || fallback || "image";
  }

  /* ------------------------------------------------------------- toast */
  /* Pass an element or an id. If the page has no toast element, one is made
     and styled inline, so a tool never has to ship toast CSS to get messages. */
  function makeToast(elOrId, ms) {
    var el = typeof elOrId === "string" ? $(elOrId) : elOrId;
    if (!el) {
      el = document.createElement("div");
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.style.cssText =
        "position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom,0px));" +
        "transform:translateX(-50%);max-width:86vw;padding:10px 16px;border-radius:14px;" +
        "background:rgba(20,20,20,.92);color:#fff;font:600 14px/1.3 system-ui,sans-serif;" +
        "text-align:center;opacity:0;pointer-events:none;transition:opacity .18s;z-index:60";
      document.body.appendChild(el);
      el._inline = true;
    }
    var timer = null;
    return function (msg) {
      el.textContent = msg;
      if (el._inline) el.style.opacity = "1"; else el.classList.add("show");
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        if (el._inline) el.style.opacity = "0"; else el.classList.remove("show");
        timer = null;
      }, ms || 2000);
    };
  }

  /* ------------------------------------------------- progressive preview */
  /* opts:
       canvas    the visible canvas
       size()    returns [W, H], the full export size (sets the aspect)
       draw(target, w, h)   draws the picture onto `target` at w x h
       after(isFinal)       optional; called after every pass (re-fit, etc.)
       max       longest side of the sharp preview      (default 1100)
       lowMax    longest side of the quick first pass   (default 260)
       delay     ms to wait after a change before the quick pass (default 30)
       settle    least ms of calm before the sharp pass (default 250)

     A change draws a small version at once, so sliders and Randomise feel
     instant. The sharp version follows only when nothing has changed for a
     moment. The wait grows with how long the quick pass took, so a slow
     style is not asked to do its heavy pass over and over while you drag.
     The visible canvas is only ever CSS-scaled, so the two passes line up.
  */
  function progressive(opts) {
    var max = opts.max || 1100;
    var lowMax = opts.lowMax || 260;
    var delay = opts.delay === undefined ? 30 : opts.delay;
    var settleMin = opts.settle || 250;
    var t1 = null, t2 = null;
    var busy = false;

    function dims(limit) {
      var s = opts.size();
      var f = Math.min(1, limit / Math.max(s[0], s[1]));
      return [Math.max(1, Math.round(s[0] * f)), Math.max(1, Math.round(s[1] * f))];
    }

    function pass(limit, isFinal) {
      var d = dims(limit);
      var t0 = (root.performance || Date).now();
      busy = true;
      try {
        opts.draw(opts.canvas, d[0], d[1]);
      } finally {
        busy = false;
      }
      var took = (root.performance || Date).now() - t0;
      if (opts.after) opts.after(isFinal);
      return took;
    }

    function cancel() {
      if (t1) { clearTimeout(t1); t1 = null; }
      if (t2) { clearTimeout(t2); t2 = null; }
    }

    function run() {
      t1 = null;
      var low = dims(lowMax), full = dims(max);
      /* small pictures need only one pass */
      if (low[0] * low[1] >= full[0] * full[1]) {
        pass(max, true);
        return;
      }
      var took = pass(lowMax, false);
      var wait = Math.max(settleMin, Math.min(1200, took * 4));
      t2 = setTimeout(function () {
        t2 = null;
        pass(max, true);
      }, wait);
    }

    return {
      /* debounced: use for control changes */
      schedule: function () {
        cancel();
        t1 = setTimeout(run, delay);
      },
      /* immediate quick pass, sharp pass follows: use for first paint and Generate */
      now: function () {
        cancel();
        run();
      },
      /* straight to the sharp pass, no quick one: use after the sheet closes */
      sharp: function () {
        cancel();
        pass(max, true);
      },
      isBusy: function () { return busy; }
    };
  }

  /* ------------------------------------------------------------ export */
  /* opts:
       size      [W, H] to save at
       draw(out, W, H)   draws onto a fresh canvas
       mime      "image/png" (default) or "image/jpeg"
       quality   for jpeg, default 0.92
       filename  base name, already cleaned
       button    optional element to dim while working
       toast     function(msg)
  */
  function exportImage(opts) {
    var W = opts.size[0], H = opts.size[1];
    var mime = opts.mime || "image/png";
    var ext = mime === "image/jpeg" ? ".jpg" : ".png";
    var btn = opts.button;
    var toast = opts.toast || function () {};
    function idle() {
      if (btn) { btn.classList.remove("busy"); btn.style.opacity = ""; }
    }
    if (btn) { btn.classList.add("busy"); btn.style.opacity = ".5"; }
    toast("Making " + W + "×" + H + "…");

    /* give the browser a frame to show the message before the heavy work */
    setTimeout(function () {
      var out = document.createElement("canvas");
      try {
        opts.draw(out, W, H);
      } catch (err) {
        idle();
        toast("Could not draw at that size. Try a smaller one.");
        return;
      }
      out.toBlob(function (blob) {
        idle();
        if (!blob) { toast("Could not make the image. Try a smaller size."); return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = opts.filename + ext;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2500);
        toast(mime === "image/jpeg" ? "Saved JPG" : "Saved PNG");
      }, mime, opts.quality || 0.92);
    }, 30);
  }

  /* ----------------------------------------------------------- presets */
  function presets(key, toast) {
    function all() {
      try { return JSON.parse(root.localStorage.getItem(key)) || {}; }
      catch (e) { return {}; }
    }
    function write(obj) {
      try { root.localStorage.setItem(key, JSON.stringify(obj)); return true; }
      catch (e) { if (toast) toast("Could not save on this phone."); return false; }
    }
    return {
      all: all,
      save: write,
      get: function (name) { return all()[name]; },
      put: function (name, data) { var o = all(); o[name] = data; return write(o); },
      remove: function (name) { var o = all(); delete o[name]; return write(o); },
      /* fills a <select> and a count badge */
      fillList: function (listEl, countEl) {
        var names = Object.keys(all()).sort();
        listEl.innerHTML = '<option value="">— none saved —</option>';
        names.forEach(function (nm) {
          var o = document.createElement("option");
          o.value = nm; o.textContent = nm;
          listEl.appendChild(o);
        });
        if (countEl) countEl.textContent = String(names.length);
      }
    };
  }

  /* -------------------------------------------------------- host switch */
  /* The row that turns the Backdrop background on or off. Stored choice
     first, then a ?bg=1 visit. */
  function hostSwitch(storeKey, toggleId, valId) {
    function isOn() {
      var saved = null;
      try { saved = root.localStorage.getItem(storeKey); } catch (e) { saved = null; }
      if (saved === "1") return true;
      if (saved === "0") return false;
      return String(root.location && root.location.search || "").indexOf("bg=1") !== -1;
    }
    function set(on, persist) {
      if (persist !== false) {
        try { root.localStorage.setItem(storeKey, on ? "1" : "0"); }
        catch (e) { /* storage may be unavailable; the row still switches */ }
      }
      var tg = $(toggleId);
      if (!tg) return;
      tg.setAttribute("data-on", on ? "true" : "false");
      tg.textContent = on ? "Backdrop: on" : "Backdrop: off";
      var val = $(valId);
      if (val) val.textContent = on ? "On" : "Off";
    }
    return { isOn: isOn, set: set };
  }

  root.AppKit = {
    cleanName: cleanName,
    makeToast: makeToast,
    progressive: progressive,
    exportImage: exportImage,
    presets: presets,
    hostSwitch: hostSwitch
  };
})(window);
