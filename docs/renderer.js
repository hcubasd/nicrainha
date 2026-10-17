import { generatePalettes } from "nicrainha";
import * as tables from "virtual:tables";

import { cellSize, IOR, Z_PER_SECOND } from "./model.js";
import { buildPermutation, MAX_DNDZ, maxDensity } from "./noise.js";
import { largestPalette } from "./palette.js";
import colorSource from "./shaders/color.glsl?raw";
import vertexSource from "./shaders/fullscreen.vert?raw";
import glassSource from "./shaders/glass.glsl?raw";
import perlinSource from "./shaders/perlin.glsl?raw";
import fragmentSource from "./shaders/scene.frag?raw";

// The showcase's renderer: a full-window canvas showing the endless
// background through glass panels. All the per-pixel work is in the fragment
// shader (shaders/scene.frag); this uploads its tables once and sets a few
// uniforms per frame. It takes everything in CSS px and works in device px.

// The noise repeats every 256 lattice units on every axis.
const PERIOD = 256;
// Must match MAX_PANELS in glass.glsl.
const MAX_PANELS = 16;

// Sets up WebGL on `canvas` for a background at L* `lightness`, and returns
// { draw, interval }:
//   draw(now, view) renders one frame of `view`: { pan, panels,
//     glassLength }, all CSS px. `pan` { x, y } is the window's position on
//     the endless background; each panel is { x, y, halfWidth, halfHeight,
//     radius }, (x, y) its center in the window; `glassLength` is ℓ.
//   interval is how often, in ms, the animation alone can change a pixel's
//     color: the time the noise's steepest pixel takes to cross one vertex
//     of the 256-gon, nicrainha's finest palette step.
export function createRenderer(canvas, lightness) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  const uniform = createProgram(gl);
  uploadTables(gl, uniform, lightness);
  gl.uniform1f(uniform.u_ior, IOR);

  // One canvas pixel per device pixel: a canvas the browser rescales blends
  // colors.
  let deviceSize = null;
  observeDeviceSize(canvas, (width, height) => { deviceSize = { width, height }; });

  let dpr, cell, start;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const width = deviceSize?.width ?? Math.round(canvas.clientWidth * dpr);
    const height = deviceSize?.height ?? Math.round(canvas.clientHeight * dpr);
    if (width === canvas.width && height === canvas.height && cell) return;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(uniform.u_resolution, width, height);
    gl.uniform1f(uniform.u_windowArea, width * height);
    cell = cellSize(width, height);
    gl.uniform1f(uniform.u_cell, cell);
    gl.uniform1i(uniform.u_period, PERIOD * cell);
  }

  // Pan and z are wrapped at the noise's period: seamless, and shader floats
  // stay small however far the view travels.
  function draw(now, { pan, panels, glassLength }) {
    start ??= now;
    resize();
    setPanels(gl, uniform, panels, dpr);
    gl.uniform1f(uniform.u_glassLength, glassLength * dpr);
    gl.uniform2f(uniform.u_offset, wrap(pan.x * dpr, PERIOD * cell), wrap(pan.y * dpr, PERIOD * cell));
    gl.uniform1f(uniform.u_z, wrap(((now - start) / 1000) * Z_PER_SECOND, PERIOD));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const interval = 1000 / (256 * maxDensity(tables.CDF) * MAX_DNDZ * Z_PER_SECOND);
  return { draw, interval };
}

const wrap = (value, period) => ((value % period) + period) % period;

// Compiles the fullscreen-triangle program, resolving the fragment shader's
// #include lines, makes it current, and returns its uniform locations by
// name.
function createProgram(gl) {
  const includes = { "perlin.glsl": perlinSource, "glass.glsl": glassSource, "color.glsl": colorSource };
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource.replace(/^#include "(.+)"$/gm, (_, name) => includes[name])));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());
  const uniform = {};
  for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
    const name = gl.getActiveUniform(program, i).name.replace(/\[0\]$/, "");
    uniform[name] = gl.getUniformLocation(program, name);
  }
  return uniform;
}

// Uploads the lookup tables (tables.js), each with one last row for the
// background's own lightness, computed here by nicrainha at exactly
// `lightness`:
//   u_perm     the noise permutation, seeded at random,
//   u_palette  nicrainha's 256-gon at L* 0…100, then at `lightness`,
//   u_ngons    each of those rows' palette: its size n, then its rotation,
//   u_cdf      the noise's value distribution,
// and picks a random shift around the circle, u_shift. Seed and shift make
// each page load a different view of the same background.
function uploadTables(gl, uniform, lightness) {
  const ring = generatePalettes(256, { lightness })[0];
  const own = largestPalette(ring);

  const rgb = Uint8Array.from(atob(tables.RGB), (c) => c.charCodeAt(0));
  const palette = new Uint8Array(rgb.length + 256 * 3);
  palette.set(rgb);
  palette.set(ring.flatMap(({ r, g, b }) => [r, g, b]), rgb.length);
  const ngons = new Uint16Array([...tables.SIZES, own.size, ...tables.ROTATIONS, own.rotation]);

  texture(gl, uniform.u_perm, 0, gl.R8UI, gl.RED_INTEGER, gl.UNSIGNED_BYTE, buildPermutation(Math.floor(Math.random() * 99999)), 256, 1);
  texture(gl, uniform.u_palette, 1, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, palette, 256, tables.ROWS + 1);
  texture(gl, uniform.u_ngons, 2, gl.R16UI, gl.RED_INTEGER, gl.UNSIGNED_SHORT, ngons, tables.ROWS + 1, 2);
  texture(gl, uniform.u_cdf, 3, gl.R32F, gl.RED, gl.FLOAT, new Float32Array(tables.CDF), tables.CDF.length, 1);
  gl.uniform1f(uniform.u_lightness, lightness);
  gl.uniform1i(uniform.u_shift, Math.floor(Math.random() * 256));
}

// A nearest-filtered lookup texture, `width` × `height`, bound to sampler
// `location` on texture unit `unit`.
function texture(gl, location, unit, internalFormat, format, type, data, width, height) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
  gl.uniform1i(location, unit);
}

// Calls back with the canvas's exact size in device pixels whenever it
// changes. At fractional pixel ratios, rounding CSS px × devicePixelRatio
// can miss by one, so the browser's own device-pixel size is used where it
// reports it (not Safari), and the rounding elsewhere.
function observeDeviceSize(canvas, callback) {
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

// Sets the glass panels, in device px. Panels past the first MAX_PANELS are
// dropped; callers pass only those on the canvas.
const panelBox = new Float32Array(4 * MAX_PANELS);
const panelRadius = new Float32Array(MAX_PANELS);
function setPanels(gl, uniform, panels, dpr) {
  const count = Math.min(panels.length, MAX_PANELS);
  for (let i = 0; i < count; i++) {
    const { x, y, halfWidth, halfHeight, radius } = panels[i];
    panelBox.set([x * dpr, y * dpr, halfWidth * dpr, halfHeight * dpr], 4 * i);
    panelRadius[i] = radius * dpr;
  }
  gl.uniform1i(uniform.u_panelCount, count);
  gl.uniform4fv(uniform.u_panelBox, panelBox);
  gl.uniform1fv(uniform.u_panelRadius, panelRadius);
}
