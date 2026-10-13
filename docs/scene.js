import { generatePalettes } from "nicrainha";
import { ROUGHNESS } from "virtual:lightness-rings";

import {
  createProgram, GLASS_UNIFORMS, observeDeviceSize, setBox, setGlassLength, setPanels, uploadTables, Z_PER_SECOND,
} from "./gl.js";
import { buildPermutation, gainFor, octaves, roughness, scaleFor } from "./noise.js";
import fragmentSource from "./shaders/scene.frag?raw";

// The showcase's renderer: an endless, animated nicrainha background on a
// canvas filling the window, panned by the page, seen through glass panels
// the page places each frame.

// Noise repeats every 256 lattice units on every axis.
const PERIOD = 256;

const wrap = (value, period) => ((value % period) + period) % period;

// Sets up WebGL on `canvas` for a background at L* `lightness`, and returns
// { draw, rate }: draw(now, panels, pan) renders one frame, and rate() is how
// many times faster than one octave the noise can change in time. Each panel is
// { x, y, halfWidth, halfHeight, radius } in CSS px, (x, y) its center in the
// window; `pan` is { x, y }, the window's position on the endless background,
// in CSS px.
export function createScene(canvas, lightness) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  const uniform = createProgram(gl, fragmentSource, [...GLASS_UNIFORMS, "u_resolution", "u_offset", "u_cell", "u_z", "u_octaves", "u_gain"]);
  // Seeded once per page load.
  const perm = buildPermutation(Math.floor(Math.random() * 99999));
  uploadTables(gl, uniform, perm, lightness);
  // Cells as small as nicrainha's circle is small, and noise as rough as its
  // colors' steps are uneven (noise.js). The glass shows other rings but
  // keeps the background's noise: it moves where the background is seen,
  // not what it is.
  const palette = generatePalettes(256, { lightness })[0], defaultPalette = generatePalettes(256)[0];
  const gain = gainFor(lightness, roughness(palette, defaultPalette), ROUGHNESS);
  const scale = scaleFor(palette, defaultPalette);
  gl.uniform1f(uniform.u_gain, gain);

  // The canvas renders at full device resolution.
  let deviceWidth = 0, deviceHeight = 0;
  observeDeviceSize(canvas, (width, height) => { deviceWidth = width; deviceHeight = height; });

  // A lattice cell is sized by the window — at the default, its long axis
  // spans 2 cells, unless that would make its short axis span more than one —
  // times the palette's scale, and never below 2 device px (Nyquist).
  let cell, fractal = { count: 1, rate: 1 };

  function layoutCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = deviceWidth || Math.round(canvas.clientWidth * dpr);
    const height = deviceHeight || Math.round(canvas.clientHeight * dpr);
    if (width === canvas.width && height === canvas.height) return;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(uniform.u_resolution, width, height);
    setBox(gl, uniform, width / dpr, height / dpr, dpr);
    setGlassLength(gl, uniform, dpr);
    cell = Math.max(scale * Math.max(Math.min(width, height), Math.max(width, height) / 2), 2) / dpr;
    gl.uniform1f(uniform.u_cell, cell * dpr);
    fractal = octaves(gain, cell * dpr);
    // Must not exceed MAX_OCTAVES in scene.frag.
    gl.uniform1i(uniform.u_octaves, Math.min(fractal.count, 16));
  }

  // Pan and z are wrapped at the noise's period, which is seamless and keeps
  // shader floats small however far the view travels.
  let start;
  function draw(now, panels, pan) {
    start ??= now;
    layoutCanvas();
    const dpr = window.devicePixelRatio || 1;
    setPanels(gl, uniform, panels, dpr);
    gl.uniform2f(uniform.u_offset, wrap(pan.x, PERIOD * cell) * dpr, wrap(pan.y, PERIOD * cell) * dpr);
    gl.uniform1f(uniform.u_z, wrap(((now - start) / 1000) * Z_PER_SECOND, PERIOD));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return { draw, rate: () => fractal.rate };
}
