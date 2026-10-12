# nicrainha showcase

An endless, animated nicrainha background you can pan in any direction, seen
through a floating slab of glass with `npm i nicrainha` on it. The glass is a
physical model — rays traced through an exact surface with Snell's law — not
a styling effect, and it puts no color on screen that nicrainha didn't
produce.

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

- **Background:** 3D Perlin noise covering an endless plane, colored by
  nicrainha's 256-color palette, slowly evolving. Drag, fling, scroll or
  swipe to pan it in any direction.
- **Glass:** a rounded rectangle, 560 × 320 CSS px (shrunk to fit smaller
  windows with a 24 px margin), floating above the background. It starts
  centered and moves with the background; once it has left the window on
  one side, it comes back in from the opposite one. Its corner radius is **0.38
  of the largest the rectangle allows** (half its shorter side: 0.38 × 160 =
  60.8 px at full size). Through it the background is refracted at the
  rounded edges and moved toward white, or toward black on dark backgrounds,
  where the glass is thick.
- **Text:** `npm i nicrainha`, system monospace, the default 16 px, on the
  glass's flat middle, where the glass doesn't refract. Black on light
  backgrounds, white on dark ones.

### URL parameter

`?lightness=<L*>` sets the background's lightness, from 0 to 100. Without it,
or with a value outside that range, the background is at nicrainha's default,
L\* 73.9124, where its 256-gon is largest — the most saturated palette.

The lightness also decides the mode:

- **Light** (black text, glass toward white) when black text has more
  contrast on the background than white text;
- **Dark** (white text, glass toward black) otherwise.

Every color of a nicrainha palette has the palette's L\*, hence the same
luminance, so one answer holds for the whole background. Black and white
text have equal WCAG contrast at luminance `Y = √(1.05 · 0.05) − 0.05 ≈
0.179`, L\* ≈ 49.4, where both give 4.58:1 — above the 4.5:1 of WCAG AA even
there. The glass only moves the text's background further from the text's
color, so it never lowers contrast.

Near L\* 0 or 100, nicrainha's 256-gon shrinks toward gray, so the background
is muted and the glass has little room to move. That is the palette, not a
limit of the page.

## What is derived and what is chosen

**Derived** — physics, geometry, measurement, platforms, or nicrainha itself:

