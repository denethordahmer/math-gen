# Mandala

One of the five tools in the Math Gen toolbox. Its files live in `mandala/`.

Symmetric pattern art for phones. Randomise is the main way it is meant to be
used, so every draw has to be varied and rich. No build step, no libraries:
open the toolbox hub and tap its card, or open `mandala/index.html` directly.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup and every settings control |
| `mandala.css` | Styling and the bottom sheet |
| `mandala-engine.js` | The six styles. Entry point `window.Mandala.draw(ctx, W, H, recipe)` |
| `mandala-app.js` | Controls, randomiser, saved recipe, PNG export |
| `fonts/` | Bundled woff2 files, so the page works offline |
| `icon/` | Icon assets, plus `iconmaker.html` to regenerate them |

Script order matters: `mandala-engine.js`, `../shared/app-kit.js`, then `mandala-app.js`.

## Typography

Two bundled open-licensed fonts, latin subset:

| File | Family used in CSS | Role |
|---|---|---|
| `fonts/italianalatin.woff2` | `MdlTitle` | Wordmark and the group headings |
| `fonts/jostlatin.woff2` | `MdlUI` | Labels, values, buttons (variable 400–700) |

## Style engines

Every style folds each point into one wedge of the picture, so the whole frame
is symmetric by construction.

| Style | What it is | Own settings |
|---|---|---|
| Kaleido fractal | A Mandelbrot field seen through the fold, frame on the set boundary | fold, detail, zoom, colouring, colour bands, twist, softness |
| Orbit filigree | A per-pixel Julia orbit; the first time it nears the origin traces the lace | fold, detail, lace density, glow, zoom, colour bands |
| Bloom field | A Julia field coloured from the point's own radius | fold, detail, petals, zoom, colour bands, softness |
| Lattice mandala | Flat vector rings: petals, chevrons, stones, rays, grooved bands | fold, rings, ring shape, width, layers |
| Spirograph rosette | Thin pen-work curves, mirrored per wedge | fold, curves, inner size, wobble, line weight, colour bands |
| Tunnel rings | A polar field with four modes picked by the seed | fold, rings, spiral, pattern, colour bands |

The per-pixel styles (kaleido, filigree, bloom, tunnel) build a float field
first and colour it second. `paintField` ranks the values with a 256-bin
histogram equalisation and blends that with the raw tone, so a field can never
come out as one flat colour. Each style passes its own `blend` and `gamma`.

## Colour

Fourteen palettes, each a ring of six HSL stops that wraps. The ramps stay
multi-hue because the reference art is multi-hue. `MOOD` gives each palette a
saturation multiplier and a lightness cap. Randomise weights the rich palettes
more heavily than the pale ones.

## Flat-frame guard

Roughly one random draw in twelve used to come out as almost one colour. The
kaleido style now measures the frame two ways after tone mapping — the share
of invalid (inside) values, and the share of the frame in the largest tone
bin — and widens the frame up to three times until neither dominates.

## Export

Sizes from 1500 px square up to 4000 px, PNG only. The saved recipe lives in
`localStorage` under `mathgen_mandala_v1`. Pressing Keep saves the current look;
Randomise pulls style, seed, palette and every setting of the chosen style.

## Known limits

- At 4000 px the fractal styles take several seconds; the page is busy while
  they draw. Preview and export use the same field maths, so the saved file
  matches the preview.
- A small number of random draws still come out simpler than the best ones.
  Judge tuning from a contact sheet of at least twelve real presses.