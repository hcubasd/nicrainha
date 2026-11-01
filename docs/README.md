# nicrainha showcase

Slides written in LaTeX, compiled in the browser and shown over nicrainha's
background. Each slide's title sits on a glass banner, and the title slide's
on a glass card; everything else sits on the bare background.

Live: https://hcubasd.github.io/nicrainha/

The background is at L\* 87, above `DEFAULT_LIGHTNESS`, for a light, even look
behind slides (chosen by eye). `?lightness=<L*>` sets another, 0 to 100.

The example deck is [`tex/nicrainha.tex`](tex/nicrainha.tex): drop it on the
page.

## Using it

The page opens on a glass panel carrying `npm i nicrainha`; drag, fling or
scroll to pan it around. Then:

1. Drop the deck's images (PNG, JPEG or PDF) anywhere on the page: "Image
   loaded!". A `.bib` file goes in the same way: "Bibliography loaded!".
2. Drop the deck's `.tex` file. The panel goes, and a rolling cat sits on the
   bare background over a progress bar, the pages TeX has finished.

Then a prompt, also over the bare background:

| Result | Prompt | Then |
| --- | --- | --- |
| Errors | "Contains errors! Download logs?" | back to the panel, for the next `.tex` |
| Warnings | "Contains 3 warnings! Download logs?" | the deck |
| Clean | "Compiled! Build PDF?" | the deck, or, on OK, the cat again while the PDF builds, then "Download PDF?", then the deck |

In the deck, **P** builds and downloads the PDF the same way, and **L**
downloads the log. **F** toggles full screen, in the deck or on the panel. The PDF builds only when asked, and its own prompt offers
it: browsers start a download only right after you act, and OK counts.
Images dropped after a deck compile it again; dropping another `.tex` file
replaces the deck. Nothing leaves the browser, and nothing is stored.

The slides stack top to bottom. Drag, wheel or trackpad move the deck up and
down freely, up to one slide past either end; once that stops, it settles on
the nearest slide, or, after a flick, on the slide the flick carries it to.
Space, ↓, → and PageDown scroll to the next slide; ↑, ←, PageUp and
Shift+Space to the previous; Home and End to the first and last.

## Writing a deck

```latex
\documentclass{nicrainha}
\title{…}
\author{…}
\date{…}
\begin{document}
\maketitle
\begin{slide}{A title}
  Anything LaTeX's article class takes: lists, tables, math, figures.
\end{slide}
\end{document}
```

See [`tex/nicrainha.tex`](tex/nicrainha.tex), a 14-slide deck on nicrainha's
color science, with TikZ figures drawn from the library's own numbers and a
BibTeX bibliography. The class, `tex/nicrainha.cls`:

- **Page and font:** beamer's 16:9 page, 160 × 90 mm, at 11 pt, in Latin
  Modern Sans. It's scaled to fit the window.
- **Packages:** `amsmath`, `amssymb`, `booktabs`, `graphicx` and `color`,
  loaded by the class, and `tikz`, with the libraries `arrows.meta`, `calc`,
  `positioning`, `shapes.geometric`, `shapes.misc`,
  `decorations.pathreplacing`, `decorations.markings`, `backgrounds`, `fit`,
  `intersections`, `patterns`, `matrix`, `shadings` and `through`. No other
  packages can be loaded: the page only has the files these need.
- **Fonts:** Latin Modern, sans by default, with serif and typewriter, and
  the catalog below.
- **Languages:** text is UTF-8, accents and all. `\usepackage[brazil]{babel}`
  (or `english`, or both) sets Portuguese hyphenation, words such as
  "Tabela" and "Figura", and dates.
- **Slides:** each `slide` is one page with its title in the top strip.
- **Title slide:** `\maketitle` centers the title, author and date on the
  page, on a glass card fitted to their widest line. Long titles wrap at the
  text width.
