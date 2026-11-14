# App kit

`shared/app-kit.js` holds the pieces that every generator used to carry its own
copy of. Load it before the tool's own app script. Global: `window.AppKit`.

| Function | What it does |
|---|---|
| `cleanName(s, fallback)` | Makes a safe file name |
| `makeToast(elOrId, ms)` | Returns `toast(msg)`. If the page has no toast element it makes and styles one |
| `progressive(opts)` | The preview renderer (below) |
| `exportImage(opts)` | Draws at full size, saves PNG or JPG, dims the button, reports errors |
| `presets(key, toast)` | Saved looks in localStorage: `all`, `get`, `put`, `remove`, `save`, `fillList` |
| `hostSwitch(storeKey, toggleId, valId)` | The "Backdrop: on/off" row: `isOn()` and `set(on, persist)` |

## Progressive preview

`AppKit.progressive({ canvas, size, draw, after, max, lowMax, delay, settle })`
returns `{ schedule, now, sharp }`.

1. A control change calls `schedule()`. After `delay` ms (default 30) a quick
   low-res pass is drawn, with the longest side at `lowMax` (default 260).
2. If nothing else changes for a moment, the sharp pass follows, with the
   longest side at `max`. The wait is at least `settle` ms (default 250) and
   grows to four times the quick pass's own time, up to 1.2 s, so a slow style is
   not asked to do its heavy pass again and again while a slider is dragged.
3. Any new change cancels the pending sharp pass.
4. If the sharp size is no bigger than the quick size, only one pass is drawn.

`now()` draws the quick pass immediately and then the sharp one (first paint,
Generate button). `sharp()` goes straight to the sharp pass.

The visible canvas is only ever scaled by CSS, so the quick and sharp passes
line up. `draw(target, w, h)` must draw the whole picture at the given size, the
same way the export does. `size()` returns the full export size and sets the
aspect ratio. `after(isFinal)` runs after each pass, for re-fitting the canvas.

Saving always redraws at full size and does not use the quick pass.

## Adding a tool

Load `../shared/app-kit.js` before the app script, then build the preview with
`AppKit.progressive`, and use `exportImage`, `presets` and `hostSwitch` instead
of writing new copies.
