# nicrainha showcase

An animated, full-screen nicrainha background with a glass label —
`npm i nicrainha` in a floating glass pill. The glass is a physical model —
rays traced through an exact surface with Snell's law — not a styling effect,
and it puts no color on screen that nicrainha didn't produce.

Live: https://hcubasd.github.io/nicrainha/

This document is also the reference for reproducing the glass in other WebGL
UIs: everything the look depends on is derived below.

## Running

```sh
npm install
npm run dev       # dev server on all interfaces (Vite's default port, 5173)
npm run build     # static site → dist/
```

`docs/` is its own Vite project that installs `nicrainha` from npm, separate
from the library. Pushes that touch `docs/` on the default branch build and
deploy it to GitHub Pages (`.github/workflows/pages.yaml`).

## Knobs

URL parameters. Missing, negative or non-numeric values fall back to the
default.

| Parameter | Default | Meaning |
| --- | --- | --- |
| `radius` | three line heights (`54` for 16 px text) | Radius of the pill's ends, CSS px. The only free parameter of the glass: it sets the edge curvature, the thickness and the air gap together. `0` makes the glass invisible. |
| `lightness` | `78` | CIE L\* of the glass at its thickest, between the background's (73.9124) and white (100). See [Glass lightness](#glass-lightness). |
| `speed` | `1` | Animation speed multiplier, for the showcase only. `2` is twice as fast, `0` freezes. At `1` the pattern turns over roughly every 10 s. |

Example: `?radius=72&speed=0.5`

## The default look: a glass label

The glass is sized by its content rather than placed as a free-standing
panel. The label `npm i nicrainha` — black, system monospace, the default
16 px — is centered on screen, and the glass is a pill around it:

- the ends are semicircles of radius `R`, so the pill is `2R` tall;
- the flat middle is exactly as wide as the text, so the text sits on the
  part of the glass that doesn't refract, and the curved ends frame it;
- `R` defaults to three line heights of the text: 54 px, a 108 px tall pill
  whose ends are wide enough for the glass to read clearly.

`main.js` measures the label and lays out the glass whenever the label or the
window changes size, so the pill follows the actual font and text.

## Files

```
index.html               page shell: full-viewport canvas plus the label
styles.css               layout; the label is centered on screen
main.js                  knobs, constants, WebGL setup, glass sizing, render loop
noise.js                 permutation table, CPU Perlin noise, exact field range
lightness-rings.js       build-time palette table (a Vite plugin)
vite.config.js           registers that plugin
shaders/fullscreen.vert  one triangle covering the viewport
shaders/scene.frag       background, glass tracing and palette lookup
```

## Rendering

The fragment shader runs once per device pixel, every frame, at full
resolution, with nothing cached or interpolated between frames:

1. **Glass.** If the pixel is over the glass, trace its view ray through the
   glass to the point of the scene it shows (below). Otherwise use the pixel
   itself.
2. **Background.** Evaluate 3D Perlin noise at that point. `x, y` place it in
   a centered 2:1 field covering the viewport, long axis along the screen's
   long axis; `z` is time.
3. **Color.** Normalize the value with this frame's range to pick one of the
   256 palette colors, then lift its lightness by the glass height above the
   pixel (zero off the glass).

The palette is nicrainha's 256-gon in a random rotation `r`: rotation `r`
starts at vertex `r`, so it is an index offset. The background uses it at
nicrainha's default lightness. The noise repeats every 256 lattice units, so
`z` wraps there without changing any value.

The frame's range is the field's exact minimum and maximum over the whole 2:1
field, computed on the CPU by `noise.js` (about 0.15 ms per frame): a 65×33
grid locates every local extremum, and each is followed to its true peak or
valley by a compass search with halving steps, down to 10⁻⁷ lattice units,
kept inside the field. Sampling alone would not do: a 64×32 grid misses the
extremes by up to 11 palette steps, flattening the brightest and darkest
spots.

### Color

Every pixel is exactly a nicrainha color: off the glass, one of the 256 colors
at the background's lightness; on it, the same palette index at a lighter
ring of nicrainha's 256-gon. The glass changes *where* the background is
sampled — always a point inside the window — and *which lightness* the color
is taken at, never how a color is computed. Lookups are `texelFetch` from a
nearest-filtered texture. There is deliberately no blending, blur, tint,
Fresnel reflection, dispersion or antialiasing: each would put colors outside
nicrainha's on screen.