- **Ink:** text on glass is black. Everything else is black or white,
  whichever has more contrast on the background (WCAG's ratio): white below
  L\* ≈ 49.4. Every nicrainha color of a lightness has the same luminance,
  so one ink fits the whole background. The page tells the class through a
  file, `nicrainha-ink.tex`; compiled elsewhere, the ink is black.
- **Floats:** `figure` and `table` don't float; captions still work.
- **Bibliographies:** `thebibliography`, or BibTeX with `plain`, `unsrt`,
  `abbrv` or `alpha`. The `.bib` can be dropped with the images, or written
  into the `.tex` with `filecontents`, keeping the deck one file. The page
  runs TeX again, up to three passes, while references or citations are
  undefined; BibTeX runs after each pass. On a slide, the slide's title is
  the bibliography's heading.
- **Overflow:** a slide whose body doesn't fit is an `Overfull \vbox` and a
  `Slide N doesn't fit` warning, never a second page. Text too wide is an
  `Overfull \hbox`.

### Fonts

Besides Latin Modern, a deck can use any family in this catalog with its
line in the preamble. A serif family sets the serif font, so its line also
makes serif the body's default; a math family replaces the math fonts only.
Regular, italic, bold and bold italic are there for every family, at any size.

| Family | Role | Preamble |
| --- | --- | --- |
| Inter | sans | `\usepackage[sfdefault]{inter}` |
| Roboto | sans | `\usepackage[sfdefault]{roboto}` |
| Source Sans | sans | `\usepackage[default]{sourcesanspro}` |
| IBM Plex Sans | sans | `\usepackage[sfdefault]{plex-sans}` |
| Fira Sans | sans | `\usepackage[sfdefault]{FiraSans}` |
| Libertinus | serif | `\usepackage{libertinus} \renewcommand\familydefault{\rmdefault}` |
| EB Garamond | serif | `\usepackage{ebgaramond} \renewcommand\familydefault{\rmdefault}` |
| Source Serif | serif | `\usepackage{sourceserifpro} \renewcommand\familydefault{\rmdefault}` |
| IBM Plex Serif | serif | `\usepackage{plex-serif} \renewcommand\familydefault{\rmdefault}` |
| Times-like (newtx) | serif | `\usepackage{newtxtext} \renewcommand\familydefault{\rmdefault}` |
| Palatino-like (newpx) | serif | `\usepackage{newpxtext} \renewcommand\familydefault{\rmdefault}` |
| IBM Plex Mono | mono | `\usepackage{plex-mono}` |
| Fira Mono | mono | `\usepackage{FiraMono}` |
| Source Code Pro | mono | `\usepackage{sourcecodepro}` |
| Inconsolata | mono | `\usepackage{inconsolata}` |
| Times-like math (newtx) | math | `\usepackage{newtxmath}` |
| Palatino-like math (newpx) | math | `\usepackage{newpxmath}` |
| Euler | math | `\usepackage{eulervm}` |
| Libertinus Math | math | `\usepackage{libertinust1math}` |
| Math in the text font (mathastext) | math | `\usepackage{mathastext}` |

A family's files are fetched when a deck first uses it, about 1–2 MB, and the
browser keeps them. The catalog is `tex/fonts.json`; `scripts/texbundle.mjs`
writes its files to `public/tex/files`.

### For agents

Agents can write decks for this page without a local TeX. The user drops the
file, downloads the log and hands it back. Fix every error (lines starting
with `!`, with their line `l.N`) and every warning the prompt listed:

- overfull boxes
- `Slide N doesn't fit`
- LaTeX, class and package warnings

## How it works

- **TeX:** pdfTeX 1.40.21 from SwiftLaTeX, as WebAssembly, in a worker
  (`public/engine/`). It's preloaded with `public/tex/tex.bundle`, which
  holds the LaTeX format and every file the class supports (5.8 MB,
  downloaded once). Nothing is fetched while compiling, and a recompile
  takes about 100 ms.
- **Pages:** pdf.js draws each page onto a transparent canvas over the
  background.
- **PDF:** the page captures each slide's background with nicrainha's
  `capture()`, and `pdf-worker.js` assembles the PDF with pdf-lib, off the
  page's thread, so the page keeps moving while it builds.
- **Glass:** a `<nicrainha-glass>` behind each slide's title. The class
  logs which page gets which glass ("nicrainha: page 2 has a title banner").
  Each panel's corner radius is the largest that keeps its text on the
  glass's flat middle: half its smallest room around the text.
- **Scrolling:** vertical only, so the page takes pointers and wheels from
  the background, which would pan both ways. A release settles where its
  velocity would carry the deck at iOS's deceleration, and a wheel settles
  150 ms after its last event. Settling takes 300 ms along CSS's `ease`.

Only the slides in view and their neighbors are in the page.

### The rolling cat

`rolling-cat.png` is `rolling-cat.gif`'s 33 frames side by side, at twice the
size it shows, stepped through by a CSS transform. Browsers animate a
transform apart from the page's scripts, so the cat keeps rolling while the
page works, as a GIF doesn't in every browser. A loading screen lasts whole
rolls, at least one. To remake the strip (ImageMagick):

```sh
convert rolling-cat.gif -coalesce -resize x320 +append -strip PNG8:rolling-cat.png
```

### Rebuilding the TeX files

After changing the class, a coverage deck (`tex/coverage*.tex`, everything a
deck may use) or the font catalog, rebuild the bundle and the catalog. It
needs Playwright's Chromium and a local TeX Live with these packages (Debian
names):

```sh
apt-get install texlive-latex-base texlive-latex-recommended texlive-latex-extra \
  texlive-fonts-recommended texlive-fonts-extra texlive-pictures \
  texlive-plain-generic lmodern tex-gyre
npx playwright install chromium
node scripts/texbundle.mjs
```

The engine is SwiftLaTeX's release v20022022, patched by
`scripts/engine.mjs` (see the script for what changes and why). SwiftLaTeX
is AGPL-3.0: https://github.com/SwiftLaTeX/SwiftLaTeX.

## Development

```sh
npm install
npm run dev       # dev server on all interfaces
npm run build     # static site → dist/
```

`docs/` is its own Vite project that installs `nicrainha` from npm, as any
user would. Pushes that touch `docs/` on the default branch build and deploy
it to GitHub Pages (`.github/workflows/pages.yaml`).
