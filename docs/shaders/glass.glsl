// The glass model of the showcase: the floor the background lies on, the
// glass panels floating above it, the ray tracer through them, and the
// palette lookup. Included after perlin.glsl (gl.js
// resolves #include). See docs/README.md for the model and its derivations.

uniform sampler2D u_palette; // nicrainha's 256-gon, 256 vertices × (TABLE_ROWS + 1) rows:
                             // rows 0…TABLE_ROWS − 1 at L* 0…100 evenly, then the
                             // background's own ring, at its exact lightness
const int TABLE_ROWS = 256;
uniform int u_rotation;      // palette rotation: index offset into the vertices
uniform float u_lightness;   // the background's L*
uniform float u_target;      // L* the glass tends to: 100 (light mode) or 0 (dark mode)
uniform float u_glassLength; // glass thickness ℓ that closes 1 − 1/e of the way to the
                             // target, device px
uniform vec2 u_boxMin;       // the window: centers of its outermost pixels, device px
uniform vec2 u_boxMax;
// Glass panels, in device px: center and half-size, then corner radius R and
// air gap D between glass and background.
const int MAX_PANELS = 16;
uniform int u_panelCount;
uniform vec4 u_panelBox[MAX_PANELS];   // center.xy, halfSize.xy
uniform vec2 u_panelShape[MAX_PANELS]; // R, D
uniform float u_ior;         // refractive index of the glass

// ── Scene ───────────────────────────────────────────────────────────────────
// The background is an endless floor. A ray heading down lands on it,
// wherever that is, on screen or off. A ray heading up never reaches it; it
// takes the window's edge pixel where its horizontal path crosses the
// window's border, as if each edge pixel continued straight up as a wall.
// Coordinates are device px with y down, z up toward the viewer; the floor is
// z = 0.

// Where a ray starting at `pos` with direction `dir` meets the scene.
vec2 hitBox(vec3 pos, vec3 dir) {
  if (dir.z < 0.0) return pos.xy + dir.xy * (pos.z / -dir.z);
  vec2 toWall = vec2(
    dir.x > 0.0 ? (u_boxMax.x - pos.x) / dir.x : dir.x < 0.0 ? (u_boxMin.x - pos.x) / dir.x : 1e30,
    dir.y > 0.0 ? (u_boxMax.y - pos.y) / dir.y : dir.y < 0.0 ? (u_boxMin.y - pos.y) / dir.y : 1e30);
  float t = min(toWall.x, toWall.y);
  if (t >= 1e30) return clamp(pos.xy, u_boxMin, u_boxMax);  // straight up
  return clamp(pos.xy + t * dir.xy, u_boxMin, u_boxMax);
}

// ── Glass ───────────────────────────────────────────────────────────────────
// Each pixel is traced through at most one panel: the one whose glass is
// thickest above it (panels that overlap are an approximation). The functions
// below describe that panel, held in these globals.

vec2 g_half;     // half-size
float g_radius;  // corner radius R
float g_gap;     // air gap D

void selectPanel(int i) {
  g_half = u_panelBox[i].zw;
  g_radius = u_panelShape[i].x;
  g_gap = u_panelShape[i].y;
}

// Positions here are relative to the panel center. The glass is a solid whose
// flat bottom is at z = D and whose top is every point at distance R from an
// inner rectangle (half-size panel − R) lying at z = D: flat in the middle,
// quarter-cylinders along the edges, eighth-spheres at the corners.

vec2 innerHalfSize() { return g_half - g_radius; }

// Horizontal offset from the inner rectangle: zero over it, otherwise the
// vector from its nearest point.
vec2 offsetFromInner(vec2 xy) {
  return sign(xy) * max(abs(xy) - innerHalfSize(), 0.0);
}

// Signed distances to the curved top and to the flat bottom; negative inside.
float distanceToTop(vec3 p) { return length(vec3(offsetFromInner(p.xy), p.z - g_gap)) - g_radius; }
float distanceToBottom(vec3 p) { return g_gap - p.z; }

// Signed distance to the glass surface: negative inside. A lower bound on the
// true distance (an intersection of two shapes), which is all marching needs.
float glassDistance(vec3 p) { return max(distanceToTop(p), distanceToBottom(p)); }