## Glass model

### Geometry

Coordinates: `x, y` in device px from the glass's center, `z` up toward the
viewer. The background is the plane `z = 0`. The glass's footprint is a
rounded rectangle of half-size `(W, H)` and corner radius `R`. The engine
handles any such shape; the label is the case `H = R`, a pill.

The glass is a solid with a flat bottom at height `D` (the air gap) and a top
made of every point at distance `R` from an **inner rectangle** of half-size
`(W − R, H − R)` lying at `z = D`. Over a screen point `p`:

```
o = sign(p) · max(|p| − (W − R, H − R), 0)    offset from the inner rectangle
s = |o|
h = sqrt(R² − s²)                              glass thickness, for s < R
N = (o, h) / R                                 outward normal of the top
```

- Over the inner rectangle `s = 0`: a flat top, thickness `R`.
- Along a straight edge one component of `o` is zero: a quarter-cylinder of
  radius `R`.
- At a corner both are nonzero: an eighth-sphere of radius `R`.
- The footprint `s < R` is exactly the rounded rectangle.

For the pill, `H = R`: the inner rectangle shrinks to a horizontal line
segment, the body along it is a half-cylinder, and each end is a
quarter-sphere — together, the top half of a capsule (a rod with rounded
ends) cut lengthwise.

The solid is convex, which the tracer relies on.

### The scene: the window is a box

Only the window's background exists, so the scene is a box: the background
is its floor, and beyond the window's edge each edge pixel continues straight
up as a wall. Every ray that leaves the glass meets this box somewhere, so
every pixel has a color, and that color always comes from a pixel of the
window — its interior, or its very edge.

### Tracing a pixel

The viewer looks straight down (orthographic), so a pixel's view ray is
`(0, 0, −1)`. Light paths are reversible: following the view ray backwards
finds the point of the scene whose light reaches the pixel.

1. **Enter.** Refract into the top surface at `(p, D + h)`:
   `refract((0, 0, −1), N, 1/n)`. Entering glass a ray is never totally
   reflected.
2. **Cross the glass.** March to the surface along the ray using the solid's
   signed distance, `max(distance to the top, distance to the bottom)`.
3. **Leave or reflect.** Refract out, `refract(dir, −normal, n)`. If Snell's
   law has no solution (total internal reflection), reflect and repeat 2.
4. **Meet the box.** The ray continues in a straight line. If it lands on the
   floor inside the window, that's the point. Otherwise — it would land
   beyond the window, or it left the glass upward — it meets the wall where
   its horizontal path crosses the window's edge, and shows that edge pixel.

A ray that has left the glass never re-enters, because it is convex. There is
no arbitrary clamp: rays land wherever the math puts them, and the window's
own edge pixels are the only limit. The tracer's iteration limits (512
marching steps per crossing, 64 reflections) were checked by rendering at
several sizes and pixel densities: no ray reaches them. One that did would
continue from wherever it was.

For almost every pixel the path is the simple one: in through the top, out
through the flat bottom, across the gap. The sideways shift points toward the
glass's center, so the background is seen from further inside than the pixel.
The flat top shifts nothing; the glass shows only through its edges.

### The rim

Toward the outer edge the surface steepens, and the rays leave the bottom
ever closer to sideways, so they travel ever further across the gap. Close
enough to the rim they cross the whole window and show its wall. In the
outermost ~0.7% of the edge band they can't leave the bottom at all (total
internal reflection); they bounce, leave upward, and also end on the wall. The
rim therefore shows thin bands of the window's edge colors. It is
stair-stepped because each pixel is one point sample; smoothing it would mean
blending colors.

### The gap: the edge's focal plane

Along an edge, a pixel at distance `s` into the curved band shows background
position `s − shift(s)`. Near the start of the band the shift is linear in
`s`:

```
d shift / d s = (1 − 1/n) + (n − 1) · D/R
```

The edge is a plano-convex lens. When that slope reaches 1, at

```
D / R = 1/(n − 1) − 1/n
```

the background lies exactly in the lens's focal plane: this is its **back
focal distance**, the focal length `R/(n − 1)` less the glass thickness `R` as
seen through the glass, `R/n`. For glass, `n = 1.5`, it is `4/3`.

