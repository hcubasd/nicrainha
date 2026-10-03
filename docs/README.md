# nicrainha showcase

An animated, full-screen nicrainha background seen through a floating glass
panel. The glass is a physical model — Snell's law on an exact surface — not
a styling trick, and it never introduces a color nicrainha didn't produce.

Live: https://hcubasd.github.io/nicrainha/

## Running

```sh
npm install
npm run dev       # dev server on all interfaces (port 5173, or --port N)
npm run build     # static site → dist/
```

`docs/` is its own Vite project that installs `nicrainha` from npm, separate
from the library. Pushes that touch `docs/` on the default branch build and
deploy it to GitHub Pages (`.github/workflows/pages.yaml`).

## Knobs

URL parameters; anything missing, negative or non-numeric falls back to the
default.

| Parameter | Default | Meaning |
| --- | --- | --- |
| `speed` | `1` | Animation speed multiplier. `2` is twice as fast, `0` freezes. At `1` the pattern turns over roughly every 10 s. |
| `radius` | `96` | Panel corner radius in CSS px. Sets the glass's edge curvature, thickness and air gap together, so it alone controls how strong the glass looks. Clamped to half the panel's shorter side (a pill); `0` makes the glass invisible. |

Example: `?speed=0.5&radius=160`

## Files

```
index.html               page shell: full-viewport canvas plus the panel's text
styles.css               layout; the panel's text is centered over the glass
main.js                  knobs, constants, WebGL setup, sizing, render loop
noise.js                 permutation table and CPU Perlin noise (range only)
shaders/fullscreen.vert  one triangle covering the viewport
shaders/scene.frag       background, glass, and palette lookup — per pixel
```

## Rendering

Every frame, the fragment shader runs once per device pixel, at full
resolution, with nothing cached or interpolated between frames:

1. **Glass.** If the pixel is over the panel, trace its view ray back through
   the glass to the background point it shows. Otherwise use the pixel itself.
