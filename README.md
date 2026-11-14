# Math Gen

A small personal toolbox of drawing generators that run in the browser. It is a set of plain files on the phone's shared storage, at `/storage/emulated/0/math-gen`, with no server, no install, no build step and no network.

## The tools

The hub page is `index.html`. It shows one card per generator. Each generator sits in its own
subfolder and carries its own `fonts/` folder and icons; the drawing engine, the one workflow and
the documentation live at the top level, so the toolbox behaves as one app with five tools inside.

| Tool | Folder | Styles | What it draws |
| --- | --- | --- | --- |
| Flow Field | `flow-field/` | 8 | Particle trails through a noise field. |
| Inkwork Tiles | `inkwork-tiles/` | 11 | Repeating printed patterns, knots and mosaics. |
| Thicket | `thicket/` | 10 | Botanical plates grown from a seed. |
| Backdrop | `background-lab/` | 30 | Woven cloth, marbled ink, engraved grounds, and eight symmetric studies. Also supplies backgrounds to the three tools above. |
| Mandala | `mandala/` | 6 | Symmetric fractal and drawn rosettes, built for one-tap randomising. |

## Backgrounds

Backdrop saves its recipe (style, seed, palette and settings) under one storage key, `mathgen_bg_v1`. Each generator can paint that background behind its own artwork:

- In Backdrop, open "Use as background" and pick a tool. It opens with `?bg=1`.
- In any generator, the Background group has a "Backdrop" row that switches it on or off.
- The background is redrawn at the exact size being saved, so a large export stays sharp.

The drawing code is `shared/backdrop-engine.js`, shared by all the tools. `shared/bg-host.js` is the small helper the generators call.

## Shared code

`shared/app-kit.js` holds what every tool used to copy: the preview renderer, image saving, saved looks, toasts and the Backdrop switch. The preview draws a quick low-res version first and the sharp one once the controls go quiet. See `docs/app-kit.md`.

## How to open it

Tap `index.html` in a file manager and open it with a browser. Tapping a card opens that generator in the same browser tab. Every tool has a `‹` button at the
top left that returns to the hub, and the browser's back button works too.

The hub page uses two bundled fonts: `fonts/rubikglitch.woff2` for the "Math Gen" wordmark and `fonts/spacegrotesk.woff2` for the cards, because the glitch face is unreadable at small sizes. It shows each generator's icon from its own `icon/` folder.

## Uploading to GitHub

`.github/workflows/unzip.yml` unpacks a zip uploaded to the repo root and commits the result. Drop any `.zip` at the top level, on any branch. The archive is deleted in the same commit.

The workflow refuses two things on purpose: an archive with no web files at all, and an archive with no generator folders beside the hub. The second check stops a zip made from inside a single generator from replacing the toolbox with one tool. It accepts a zip that is either flat (files at the root) or wrapped in one folder such as `math-gen/`.

## Layout

```
math-gen/
  index.html          the hub
  README.md           this file
  docs/               one page per tool, for the technical detail
  shared/             the background engine, the host helper and the app kit
  fonts/              hub wordmark and body fonts
  icon-192.png        hub icon
  .github/            the one upload workflow
  flow-field/  inkwork-tiles/  thicket/  background-lab/  mandala/   one folder per tool
```

Tool folders hold only what the tool loads: its HTML, CSS, scripts, fonts and icons. They have
no README and no GitHub folder of their own; those belong to the toolbox.

## Adding a sixth tool

1. Copy its folder in beside the others, so it sits next to `flow-field`, `inkwork-tiles`, `thicket` and `background-lab`.
2. In `index.html`, copy one `<a class="card">` block and change the `href`, the icon path, the name, the description and the style count. The accent dot colour is set inline on the `swatch` span.
3. Add the tool to the table above, and a page to `docs/` if it needs one.
4. Load `../shared/app-kit.js` before the tool's app script and use it for the preview, saving and saved looks (see `docs/app-kit.md`).
5. In the tool's top bar, add `<a class="homeBtn" href="../index.html">` with a `‹` in it, plus a
   `.homeBtn` rule in its CSS, so it can get back to the hub.

## How the toolbox is packaged

A zip copy is kept in `Documents/math-gen.zip`. It is rebuilt from this folder with the subfolders included, so the whole toolbox travels as one file.