The showcase puts the background exactly there: `D = (1/(n − 1) − 1/n) · R`.
It is the only gap that follows from the glass itself rather than from taste.
The edge band then shows the nearby background mirrored, with the strongest
magnification where the curve meets the flat top — a thick, well-defined
border. Gaps beyond it repeat the mirrored image as multiple fringes; gaps
below it give weaker edges, down to `D = 0`, where the edge barely shows over
a background this smooth.

| `D / R` | Part of the edge band that is mirrored |
| --- | --- |
| 0 | none |
| 0.25 | outer 10% |
| 0.5 | outer 23% |
| 1 | outer 53% |
| 4/3 | all of it — the focal plane, used here |
| > 4/3 | all of it, repeated as more fringes |

### One free parameter

The model has no absolute scale: multiplying `R` and `D` together scales
every ray path and changes nothing else. With the gap tied to `R`, the glass
depends only on `n`, a physical constant, and `R`:

- The **radius is the only free parameter.** The rest of the shape only sizes
  the flat middle — for the label, the text's width.
- The same radius looks the same on any shape. A larger radius is the same
  glass, scaled.
- `R = 0` gives `D = 0` and a flat sheet that bends nothing: invisible glass.
- Separately from the optics, the [lightness lift](#glass-lightness) adds one
  more choice, `L_glass`: how light the thickest glass gets. Its default, 78
  (about 4.1 L\* above the background), is the one value chosen by eye.

What the scaling doesn't change is the background: its blobs are a few hundred
pixels across at any radius, so larger glass bends a larger share of one.

## Glass lightness

The glass also lightens what it shows, in proportion to how much glass there
is: at a point where the glass is `h` thick (out of `R`), the color's CIE L\*
lifts from the background's `L_bg` toward the glass's `L_glass`:

```
L = L_bg + (L_glass − L_bg) · h / R
```

L\* is perceptually uniform, so twice the glass is twice the visible lift. The
color itself never changes, only its lightness: nicrainha's 256-gon has the
same 256 hue angles at every lightness, so the lifted color is the same palette
index on a lighter ring. The glass is background-colored at its rim and
lightest where it is thickest — along the pill's center line, since a pill's
cross-section is a half-cylinder — so it reads as a solid. Black text gets
more contrast on it, not less.

**The default, `L_glass = 78`, is chosen by eye**: a lift of **about 4.1 L\*
points** (78 − 73.9124 = 4.0876) at the thickest glass. That is the amount we
found looks right: enough to read as a lighter body of glass, little enough
that the background's hues stay clearly visible through it. Unlike the
background's lightness and the gap, it is not derived. The only
non-arbitrary values are the two ends of the range — `L_bg` (no lift) and
100, where the 256-gon collapses to white — and at 100 the glass's middle
loses its color entirely. For another background lightness, start from the
same lift of about 4 points.

The rings are precomputed at build time by `lightness-rings.js`: 128 rows from
the background's L\* to 100, about 0.2 apart (below what the eye
distinguishes), each the 256-gon's vertices in vertex order. Computing them
takes a few hundred milliseconds and depends on nothing that varies per page
load, so the page receives them as data and only applies the random rotation,
as an index offset, and the lift, as a row. `?lightness=` picks how far up the
table the thickest glass reaches.

## Reproducing the glass in another UI

1. Draw the background procedurally, so it can be evaluated at any point,
   and color it by palette lookup.
2. Per pixel, trace the view ray as above and evaluate the background where it
   lands. `scene.frag` is self-contained; `backgroundAt` is the only function
   to swap for a different background.
3. Keep `n = 1.5` and `D = (1/(n − 1) − 1/n) · R`. For a label, make the
   glass a pill around the content: radius `R`, height `2R`, flat middle as
   wide as the content, with `R` three line heights of the text by default.
   Any rounded rectangle works too, with `R` at most half its shorter side.
4. Keep colors exact: move the *sample position*, never filter, blend or
   antialias rendered colors.
5. Lift lightness with glass height, `L_bg + (L_glass − L_bg) · h / R`, by
   looking the same palette index up on a lighter ring of the 256-gon, with
   `L_glass` about 4 L\* points above `L_bg`. Precompute the rings rather than
   computing them per load.
