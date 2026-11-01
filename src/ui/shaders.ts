// The renderer's shaders. The fragment shader runs once per device pixel,
// every frame:
//   1. glass: if the pixel is over a glass panel, trace its view ray through
//      the glass to the point of the background it sees, and measure how far
//      the ray traveled inside the glass;
//   2. engine: evaluate the background there: one octave of Perlin noise,
//      mapped to a position on nicrainha's color circle, colored by the
//      palette of the lightness the glass gives it, dithered per pixel.
// Every pixel is exactly a nicrainha color. See the README for the model.

// One triangle covering the viewport; no vertex buffers.
export const vertexShader: string = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const fragmentShader: string = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform vec2 u_resolution;            // device px
uniform float u_windowArea;           // device px²
uniform float u_cell;                 // noise lattice cell, device px
uniform float u_z;                    // noise depth: the animation

uniform usampler2D u_perm;            // 256 × 1 noise permutation
uniform sampler2D u_cdf;              // the noise's CDF at values −1…1 evenly
uniform int u_shift;                  // where on the circle the noise starts
uniform sampler2D u_palette;          // 256 vertices × ROWS + 2 rows: L* 0…100,
                                      // then the background's, then the default's
uniform usampler2D u_ngons;           // each row's palette: size n, then rotation
uniform float u_lightness;            // the background's L*
uniform float u_defaultLightness;     // nicrainha's default L*

uniform int u_panelCount;
uniform highp sampler2D u_panels;         // two texels per panel, in rows:
                                          // center.xy, halfSize.xy, then R,
                                          // all device px
uniform float u_ior;                      // refractive index
uniform float u_gapRatio;                 // air gap D / R
uniform float u_minRadius;                // below this, glass is flat

out vec4 outColor;

// ── Perlin noise ─────────────────────────────────────────────────────────────
// Ken Perlin's improved noise (2002): values in [−1, 1], period 256.

int P(int i) { return int(texelFetch(u_perm, ivec2(i & 255, 0), 0).r); }

float fade(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float grad(int hash, float x, float y, float z) {
  int h = hash & 15;
  float u = h < 8 ? x : y;
  float v = h < 4 ? y : (h == 12 || h == 14) ? x : z;
  return ((h & 1) != 0 ? -u : u) + ((h & 2) != 0 ? -v : v);
}

float perlin3(vec3 p) {
  vec3 f = floor(p);
  int X = int(f.x), Y = int(f.y), Z = int(f.z);
  vec3 r = p - f;
  float x = r.x, y = r.y, z = r.z;
  float u = fade(x), v = fade(y), w = fade(z);
  int A = P(X) + Y, AA = P(A) + Z, AB = P(A + 1) + Z;
  int B = P(X + 1) + Y, BA = P(B) + Z, BB = P(B + 1) + Z;
  return mix(
    mix(mix(grad(P(AA), x, y, z), grad(P(BA), x - 1.0, y, z), u),
        mix(grad(P(AB), x, y - 1.0, z), grad(P(BB), x - 1.0, y - 1.0, z), u), v),
    mix(mix(grad(P(AA + 1), x, y, z - 1.0), grad(P(BA + 1), x - 1.0, y, z - 1.0), u),
        mix(grad(P(AB + 1), x, y - 1.0, z - 1.0), grad(P(BB + 1), x - 1.0, y - 1.0, z - 1.0), u), v),
    w);
}

// ── Glass ────────────────────────────────────────────────────────────────────
// Device px, y down, z up toward the viewer, who looks straight down. The
// background is the plane z = 0. A panel is a solid whose flat bottom floats
// at the gap D and whose top is every point within R of an inner rectangle
// (half-size − R) lying at z = D: flat in the middle, quarter-cylinders along
// the edges, eighth-spheres at the corners. It is convex. Positions are
// relative to its center.

struct Panel {
  vec2 center;
  vec2 halfSize;
  float radius;
  float gap;
};

vec4 panelTexel(int t) {
  int width = textureSize(u_panels, 0).x;
  return texelFetch(u_panels, ivec2(t % width, t / width), 0);
}

Panel panelAt(int i) {
  vec4 box = panelTexel(2 * i);
  float radius = panelTexel(2 * i + 1).x;
  return Panel(box.xy, box.zw, radius, u_gapRatio * radius);
}

// Horizontal offset from the inner rectangle: zero over it, else the vector
// from its nearest point.
vec2 offsetFromInner(Panel panel, vec2 xy) {
  return sign(xy) * max(abs(xy) - (panel.halfSize - panel.radius), 0.0);
}

bool covers(Panel panel, vec2 xy) {
  if (panel.radius < u_minRadius) return all(lessThan(abs(xy), panel.halfSize));
  return length(offsetFromInner(panel, xy)) < panel.radius;
}

// Signed distances to the curved top and the flat bottom, negative inside.
float distanceToTop(Panel panel, vec3 p) {
  return length(vec3(offsetFromInner(panel, p.xy), p.z - panel.gap)) - panel.radius;
}
float distanceToBottom(Panel panel, vec3 p) { return panel.gap - p.z; }

vec3 surfaceNormal(Panel panel, vec3 p) {
  if (distanceToBottom(panel, p) > distanceToTop(panel, p)) return vec3(0.0, 0.0, -1.0);
  return normalize(vec3(offsetFromInner(panel, p.xy), p.z - panel.gap));
}

// Distance along \`dir\` from \`origin\`, inside the glass, to its surface, by
// sphere tracing max(top, bottom), a lower bound on the true distance.
const int MAX_STEPS = 512;
float distanceToSurface(Panel panel, vec3 origin, vec3 dir) {
  float t = 1e-2;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = origin + t * dir;
    float d = -max(distanceToTop(panel, p), distanceToBottom(panel, p));
    if (d < 1e-3) break;
    t += max(d, 1e-3);
  }
  return t;
}

