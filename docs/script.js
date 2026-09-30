import { generatePalettes } from "nicrainha";

// z advance in noise-lattice units per second. Override with ?speed=0.2
const SPEED = Number(new URLSearchParams(location.search).get("speed")) || 0.1;

// — Permutation (seeded once on load) —
const perm = new Uint8Array(256);

function buildPerm(seed) {
  for (let i = 0; i < 256; i++) perm[i] = i;
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
  }
}

// — 3D Perlin noise (Perlin 2002), mirrored in the shader below —
// The CPU copy only samples a coarse grid to find the per-frame range.
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }
function P(i) { return perm[i & 255]; }
function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14) ? x : z;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

function perlin3(x, y, z) {
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

// Range of the 2:1 field (x in [0,2), y in [0,1)) at depth z, on a coarse grid.
function fieldRange(z) {
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < 32; j++) {
    for (let i = 0; i < 64; i++) {
      const v = perlin3(i / 32, j / 32, z);
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { min, range: max - min || 1 };
}

// — Shaders —
const VERTEX = `#version 300 es
void main() {
  // Full-screen triangle
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D u_perm;
uniform sampler2D u_palette;
uniform vec2 u_resolution;   // canvas size in device pixels
uniform float u_z;
uniform float u_min;
uniform float u_range;
out vec4 outColor;

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

void main() {
  // Cover the viewport with a centered 2:1 field whose long axis follows the
  // screen's long axis (x in [0,2), y in [0,1)), as in miniature-waffle.
  vec2 frag = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  bool portrait = u_resolution.y > u_resolution.x;
  vec2 screen = portrait ? u_resolution.yx : u_resolution;
  vec2 pos = portrait ? frag.yx : frag;
  float H = max(screen.y, screen.x / 2.0);
  vec2 field = (pos + (vec2(2.0 * H, H) - screen) / 2.0) / H;

  float t = clamp((perlin3(vec3(field, u_z)) - u_min) / u_range, 0.0, 1.0);
  outColor = texelFetch(u_palette, ivec2(int(floor(t * 255.0 + 0.5)), 0), 0);
}`;

// — WebGL setup —
const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(program));
}
gl.useProgram(program);
gl.bindVertexArray(gl.createVertexArray());

function texture(unit, internalFormat, format, data) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 256, 1, 0, format, gl.UNSIGNED_BYTE, data);
}

buildPerm(Math.floor(Math.random() * 99999));
texture(0, gl.R8UI, gl.RED_INTEGER, perm);
gl.uniform1i(gl.getUniformLocation(program, "u_perm"), 0);

const rotation = Math.floor(Math.random() * 256);
const palette = generatePalettes(256)[rotation];
texture(1, gl.RGBA8, gl.RGBA, new Uint8Array(palette.flatMap(({ r, g, b }) => [r, g, b, 255])));
gl.uniform1i(gl.getUniformLocation(program, "u_palette"), 1);

const u = Object.fromEntries(
  ["u_resolution", "u_z", "u_min", "u_range"].map((name) => [name, gl.getUniformLocation(program, name)]),
);

// — Full-resolution sizing —
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(canvas.clientWidth * dpr);
  const H = Math.round(canvas.clientHeight * dpr);
  if (W === canvas.width && H === canvas.height) return;
  canvas.width = W;
  canvas.height = H;
  gl.viewport(0, 0, W, H);
  gl.uniform2f(u.u_resolution, W, H);
}

// — Animation: only z moves. Noise repeats every 256 lattice units, so
// wrapping z there is seamless and keeps shader floats small. —
const start = performance.now();

function frame(now) {
  resize();
  const z = (((now - start) / 1000) * SPEED) % 256;
  const { min, range } = fieldRange(z);
  gl.uniform1f(u.u_z, z);
  gl.uniform1f(u.u_min, min);
  gl.uniform1f(u.u_range, range);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
