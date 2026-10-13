import { DEFAULT_LIGHTNESS } from "nicrainha";

// The background noise: its permutation table, and its scale and roughness,
// derived from the palette. The shader (shaders/perlin.glsl, scene.frag)
// evaluates Ken Perlin's improved noise from these, per pixel. Runs both in
// the browser and at build time (lightness-rings.js).

// Seeded Fisher–Yates shuffle of 0..255 (classic LCG, as in miniature-waffle).
export function buildPermutation(seed) {
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
  }
  return perm;
}

// ── Scale and roughness, from the palette ───────────────────────────────────
// nicrainha's 256-gon is largest at its default lightness and shrinks toward
// L* 0 and 100. See docs/README.md for the model.
//
// Scale: cells shrink with the circle's radius, r(L) / r(default), so the
// color changes as much per pixel at every lightness as at the default.
//
// Roughness: where the circle is small, its 256 colors round unevenly to
// 8-bit sRGB — some neighbors repeat, others jump — and smooth noise shows
// those uneven steps as bands. The noise is as rough as the steps are uneven:
// with σ the standard deviation of the palette's steps between neighboring
// colors, in ΔE2000, ρ = 1 − σ(default) / σ(L) is 0 wherever the steps are as
// even as the default's. Rounding is close to random, so ρ measured at one
// lightness is noisy; the noise takes its running maximum from the default
// outward, so it only ever grows toward the ends. ρ is the share of the
// noise's energy in its fine detail: fractal noise of gain g keeps 1 − g² of
// its energy in the base octave, so g = √ρ.

const linear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

// CIELAB [L*, a*, b*] of an 8-bit sRGB color (D65).
function lab({ r, g, b }) {
  const R = linear(r), G = linear(g), B = linear(b);
  const fx = labF((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const fy = labF(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const fz = labF((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// CIEDE2000 color difference (Sharma, Wu & Dalal 2005).
function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const C7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(C7 / (C7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hue = (a, b) => { const h = Math.atan2(b, a) / rad; return h < 0 ? h + 360 : h; };
  const h1 = hue(a1p, b1), h2 = hue(a2p, b2);
  let dh = 0;
  if (C1p * C2p) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dL = L2 - L1, dC = C2p - C1p, dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2);
  const Lm = (L1 + L2) / 2, Cm = (C1p + C2p) / 2;
  let hm = h1 + h2;
  if (C1p * C2p) { if (Math.abs(h1 - h2) > 180) hm += hm < 360 ? 360 : -360; hm /= 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad)
    + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const SC = 1 + 0.045 * Cm, SH = 1 + 0.015 * Cm * T;
  const Cm7 = Cm ** 7;
  const RT = -2 * Math.sqrt(Cm7 / (Cm7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

// Radius of a palette's circle, measured as its colors' mean chroma.
const radius = (palette) => palette.map(lab).reduce((sum, [, a, b]) => sum + Math.hypot(a, b), 0) / palette.length;

// Unevenness of a palette's steps: the standard deviation of the ΔE2000
// between each color and the next, around the circle.
function unevenness(palette) {
  const colors = palette.map(lab);
  const steps = colors.map((color, i) => deltaE2000(color, colors[(i + 1) % colors.length]));
  const mean = steps.reduce((sum, step) => sum + step, 0) / steps.length;
  return Math.sqrt(steps.reduce((sum, step) => sum + (step - mean) ** 2, 0) / steps.length);
}

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);

// The cells' scale, r(L) / r(default).
export const scaleFor = (palette, defaultPalette) => clamp01(radius(palette) / radius(defaultPalette));

// ρ measured on one palette: 1 − σ(default) / σ(L).
export const roughness = (palette, defaultPalette) =>
  clamp01(1 - unevenness(defaultPalette) / unevenness(palette));

// The noise's gain at L* `lightness`, given ρ measured on its palette (`rho`)
// and on the palette table's rows (`rowRoughness`, rows at L* 0…100 evenly):
// √ of the largest ρ between `lightness` and the default.
export function gainFor(lightness, rho, rowRoughness) {
  const lowest = Math.min(lightness, DEFAULT_LIGHTNESS), highest = Math.max(lightness, DEFAULT_LIGHTNESS);
  rowRoughness.forEach((rowRho, row) => {
    const rowLightness = (100 * row) / (rowRoughness.length - 1);
    if (rowLightness > lowest && rowLightness < highest) rho = Math.max(rho, rowRho);
  });
  return Math.sqrt(rho);
}

// Octaves of fractal noise with gain `gain`, and how much faster than one
// octave it can change: octave k joins while its weight relative to the
// noise's normalization, gainᵏ / √(Σ gain²ʲ), can still move a value by half
// a palette step (1/256 of one octave's span of 2), and while its wavelength,
// cell / 2ᵏ, is at least 2 device px (Nyquist). One octave at gain 0. Each
// octave changes in time at most as fast as one, so the sum changes at most
// Σ gainᵏ / √(Σ gain²ᵏ) times as fast (`rate`).
export function octaves(gain, cellDevicePx) {
  const nyquist = Math.floor(Math.log2(cellDevicePx / 2)) + 1;
  let count = 1, weight = 1, total = 1, energy = 1;
  while (count < nyquist) {
    weight *= gain;
    if (weight / Math.sqrt(energy + weight * weight) < 1 / 256) break;
    total += weight;
    energy += weight * weight;
    count++;
  }
  return { count, rate: total / Math.sqrt(energy) };
}
