# nicrainha showcase

An endless, animated nicrainha background you can pan in any direction, seen
through a floating slab of glass with `npm i nicrainha` on it. The glass is a
physical model — rays traced through an exact surface with Snell's law — not
a styling effect, and nothing on screen is a color nicrainha didn't produce.

Live: https://hcubasd.github.io/nicrainha/

This document is the reference for reproducing the look in other UIs. Its one
input is a lightness; everything else is listed below, derived where
possible, and marked where chosen.

## Running

```sh
npm install
npm run dev       # dev server on all interfaces (Vite's default port, 5173)
npm run build     # static site → dist/
```

`docs/` is its own Vite project that installs `nicrainha` from npm, separate
from the library. Pushes that touch `docs/` on the default branch build and
deploy it to GitHub Pages (`.github/workflows/pages.yaml`).

`?lightness=<L*>` sets the background's lightness, 0 to 100. Without it, or
outside that range, it is nicrainha's default, L\* 73.9124, where its
256-gon is largest — the most saturated palette.

## The model

For a lightness `L`, every pixel, every frame:

1. **Glass.** Trace the pixel's view ray back through the glass to the point
   of the background it sees, and note the glass's thickness `h` above the
   pixel (0 off the glass).
2. **Noise.** Evaluate one octave of 3D Perlin noise at that point; time is
   the third axis.
3. **Band.** Map the value, by its share of the noise below it, to a position
   around nicrainha's color circle, and take the color of the palette band it
   falls in.
4. **Dither.** Step a fixed, random number of colors past the band.
5. **Lightness.** Take that color at the lightness the glass moves it to,
   `L` toward white by `h`.

