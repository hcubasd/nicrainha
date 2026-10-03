import { generatePalettes } from "nicrainha";

import { buildPermutation, fieldRange } from "./noise.js";
import fragmentSource from "./shaders/scene.frag?raw";
import vertexSource from "./shaders/fullscreen.vert?raw";

// ── Knobs ───────────────────────────────────────────────────────────────────
// URL parameters, e.g. ?speed=0.5&radius=128. See docs/README.md.

const params = new URLSearchParams(location.search);
function knob(name, fallback) {
  const value = Number(params.get(name) ?? fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

// Animation speed multiplier: 1 = default, 2 = twice as fast, 0 = frozen.
const SPEED = knob("speed", 1);
// Corner radius of the glass panel in CSS px. Also sets the glass thickness
// and the air gap, so it alone controls how strong the glass looks.
const RADIUS = knob("radius", 96);

// ── Constants ───────────────────────────────────────────────────────────────

// Depth the noise advances per second at speed 1, in lattice units: the
// pattern turns over roughly every 10 s.
const Z_PER_SECOND = 0.1;
// Panel size in CSS px, shrunk to fit the viewport with this margin.
const PANEL = { width: 640, height: 400, margin: 24 };
// Refractive index of glass.
const GLASS_IOR = 1.5;
// Air gap between the glass and the background, as a multiple of the corner
// radius: the back focal distance of the panel's edge, 1/(n − 1) − 1/n
// (4/3 for glass). The background sits in the edge lens's focal plane.
const GAP_RATIO = 1 / (GLASS_IOR - 1) - 1 / GLASS_IOR;

// ── WebGL setup ─────────────────────────────────────────────────────────────

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
gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(program));
}
gl.useProgram(program);
gl.bindVertexArray(gl.createVertexArray());

const uniform = Object.fromEntries(
  ["u_perm", "u_palette", "u_resolution", "u_z", "u_min", "u_range", "u_panel", "u_radius", "u_gap", "u_ior"]
    .map((name) => [name, gl.getUniformLocation(program, name)]),
);

// 256×1 lookup texture on the given texture unit.
function lookupTexture(unit, internalFormat, format, data) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 256, 1, 0, format, gl.UNSIGNED_BYTE, data);
}

// ── Scene (seeded once per page load) ───────────────────────────────────────

const perm = buildPermutation(Math.floor(Math.random() * 99999));
lookupTexture(0, gl.R8UI, gl.RED_INTEGER, perm);
gl.uniform1i(uniform.u_perm, 0);

// One random rotation of the 256-gon at nicrainha's default lightness.
const palette = generatePalettes(256)[Math.floor(Math.random() * 256)];
lookupTexture(1, gl.RGBA8, gl.RGBA, new Uint8Array(palette.flatMap(({ r, g, b }) => [r, g, b, 255])));
gl.uniform1i(uniform.u_palette, 1);

gl.uniform1f(uniform.u_ior, GLASS_IOR);

// ── Sizing: full device resolution, panel fitted to the viewport ────────────

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * dpr);
  const height = Math.round(canvas.clientHeight * dpr);
  if (width === canvas.width && height === canvas.height) return;
  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.uniform2f(uniform.u_resolution, width, height);

  const halfWidth = Math.max(0, Math.min(PANEL.width, canvas.clientWidth - 2 * PANEL.margin) / 2);
  const halfHeight = Math.max(0, Math.min(PANEL.height, canvas.clientHeight - 2 * PANEL.margin) / 2);
  // A rounded rectangle's corner radius can't exceed half its shorter side.
  const radius = Math.min(RADIUS, halfWidth, halfHeight);
  gl.uniform2f(uniform.u_panel, halfWidth * dpr, halfHeight * dpr);
  gl.uniform1f(uniform.u_radius, radius * dpr);
  gl.uniform1f(uniform.u_gap, GAP_RATIO * radius * dpr);
}

// ── Animation: only the noise depth z moves ─────────────────────────────────
// Noise repeats every 256 lattice units, so wrapping z there is seamless and
// keeps shader floats small.

const start = performance.now();

function frame(now) {
  resize();
  const z = (((now - start) / 1000) * Z_PER_SECOND * SPEED) % 256;
  const { min, range } = fieldRange(perm, z);
  gl.uniform1f(uniform.u_z, z);
  gl.uniform1f(uniform.u_min, min);
  gl.uniform1f(uniform.u_range, range);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
