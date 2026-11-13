# Flow Field

One of the five tools in the Math Gen toolbox. Its files live in `flow-field/`.

Seeded generative art for phones. A noise field guides particles, and each
style turns those paths into lines, dots, bands or contours. No build step, no
libraries: open the toolbox hub and tap its card, or open
`flow-field/index.html` directly.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup and every settings control |
| `flow.css` | Styling and the bottom sheet |
| `flow-field.js` | Noise field, colour engine and the eight drawing engines |
| `flow-app.js` | Controls, colour picker, saved looks, saving images |
| `fonts/` | Bundled woff2 files, so the page works offline |

Script order matters: `flow-field.js`, then `flow-app.js`. The drawing file
exposes `window.FlowField.draw(ctx, W, H, settings)`; the app file reads the
controls and calls it. Same seed and same settings always give the same
picture.

## Typography

Two bundled open-licensed fonts, latin subset, no network needed:

| File | Family used in CSS | Role |
|---|---|---|
| `fonts/sacramento.woff2` | `FlowTitle` | Wordmark only |
| `fonts/cormorant-italic.woff2` | `FlowInk` | Every other label, value and button |

Sacramento is a light monoline script, chosen for a drifting, smoke-like feel.
Cormorant italic is a fine high-contrast serif that stays readable at small
sizes. The hex code field in the colour picker stays monospace.

## Drawing engines

| Style | What it is | Own settings |
|---|---|---|
| Flow lines (`flow`) | Strands that walk the noise field | flow length, step size |
| Engraving (`engrave`) | Evenly ruled lines that wave, like a cut plate | rule spacing, wobble |
| Ribbons (`ribbons`) | Filled bands with a lit core and soft ends | band width, plus flow length and step size |
| Vortex (`vortex`) | Strands spiralling out of a turning core | turns, turbulence, plus flow length and step size |
| Stipple (`stipple`) | Dots that thicken where the field is dense | — |
| Ticks (`ticks`) | Short dashes showing which way the field runs | spacing, dash length, jitter |
| Silk (`silk`) | Many short faint strokes, like smoke or brushed hair | stroke length |
| Contour (`contour`) | Topographic lines and shading from the noise | levels, shading |

Density (`particles`), feature size, bend (`curl`), line weight and opacity are
shared by every engine. Flow length and step size are shared by the three line
engines: flow, ribbons and vortex. Colour direction and mirror apply to all
engines too, and the seed, colour scheme, background and finish are handled
outside the engine, before or after it draws.

## Adding an engine

Write `function myThing(ctx, W, H, S)` in `flow-field.js` and add it to the
`ENGINES` object. In `index.html`, add an `<option value="myThing">` to the
`#engine` select and a `<div class="settingsGroup" data-engines="myThing">`
group holding its rows. In `flow-app.js`, add its control ids to `CONTROLS`
and to `ENGINE_RANDOM`; add the name to `ENGINE_LABEL` and the slider ids to
the list in `syncAllBadges`, or the sheet will show "Style" and stale numbers.

`S` carries: `particles`, `steps`, `stepSize`, `curl`, `lineWeight`, `opacity`,
`direction`, `mirror`, `noise`, `rand`, `scale`, `k`, `colAt`, `ink`,
`featureSize`, `seed`, plus every per-engine setting.

- `particles` is the density. Engines that draw fewer marks than that divide
  it themselves, as ribbons and vortex do.
- `steps` and `stepSize` are how many steps a strand takes and how far each
  step goes. Multiply the step by `k`.
- `noise(x, y)` returns about -1 to 1. `rand()` is the seeded random, 0 to 1.
- `scale` turns pixels into noise space. `k` is the scale factor from 1500 px,
  so a size set in pixels is `setting * k`.
- `colAt(x, y, nv)` returns an `[r, g, b]` colour for a position and noise
  value; the colour direction is already taken into account.
- `ink(col, extra)` turns that colour into a paintable string at the chosen
  opacity, with an optional extra fade.

Rules an engine must follow:

1. Clamp loop counts. A high density with a tiny step must not hang the phone.
2. Use `S.ink(S.colAt(x, y, nv))` for colour, and paint with the alpha it
   gives you. Do not set `globalAlpha` or hard-code an opacity.
3. Do not touch the page DOM. An offscreen canvas for a wash or a pattern is
   fine; reading controls is not.
4. Under four-way mirror, `W` and `H` are half the canvas and the caller
   mirrors the result. Draw as usual.

## Saving

Sizes: square 1500×1500, portrait 1080×1620, landscape 1920×1080, Samsung A17
1080×2340, desktop 1920×1080, large 3000×3000 and print 4000×4000. Saving
redraws at the chosen size; it never enlarges the preview.

PNG keeps a see-through background when Transparent bg is on. JPG has no
transparency, so it always fills the background with the chosen colour. The
File name field sets the download name, with `.png` or `.jpg` added.

Saved looks store every control under `localStorage` key
`flow_field_presets_v1`, on the phone only.

## Known limits

- Previews are drawn at no more than 1100 px on the longer side and scaled by
  CSS to fit the screen, so very fine detail only appears in the saved file.
- Print size, 4000×4000, takes a moment on a phone. The save button shows a
  message but no progress.
- There is no service worker and no installable manifest, by design: it is a
  plain page with nothing to install or update.