| | | |
| --- | --- | --- |
| **Input** | Background lightness | `?lightness`, else L\* 73.9124 |
| **Derived** | Palette | the largest evenly spaced subset of nicrainha's 256-gon with no repeated color ([palette](#palette)) |
| | Color mapping | the noise's own distribution: every color covers the same share of the background ([bands](#bands)) |
| | Dither | `ln A` colors, `A` the expected area of one color, right-triangular ([dither](#dither)) |
| | Refractive index | 1.5, glass |
| | Air gap | `4/3 · R`, the edge lens's back focal distance ([gap](#the-gap-the-edges-focal-plane)) |
| | Glass lightness | toward white, each layer closing the same fraction of the remaining way ([lightness](#glass-lightness)) |
| | Text color | black or white, whichever has more contrast on the glass under it ([text](#text)) |
| | Fling | iOS's deceleration, Android's velocity tracking ([panning](#panning)) |
| | Redraw rate at rest | the time the steepest pixel takes to cross one palette step ([frames](#frames)) |
| **Chosen by eye** | Noise scale | the window's long side spans 2 lattice cells, unless its short side would span more than one |
| | Animation pace | 0.1 lattice units per second: the pattern turns over about every 10 s |
| | Glass size | 560 × 320 CSS px, 24 px margin — it only sizes the flat middle |
| | Corner radius `R` | 0.38 of the largest the rectangle allows — sets the glass's thickness, gap and lightness |
| | Glass length `ℓ` | 8 rem — glass this thick moves L\* 63% of the way to white |
| | Text | system monospace, 16 px |
| **Random per load** | | the noise's permutation, and where on the circle the noise starts |

**Numerical**, precision rather than appearance: 256 table rows of lightness
(L\* 0.39 apart, about one 8-bit sRGB level), the noise distribution's 1,024
bins, the tracer's iteration limits and sub-pixel tolerances.

## Files

```
index.html               page shell: full-window canvas plus the text
styles.css               layout and the two text colors
main.js                  the page: lightness, panning, the glass's layout, frames
model.js                 the page's constants and formulas: noise scale and pace, glass, text color
renderer.js              WebGL: the tables' upload, and one draw per frame
palette.js               the palette a lightness uses
noise.js                 the noise's permutation, value distribution and steepest rate
tables.js                build-time tables (a Vite plugin): the 256-gon at 256 lightnesses, their palettes, the noise distribution
vite.config.js           registers that plugin
shaders/fullscreen.vert  one triangle covering the window
shaders/scene.frag       a pixel, end to end
shaders/glass.glsl       the glass: geometry and ray tracer
shaders/perlin.glsl      3D Perlin noise
shaders/color.glsl       palette band, dither, glass lightness
```

## Background

### An endless background without storing anything

Perlin noise is a pure function of position and time: the same `(x, y, z)`
always gives the same value. So there are no tiles to generate, cache or
evict: each frame evaluates exactly the visible pixels at the current pan,
and any place you come back to is as you left it. Memory doesn't grow however
far you travel; the whole state is the pan, the time, a 256-byte permutation
table and the palette tables. Time is one global `z`, so the whole plane
evolves in step.

The noise repeats every 256 lattice cells on every axis. The cell is a whole
number of device pixels, so the period is too, and the page keeps the pan and
`z` within it before they reach the GPU: seamless — the dither too, which
repeats with it — and shader coordinates stay small, so float precision is
the same however far you travel.

The background is **one octave**, at every lightness: the smoothest shapes
noise makes. At full size a cell is the window's short side, or half its long
side if that is larger.

### Palette

nicrainha's 256-gon at a lightness is 256 colors evenly around a circle,
rounded to 8-bit sRGB. Toward L\* 0 and 100 the circle shrinks, neighbors
round to the same color, and at the ends it is a single color.

The background uses the **largest evenly spaced palette of unique colors**:
the largest `n` for which some rotation of nicrainha's `n`-gon,
`generatePalettes(n)[rotation]`, has `n` different colors — and the first
such rotation. Every `n`-gon is a subset of the 256-gon (rotation `r` takes
vertices `r + ⌊k · 256 / n⌋`), so one call for the 256-gon answers every `n`.
Uniqueness isn't monotone in `n` once any rotation may be chosen, so `n` is
scanned down from 256; the worst lightness takes under 0.1 s.

| L\* | 0 | 0.5 | 1 | 5 | 10 | 20 | 30 | 40 | 50 | 58.5–81 | 90 | 95 | 99 | 100 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `n` | 1 | 12 | 21 | 63 | 93 | 133 | 148 | 225 | 255 | 256 | 126 | 86 | 18 | 1 |

Evenly spaced and unique, every step between neighboring colors is the same
size around the circle: no duplicated colors widening some steps, no rounding
collisions.

### Bands

One octave of Perlin noise spans exactly `[−1, 1]` but rarely leaves ±0.45
(90% of it is inside). Mapped linearly around the circle, the middle colors
would fill most of the screen and the rest show up as slivers. Instead a
value maps to its **share of the noise below it**, its cumulative
distribution: a position once around the circle at which every color covers
the same share of the background — histogram equalization. The distribution
is measured at build time from 4 million points over the noise's whole
period and 4 permutations; it holds for any seed.

The palette's color `k`, the **band**, spans the positions from its vertex to
the next. The mapping is fixed — a value picks the same color wherever and
whenever it occurs, so panning never shifts colors — and the circle has no
ends, so the noise's highest values sit next to its lowest. Where on the
circle the noise starts is random per page load, so each load shows other
colors at its peaks.

### Dither

A continuous field over finitely many colors draws bands; the fewer the
colors, the wider and more visible their edges. The dither spreads each edge
over the colors beyond it.

Each color covers `1/n` of the background, an expected area
`A = window area / n` (device px). A pixel of band `k` shows color `k + j`,
around the circle, with `j` drawn from a **right-triangular distribution on
`[0, w)`, `w = ln A`**: the band's own color is the likeliest, and the next
ones ahead less and less. The logarithm grows the reach slowly with the area
a color has to cover — a few colors for any window and palette:

| | `n` | `A` (900 × 600) | `w` | the band's own color |
| --- | --- | --- | --- | --- |
| L\* 73.9 | 256 | 2,100 px | 7.7 | 24% |
| L\* 20 | 133 | 4,100 px | 8.3 | 23% |
| L\* 1 | 21 | 26,000 px | 10.2 | 19% |

The draw is one uniform number per **spot of the background**, a PCG hash of
the pixel's position plus the pan, taken by inverse CDF:
`j = ⌊w (1 − √u)⌋`. It is fixed, so the grain pans with the background, and
as the noise drifts colors flow through it instead of flickering. It is keyed
to the pixel's own spot, not the point the glass shows there, so the glass
doesn't stretch it. Only palette colors appear.

## Glass

### Geometry

Coordinates: `x, y` in device px from the glass's center, `z` up toward the
viewer. The background is the plane `z = 0`. The glass's footprint is a
rounded rectangle of half-size `(W, H)` and corner radius `R`, at most
`min(W, H)`.

The glass is a solid with a flat bottom at height `D` (the air gap) and a top
made of every point at distance `R` from an **inner rectangle** of half-size
`(W − R, H − R)` lying at `z = D`. Over a screen point `p`:

```
o = sign(p) · max(|p| − (W − R, H − R), 0)    offset from the inner rectangle
s = |o|
h = sqrt(R² − s²)                              glass thickness, for s < R
N = (o, h) / R                                 outward normal of the top
```

Over the inner rectangle the top is flat, thickness `R`; along a straight
edge it is a quarter-cylinder; at a corner, an eighth-sphere. The footprint
`s < R` is exactly the rounded rectangle, and the solid is convex.

### Tracing a pixel

The viewer looks straight down (orthographic), so a pixel's view ray is
`(0, 0, −1)`. Light paths are reversible: following it backwards finds the
point whose light reaches the pixel.

1. **Enter.** Refract into the top at `(p, D + h)`: `refract((0, 0, −1), N,
   1/n)`.
2. **Cross.** Sphere-trace to the surface along the ray with the solid's
   signed distance, `max(distance to the top, distance to the bottom)`.
3. **Leave or reflect.** Refract out, `refract(dir, −normal, n)`; if Snell's
   law has no solution (total internal reflection), reflect and repeat 2.
4. **Meet the scene.** Heading down, the ray lands on the endless
   background, wherever that is — on screen or off. Heading up it never
   reaches it, and takes the window's edge pixel where its horizontal path
   crosses the window's border, as if each edge pixel continued straight up
   as a wall.

A ray that has left the glass never re-enters, because it is convex. The
iteration limits (512 steps per crossing, 64 reflections) were checked at
several sizes and pixel densities: no ray reaches them.

Almost every ray goes in through the top, out through the flat bottom and
across the gap. The flat top shifts nothing; the glass bends the background
only at its edges. Toward the outer edge the surface steepens and rays leave
the bottom ever closer to sideways, showing background far from the glass;
in the outermost ~0.7% of the edge they can't leave the bottom at all, bounce
and leave upward, onto the walls. Each pixel is one point sample, so the rim
is stair-stepped; smoothing it would mean blending colors.

### The gap: the edge's focal plane

Along an edge, a pixel at distance `s` into the curved band shows background
position `s − shift(s)`. Near the start of the band

```
d shift / d s = (1 − 1/n) + (n − 1) · D/R
```

The edge is a plano-convex lens, and that slope reaches 1 at

```
D / R = 1/(n − 1) − 1/n
```

where the background lies exactly in the lens's focal plane — its **back
focal distance**, the focal length `R/(n − 1)` less the glass thickness as
seen through the glass, `R/n`. For glass, `n = 1.5`, it is `4/3`, and the
shader derives the gap from the index. The edge band then shows the nearby
background mirrored, most magnified where the curve meets the flat top: a
thick, well-defined border. Smaller gaps give weaker edges, down to none at
`D = 0`; larger ones repeat the mirrored image as more fringes.

Refraction alone has no absolute scale — scaling `R` and `D` together scales
every ray path and nothing else — so the optics look the same at any radius.

### Glass lightness

The glass moves what it shows toward white, more where there is more of it.
A pixel under glass `h` thick keeps the color the background picked and
takes it at

```
L = 100 − (100 − L_bg) · e^(−h/ℓ)
```

the one curve that depends only on the thickness, changes nothing where
there is no glass, never passes white however thick, and closes the same
fraction of the remaining way with each layer of glass (`dL/dh = (100 −
L)/ℓ`, the Beer–Lambert form). For thin glass it is linear in thickness, and
L\* is perceptually uniform, so twice the glass is twice the visible change.

Converting thickness to lightness needs one length: `ℓ`, the thickness that
closes 1 − 1/e ≈ 63% of the way. Nothing physical fixes it; **`ℓ = 8 rem`**
(128 CSS px at the default font size) is chosen by eye, in rem so the glass
follows the user's font size along with the text. At full size the flat
middle is `R = 60.8` CSS px thick: L\* 73.9 → 83.8, L\* 20 → 50.2,
L\* 1 → 38.4.

**The same hue, lighter.** The color under glass is the same position on the
circle, on nicrainha's 256-gon at the new lightness (nicrainha's 256-gon has
the same 256 hue angles at every lightness), in that lightness's own palette
and band, with the same dither draw. The rings are a table of 256
lightnesses, L\* 0 to 100, built at build time with their palettes; a pixel
takes the nearest. Within half a row of the background's L\*, it takes the
background's own ring, computed in the browser at exactly that lightness, so
the glass meets the background seamlessly at its rim.

On dark backgrounds, lightening reveals the hue the background hides: at
L\* 1 the background is near black, and the glass shows its colors at
L\* 38.

### Text

The label sits on the glass's flat middle, where it doesn't refract, at
lightness `L_mid = 100 − (100 − L_bg) · e^(−R/ℓ)`. Every color of a nicrainha
palette has the palette's L\*, hence the same luminance, so one text color
holds for all of it: **black or white, whichever has more contrast**. They
have equal WCAG contrast at luminance `Y = √(1.05 · 0.05) − 0.05 ≈ 0.179`,
L\* ≈ 49.4, both 4.58:1 — above WCAG AA's 4.5:1 even there. At full size the
text is white below a background of L\* 18.7 and black above. It follows the
glass's actual thickness, so on a small window, with thinner glass, the
switch moves toward L\* 49.4.

### The corner radius

The corner radius `R` sets everything about the glass: its thickness (`R`
over the flat middle), the air gap (`4/3 · R`) and, through the thickness,
its lightness. The same `R` gives the same glass on any rectangle; width and
height only size the flat middle. `R = 0` is a flat sheet: invisible glass.
The showcase uses 0.38 of the largest the rectangle allows, chosen by eye:
60.8 CSS px at full size, smaller on small windows.

## Panning

The browser's own scrolling can't be endless or two-dimensional, so the page
pans the background itself, as maps do. It also moves the glass and the
label, in the same frame it draws, so they never lag the background.

- **Drag:** the background follows the pointer exactly.
- **Fling:** on release, the background keeps the pointer's velocity —
  measured over its last 100 ms, and zero if it rested 40 ms before release
  (Android's `VelocityTracker`) — and decelerates by a factor of 0.998 per
  millisecond, iOS's own scroll deceleration. Each frame advances the fling
  exactly, `v · (0.998^dt − 1) / ln 0.998`, so its feel doesn't depend on the
  frame rate. It stops once the travel it has left is under half a device
  pixel.
- **Wheel and trackpad:** their deltas pan directly; trackpads add their own
  momentum. Pinch (a wheel with Ctrl) is left to the browser.

**The glass wraps.** It moves with the background, and its position wraps,
horizontally and vertically, with a period of the window plus its own size:
it leaves the window entirely before coming back in from the opposite side,
so there is only ever one panel and one label.

### Frames

A frame is drawn when the view moved — a drag, a fling, a wheel, a resize —
and otherwise only as often as the animation can change a pixel. The noise's
steepest rate in time is `max |∂n/∂z| ≈ 3.09` (measured over 8 million
points, refined by local search); the mapping's steepest is at the commonest
value, density `p_max ≈ 1.66` per unit of noise. The finest palette step is
one vertex of the 256-gon, `1/256` of the circle, so the steepest pixel
crosses one every

```
1 / (256 · p_max · 3.09 · 0.1) s ≈ 7.6 ms
```

rounded to whole display frames: at rest the page redraws every frame up to
about 200 Hz. Most pixels change far slower; this is the bound that never
skips a change.

### Cost

- **One draw per frame, one triangle**, one fragment per device pixel. No
  geometry, render targets, readbacks, or per-frame allocation or upload: a
  frame sets a handful of uniforms (pan, time, panels) and draws.
- **Off the glass**, a pixel costs one Perlin evaluation (14 permutation
  lookups), one hash and five table lookups.
- **Under the glass**, it also traces its ray: almost always one crossing;
  only the outermost rim reflects.
- **Nothing scales with distance traveled**: no tiles, no caches.
- **Setup is once per page load**: nicrainha's 256-gon at the exact
  lightness and its palette (under 0.1 s). The other 256 rings, their
  palettes and the noise distribution are built at build time.

## Reproducing it in another UI

1. **Palette.** Take nicrainha's 256-gon at your lightness, and its largest
   `n`-gon of unique colors (`palette.js`).
2. **Background.** Draw it procedurally — one octave of Perlin noise,
   equalized through its distribution — so it can be evaluated at any point
   and needs no tiles. Offset its coordinates by your pan, kept within the
   noise's period.
3. **Dither** by a fixed draw per spot of the background, `j = ⌊ln A ·
   (1 − √u)⌋` colors ahead.
4. **Glass.** Per pixel, trace the view ray as above (`glass.glsl` is
   self-contained) and evaluate the background where it lands. Keep
   `n = 1.5` and `D = (1/(n − 1) − 1/n) · R`.
5. **Lightness.** Move it toward white with thickness, `L = 100 − (100 −
   L_bg) · e^(−h/ℓ)`, by looking the same circle position up on the 256-gon
   at that lightness; precompute those rings. Pick the text color on the
   glass's flat middle.
6. **Keep colors exact.** Move the sample position and the ring, never
   filter, blend or antialias rendered colors, and give the canvas exactly
   one pixel per device pixel.
7. **Move everything in the frame you draw.** If the background moves under
   content, pan it yourself, or put the canvas in the scrolled content; never
   draw a fixed canvas to follow native scrolling.
8. **Draw only when something moved**, or when the animation could have
   changed a pixel.