// Where the view ray at \`pixel\` lands on the background, and how far it
// traveled inside the glass over R (0 off the glass, 1 straight through the
// flat middle). At the refractive index used, no ray is totally reflected:
// each enters through the top, leaves through the bottom heading down, and
// lands on the background, on screen or off.
vec2 seenPoint(vec2 pixel, out float travel) {
  travel = 0.0;
  for (int i = 0; i < u_panelCount; i++) {
    Panel panel = panelAt(i);
    vec2 xy = pixel - panel.center;
    if (!covers(panel, xy)) continue;
    // Flat glass bends nothing, and is the limit of the travel at R → 0.
    travel = 1.0;
    if (panel.radius < u_minRadius) return pixel;

    // The view ray comes straight down and refracts in through the top.
    vec2 offset = offsetFromInner(panel, xy);
    float h = sqrt(max(panel.radius * panel.radius - dot(offset, offset), 0.0));
    vec3 pos = vec3(xy, panel.gap + h);
    vec3 dir = refract(vec3(0.0, 0.0, -1.0), vec3(offset, h) / panel.radius, 1.0 / u_ior);
    float path = distanceToSurface(panel, pos, dir);
    pos += path * dir;
    dir = refract(dir, -surfaceNormal(panel, pos), u_ior);
    travel = min(path / panel.radius, 1.0);
    // A ray grazing the very rim can fail to leave in floating point.
    if (dir.z >= 0.0) return pixel;
    return panel.center + pos.xy + dir.xy * (pos.z / -dir.z);
  }
  return pixel;
}

// ── Engine ───────────────────────────────────────────────────────────────────

const int ROWS = 256;
const int BACKGROUND_ROW = ROWS;
const int DEFAULT_ROW = ROWS + 1;

// The palette row for L*: the background's or the default's own ring within
// half a row of either, else the nearest table row.
int rowFor(float lightness) {
  float rowStep = 100.0 / float(ROWS - 1);
  if (abs(lightness - u_lightness) < rowStep / 2.0) return BACKGROUND_ROW;
  if (abs(lightness - u_defaultLightness) < rowStep / 2.0) return DEFAULT_ROW;
  return int(floor(lightness / rowStep + 0.5));
}

// Where a noise value falls once around the circle, in [0, 1): its share of
// the noise below it, so every color covers the same share of the
// background, shifted by u_shift.
float positionOf(float value) {
  float bins = float(textureSize(u_cdf, 0).x - 1);
  float b = clamp((value + 1.0) * 0.5, 0.0, 1.0) * bins;
  int i = min(int(b), int(bins) - 1);
  float share = mix(texelFetch(u_cdf, ivec2(i, 0), 0).r, texelFetch(u_cdf, ivec2(i + 1, 0), 0).r, b - float(i));
  return fract(share + float(u_shift) / 256.0);
}

// PCG2D hash (Jarzynski & Olano 2020).
uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}

// The color at circle position \`position\`, L* \`lightness\`, for screen pixel
// \`spot\`. The row's palette is nicrainha's n-gon at the row's rotation r,
// vertices r + ⌊k · 256 / n⌋, and the band, color k, spans the positions
// from its vertex to the next. Dither: every color covers 1/n of the window,
// an expected area A, and the pixel shows j colors past its band, j drawn
// once per pixel from a right-triangular distribution on [0, ln A).
vec4 color(float position, float lightness, ivec2 spot) {
  int row = rowFor(lightness);
  int n = int(texelFetch(u_ngons, ivec2(row, 0), 0).r);
  int r = int(texelFetch(u_ngons, ivec2(row, 1), 0).r);
  int y = int(mod(position * 256.0 - float(r), 256.0)) & 255;
  int k = ((y + 1) * n + 255) / 256 - 1;
  float w = log(max(u_windowArea / float(n), 1.0));
  float u = (float(pcg2d(uvec2(spot)).x) + 0.5) / 4294967296.0;
  int c = (k + int(floor(w * (1.0 - sqrt(u))))) % n;
  return texelFetch(u_palette, ivec2((r + (c * 256) / n) & 255, row), 0);
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  float travel;
  vec2 point = seenPoint(pixel, travel);
  float value = perlin3(vec3(mod(point / u_cell, 256.0), u_z));
  float lightness = mix(u_lightness, u_defaultLightness, travel);
  outColor = color(positionOf(value), lightness, ivec2(floor(pixel)));
}
`;
