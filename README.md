# nicrainha

A TypeScript library for building perceptually-uniform color palettes from the
CIE Lab color space, and for mapping arbitrary colors onto them.

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
tests/
  colors.spec.ts
  helpers.spec.ts
```

## Development

```sh
npm install
npm test          # vitest
npm run build     # tsc → dist/
```

The showcase in `docs/` is a separate Vite project that installs `nicrainha`
from npm. Pushes that touch `docs/` on the default branch deploy it to GitHub
Pages.

```sh
cd docs
npm install
npm run dev       # dev server on all interfaces, for use from a container
```

## Releasing

Push a `v*.*.*` tag. CI sets the package version from the tag, publishes to
npm, and creates a GitHub release.
