// WebGL for <nicrainha-background>: uploads the lookup tables once, and draws
// one frame per call. All per-pixel work is in the fragment shader
// (shaders.ts). Loaded on demand by the element, with the build-time tables.

import { DEFAULT_LIGHTNESS, generatePalettes } from "../colors.js";
import { cellSize, colorStep, GAP_RATIO, IOR, MIN_RADIUS, TABLE_ROWS } from "./model.js";
import { buildPermutation, maxDensity } from "./noise.js";
import { largestPalette } from "./palette.js";
import { fragmentShader, vertexShader } from "./shaders.js";
import * as tables from "./tables.data.js";

// A glass panel in device px: (x, y) its center in the canvas.
export interface Panel {
	x: number;
	y: number;
	halfWidth: number;
	halfHeight: number;
	radius: number;
}

export interface Renderer {
	setLightness(lightness: number): void;
	// Renders one frame, the noise advanced by `steps` color steps.
	draw(panels: readonly Panel[], steps: number): void;
	dispose(): void;
}

// The noise repeats every 256 lattice units on every axis.
const PERIOD = 256;
const step = colorStep(maxDensity(tables.CDF));

// Sets up WebGL2 on `canvas`, or returns null where it is unavailable.
export function createRenderer(canvas: HTMLCanvasElement, lightness: number): Renderer | null {
	const context = canvas.getContext("webgl2", { antialias: false, alpha: false });
	if (!context) return null;
	const gl: WebGL2RenderingContext = context;
	const uniform = createProgram(gl);
	const textures: WebGLTexture[] = [];
	const texture = (
		location: WebGLUniformLocation | null,
		unit: number,
		internalFormat: number,
		format: number,
		type: number,
		data: ArrayBufferView,
		width: number,
		height: number,
	) => {
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, (textures[unit] ??= gl.createTexture()));
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);
		gl.uniform1i(location, unit);
	};

	// Lookup tables. The palette and its sizes get two rows beyond the table:
	// the background's own lightness and nicrainha's default, both exact.
	const table = Uint8Array.from(atob(tables.RGB), (c) => c.charCodeAt(0));
	const ring = (L: number) => generatePalettes(256, { lightness: L })[0];
	const defaultRing = ring(DEFAULT_LIGHTNESS);
	const defaultPalette = largestPalette(defaultRing);
	texture(uniform.u_perm, 0, gl.R8UI, gl.RED_INTEGER, gl.UNSIGNED_BYTE, buildPermutation(Math.floor(Math.random() * 99999)), 256, 1);
	texture(uniform.u_cdf, 3, gl.R32F, gl.RED, gl.FLOAT, new Float32Array(tables.CDF), tables.CDF.length, 1);
	gl.uniform1i(uniform.u_shift, Math.floor(Math.random() * 256));
	gl.uniform1f(uniform.u_defaultLightness, DEFAULT_LIGHTNESS);
	gl.uniform1f(uniform.u_ior, IOR);
	gl.uniform1f(uniform.u_gapRatio, GAP_RATIO);

	function setLightness(L: number): void {
		const own = ring(L);
		const palette = new Uint8Array(table.length + 2 * 256 * 3);
		palette.set(table);
		palette.set(own.flatMap(({ r, g, b }) => [r, g, b]), table.length);
		palette.set(defaultRing.flatMap(({ r, g, b }) => [r, g, b]), table.length + 256 * 3);
		const { size, rotation } = largestPalette(own);
		const ngons = new Uint16Array([
			...tables.SIZES, size, defaultPalette.size,
			...tables.ROTATIONS, rotation, defaultPalette.rotation,
		]);
		texture(uniform.u_palette, 1, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, palette, 256, TABLE_ROWS + 2);
		texture(uniform.u_ngons, 2, gl.R16UI, gl.RED_INTEGER, gl.UNSIGNED_SHORT, ngons, TABLE_ROWS + 2, 2);
		gl.uniform1f(uniform.u_lightness, L);
	}
	setLightness(lightness);

	let z = 0;
	const maxWidth: number = gl.getParameter(gl.MAX_TEXTURE_SIZE);

	function draw(panels: readonly Panel[], steps: number): void {
		const { width, height } = canvas;
		gl.viewport(0, 0, width, height);
		gl.uniform2f(uniform.u_resolution, width, height);
		gl.uniform1f(uniform.u_windowArea, width * height);
		gl.uniform1f(uniform.u_cell, cellSize(width, height));
		z = (z + steps * step) % PERIOD;
		gl.uniform1f(uniform.u_z, z);
		// The panels, two texels each, in rows as wide as WebGL allows.
		const texels = Math.max(2 * panels.length, 1);
		const columns = Math.min(texels, maxWidth);
		const rows = Math.ceil(texels / columns);
		const data = new Float32Array(4 * columns * rows);
		panels.forEach(({ x, y, halfWidth, halfHeight, radius }, i) => {
			data.set([x, y, halfWidth, halfHeight, radius], 8 * i);
		});
		texture(uniform.u_panels, 4, gl.RGBA32F, gl.RGBA, gl.FLOAT, data, columns, rows);
		gl.uniform1i(uniform.u_panelCount, panels.length);
		gl.uniform1f(uniform.u_minRadius, MIN_RADIUS);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	return {
		setLightness,
		draw,
		dispose: () => gl.getExtension("WEBGL_lose_context")?.loseContext(),
	};
}

// Compiles and links the program, makes it current, and returns its uniform
// locations by name.
function createProgram(gl: WebGL2RenderingContext): Record<string, WebGLUniformLocation | null> {
	function compile(type: number, source: string): WebGLShader {
		const shader = gl.createShader(type)!;
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "");
		return shader;
	}
	const program = gl.createProgram();
	gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
	gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "");
	gl.useProgram(program);
	gl.bindVertexArray(gl.createVertexArray());
	const uniform: Record<string, WebGLUniformLocation | null> = {};
	for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
		const name = gl.getActiveUniform(program, i)!.name.replace(/\[0\]$/, "");
		uniform[name] = gl.getUniformLocation(program, name);
	}
	return uniform;
}
