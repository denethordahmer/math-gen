# Inkwork Tiles

One of the five tools in the Math Gen toolbox. Its files live in `inkwork-tiles/`.

Procedural tile patterns for phones. No build step, no libraries: open the toolbox hub and tap its card, or open
`inkwork-tiles/index.html` directly.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup and every settings control |
| `inkwork.css` | Styling and the bottom sheet |
| `inkwork-app.js` | Controls, colour schemes, colour picker, presets, export |
| `inkwork-styles.js` | Entry point, finish (grain/vignette), kaleidoscope, and the four original engines |
| `inkwork-engines.js` | The seven added engines |
| `fonts/` | Bundled woff2 files, so the page works offline |

Script order matters: `inkwork-engines.js`, then `inkwork-styles.js`, then
`inkwork-app.js`. The engines register on `window.InkworkEngines`; the styles
file dispatches to them.

## Typography

Two bundled open-licensed fonts, one variable file each, latin subset:

| File | Family used in CSS | Role |
|---|---|---|
| `fonts/monoton-latin.woff2` | `InkworkTitle` | Wordmark only |
| `fonts/inter-latin.woff2` | `InkworkUI` | Section headings, labels, values, buttons |

Monoton is an outlined neon-tube deco display face. It is an outline, so it only
reads at large sizes: it is used for the wordmark and nothing else. Section
headings, the drawer label and the colour picker title are Inter, at a heavier
weight and wider tracking than the body text.

## Pattern engines

| Style | What it is | Own settings |
|---|---|---|
| Motif Grid | A shape repeated per cell | shape, size, fill, turn, offset, colouring, placement, mirror |
| Lattice | Woven ribbons | shape, weave, strand width, colouring |
| Interlace | Celtic knotwork, over-under | knot (2 or 3 way), strand width |
| Meander | Greek key rule | — |
| Hex Weave | Honeycomb, flat or woven | style, cell gap, colouring |
| Truchet | Flipped tiles that join | tile style, mix, colouring |
| Girih | Islamic star tessellation | — |
| Voronoi | Irregular fitted cells | fill or outline |
| Blocks | Herringbone or chevron | weave, block width |
| Scallop | Art Deco overlapping scales | fill |
| Plaid | Tartan bands | band width, depth |

Every engine draws into its own buffer and is then laid down at the chosen
opacity, so patterns never double-darken where shapes overlap.

Lower-value settings are global: seed, tile size, rotation, line weight,
opacity, symmetry, finish, colour scheme and the four palette colours.

## Adding an engine

Write `function myThing(S){...}` in `inkwork-engines.js`, add it to the `ENG`
object at the bottom, then add an `<option value="myThing">` to the
`patternStyle` select and a `<div class="settingsGroup" data-styles="myThing">`
holding its rows. Add its control ids to `CONTROLS` in `inkwork-app.js`, and to
`STYLE_RANDOM` if Randomize should touch them.

`S` carries: `c` (context, already centred on the canvas and rotated), `p` (all
settings as strings), `T` (tile size, scaled), `lw` (line weight, scaled), `D`
(half the canvas diagonal, so drawing from `-D` to `+D` covers everything),
`cols` (four hex strings), `k` (scale factor from 900 px), `seed` (integer).

Helpers already in `inkwork-engines.js`: `rgba`, `darken`, `lightenHex`,
`colsOf`, `num`, `clamp`, `mod`.

Rules an engine must follow:

1. Draw from `-D` to `+D` in both axes, so it covers every corner at any
   rotation.
2. Clamp loop counts. Deep zoom with a tiny tile must not hang the phone.
3. Never assume `p.colors` has four entries; use `colsOf(S)`.
4. Report nothing; just draw. The buffer and opacity are handled for you.

## Export

Sizes from 1500 px square up to 4000 px. PNG keeps transparency; JPG does not
and always paints the background. Presets are stored in `localStorage` under
`inkwork_tiles_presets_v1`, on the phone only.

## Known limits

- Girih is the heaviest engine, about half a second at 1500 px. At 4000 px it
  takes several seconds; the button does not show progress.
- Voronoi caps its site grid so the picture stays quick; at very small tile
  sizes the cells get coarse.
- The meander repeat is a single 1×1 cell unit, so its key is bolder and
  simpler than a full classical meander band.