// Outward unit normal at a surface point: whichever surface it lies on.
vec3 glassNormal(vec3 p) {
  if (distanceToBottom(p) > distanceToTop(p)) return vec3(0.0, 0.0, -1.0);
  return normalize(vec3(offsetFromInner(p.xy), p.z - g_gap));
}

// Iteration limits of the tracer. Rays grazing the rim need many small steps
// and several reflections; at these limits none runs out in practice.
const int MAX_STEPS = 512;
const int MAX_BOUNCES = 64;

// Distance along `dir` from `origin`, inside the glass, to its surface.
float distanceToSurface(vec3 origin, vec3 dir) {
  float t = 1e-2;
  for (int i = 0; i < MAX_STEPS; i++) {
    float d = -glassDistance(origin + t * dir);
    if (d < 1e-3) break;
    t += max(d, 1e-3);
  }
  return t;
}

// Follows a ray that has just entered the glass at `pos` heading `dir`, and
// returns where and in which direction it leaves. Inside, it refracts out
// where Snell's law allows and reflects (total internal reflection) where it
// doesn't. The glass is convex, so a ray that has left never comes back.
void traceGlass(inout vec3 pos, inout vec3 dir) {
  for (int bounce = 0; bounce < MAX_BOUNCES; bounce++) {
    pos += distanceToSurface(pos, dir) * dir;
    vec3 normal = glassNormal(pos);
    vec3 exitDir = refract(dir, -normal, u_ior);  // glass → air
    if (exitDir != vec3(0.0)) {
      dir = exitDir;
      return;
    }
    dir = reflect(dir, normal);
  }
}

// The point of the scene the viewer sees at `pixel`, and the thickness of the
// glass there in device px: 0 off the glass and at its rim, R over its flat
// top.
vec2 seenPoint(vec2 pixel, out float thickness) {
  // Pick the panel with the thickest glass above the pixel.
  thickness = 0.0;
  int chosen = -1;
  for (int i = 0; i < MAX_PANELS; i++) {
    if (i >= u_panelCount) break;
    selectPanel(i);
    float s = length(offsetFromInner(pixel - u_panelBox[i].xy));
    if (s >= g_radius) continue;
    float h = sqrt(g_radius * g_radius - s * s);
    if (h > thickness) { thickness = h; chosen = i; }
  }
  if (chosen < 0) return pixel;  // not over the glass

  selectPanel(chosen);
  vec2 center = u_panelBox[chosen].xy;
  vec2 xy = pixel - center;
  vec2 offset = offsetFromInner(xy);
  float h = thickness;

  // The view ray comes straight down and refracts into the top surface.
  vec3 pos = vec3(xy, g_gap + h);
  vec3 normal = vec3(offset, h) / g_radius;
  vec3 dir = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / u_ior);  // air → glass

  traceGlass(pos, dir);
  return hitBox(pos + vec3(center, 0.0), dir);
}

// ── Color ───────────────────────────────────────────────────────────────────
// The background picks the palette index (the hue); the glass thickness picks
// the row (the lightness). Every pixel is exactly a nicrainha color.
//
// Index: a fixed mapping. One octave of noise spans exactly [−1, 1], one turn
// of the circular palette (fractal sums are normalized to the same spread,
// and their rare peaks beyond wrap on around the circle), so a value always
// picks the same color wherever and whenever it occurs, and panning never
// shifts colors.
//
// Row: each layer of glass closes the same fraction of the remaining way
// from the background's L* to the target, white or black:
//   L = L_target + (L_bg − L_target) · e^(−h/ℓ)
// Within half a table step of L_bg, that's the background's own ring.

vec4 paletteColor(float value, float thickness) {
  int vertex = (int(floor((value + 1.0) * 128.0)) + u_rotation) & 255;
  float lightness = u_target + (u_lightness - u_target) * exp(-thickness / u_glassLength);
  float rowStep = 100.0 / float(TABLE_ROWS - 1);
  int row = abs(lightness - u_lightness) < rowStep / 2.0
    ? TABLE_ROWS
    : int(floor(lightness / rowStep + 0.5));
  return texelFetch(u_palette, ivec2(vertex, row), 0);
}
