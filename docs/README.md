# nicrainha showcase

An animated, full-screen nicrainha background seen through a floating slab of
glass, with `npm i nicrainha` on it. The glass is a physical model — rays
traced through an exact surface with Snell's law — not a styling effect, and
it puts no color on screen that nicrainha didn't produce.

Live: https://hcubasd.github.io/nicrainha/

This document is also the reference for reproducing the glass in other WebGL
UIs: everything the look depends on is listed and, where possible, derived
below.

## Running

```sh
npm install
npm run dev       # dev server on all interfaces (Vite's default port, 5173)
npm run build     # static site → dist/
```

`docs/` is its own Vite project that installs `nicrainha` from npm, separate
from the library. Pushes that touch `docs/` on the default branch build and
deploy it to GitHub Pages (`.github/workflows/pages.yaml`).

## The look

- **Background:** 3D Perlin noise filling the window, colored by nicrainha's
  256-color palette at its default lightness, slowly evolving.
- **Glass:** a centered rounded rectangle, 560 × 320 CSS px (shrunk to fit
  smaller windows with a 24 px margin), floating above the background. Its
  corner radius is **0.38 of the largest the rectangle allows** (half its
  shorter side: 0.38 × 160 = 60.8 px at full size). Through it the background
  is refracted at the rounded edges and lightened where the glass is thick.
- **Text:** `npm i nicrainha`, black, system monospace, the default 16 px,
  centered on the glass's flat middle, where the glass doesn't refract.

There are no URL parameters; the page always shows this.

## What is derived and what is chosen

**Derived** — physics, geometry, or nicrainha itself:

| What | Value | Why |
| --- | --- | --- |
| Background lightness | L\* 73.9124 | nicrainha's default: where its 256-gon is largest, the most saturated palette |
| Refractive index | 1.5 | glass |
| Air gap | `4/3 · R` | the edge lens's back focal distance ([derivation](#the-gap-the-edges-focal-plane)) |
| Lightness lift | exponential in glass thickness, toward white | each layer of glass closes the same fraction of the remaining way to white ([details](#glass-lightness)) |
| Beyond the window | the window's own edge pixels | [the window is a box](#the-scene-the-window-is-a-box) |
| Color range | the field's exact min and max | computed, not sampled |

**Chosen by eye** — design, not physics:

| What | Value |
| --- | --- |
| Corner radius | 0.38 of the maximum — sets the glass's thickness, gap and lift |
| Whitening length `ℓ` | 8 rem — glass this thick lifts L\* 63% of the way to white |
| Glass size | 560 × 320 CSS px, 24 px margin — layout only, it sizes the flat middle |
| Animation pace | 0.1 noise lattice units per second: the pattern turns over about every 10 s |
| Noise scale | a 2 × 1 noise field across the window, inherited from miniature-waffle's showcase |
| Text | black system monospace, 16 px |

**Numerical** — precision, not appearance: 128 lightness rows (0.2 L\* apart,
below what the eye distinguishes), the tracer's iteration limits and
sub-pixel tolerances. The noise seed and palette rotation are random per page
load, on purpose.

## Files

```
index.html               page shell: full-viewport canvas plus the text
styles.css               layout; the text is centered on screen
main.js                  constants, WebGL setup, glass sizing, render loop
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
   256 palette colors, then lift its lightness by the glass thickness above
   the pixel (zero off the glass).

The palette is nicrainha's 256-gon in a random rotation `r`: rotation `r`
starts at vertex `r`, so it is an index offset. The noise repeats every 256
lattice units, so `z` wraps there without changing any value.

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
rounded rectangle of half-size `(W, H)` and corner radius `R`, at most
`R_max = min(W, H)`.

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
The flat top shifts nothing; the glass bends the background only at its
edges.

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

### Glass lightness

The glass lightens what it shows, more where there is more of it. A pixel
under glass `h` thick keeps the palette index the background picked and takes
it at lightness

```
L = 100 − (100 − L_bg) · e^(−h/ℓ)
```

This is the one curve that satisfies all of:

- **It depends only on the actual thickness `h`,** like the gap, so the same
  corner radius gives the same glass on any rectangle.
- **No glass, no lift:** `L(0) = L_bg`.
- **It never passes white,** however thick the glass: it only approaches 100.
- **Each layer of glass closes the same fraction of the remaining way to
  white** (`dL/dh = (100 − L)/ℓ`) — the Beer–Lambert form, running toward
  white instead of black.

For thin glass it is linear in thickness, with slope `(100 − L_bg)/ℓ` ≈ 0.2
L\* per CSS px; L\* is perceptually uniform, so there twice the glass is twice
the visible lift.

Converting a thickness into a lightness needs one length to measure the
thickness against: `ℓ`, the thickness that closes 1 − 1/e ≈ 63% of the way to
white. Nothing in the physics fixes it. The showcase uses **`ℓ = 8 rem`**
(128 CSS px at the default font size), chosen by eye — it matches the look
first tuned by eye on the full-size glass — and expressed in rem so the glass
follows the user's font size along with the text.

**The same hue, lighter.** nicrainha's 256-gon has the same 256 hue angles at
every lightness, so the lifted color is the same palette index on a lighter
ring — still exactly a nicrainha color. The glass is background-colored at
its rim and lightest over its flat middle, so it reads as a solid. At full
size the flat middle is 60.8 CSS px thick and lifts L\* by about 9.9, to about
83.8. Black text gets more contrast on it, not less.

The rings are precomputed at build time by `lightness-rings.js`: 128 rows from
the background's L\* to 100, about 0.2 apart, each the 256-gon's vertices in
vertex order. Computing them takes a few hundred milliseconds and depends on
nothing that varies per page load, so the page receives them as data and only
applies the random rotation, as an index offset, and the lift, as a row.

### The corner radius

The corner radius `R` sets everything about the glass: its thickness (`R`
over the flat middle), the air gap (`4/3 · R`) and, through the thickness,
the lift. The same `R` gives the same glass on any rectangle; width and
height only size the flat middle. `R = 0` is a flat sheet that bends nothing
and lifts nothing — invisible glass.

The showcase sets it as a fraction of the largest a rounded rectangle allows,
`R = c · R_max` with `c = 0.38`, chosen by eye: 60.8 CSS px at full size.
On a small window the rectangle shrinks, so `R`, the gap and the lift shrink
with it.

The refraction alone has no absolute scale — multiplying `R` and `D` together
scales every ray path and changes nothing else — so the optics look the same
at any radius. The lift does have a scale, `ℓ`: more glass is lighter glass.

## Reproducing the glass in another UI

1. Draw the background procedurally, so it can be evaluated at any point,
   and color it by palette lookup.
2. Per pixel, trace the view ray as above and evaluate the background where it
   lands. `scene.frag` is self-contained; `backgroundAt` is the only function
   to swap for a different background.
3. Make the glass a rounded rectangle with corner radius `R` (here 0.38 of
   half its shorter side), and keep `n = 1.5` and
   `D = (1/(n − 1) − 1/n) · R`.
4. Lift lightness with thickness, `L = 100 − (100 − L_bg) · e^(−h/ℓ)` with
   `ℓ = 8 rem`, by looking the same palette index up on a lighter ring of the
   256-gon. Precompute the rings rather than computing them per load.
5. Keep colors exact: move the *sample position* and the *ring*, never
   filter, blend or antialias rendered colors.
