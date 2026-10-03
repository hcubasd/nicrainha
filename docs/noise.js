// CPU side of the background noise. The shader (shaders/scene.frag) evaluates
// the same 3D Perlin noise per pixel; this copy exists only to measure the
// field's range each frame. Both read the same permutation table, so their
// values agree.

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

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + t * (b - a);

function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14) ? x : z;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

// Ken Perlin's improved noise (2002). Periodic with period 256 on every axis.
export function perlin3(perm, x, y, z) {
  const P = (i) => perm[i & 255];
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  x -= X; y -= Y; z -= Z;
  const u = fade(x), v = fade(y), w = fade(z);
  const A = P(X) + Y, AA = P(A) + Z, AB = P(A + 1) + Z;
  const B = P(X + 1) + Y, BA = P(B) + Z, BB = P(B + 1) + Z;
  return lerp(
    lerp(
      lerp(grad(P(AA), x, y, z), grad(P(BA), x - 1, y, z), u),
      lerp(grad(P(AB), x, y - 1, z), grad(P(BB), x - 1, y - 1, z), u),
      v,
    ),
    lerp(
      lerp(grad(P(AA + 1), x, y, z - 1), grad(P(BA + 1), x - 1, y, z - 1), u),
      lerp(grad(P(AB + 1), x, y - 1, z - 1), grad(P(BB + 1), x - 1, y - 1, z - 1), u),
      v,
    ),
    w,
  );
}

// Min and range of the 2:1 background field (x in [0,2), y in [0,1)) at
// depth z, sampled on a 64×32 grid. The shader stretches this range over the
// whole palette, as miniature-waffle's static version did per image.
export function fieldRange(perm, z) {
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < 32; j++) {
    for (let i = 0; i < 64; i++) {
      const v = perlin3(perm, i / 32, j / 32, z);
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { min, range: max - min || 1 };
}
