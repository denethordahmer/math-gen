# Backdrop

One of the five tools in the Math Gen toolbox. Its files live in
`background-lab/`; the drawing code is shared, in `shared/backdrop-engine.js`.

Thirty full-frame backgrounds: woven cloth, marbled ink, engraved grounds and
eight symmetric studies. It also supplies backgrounds to Flow Field, Inkwork
Tiles and Thicket. Open the toolbox hub and tap its card, or open
`background-lab/index.html` directly.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup and every settings control |
| `backdrop.css` | Styling and the bottom sheet |
| `backdrop-app.js` | Controls, randomiser, saved recipe, "Use as background", PNG export |
| `icon-192.png` | Icon shown on the hub card |
| `../shared/backdrop-engine.js` | The styles. Entry point `window.Backdrop.draw(ctx, W, H, recipe)` |

Script order matters: `../shared/backdrop-engine.js`, `../shared/app-kit.js`,
`backdrop-app.js`.

## The recipe

A recipe is plain JSON: style, seed, palette and settings. Backdrop saves the
current one under the storage key `mathgen_bg_v1` every time something changes.
Other tools read that key through `shared/bg-host.js`.

## Use as background

"Use as background" asks for a tool and opens it with `?bg=1`. In each tool the
Background group has a Backdrop row that switches it on or off; the choice is
remembered per tool under `mathgen_bg_on_<tool>`. The background is redrawn at
the exact size being saved, so a large export stays sharp.

## Typography

| File | Family used in CSS | Role |
|---|---|---|
| `../fonts/cinzeldecorative.woff2` | `BackdropTitle` | Wordmark |
| `../fonts/spacegrotesk.woff2` | `BackdropUI` | Labels, values, buttons |
