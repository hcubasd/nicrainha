# nicrainha

A TypeScript library for building perceptually-uniform color palettes from the
CIE Lab color space, for mapping arbitrary colors onto them, and for giving web
UIs an animated nicrainha background with refracting glass panels.

The core idea: for a given lightness `L*`, inscribe the largest regular 256-gon
on the constant-`L*` plane that fits inside the sRGB gamut. Subsets of that
polygon are maximally spread color palettes. All public APIs use `RgbColor`
(`{ r, g, b }` integers in `[0, 255]`) — Lab is internal machinery.

Showcase: https://hcubasd.github.io/nicrainha/

## Install

```sh
npm install nicrainha
```

## API

```ts
import { DEFAULT_LIGHTNESS, generatePalettes, mapColors } from "nicrainha";
```

The colors API runs anywhere. In browsers, the same import also registers two
custom elements, [`<nicrainha-background>` and
`<nicrainha-glass>`](#background-and-glass).

Both functions take an optional `{ lightness }`, a finite number in `[0, 100]`.
It defaults to `DEFAULT_LIGHTNESS` (`73.9124`), the lightness at which the
256-gon is largest (radius ≈ 40.19), i.e. the most saturated palettes.

---

### `generatePalettes(size, options?)`

```ts
generatePalettes(size: number, options?: { lightness?: number }): RgbColor[][]
```

- `size` — integer in `[1, 256]`

Returns all 256 rotations of a `size`-color palette. Index `r` is the palette
starting at 256-gon vertex `r`, so `generatePalettes(size)[r]` is always
rotation `r`. When `size` divides the 256-gon evenly, some rotations contain
the same colors in a different order (e.g. for `size = 4`, index 64 repeats
index 0); they are kept so indices stay aligned.

```ts
const palettes = generatePalettes(3);                  // 256 palettes of 3 colors
const palette = generatePalettes(3)[17];               // rotation 17
const darker = generatePalettes(3, { lightness: 40 }); // same at L*=40
```

At `lightness` 0 or 100 every color is black or white. Near those extremes the
256-gon is tiny, and neighboring vertices can round to the same 8-bit color.

---

### `mapColors(colors, options?)`

```ts
mapColors(colors: readonly RgbColor[], options?: { lightness?: number }): RgbColor[]
```

- `colors` — 1–256 distinct, non-gray `RgbColor` entries

Projects each input color onto the constant-`lightness` plane and matches the
set one-to-one onto the `colors.length`-color palette rotation with minimum
total `(a, b)`-plane distance. Returns one palette color per input, in input
order.

```ts
const [red, blue] = mapColors([
	{ r: 255, g: 0, b: 0 },
	{ r: 0, g: 0, b: 255 },
]);
```

Throws a `RangeError` for:

- a channel that is not an integer in `[0, 255]`
- a gray input (`r === g === b`), which has no hue to match
- a color that appears more than once

## Background and glass

```html
<script type="module">import "nicrainha";</script>

<nicrainha-background lightness="40">
  <nicrainha-glass style="left: 80px; top: 120px; width: 560px; height: 320px; border-radius: 60px">
    Hello
  </nicrainha-glass>
  <!-- …the rest of your UI… -->
</nicrainha-background>
```

Importing `nicrainha` in a browser registers both elements. Outside one (in
Node) it registers nothing. The renderer and its tables load only when a
background appears on the page. They need WebGL2; without it the background
is a single nicrainha color at its lightness.

### `<nicrainha-background>`

An animated nicrainha background filling the viewport, behind its children.
Its children are your UI, on an endless plane that pans in every direction.
The background itself stays in place while the UI pans over it. Use one per
page.

| Attribute | Default | |
| --- | --- | --- |
| `lightness` | `73.9124` (`DEFAULT_LIGHTNESS`) | L\* of the background, `[0, 100]` |
| `speed` | `1` | color steps the animation advances per displayed frame; `0` is still |

Both are also properties, and changing either takes effect at once. Users who
prefer reduced motion get a still background and instant scrolls.

**Panning.** Drags, flings and wheels pan the UI. So do the element's own
scroll APIs, made endless:

- `scrollLeft` and `scrollTop` read or set the pan, in CSS px, unbounded.
- `scrollTo(x, y)` and `scrollBy(dx, dy)` also take `{ left, top, behavior: "smooth" }`.
  A smooth scroll is a fling that comes to rest exactly at the target.
- A `scroll` event fires in every frame the pan changes, before that frame
  draws.

Position your UI on the plane with ordinary CSS. The background shifts it by
the pan, and draws the glass from the same pan, in the same frame. To keep
glass and UI together, move them through the pan or from script, never by
native scrolling or compositor-run CSS animations, which the canvas can't
follow in the same frame. Presses on inputs, buttons, links, labels and
editable content don't start a pan.

A segue is your own code: for example, `background.scrollTo({ left: 2000,
top: 0, behavior: "smooth" })` brings the view placed at `left: 2000px` into
the window.

### `<nicrainha-glass>`

A glass panel: any element inside the background, shaped by its CSS. Its
layout box is its size and position, and its `border-radius` (top-left, at
most half its shorter side) is its corner radius. It has no attributes. Text
on it is black by default, the most contrast on the glass; your CSS can
override that. Panels must not overlap, and a background draws up to 16.

A panel refracts the background behind it at its rounded edges and moves its
lightness toward `DEFAULT_LIGHTNESS`, most where the glass is thickest. With
`border-radius: 0`, CSS's default, it is a flat card at `DEFAULT_LIGHTNESS`
that refracts nothing.

### Model

Lightness is the background's only input, and speed the animation's. The
rest follows from math, measurement or nicrainha, except one value chosen by
eye: the noise scale.

**Background.** Every pixel, every frame:

1. **Noise.** One octave of 3D Perlin noise (Perlin's improved noise), with
   time as the third axis. A lattice cell is the window's short side, or half
   its long side if that is larger (chosen by eye). The noise is defined
   everywhere and stored nowhere.
2. **Position.** The value maps to its share of the noise below it (histogram
   equalization, from the distribution measured at build time), a position
   once around nicrainha's color circle. Every color covers the same share of
   the background. The start of the circle is random per page load.
3. **Palette.** The lightness's palette is the largest `n` for which some
   rotation of `generatePalettes(n, { lightness })` has `n` distinct colors,
   and the first such rotation: 256 colors from L\* 58.5 to 81, 1 at L\* 0 and
   100. The position's band is the palette color it falls after.
4. **Dither.** Every color covers `1/n` of the window, an expected area `A`.
   The pixel shows `j` colors past its band, `j` drawn once per pixel from a
   right-triangular distribution on `[0, ln A)`, so nearer colors are
   likelier. The draw is fixed per pixel: dithering is a display step, at the
   scale of the screen's pixels.

**Speed.** The noise is continuous, but colors aren't, so a change in time
only shows once it carries some pixel into the next color. The smallest step
that can is one vertex of the 256-gon at the noise's steepest:
`Δz = 1 / (256 · 1.66 · 3.09) ≈ 0.00076` lattice units, from the
distribution's peak density and the noise's steepest rate in time. `speed`
is that step per displayed frame, so at 1 every frame shows the next step and
no pixel skips a color. The clock is the display's own frames: faster
displays animate faster.

**Glass.** A panel is a solid with a flat bottom and a top made of every
point within `R` (the corner radius) of an inner rectangle: flat in the
middle, quarter-cylinders along the edges, eighth-spheres at the corners.
Each pixel over it traces its view ray, looking straight down, through the
glass with Snell's law.

- **Refractive index `√2`**: the largest at which no ray is totally
  reflected inside. The steepest ray enters at the vertical rim and meets the
  bottom with `n · sin = √(n² − 1)`, which must be at most 1. Every ray then
  leaves through the bottom and lands on the background, on screen or off.
- **Air gap `(1/(n − 1) − 1/n) · R ≈ 1.707 R`**: the back focal distance of
  the edge, a plano-convex lens of radius `R`. The background lies in the
  edge's focal plane, so every radius shows the same image, scaled.
- **Lightness** moves linearly from the background's toward
  `DEFAULT_LIGHTNESS`, by the distance the ray travels inside the glass over
  `R`, its longest, straight through the flat middle. A background at the
  default shows pure refraction. Flat glass is the limit as `R → 0`: the
  default lightness everywhere.

The glass changes only two inputs of the background's computation: the
position the pixel samples (where its ray lands) and the lightness (from the
ray's path). The palette, band and dither are those of that lightness.
Every pixel is exactly a nicrainha color.

**Panning** uses the platform's own feel: flings decelerate by 0.998 per
millisecond (iOS's `UIScrollView.DecelerationRate.normal`), exactly per frame
whatever the frame rate. Release velocity is measured over the last 100 ms,
and is zero if the pointer rested 40 ms (Android's `VelocityTracker`).

## Mathematical model

### 1. The 256-gon and its radius

Fix a Lab lightness $L^{\ast}$. The library uses the regular 256-gon centered on the
neutral axis, anchored at angle $\frac{3\pi}{2}$ (the $-b$ direction):

$$
v_k = \left(L^{\ast},\; r(L^{\ast})\cos\theta_k,\; r(L^{\ast})\sin\theta_k\right),
\qquad
\theta_k = \frac{3\pi}{2} + \frac{2\pi k}{256},
\qquad k = 0,\dots,255.
$$

The radius is the largest value such that all 256 vertices remain inside sRGB:

$$
r(L^{\ast}) = \min_{0 \le k < 256} \sup\left\lbrace r \ge 0 : v_k(r) \in \text{sRGB} \right\rbrace.
$$

Each per-direction boundary is found in closed form. The Lab → linear RGB
pipeline is piecewise cubic in `r` (the $f^{-1}$ branches of the CIE
piecewise function composed with the sRGB matrix). The solver finds all
polynomial roots in each piecewise interval and picks the smallest crossing.

$r(L^{\ast})$ peaks at $L^{\ast} \approx 73.9124$, which is `DEFAULT_LIGHTNESS`.

### 2. Bresenham n-gons

To build an `n`-color palette from the 256 vertices, the library uses
integer-ratio gap spacing. If

$$
256 = qn + s, \qquad q = \left\lfloor \frac{256}{n} \right\rfloor, \qquad 0 \le s < n,
$$

then the gap sequence has $n - s$ gaps of size $q$ and $s$ gaps of size $q + 1$.
All 256 rotations of this pattern give the 256 palettes returned by
`generatePalettes`.

### 3. Hungarian matching

Given $n$ input colors projected to $(a_i, b_i)$ on the constant-$L^{\ast}$ plane,
and a candidate palette $\{v_0, \dots, v_{n-1}\}$, the cost matrix is the
planar Lab distance:

$$
d_{ij} = \sqrt{(a_i - a_j)^2 + (b_i - b_j)^2}.
$$

The Hungarian algorithm (Kuhn–Munkres, $O(n^3)$) finds the assignment
$\sigma : [n] \to [n]$ minimising $\sum_i d_{i,\sigma(i)}$.
`mapColors` runs this over all 256 rotations and returns the assignment
from the rotation with the smallest total cost, so large inputs are slow
(about 0.4 s for 128 colors).

## Repo structure

```
src/
  index.ts             — public entry point
  colors.ts            — generatePalettes, mapColors, DEFAULT_LIGHTNESS
  types.ts             — RgbColor (+ internal Lab)
  helpers/
    radiusFinder.ts    — exact 256-gon radius via polynomial root-finding
    bresenham.ts       — Bresenham integer gap distribution
    hungarian.ts       — O(n³) Kuhn-Munkres assignment
    converters.ts      — sRGB ↔ CIE Lab
  ui/
    elements.ts        — <nicrainha-background>, <nicrainha-glass>, panning
    renderer.ts        — WebGL2: tables upload, one draw per frame
    shaders.ts         — the fragment shader: glass tracing, noise, palette, dither
    model.ts           — every constant and formula of the background and glass
    palette.ts         — the largest unique n-gon of a lightness
    noise.ts           — Perlin noise and its measured distribution
    tables.ts          — the build-time lookup tables
scripts/
  tables.js            — writes the tables into dist/ui at build time
tests/
  colors.spec.ts
  helpers.spec.ts
  ui.spec.ts
```

## Development

```sh
npm install
npm test          # vitest
npm run build     # tsc → dist/, then the lookup tables
```

The showcase in `docs/` is a separate Vite project that uses the library in
this repo. Pushes that touch `docs/` or `src/` on the default branch deploy it
to GitHub Pages.

```sh
cd docs
npm install
npm run dev       # dev server on all interfaces, for use from a container
```

## Releasing

Push a `v*.*.*` tag. CI sets the package version from the tag, publishes to
npm, and creates a GitHub release.
