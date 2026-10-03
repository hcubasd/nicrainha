# nicrainha showcase

An animated, full-screen nicrainha background seen through a floating glass
panel. The glass is a physical model — rays traced through an exact surface
with Snell's law — not a styling effect, and it puts no color on screen that
nicrainha didn't produce.

Live: https://hcubasd.github.io/nicrainha/

This document is also the reference for reproducing the panel in other WebGL
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
| `radius` | `96` | Panel corner radius, CSS px. The only free parameter of the glass: it sets the edge curvature, the thickness and the air gap together. Capped at half the panel's shorter side (a pill); `0` makes the glass invisible. |
| `speed` | `1` | Animation speed multiplier, for the showcase only. `2` is twice as fast, `0` freezes. At `1` the pattern turns over roughly every 10 s. |

Example: `?radius=160&speed=0.5`

## Files

```
index.html               page shell: full-viewport canvas plus the panel's text
styles.css               layout; the panel's text is centered over the glass
main.js                  knobs, constants, WebGL setup, sizing, render loop
noise.js                 permutation table and CPU Perlin noise (range only)
shaders/fullscreen.vert  one triangle covering the viewport
shaders/scene.frag       background, glass tracing and palette lookup
```

## Rendering

The fragment shader runs once per device pixel, every frame, at full
resolution, with nothing cached or interpolated between frames:

1. **Glass.** If the pixel is over the panel, trace its view ray through the
   glass to the background point it shows (below). Otherwise use the pixel
   itself.
2. **Background.** Evaluate 3D Perlin noise at that point. `x, y` place it in
   a centered 2:1 field covering the viewport, long axis along the screen's
   long axis; `z` is time.
3. **Color.** Normalize the value with this frame's range and look up one of
   the 256 palette colors.

The palette is `generatePalettes(256)[r]` for a random rotation `r`, at
nicrainha's default lightness, uploaded once as a 256×1 texture. The frame's
range comes from `noise.js` sampling the same noise on a 64×32 grid on the
CPU. The noise repeats every 256 lattice units, so `z` wraps there and far
landing points are wrapped too, both without changing any value.

### Color

Every pixel is exactly one of the 256 palette colors, or black where no
background light arrives (see the rim, below). The glass only changes *where*
the background is sampled, never how a color is computed, and the lookup is a
`texelFetch` from a nearest-filtered texture. There is deliberately no
blending, blur, tint, Fresnel reflection, dispersion or antialiasing: each
would put colors outside the palette on screen. Black, like the panel's text,
lies on the gray axis that every nicrainha color is equally far from.

## Glass model

### Geometry

Coordinates: `x, y` in device px from the panel center, `z` up toward the
viewer. The background is the plane `z = 0`. The panel is a rounded rectangle
of half-size `(W, H)` and corner radius `R`.

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

### Tracing a pixel

The viewer looks straight down (orthographic), so a pixel's view ray is
`(0, 0, −1)`. Light paths are reversible: following the view ray backwards
finds the background point whose light reaches the pixel.

1. **Enter.** Refract into the top surface at `(p, D + h)`:
   `refract((0, 0, −1), N, 1/n)`. Entering glass a ray is never totally
   reflected.
2. **Cross the glass.** March to the surface along the ray using the solid's
   signed distance, `max(distance to the top, distance to the bottom)`.
3. **Leave or reflect.** Refract out, `refract(dir, −normal, n)`. If Snell's
   law has no solution (total internal reflection), reflect and repeat 2.
4. **Land.** A ray that leaves downward crosses the gap in a straight line and
   lands on `z = 0`. A ray that leaves upward heads away from the scene's only
   light source, the background, so the pixel is black.

A ray that has left the glass never re-enters, because it is convex. Nothing
is clamped: however far a ray travels across the gap, it lands where the math
puts it. The only limits are numerical: the shader gives up after 16
reflections or 128 marching steps per crossing and treats that ray like one
leaving upward.

For almost every pixel the path is the simple one: in through the top, out
through the flat bottom, across the gap. The sideways shift points toward the
panel's center, so the background is seen from further inside than the pixel.
The flat top shifts nothing; the panel shows only through its edges.

### The rim

Toward the outer edge the surface steepens, and in the outermost ~0.7% of the
edge band the rays hit the bottom beyond the critical angle. Traced onward,
they reflect and end up leaving the glass upward. Those pixels are black: a
one-pixel hairline around the panel that comes out of the physics rather than
being drawn. It is stair-stepped because each pixel is one point sample;
smoothing it would mean blending colors.

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

- The **corner radius is the only free parameter.** Panel width and height
  only size the flat middle.
- The same radius looks the same at any panel size. A larger radius is the
  same glass, scaled.
- The gap follows the radius when the viewport shrinks the panel and the
  radius is capped at half the shorter side.
- `R = 0` gives `D = 0` and a flat sheet that bends nothing: invisible glass.

What the scaling doesn't change is the background: its blobs are a few hundred
pixels across at any radius, so a larger panel bends a larger share of one.

## Reproducing the panel in another UI

1. Draw the background procedurally, so it can be evaluated at any point,
   and color it by palette lookup.
2. Per pixel, trace the view ray as above and evaluate the background where it
   lands. `scene.frag` is self-contained; `backgroundAt` is the only function
   to swap for a different background.
3. Keep `n = 1.5` and `D = (1/(n − 1) − 1/n) · R`. Choose `R` per panel, at
   most half the panel's shorter side.
4. Keep colors exact: move the *sample position*, never filter, blend or
   antialias rendered colors.