| What | Value | Why |
| --- | --- | --- |
| Background lightness | `?lightness`, else L\* 73.9124 | nicrainha's default: its most saturated palette |
| Light or dark mode | by text contrast, switching at L\* ≈ 49.4 | [equal contrast for black and white text](#url-parameter) |
| Refractive index | 1.5 | glass |
| Air gap | `4/3 · R` | the edge lens's back focal distance ([derivation](#the-gap-the-edges-focal-plane)) |
| Glass lightness | exponential in thickness, toward white or black | each layer of glass closes the same fraction of the remaining way ([details](#glass-lightness)) |
| Noise roughness | gain `√ρ`, `ρ = 1 − r(L)/r(default)`; octaves until too weak or below Nyquist — per pixel, through the glass | [nicrainha's cone, carried into the noise](#roughness-nicrainhas-cone-in-the-noise) |
| Color mapping | noise `[−1, 1]` → one turn of the palette | the noise's exact range; [fixed, so panning never shifts colors](#color) |
| Off-screen | the endless background itself | [the floor is endless](#the-scene-an-endless-floor) |
| Fling deceleration | velocity × 0.998 per ms | iOS's `UIScrollView.DecelerationRate.normal` |
| Release velocity | over the last 100 ms; zero if the pointer rested 40 ms | Android's `VelocityTracker` horizon and "pointer stopped" time |
| Redraw rate at rest | every ≈ 25 ms at the default, sooner on rougher noise | the time the noise's steepest pixel takes to step one palette color ([details](#frames)) |

**Chosen by eye** — design, not physics:

| What | Value |
| --- | --- |
| Corner radius | 0.38 of the maximum — sets the glass's thickness, gap and lightness |
| Glass length `ℓ` | 8 rem — glass this thick moves L\* 63% of the way to white or black |
| Glass size | 560 × 320 CSS px, 24 px margin — layout only, it sizes the flat middle |
| Animation pace | 0.1 noise lattice units per second: the pattern turns over about every 10 s |
| Noise scale | the window's long axis spans 2 lattice cells, unless its short axis would span more than one |
| Text | system monospace, 16 px |

**Numerical** — precision, not appearance: the octaves' golden-ratio shifts, 256 lightness rows (L\* 0.39
apart, about one 8-bit sRGB level), the tracer's iteration limits and
sub-pixel tolerances, the noise's steepest slope in time (measured). The
noise seed and palette rotation are random per page load, on purpose.

## Files

```
index.html               page shell: full-window canvas plus the text
styles.css               layout and the two text colors
main.js                  the lightness parameter, panning, the glass's position, frames
scene.js                 the renderer: WebGL setup and one draw per frame
gl.js                    shared WebGL plumbing, glass constants, the palette upload, light/dark mode
noise.js                 the noise's permutation table and roughness model
lightness-rings.js       build-time palette table (a Vite plugin)
vite.config.js           registers that plugin
shaders/fullscreen.vert  one triangle covering the window
shaders/scene.frag       the endless background, and the pixel's color
shaders/perlin.glsl      3D Perlin noise
shaders/glass.glsl       the glass: geometry, tracer, scene, palette lookup
```

## Rendering

The fragment shader runs once per device pixel of the window, at full
resolution, with nothing cached between frames:

1. **Glass.** If the pixel is over the glass, trace its view ray through the
   glass to the point of the scene it shows (below). Otherwise use the pixel
   itself.
2. **Background.** Evaluate fractal 3D Perlin noise at that point. `x, y`
   are its position on the endless plane — the pixel plus the pan — in
   lattice cells; `z` is time. How many octaves, and how rough, follows from
   the lightness ([roughness](#roughness-nicrainhas-cone-in-the-noise)) and
   from how much of the plane the pixel spans through the glass.
3. **Color.** Pick one of the 256 palette colors from the value, then move
   its lightness toward the target by the glass thickness above the pixel
   (zero off the glass).

The canvas has exactly one pixel per device pixel. It is sized from the
browser's own device-pixel measure of it (`ResizeObserver`'s
`device-pixel-content-box`; rounded CSS size × pixel ratio where a browser
doesn't report it, as Safari doesn't), because a canvas the browser has to
rescale blends colors.

### An endless background without storing anything

Perlin noise is a pure function of position and time: the same `(x, y, z)`
always gives the same value. So there are no cells or tiles to generate in
advance, to cache, or to evict: each frame evaluates exactly the visible
pixels at the current pan, and any place you come back to is as you left it.
Panning into new territory costs exactly what redrawing the same territory
costs, and memory doesn't grow however far you travel — the whole state is
the pan, the time, a 256-byte permutation table and the palette table. Time
is one global `z`, so the whole plane evolves in step.

The noise repeats every 256 lattice units on every axis. The page keeps the
pan and `z` modulo that period before they reach the GPU: seamless, and the
shader's coordinates stay small, so float precision is the same however far
you travel. At full size a cell is 720 CSS px, so the plane repeats only
every 184,000 px.

### Roughness: nicrainha's cone in the noise

nicrainha's 256-gon is largest at its default lightness and shrinks to a
point toward L\* 0 and 100. The noise follows that cone: the smaller the
palette's circle, the rougher the noise. With `r(L)` the circle's radius
(measured as its colors' mean CIELAB chroma),

```
ρ = 1 − r(L) / r(default)
```

is 0 at the default and approaches 1 toward the ends. ρ is the **share of
the noise's energy in its fine detail**. The background is fractal noise:
octave `k` at `2ᵏ` times the base frequency and `gᵏ` times its weight. Such
noise keeps `1 − g²` of its energy (variance) in the base octave, so

```
g = √ρ
```

- **At the default, `g = 0`:** one octave, plain Perlin noise.
- **Normalization by energy:** the sum is divided by `√(Σ g²ᵏ)`, so it has the
  same spread as one octave at every lightness, and rough pages use as much
  of the palette as smooth ones. Rare peaks then exceed `[−1, 1]`; the
  palette is a circle and the mapping wraps, so they continue smoothly into
  the next colors, and a value still always picks the same color.
- **Octaves** are added while the next one, relative to that normalization,
  could still move a value by half a palette step (`1/256` of one octave's
  span), and while its wavelength is at least 2 device px (Nyquist): one at
  the default, 6 at L\* 60, and the Nyquist limit (9–10) from about L\* 50
  down and L\* 85 up.
- **Through the glass, per pixel:** the glass changes how much floor a pixel
  spans (its footprint, measured from the seen points of neighboring
  pixels): its outer rim squeezes a wide strip of background into a few
  pixels. There, finer octaves would alias into speckle, so an octave is kept
  whole while its wavelength is at least 2 footprints (the same Nyquist rule),
  fades out as it falls to 1 footprint, and is dropped below that — the idea
  behind mipmapping. The base octave is always kept, and the normalization
  counts only the weight kept. Off the glass the footprint is 1 and nothing
  changes.
- **Roughness as a Hurst exponent:** gain `g` means `H = −log₂ g`: infinite
  (perfectly smooth) at the default, 1 (classic fractal noise) around L\* 50,
  approaching 0 (rough) toward the ends, never reaching it — at L\* 0 or 100
  the palette is a single color, and nothing shows.

| L\* | ρ | gain `√ρ` | octaves (2× screen) |
| --- | --- | --- | --- |
| 73.9 (default) | 0 | 0 | 1 |
| 60 | 0.15 | 0.39 | 6 |
| 50 | 0.27 | 0.51 | 9 |
| 30 | 0.49 | 0.70 | 10 |
| 20 / 90 | 0.60 / 0.66 | 0.77 / 0.81 | 10 |

This also hides 8-bit banding where it is worst. Away from the default the
256 palette colors are closer together than 8-bit color represents evenly,
so some neighbors round to the same color and others jump; in smooth noise
those jumps draw contour lines. The finer octaves break those gradients up.

Each octave is shifted by a fraction of a cell (multiples of the golden
ratio's fractional parts) so their lattices don't line up. All octaves share
`z`, so they evolve at the base rate and every lightness drifts at the same
pace. Each octave costs one more noise evaluation per pixel: up to 10× the
noise work away from the default.

### Color

Every pixel is exactly a nicrainha color.

**Index.** One octave of noise spans exactly `[−1, 1]` (a multi-start search
over 4,800 local extrema found none beyond 1; the maximum, 1, sits at the
center of a cell face), and the fractal sum is normalized to the same spread.
That range is one turn of the 256-color palette:

```
index = (⌊(n + 1) · 128⌋ + rotation) mod 256
```

A value picks the same color wherever and whenever it occurs, so panning
never shifts colors. The palette is a circle — index 255 sits next to index 0
— so the mapping wraps rather than clips, seamlessly. A single screen shows
the part of the circle its noise covers, as a map shows one region. The
rotation is random per page load, an index offset: rotation `r` of the
palette starts at vertex `r`.

**Row.** Off the glass, the color is taken from the background's own ring:
nicrainha's 256-gon at exactly the requested lightness, computed in the
browser by `generatePalettes` (a few milliseconds). Under glass it is the
same index on another ring of the 256-gon (see [glass
lightness](#glass-lightness)), from a table of 256 rings at L\* 0 to 100
precomputed at build time by `lightness-rings.js`. nicrainha's 256-gon has the
same 256 hue angles at every lightness, so the index keeps its hue from ring
to ring.

The glass changes *where* the background is sampled and *which ring* the
color is taken from, never how a color is computed. Lookups are `texelFetch`
from a nearest-filtered texture. There is deliberately no blending, blur,
tint, Fresnel reflection, dispersion or antialiasing: each would put colors
outside nicrainha's on screen. (Dropping octaves too fine for a pixel, above,
filters the noise *before* its value picks a color, so it doesn't.)

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

### The scene: an endless floor

The background is an endless floor, so a ray heading down lands on real
background wherever it goes, on screen or off. Only a ray that leaves the
glass heading up never reaches it; it takes the window's edge pixel where its
horizontal path crosses the window's border, as if each edge pixel continued
straight up as a wall. Every ray therefore meets something, and every pixel
has a color.

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
4. **Meet the scene.** The ray continues in a straight line to the floor, or,
   heading up, to the window's wall.

A ray that has left the glass never re-enters, because it is convex. There is
no arbitrary clamp: rays land wherever the math puts them. The tracer's
iteration limits (512 marching steps per crossing, 64 reflections) were
checked by rendering at several sizes and pixel densities: no ray reaches
them. One that did would continue from wherever it was.

For almost every pixel the path is the simple one: in through the top, out
through the flat bottom, across the gap. The sideways shift points toward the
glass's center, so the background is seen from further inside than the pixel.
The flat top shifts nothing; the glass bends the background only at its
edges.

### The rim

Toward the outer edge the surface steepens, and the rays leave the bottom
ever closer to sideways, so they travel ever further across the gap and show
background far from the glass. In the outermost ~0.7% of the edge band they
can't leave the bottom at all (total internal reflection); they bounce, leave
upward, and end on the window's wall. The rim therefore shows thin bands of
distant background. It is stair-stepped because each pixel is one point
sample; smoothing it would mean blending colors.

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
border. There a strip of pixels sees the same line of background, smeared
across the edge: on rough backgrounds that shows as streaks perpendicular to
the edge, as a real slab would show over a fine texture. Gaps beyond it
repeat the mirrored image as multiple fringes; gaps below it give weaker
edges, down to `D = 0`, where the edge barely shows over
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

The glass moves what it shows toward a target lightness — white (L\* 100) in
light mode, black (L\* 0) in dark mode — more where there is more of it. A
pixel under glass `h` thick keeps the palette index the background picked and
takes it at lightness

```
L = L_target + (L_bg − L_target) · e^(−h/ℓ)
```

This is the one curve that satisfies all of:

- **It depends only on the actual thickness `h`,** like the gap, so the same
  corner radius gives the same glass on any rectangle.
- **No glass, no change:** `L(0) = L_bg`.
- **It never passes the target,** however thick the glass: it only
  approaches it.
- **Each layer of glass closes the same fraction of the remaining way**
  (`dL/dh = (L_target − L)/ℓ`) — the Beer–Lambert form.

For thin glass it is linear in thickness, with slope `|L_target − L_bg|/ℓ`;
L\* is perceptually uniform, so there twice the glass is twice the visible
change.

Converting a thickness into a lightness needs one length to measure the
thickness against: `ℓ`, the thickness that closes 1 − 1/e ≈ 63% of the way.
Nothing in the physics fixes it. The showcase uses **`ℓ = 8 rem`** (128 CSS px
at the default font size), chosen by eye, and expressed in rem so the glass
follows the user's font size along with the text. Thickness is a length, so
any curve from thickness to lightness needs such a length; models without
one, such as `1 − a/(1 + h/a)`, only hide it in the unit `h` is measured in.

**The same hue, lighter or darker.** The moved color is the same palette
index on another ring of nicrainha's 256-gon — still exactly a nicrainha
color. The glass is background-colored at its rim and furthest from it over
its flat middle, so it reads as a solid. At full size on the default
background, the flat middle is 60.8 CSS px thick and lifts L\* by about 9.9,
to about 83.8.

The rings come from the 256-row table, the nearest row to `L`. Within half a
row of the background's L\* the background's own ring is used, so the glass
meets the background seamlessly at its rim.

### The corner radius

The corner radius `R` sets everything about the glass: its thickness (`R`
over the flat middle), the air gap (`4/3 · R`) and, through the thickness,
the lightness. The same `R` gives the same glass on any rectangle; width and
height only size the flat middle. `R = 0` is a flat sheet that bends nothing
and changes nothing — invisible glass.

The showcase sets it as a fraction of the largest a rounded rectangle allows,
`R = c · R_max` with `c = 0.38`, chosen by eye: 60.8 CSS px at full size.
On a small window the rectangle shrinks, so `R`, the gap and the lightness
change shrink with it.

The refraction alone has no absolute scale — multiplying `R` and `D` together
scales every ray path and changes nothing else — so the optics look the same
at any radius. The lightness does have a scale, `ℓ`: more glass is lighter,
or darker, glass.

## Panning

The browser's own scrolling can't be endless or two-dimensional this way, so
the page pans the background itself, as maps do. Because the page also moves
the glass and the label, in the same frame as it draws, they can never lag
the background — the lag of a canvas tracking natively scrolled content
doesn't arise.

- **Drag:** the background follows the pointer exactly.
- **Fling:** on release, the background keeps the pointer's velocity —
  measured over its last 100 ms, and zero if it rested 40 ms before release
  (Android's `VelocityTracker`) — and decelerates by a factor of 0.998 per
  millisecond, iOS's own scroll deceleration. Each frame advances the fling
  exactly, `v · (0.998^dt − 1) / ln 0.998`, so its feel doesn't depend on the
  frame rate. It stops once all the travel it has left is under half a device
  pixel.
- **Wheel and trackpad:** their deltas pan directly; trackpads already add
  their own momentum. Pinch (a wheel with Ctrl) is left to the browser.

**The glass wraps.** It moves with the background, and its position wraps,
horizontally and vertically, with a period of the window plus the panel's own
size: it leaves the window entirely before coming back in from the opposite
side, so there is only ever one panel (and one label).

### Frames

A frame is drawn when the view moved — a drag, a fling, a wheel, a resize —
and otherwise only as often as the animation needs. The noise's steepest rate
of change in time is `max |∂n/∂z| ≈ 3.09` (measured over 8 million points and
refined by local search); at 0.1 lattice units per second, the steepest pixel
of one octave steps one palette color (2/256 of its span) every

```
(2/256) / (0.1 · 3.09) s ≈ 25 ms
```

Fractal noise can change up to `Σ gᵏ / √(Σ g²ᵏ)` times faster — each octave
at most as fast as one, then the energy normalization — so rough pages redraw
proportionally more often: every 25 ms at the default, about 14 ms at L\* 50,
9 ms at L\* 20. The interval is rounded to whole display frames, so at rest a
120 Hz screen draws every third frame at the default.

### Cost

What the renderer does, and doesn't, spend:

- **One draw per frame, one triangle**, one fragment per device pixel. No
  geometry, no render targets, no readbacks, no per-frame allocation or
  texture upload: a frame sets a handful of uniforms (pan, time, panels) and
  draws.
- **Off the glass**, a pixel costs only the noise: one Perlin evaluation per
  octave (8 permutation lookups each) and one palette lookup. That is 1
  evaluation at the default and up to about 10 toward L\* 0 and 100.
- **Under the glass**, a pixel also traces its ray: sphere tracing through the
  solid, almost always a single crossing; only the outermost rim reflects.
  The rim's footprint filtering then skips octaves it can't show.
- **Nothing scales with distance traveled**: no tiles, no caches (see
  [above](#an-endless-background-without-storing-anything)).
- **Frames are skipped** when nothing moves, down to the noise's own pace.
- **Setup is once per page load**: one nicrainha palette at the exact
  lightness (a few ms); the 256 other rings are built at build time.

## Reproducing the glass in another UI

1. Draw the background procedurally, so it can be evaluated at any point,
   and color it by palette lookup.
2. Per pixel, trace the view ray as above and evaluate the background where it
   lands. `glass.glsl` is self-contained; `backgroundAt(point, footprint)` in
   `scene.frag` is the only function to swap for a different background. A
   detailed background should drop detail finer than `footprint`, as this
   one drops octaves.
3. Make the glass a rounded rectangle with corner radius `R` (here 0.38 of
   half its shorter side), and keep `n = 1.5` and
   `D = (1/(n − 1) − 1/n) · R`.
4. Move lightness with thickness, `L = L_target + (L_bg − L_target) ·
   e^(−h/ℓ)` with `ℓ = 8 rem`, toward white or black by text contrast, by
   looking the same palette index up on another ring of the 256-gon.
   Precompute the rings rather than computing them per load.
5. Keep colors exact: move the *sample position* and the *ring*, never
   filter, blend or antialias rendered colors, and give the canvas exactly
   one pixel per device pixel.
6. If the background moves under content, move everything in the same frame
   you draw — your own panning — or put the canvas in the scrolled content;
   never draw a fixed canvas to follow native scrolling. A procedural
   background needs no tiling: offset its coordinates by the pan, kept within
   the noise's period.
7. Draw only when something moved, or when the animation could have changed
   a pixel's color; with a fractal background, scale that pace by its
   octaves' combined rate.