2. **Background.** Evaluate 3D Perlin noise at that point. `x, y` place the
   point in a centered 2:1 field covering the viewport (long axis along the
   screen's long axis); `z` is time.
3. **Color.** Normalize the noise value to `[0, 1]` with this frame's range
   and look up one of 256 palette colors.

The palette is `generatePalettes(256)[r]` for a random rotation `r`, at
nicrainha's default lightness, uploaded once as a 256×1 texture. The frame's
range comes from `noise.js` sampling the same noise on a 64×32 grid on the
CPU. Noise repeats every 256 lattice units, so `z` wraps there seamlessly.

### Color exactness

Every pixel on screen is exactly one of the 256 palette colors. The glass only
changes *where* the background is sampled, never how a color is computed, and
the lookup uses `texelFetch` on a nearest-filtered texture. There is no
blending, blur, tint, Fresnel reflection or dispersion: each would produce
colors outside the palette, and nicrainha's guarantee — every color equally
distant from the gray axis — would no longer hold on screen.

## Glass model

### Geometry

Screen coordinates `(x, y)` in device px, `z` toward the viewer. The background
is the plane `z = 0`. The panel is a rounded rectangle of half-size `(W, H)`
and corner radius `R`, centered on screen.

The glass has a flat bottom at height `D` (the air gap) and a top surface made
of every point at distance `R` from an **inner rectangle** of half-size
`(W − R, H − R)`:

```
q = max(|p| − (W − R, H − R), 0)      per axis, p = pixel − screen center
s = |q|                               distance from p to the inner rectangle
h = sqrt(R² − s²)                     glass height above its bottom, for s < R
```

- Inside the inner rectangle `s = 0`: a flat top of height `R`.
- Along a straight edge one component of `q` is zero: a quarter-cylinder of
  radius `R`.
- At a corner both are nonzero: an eighth-sphere of radius `R`.
- The footprint `s < R` is exactly the rounded rectangle.

The surface normal is the direction from the nearest inner-rectangle point:

```
N = (sign(p)·q, h) / R
```

### Tracing a pixel

The viewer is orthographic, looking straight down, so the view ray is
`I = (0, 0, −1)`. Light paths are reversible, so following this ray backwards
finds the background point whose light reaches the pixel:

1. **Into the top surface.** `T = refract(I, N, 1/n)`, with `n = 1.5`. Going
   from air into glass a ray is never totally reflected, so every pixel has an
   answer.
2. **Through the glass.** Travel down height `h`: horizontal shift
   `T.xy · h / (−T.z)`.
3. **Out of the flat bottom.** The direction keeps its azimuth and its sine
   scales by `n`: `sin φ = n · |T.xy|`.
4. **Across the gap.** Horizontal shift `D · tan φ` in the direction of
   `T.xy`.

The sum of the two shifts points toward the panel's center: the background is
seen from further inside than the pixel. The flat top (`N` vertical) shifts
nothing, so the panel is visible only through its edges.

### The gap and folding

Along an edge, a pixel at distance `s` into the curved band shows background
position `s − shift(s)`. While that keeps increasing with `s` the edge shows an
upright, compressed image. Where `d shift / d s ≥ 1` the mapping **folds**: the
background runs backwards and repeats mirrored — visible as fringes.

Near the middle of the band both shifts are linear in `s`:

```
d shift / d s = (1 − 1/n) + (n − 1) · D/R
```

which reaches 1 at

```
D / R = 1/(n − 1) − 1/n = 4/3          (n = 1.5)
```

— the **back focal distance** of the edge's plano-convex lens: its focal
length `R/(n − 1)` minus the glass's own thickness `R/n` as seen through it.
At or beyond it the whole edge folds, with more fringes the larger the gap.

Below it, the outer rim still folds, because rays leaving the bottom near
grazing (`φ → 90°`) shift unboundedly. That fold strip widens smoothly with
the gap:

| `D / R` | Folded part of the edge band |
| --- | --- |
| 0 | none |
| 0.1 | outer 3.8% |
| 0.25 | outer 10% |
| 0.5 | outer 23% |
| 1 | outer 53% |
| 4/3 | all of it |

Only `D = 0` is fold-free, but it barely distorts a background this smooth. A
thin fold strip reads as a crisp glass edge line, which is what makes a panel
look like a panel. The showcase uses **`D/R = 0.5`** (`GAP_RATIO` in
`main.js`).

### Why the gap is tied to the radius

The model has no absolute scale: multiplying `R` and `D` by the same factor
scales every shift by that factor and changes nothing else. The look depends
only on `n` and `D/R`. Setting `D = GAP_RATIO · R` therefore gives the same
glass at any corner radius, and can never cross the `4/3` fold limit no matter
how the radius is chosen or clamped. Consequences:

- The corner radius is the only per-panel optical parameter; width and height
  only size the flat middle.
- The largest gap follows from the largest radius, `min(width, height) / 2`.
- `R = 0` gives `D = 0` and a flat sheet that bends nothing: invisible glass.

### The one non-physical choice

In the outer ~0.7% of the rim, rays inside the glass hit the bottom beyond the
critical angle and are totally reflected; just inside that sliver they exit
nearly sideways and would land arbitrarily far away. Their horizontal travel
across the gap is capped at slope `MAX_EXIT_SLOPE = 4` (an exit angle of
about 76°). The cap affects the outer 1.1% of the edge band, about 1 CSS px
at the default radius.

## Reusing the panel in other UIs

To keep the same look elsewhere:

- Keep `n = 1.5` and the gap as a ratio of the corner radius
  (`0 < GAP_RATIO < 4/3`; `0.5` here).
- Size panels freely; let the corner radius set the glass strength, capped at
  half the shorter side.
- Keep color exact: refract the *sample position* and look colors up from the
  palette, rather than filtering or blending rendered colors.
