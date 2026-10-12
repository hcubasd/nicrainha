#version 300 es
// The showcase: an endless, pannable nicrainha background, seen through a
// floating glass panel.
//
// Runs once per device pixel, every frame, at full resolution:
//   1. trace the pixel's view ray back through the glass into the scene,
//   2. evaluate the background noise at the point it meets,
//   3. look the value up in the nicrainha palette, moved in lightness toward
//      white or black by the thickness of the glass above the pixel.
// See docs/README.md for the model and its derivations.

precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D u_perm;   // 256×1 noise permutation table (noise.js)
uniform vec2 u_resolution;   // canvas size in device px
uniform vec2 u_offset;       // pan position of the window, device px
uniform float u_cell;        // noise lattice cell size, device px
uniform float u_z;           // noise depth: the animation time
uniform int u_octaves;       // octaves of fractal noise, 1 at the default lightness
uniform float u_gain;        // weight of each octave relative to the one before

out vec4 outColor;

#include "perlin.glsl"
#include "glass.glsl"

// Fractal noise: octave k has twice the frequency of the one before and
// u_gain times its weight, and the sum is divided by the root of the summed
// squared weights, so it has the same spread (energy) as one octave. Rare
// peaks then exceed [−1, 1]; the palette is a circle and the mapping wraps,
// so they continue smoothly into the next colors. Each octave is shifted by a fraction of a cell (golden
// ratio multiples) so their lattices don't line up. All octaves share z: they
// evolve at the base rate, so the steepest change in time stays that of one
// octave.
const int MAX_OCTAVES = 16;
const vec2 OCTAVE_SHIFT = vec2(0.6180339887, 0.3819660113);

// Noise value at a point of the floor (device px, y down, relative to the
// window's top-left). The view is panned by u_offset, kept within one
// 256-cell period of the noise, so coordinates stay small however far it
// pans.
//
// `footprint` is how many device px of floor the pixel spans: 1 off the
// glass, more where the glass shrinks the background (its outer rim), less
// where it magnifies. An octave is kept whole while its wavelength is at
// least 2 footprints (Nyquist, as the octave count assumes for footprint 1),
// fades out as its wavelength falls to 1 footprint, and is dropped below
// that, where it could only alias. The base octave is always kept: a pixel
// straddling a jump in the seen point (where a ray's path through the glass
// changes) has no meaningful footprint. The normalization counts only the
// weight kept, so the spread stays that of one octave.
float backgroundAt(vec2 point, float footprint) {
  vec2 p = (point + u_offset) / u_cell;
  float sum = 0.0, energy = 0.0, weight = 1.0, frequency = 1.0;
  for (int k = 0; k < MAX_OCTAVES; k++) {
    if (k >= u_octaves) break;
    float kept = k == 0 ? 1.0 : weight * clamp(log2(u_cell / frequency / footprint), 0.0, 1.0);
    if (kept <= 0.0) break;
    vec2 q = mod(p * frequency + float(k) * OCTAVE_SHIFT, 256.0);
    sum += kept * perlin3(vec3(q, u_z));
    energy += kept * kept;
    weight *= u_gain;
    frequency *= 2.0;
  }
  return sum / sqrt(energy);
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  float thickness;
  vec2 point = seenPoint(pixel, thickness);
  // The floor spanned by this pixel, from the seen points of its neighbors.
  float footprint = max(length(dFdx(point)), length(dFdy(point)));
  float value = backgroundAt(point, footprint);
  outColor = paletteColor(value, thickness);
}
