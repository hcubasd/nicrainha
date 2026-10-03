#version 300 es
// Animated nicrainha background seen through a floating glass panel.
// Every pixel is computed independently at full device resolution, every
// frame. See docs/README.md for the derivations behind the glass model.

precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D u_perm;   // 256×1 permutation table, shared with noise.js
uniform sampler2D u_palette; // 256×1 nicrainha palette (one 256-gon rotation)
uniform vec2 u_resolution;   // canvas size, device pixels
uniform float u_z;           // noise depth = animation time
uniform float u_min;         // field range for this frame (from noise.js)
uniform float u_range;
uniform vec2 u_panel;        // panel half-size, device pixels
uniform float u_radius;      // corner radius R, device pixels
uniform float u_gap;         // air gap D = GAP_RATIO · R, device pixels
uniform float u_eta;         // n_air / n_glass

out vec4 outColor;

// ── Background ──────────────────────────────────────────────────────────────

int P(int i) { return int(texelFetch(u_perm, ivec2(i & 255, 0), 0).r); }

float fade(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float grad(int hash, float x, float y, float z) {
  int h = hash & 15;
  float u = h < 8 ? x : y;
  float v = h < 4 ? y : (h == 12 || h == 14) ? x : z;
  return ((h & 1) != 0 ? -u : u) + ((h & 2) != 0 ? -v : v);
}

// Ken Perlin's improved noise (2002); identical to perlin3 in noise.js.
float perlin3(vec3 p) {
  vec3 f = floor(p);
  int X = int(f.x), Y = int(f.y), Z = int(f.z);
  vec3 r = p - f;
  float x = r.x, y = r.y, z = r.z;
  float u = fade(x), v = fade(y), w = fade(z);
  int A = P(X) + Y, AA = P(A) + Z, AB = P(A + 1) + Z;
  int B = P(X + 1) + Y, BA = P(B) + Z, BB = P(B + 1) + Z;
  return mix(
    mix(
      mix(grad(P(AA), x, y, z), grad(P(BA), x - 1.0, y, z), u),
      mix(grad(P(AB), x, y - 1.0, z), grad(P(BB), x - 1.0, y - 1.0, z), u),
      v),
    mix(
      mix(grad(P(AA + 1), x, y, z - 1.0), grad(P(BA + 1), x - 1.0, y, z - 1.0), u),
      mix(grad(P(AB + 1), x, y - 1.0, z - 1.0), grad(P(BB + 1), x - 1.0, y - 1.0, z - 1.0), u),
      v),
    w);
}

// Background field at a point on the background plane (device px, y down).
// The viewport is covered by a centered 2:1 field (x in [0,2), y in [0,1))
// whose long axis follows the screen's long axis, as in miniature-waffle.
float backgroundAt(vec2 point) {
  bool portrait = u_resolution.y > u_resolution.x;
  vec2 screen = portrait ? u_resolution.yx : u_resolution;
  vec2 pos = portrait ? point.yx : point;
  float H = max(screen.y, screen.x / 2.0);
  vec2 field = (pos + (vec2(2.0 * H, H) - screen) / 2.0) / H;
  return perlin3(vec3(field, u_z));
}

// ── Glass ───────────────────────────────────────────────────────────────────
// The panel is flat-bottomed glass floating u_gap above the background. Its
// top surface is every point at distance R from an inner rectangle of
// half-size (panel − R): flat in the middle, quarter-cylinders along the
// edges, eighth-spheres at the corners. The viewer looks straight down, so
// tracing each pixel's ray backwards finds the background point it shows.

// Rays leaving the glass bottom near grazing would land arbitrarily far away,
// and in the outer ~0.7% of the rim they can't leave at all (total internal
// reflection). Horizontal travel across the gap is capped at this slope
// (~76°), which affects the outer ~1.1% of the edge band.
const float MAX_EXIT_SLOPE = 4.0;

// Background point seen through the glass at `pixel`, where the top surface
// has height h and unit normal N.
vec2 refractedPoint(vec2 pixel, vec3 N, float h) {
  // Into the top surface (Snell's law); never totally reflected air → glass.
  vec3 T = refract(vec3(0.0, 0.0, -1.0), N, u_eta);
  // Down through the glass to its flat bottom.
  vec2 point = pixel + T.xy * (h / -T.z);
  // Out of the flat bottom: same azimuth, sin(angle) scaled by n_glass / n_air.
  float sinInside = length(T.xy);
  if (sinInside > 0.0) {
    float sinOutside = sinInside / u_eta;
    float slope = sinOutside < 1.0
      ? min(sinOutside / sqrt(1.0 - sinOutside * sinOutside), MAX_EXIT_SLOPE)
      : MAX_EXIT_SLOPE;
    // Across the air gap to the background.
    point += (T.xy / sinInside) * slope * u_gap;
  }
  return point;
}

float throughGlass(vec2 pixel) {
  vec2 p = pixel - u_resolution / 2.0;
  vec2 q = max(abs(p) - (u_panel - u_radius), 0.0);
  float s = length(q);                       // distance to the inner rectangle
  if (s >= u_radius) return backgroundAt(pixel);  // outside the glass

  float h = sqrt(u_radius * u_radius - s * s);    // glass height
  vec3 N = vec3(sign(p) * q, h) / u_radius;       // points away from the inner rectangle
  return backgroundAt(refractedPoint(pixel, N, h));
}

// ── Color ───────────────────────────────────────────────────────────────────
// The glass only moves where the background is sampled; the color is always
// a direct palette lookup, so every pixel is exactly a nicrainha color.

void main() {
  float value = throughGlass(vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y));
  float t = clamp((value - u_min) / u_range, 0.0, 1.0);
  outColor = texelFetch(u_palette, ivec2(int(floor(t * 255.0 + 0.5)), 0), 0);
}
