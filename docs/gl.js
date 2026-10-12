import { generatePalettes } from "nicrainha";
import * as rings from "virtual:lightness-rings";

import vertexSource from "./shaders/fullscreen.vert?raw";
import glassSource from "./shaders/glass.glsl?raw";
import perlinSource from "./shaders/perlin.glsl?raw";

// WebGL plumbing and constants of the showcase.
// See docs/README.md for which constants are derived and which are chosen.

// Corner radius of a glass panel, as a fraction of the largest a rounded
// rectangle allows (half its shorter side): 0 is square, 1 fully rounded. It
// sets the glass's thickness, and with it the air gap and the lightness.
// Chosen by eye.
export const CORNER = 0.38;
// Depth the noise advances per second, in lattice units: the pattern turns
// over roughly every 10 s.
export const Z_PER_SECOND = 0.1;
// Glass thickness ℓ, in rem, that moves L* 1 − 1/e (63%) of the way from the
// background's to the target, white or black:
// L = L_target + (L_bg − L_target) · e^(−h/ℓ). Chosen by eye.
const GLASS_LENGTH_REM = 8;
// Refractive index of glass.
const GLASS_IOR = 1.5;
// Air gap between the glass and the background, as a multiple of the corner
// radius: the back focal distance of the panel's edge, 1/(n − 1) − 1/n
// (4/3 for glass). The background sits in the edge lens's focal plane.
const GAP_RATIO = 1 / (GLASS_IOR - 1) - 1 / GLASS_IOR;
// Must match MAX_PANELS in glass.glsl.
const MAX_PANELS = 16;

// Uniforms of perlin.glsl and glass.glsl.
export const GLASS_UNIFORMS = [
  "u_perm", "u_palette", "u_rotation", "u_lightness", "u_target", "u_glassLength",
  "u_boxMin", "u_boxMax", "u_panelCount", "u_panelBox", "u_panelShape", "u_ior",
];

// Relative luminance at which black and white text have equal WCAG contrast
// against the background: (Y + 0.05) / 0.05 = 1.05 / (Y + 0.05), so
// Y = √(1.05 · 0.05) − 0.05 ≈ 0.179, L* ≈ 49.4.
const EQUAL_CONTRAST_Y = Math.sqrt(1.05 * 0.05) - 0.05;

// "dark" (white text, glass toward black) when white text has more contrast
// on this background than black text, "light" otherwise. Every color of a
// nicrainha palette has the palette's L*, hence the same luminance, so one
// answer holds for the whole background.
export function modeFor(lightness) {
  const Y = lightness > 8 ? ((lightness + 16) / 116) ** 3 : lightness / 903.3;
  return Y < EQUAL_CONTRAST_Y ? "dark" : "light";
}

const includes = { "perlin.glsl": perlinSource, "glass.glsl": glassSource };

// Compiles a fullscreen-triangle program around `fragmentSource`, resolving
// its #include lines, makes it current, and returns its uniform locations by
// name.
export function createProgram(gl, fragmentSource, uniformNames) {
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
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource.replace(/^#include "(.+)"$/gm, (_, name) => includes[name])));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());
  return Object.fromEntries(uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]));
}

// 256-wide lookup texture with `rows` rows on the given texture unit.
function lookupTexture(gl, unit, internalFormat, format, data, rows = 1) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 256, rows, 0, format, gl.UNSIGNED_BYTE, data);
}

// Uploads the noise permutation `perm` (u_perm) and the palette table
// (u_palette): nicrainha's 256-gon at L* 0…100, precomputed at build time by
// lightness-rings.js, plus one last row, the background's own ring, computed
// here by nicrainha at exactly `lightness`. Sets the glass's target, white or
// black (see modeFor), and picks a random rotation of the palette, an index
// offset into the rows (u_rotation).
export function uploadTables(gl, uniform, perm, lightness) {
  lookupTexture(gl, 0, gl.R8UI, gl.RED_INTEGER, perm);
  gl.uniform1i(uniform.u_perm, 0);

  const table = new Uint8Array((rings.ROWS + 1) * 256 * 3);
  table.set(Uint8Array.from(atob(rings.RGB), (c) => c.charCodeAt(0)));
  generatePalettes(256, { lightness })[0].forEach(({ r, g, b }, vertex) => {
    table.set([r, g, b], (rings.ROWS * 256 + vertex) * 3);
  });
  lookupTexture(gl, 1, gl.RGB8, gl.RGB, table, rings.ROWS + 1);
  gl.uniform1i(uniform.u_palette, 1);

  gl.uniform1f(uniform.u_lightness, lightness);
  gl.uniform1f(uniform.u_target, modeFor(lightness) === "dark" ? 0 : 100);
  gl.uniform1i(uniform.u_rotation, Math.floor(Math.random() * 256));
  gl.uniform1f(uniform.u_ior, GLASS_IOR);
}

// Calls back with the canvas's exact size in device pixels whenever it
// changes. One canvas pixel must cover exactly one device pixel: a canvas the
// browser rescales blends colors. At fractional pixel ratios, rounding CSS
// px × devicePixelRatio can miss by one, so the browser's own device-pixel
// size is used where it reports it (not Safari), and the rounding elsewhere.
export function observeDeviceSize(canvas, callback) {
  const observer = new ResizeObserver(([entry]) => {
    const exact = entry.devicePixelContentBoxSize?.[0];
    const dpr = window.devicePixelRatio || 1;
    callback(
      exact ? exact.inlineSize : Math.round(entry.contentRect.width * dpr),
      exact ? exact.blockSize : Math.round(entry.contentRect.height * dpr),
    );
  });
  try {
    observer.observe(canvas, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(canvas);
  }
}

// Sets the glass length ℓ for the current root font size.
export function setGlassLength(gl, uniform, dpr) {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  gl.uniform1f(uniform.u_glassLength, GLASS_LENGTH_REM * rem * dpr);
}

// Sets the window, from (0, 0) to `width` × `height` CSS px, by the centers
// of its outermost device pixels.
export function setBox(gl, uniform, width, height, dpr) {
  gl.uniform2f(uniform.u_boxMin, 0.5, 0.5);
  gl.uniform2f(uniform.u_boxMax, width * dpr - 0.5, height * dpr - 0.5);
}

// Sets the glass panels, each { x, y, halfWidth, halfHeight, radius } in CSS
// px with (x, y) its center, in window coordinates. Panels past the first
// MAX_PANELS are dropped; callers pass only those on the canvas.
const panelBox = new Float32Array(4 * MAX_PANELS);
const panelShape = new Float32Array(2 * MAX_PANELS);
export function setPanels(gl, uniform, panels, dpr) {
  const count = Math.min(panels.length, MAX_PANELS);
  for (let i = 0; i < count; i++) {
    const { x, y, halfWidth, halfHeight, radius } = panels[i];
    panelBox.set([x * dpr, y * dpr, halfWidth * dpr, halfHeight * dpr], 4 * i);
    panelShape.set([radius * dpr, GAP_RATIO * radius * dpr], 2 * i);
  }
  gl.uniform1i(uniform.u_panelCount, count);
  gl.uniform4fv(uniform.u_panelBox, panelBox);
  gl.uniform2fv(uniform.u_panelShape, panelShape);
}
