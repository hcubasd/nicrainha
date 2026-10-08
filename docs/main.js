import * as rings from "virtual:lightness-rings";

import { buildPermutation, fieldRange } from "./noise.js";
import fragmentSource from "./shaders/scene.frag?raw";
import vertexSource from "./shaders/fullscreen.vert?raw";

// ── Constants ───────────────────────────────────────────────────────────────
// See docs/README.md for which of these are derived and which are chosen.

// Corner radius of the glass, as a fraction of the largest a rounded
// rectangle allows (half its shorter side): 0 is square, 1 fully rounded. It
// sets the glass's thickness, and with it the air gap and the lightness.
// Chosen by eye.
const CORNER = 0.38;
// Glass thickness ℓ, in rem, that lifts L* 1 − 1/e (63%) of the way from the
// background's to white: L = 100 − (100 − L_bg) · e^(−h/ℓ). Chosen by eye.
const WHITE_LENGTH_REM = 8;
// Glass size in CSS px, shrunk to fit the viewport with this margin.
const PANEL = { width: 560, height: 320, margin: 24 };
// Depth the noise advances per second, in lattice units: the pattern turns
// over roughly every 10 s.
const Z_PER_SECOND = 0.1;
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
  ["u_perm", "u_palette", "u_rows", "u_rotation", "u_whiteLength", "u_resolution", "u_z", "u_min", "u_range", "u_panel", "u_radius", "u_gap", "u_ior"]
    .map((name) => [name, gl.getUniformLocation(program, name)]),
);

// 256-wide lookup texture with `rows` rows on the given texture unit.
function lookupTexture(unit, internalFormat, format, data, rows = 1) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 256, rows, 0, format, gl.UNSIGNED_BYTE, data);
}

// ── Scene (seeded once per page load) ───────────────────────────────────────

const perm = buildPermutation(Math.floor(Math.random() * 99999));
lookupTexture(0, gl.R8UI, gl.RED_INTEGER, perm);
gl.uniform1i(uniform.u_perm, 0);

// nicrainha's 256-gon at every lightness from the background's (row 0) to
// white (last row), precomputed at build time (lightness-rings.js). A random
// rotation of the palette is an index offset into these rows.
const ringData = Uint8Array.from(atob(rings.RGB), (c) => c.charCodeAt(0));
lookupTexture(1, gl.RGB8, gl.RGB, ringData, rings.ROWS);
gl.uniform1i(uniform.u_palette, 1);
gl.uniform1i(uniform.u_rows, rings.ROWS);
gl.uniform1i(uniform.u_rotation, Math.floor(Math.random() * 256));
// How far up the table the thickest glass reaches.

gl.uniform1f(uniform.u_ior, GLASS_IOR);

// ── Sizing ──────────────────────────────────────────────────────────────────

// The canvas renders at full device resolution.
function layoutCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * dpr);
  const height = Math.round(canvas.clientHeight * dpr);
  if (width === canvas.width && height === canvas.height) return false;
  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.uniform2f(uniform.u_resolution, width, height);
  return true;
}

// The glass is a centered rounded rectangle. Its corner radius R sets the
// thickness of the glass, and with it the air gap and the lightness. A square
// rectangle has no glass to show.
function layoutGlass() {
  const dpr = window.devicePixelRatio || 1;
  const halfWidth = Math.max(0, Math.min(PANEL.width, canvas.clientWidth - 2 * PANEL.margin) / 2);
  const halfHeight = Math.max(0, Math.min(PANEL.height, canvas.clientHeight - 2 * PANEL.margin) / 2);
  const maxRadius = Math.min(halfWidth, halfHeight);
  const radius = CORNER * maxRadius;
  gl.uniform2f(uniform.u_panel, halfWidth * dpr, halfHeight * dpr);
  gl.uniform1f(uniform.u_radius, radius * dpr);
  gl.uniform1f(uniform.u_gap, GAP_RATIO * radius * dpr);
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  gl.uniform1f(uniform.u_whiteLength, WHITE_LENGTH_REM * rem * dpr);
}

// ── Animation: only the noise depth z moves ─────────────────────────────────
// Noise repeats every 256 lattice units, so wrapping z there is seamless and
// keeps shader floats small.

const start = performance.now();

function frame(now) {
  if (layoutCanvas()) layoutGlass();
  const z = (((now - start) / 1000) * Z_PER_SECOND) % 256;
  const { min, range } = fieldRange(perm, z);
  gl.uniform1f(uniform.u_z, z);
  gl.uniform1f(uniform.u_min, min);
  gl.uniform1f(uniform.u_range, range);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
