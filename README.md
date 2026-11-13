# Math Gen

A small personal toolbox of drawing generators that run in the browser. It is a set of plain files on the phone's shared storage, at `/storage/emulated/0/math-gen`, with no server, no install, no build step and no network.

## The tools

The hub page is `index.html`. It shows one card per generator. Each generator sits in its own subfolder, copied in unchanged, and is fully self-contained: it has its own `fonts/` folder and saves images itself.

| Tool | Folder | Styles | What it draws |
| --- | --- | --- | --- |
| Flow Field | `flow-field/` | 8 | Particle trails through a noise field. |
| Inkwork Tiles | `inkwork-tiles/` | 11 | Repeating printed patterns, knots and mosaics. |
| Thicket | `thicket/` | 10 | Botanical plates grown from a seed. |

## How to open it

Tap `index.html` in a file manager and open it with a browser. Tapping a card opens that generator in the same browser tab. The browser's back button returns to the hub.

The hub page uses two bundled fonts: `fonts/rubikglitch.woff2` for the "Math Gen" wordmark and `fonts/spacegrotesk.woff2` for the cards, because the glitch face is unreadable at small sizes. It shows each generator's icon from its own `icon/` folder.

## Uploading to GitHub

`.github/workflows/unzip.yml` unpacks a zip uploaded to the repo root and commits the result. Drop any `.zip` at the top level, on any branch. The archive is deleted in the same commit.

The workflow refuses two things on purpose: an archive with no web files at all, and an archive with no generator folders beside the hub. The second check stops a zip made from inside a single generator from replacing the toolbox with one tool. It accepts a zip that is either flat (files at the root) or wrapped in one folder such as `math-gen/`.

## Adding a fourth tool

1. Copy its folder in beside the others, so it sits next to `flow-field`, `inkwork-tiles` and `thicket`.
2. In `index.html`, copy one `<a class="card">` block and change the `href`, the icon path, the name, the description and the style count. The accent dot colour is set inline on the `swatch` span.
3. Add the tool to the table above.

## How the toolbox is packaged

A zip copy is kept in `Documents/math-gen.zip`. It is rebuilt from this folder with the subfolders included, so the whole toolbox travels as one file.