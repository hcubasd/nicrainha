// The background noise's permutation table. The shader (shaders/perlin.glsl)
// evaluates Ken Perlin's improved noise from it, per pixel.

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

// ── Roughness: nicrainha's cone, carried into the noise ─────────────────────
// nicrainha's 256-gon is largest at its default lightness and shrinks to a
// point toward L* 0 and 100. The noise follows: ρ = 1 − r(L) / r(default) is
// 0 at the default, where the noise is one smooth octave, and approaches 1
// toward the ends, where it becomes rough. ρ is the share of the noise's
// energy in its fine detail: fractal noise of gain g keeps 1 − g² of its
// energy in the base octave, so g = √ρ.

const linear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

// CIELAB chroma of an 8-bit sRGB color (D65).
function chroma({ r, g, b }) {
  const R = linear(r), G = linear(g), B = linear(b);
  const fx = labF((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const fy = labF(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const fz = labF((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return Math.hypot(500 * (fx - fy), 200 * (fy - fz));
}

// Radius of a palette's circle, measured as its colors' mean chroma.
const radius = (palette) => palette.reduce((sum, color) => sum + chroma(color), 0) / palette.length;

// The noise's gain, √ρ, for a background whose palette is `palette`, given
// the default's.
export function gainFor(palette, defaultPalette) {
  const rho = Math.min(Math.max(1 - radius(palette) / radius(defaultPalette), 0), 1);
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
