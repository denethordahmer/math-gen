# Thicket

One of the five tools in the Math Gen toolbox. Its files live in `thicket/`.

Botanical plates grown from a seed: trees, groves, fungi and ornamental
wreaths, drawn as symmetric ornament. No build step, no libraries: open the
toolbox hub and tap its card, or open `thicket/index.html` directly.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup and every settings control |
| `thicket.css` | Styling and the bottom sheet |
| `thicket-core.js` | Shared drawing language: colour, symmetry, tapered stems, foliage, paper texture, the dispatcher. Exposes `window.ThicketBrush` |
| `thicket-forms.js` | The compositions. Each registers itself with the core |
| `thicket-app.js` | Controls, colour schemes, randomiser, saved looks, saving images |
| `fonts/` | Bundled woff2 files, so the page works offline |
| `icon/` | Icon assets, plus `iconmaker.html` to regenerate them |

Script order matters: `../shared/backdrop-engine.js`, `../shared/bg-host.js`,
`thicket-core.js`, `thicket-forms.js`, `../shared/app-kit.js`, `thicket-app.js`.

## Styles

| Group | Styles |
|---|---|
| Trees and growth | Tree of life, Grove, Bloom |
| Fungi | Mushroom stand, Mycelium threads, Spore print |
| Ornament | Mandala, Wreath, Fountain, Corner frames |

Same seed and same settings always give the same picture.

## Typography

| File | Family used in CSS | Role |
|---|---|---|
| `fonts/cormorant-unicase.woff2` | `ThicketTitle` | Wordmark |
| `fonts/almendra-display.woff2` | `ThicketLabel` | Labels and headings |
| `fonts/almendra-italic.woff2` | `ThicketInk` | Values |

## Shared pieces

Preview drawing, saving, saved looks and the Backdrop row come from
`shared/app-kit.js` (see `docs/app-kit.md`). The Backdrop row paints the recipe
saved by the Backdrop tool behind the plate.
