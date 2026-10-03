#version 300 es
// The nicrainha background seen through a floating glass panel.
//
// Runs once per device pixel, every frame, at full resolution:
//   1. trace the pixel's view ray back through the glass to the background,
//   2. evaluate the background noise where the ray lands,
//   3. look the value up in the nicrainha palette.
// See docs/README.md for the model and its derivations.

precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D u_perm;   // 256×1 noise permutation table (noise.js)
uniform sampler2D u_palette; // 256×1 nicrainha palette, one 256-gon rotation
uniform vec2 u_resolution;   // canvas size in device px
uniform float u_z;           // noise depth: the animation time
uniform float u_min;         // this frame's noise range (noise.js)
uniform float u_range;
uniform vec2 u_panel;        // panel half-size in device px
uniform float u_radius;      // corner radius R in device px
uniform float u_gap;         // air gap D between glass and background, device px
uniform float u_ior;         // refractive index of the glass

out vec4 outColor;

// ── Background: 3D Perlin noise ─────────────────────────────────────────────
// Ken Perlin's improved noise (2002), identical to perlin3 in noise.js.

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

// Noise value at a point of the background plane (device px, y down). The
// viewport shows a centered 2:1 field, x in [0,2) and y in [0,1), with its
// long axis along the screen's long axis.
float backgroundAt(vec2 point) {
  bool portrait = u_resolution.y > u_resolution.x;
  vec2 screen = portrait ? u_resolution.yx : u_resolution;
  vec2 pos = portrait ? point.yx : point;
  float H = max(screen.y, screen.x / 2.0);
  vec2 field = (pos + (vec2(2.0 * H, H) - screen) / 2.0) / H;
  // The noise repeats every 256 lattice units, so wrapping is exact; it keeps
  // far-away landing points within integer range.
  return perlin3(vec3(mod(field, 256.0), u_z));
}

// ── Glass ───────────────────────────────────────────────────────────────────
// Coordinates: x, y in device px from the panel center (y down), z up toward
// the viewer. The background is the plane z = 0. The glass is a solid whose
// flat bottom is at z = D and whose top is every point at distance R from an
// inner rectangle (half-size panel − R) lying at z = D: flat in the middle,
// quarter-cylinders along the edges, eighth-spheres at the corners.

vec2 innerHalfSize() { return u_panel - u_radius; }

// Horizontal offset from the inner rectangle: zero over it, otherwise the
// vector from its nearest point.
vec2 offsetFromInner(vec2 xy) {
  return sign(xy) * max(abs(xy) - innerHalfSize(), 0.0);
}

// Signed distances to the curved top and to the flat bottom; negative inside.
float distanceToTop(vec3 p) { return length(vec3(offsetFromInner(p.xy), p.z - u_gap)) - u_radius; }
float distanceToBottom(vec3 p) { return u_gap - p.z; }

// Signed distance to the glass surface: negative inside. A lower bound on the
// true distance (an intersection of two shapes), which is all marching needs.
float glassDistance(vec3 p) { return max(distanceToTop(p), distanceToBottom(p)); }

// Outward unit normal at a surface point: whichever surface it lies on.
vec3 glassNormal(vec3 p) {
  if (distanceToBottom(p) > distanceToTop(p)) return vec3(0.0, 0.0, -1.0);
  return normalize(vec3(offsetFromInner(p.xy), p.z - u_gap));
}

// Distance along `dir` from `origin`, inside the glass, to its surface.
float distanceToSurface(vec3 origin, vec3 dir) {
  float t = 1e-2;
  for (int i = 0; i < 128; i++) {
    float d = -glassDistance(origin + t * dir);
    if (d < 1e-3) break;
    t += max(d, 1e-3);
  }
  return t;
}

// Follows a ray that has just entered the glass at `pos` heading `dir`.
// Inside, it refracts out where Snell's law allows and reflects (total
// internal reflection) where it doesn't. Returns true and the background
// point when the ray leaves downward; false when it leaves upward, away from
// the only light source in the scene. The glass is convex, so a ray that has
// left never comes back.
bool traceGlass(vec3 pos, vec3 dir, out vec2 landing) {
  for (int bounce = 0; bounce < 16; bounce++) {
    pos += distanceToSurface(pos, dir) * dir;
    vec3 normal = glassNormal(pos);
    vec3 exitDir = refract(dir, -normal, u_ior);  // glass → air
    if (exitDir == vec3(0.0)) {
      dir = reflect(dir, normal);
      continue;
    }
    if (exitDir.z >= 0.0) return false;
    landing = pos.xy + exitDir.xy * (pos.z / -exitDir.z);
    return true;
  }
  return false;
}

// What the viewer sees at `pixel`: the background value, or false for a ray
// that never reaches the background.
bool viewThroughGlass(vec2 pixel, out float value) {
  vec2 center = u_resolution / 2.0;
  vec2 xy = pixel - center;
  vec2 offset = offsetFromInner(xy);
  float s = length(offset);
  if (s >= u_radius) {  // not over the glass
    value = backgroundAt(pixel);
    return true;
  }

  // The view ray comes straight down and refracts into the top surface.
  float h = sqrt(u_radius * u_radius - s * s);
  vec3 entry = vec3(xy, u_gap + h);
  vec3 normal = vec3(offset, h) / u_radius;
  vec3 dir = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / u_ior);  // air → glass

  vec2 landing;
  if (!traceGlass(entry, dir, landing)) return false;
  value = backgroundAt(landing + center);
  return true;
}

// ── Color ───────────────────────────────────────────────────────────────────
// The glass only changes where the background is sampled. The color is a
// direct palette lookup, so every pixel is a nicrainha palette color — or
// black, on the gray axis, where no background light arrives.

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  float value;
  if (!viewThroughGlass(pixel, value)) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float t = clamp((value - u_min) / u_range, 0.0, 1.0);
  outColor = texelFetch(u_palette, ivec2(int(floor(t * 255.0 + 0.5)), 0), 0);
}
