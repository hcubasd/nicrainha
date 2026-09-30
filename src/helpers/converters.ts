import type { LabColor, RgbColor } from "../types.js";

export function rgbToLab(r: number, g: number, b: number): LabColor {
	r /= 255;
	g /= 255;
	b /= 255;

	r = r > 0.04045 ? ((r + 0.055) / 1.055) ** 2.4 : r / 12.92;
	g = g > 0.04045 ? ((g + 0.055) / 1.055) ** 2.4 : g / 12.92;
	b = b > 0.04045 ? ((b + 0.055) / 1.055) ** 2.4 : b / 12.92;

	let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
	let y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
	let z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

	x /= 0.95047;
	y /= 1.0;
	z /= 1.08883;

	const delta = 6 / 29;
	const deltaSq = delta * delta;
	const deltaCu = deltaSq * delta;

	const fx = x > deltaCu ? x ** (1 / 3) : x / (3 * deltaSq) + 4 / 29;
	const fy = y > deltaCu ? y ** (1 / 3) : y / (3 * deltaSq) + 4 / 29;
	const fz = z > deltaCu ? z ** (1 / 3) : z / (3 * deltaSq) + 4 / 29;

	return {
		L: 116 * fy - 16,
		a: 500 * (fx - fy),
		b: 200 * (fy - fz),
	};
}

export function labToRgb(L: number, a: number, b: number): RgbColor {
	const delta = 6 / 29;
	const deltaSq = delta * delta;

	const fy = (L + 16) / 116;
	const fx = a / 500 + fy;
	const fz = fy - b / 200;

	const xr = fx > delta ? fx ** 3 : 3 * deltaSq * (fx - 4 / 29);
	const yr = fy > delta ? fy ** 3 : 3 * deltaSq * (fy - 4 / 29);
	const zr = fz > delta ? fz ** 3 : 3 * deltaSq * (fz - 4 / 29);

	const x = xr * 0.95047;
	const y = yr;
	const z = zr * 1.08883;

	let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
	let g = x * -0.969266 + y * 1.8760108 + z * 0.041556;
	let blue = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

	r = r > 0.0031308 ? 1.055 * r ** (1 / 2.4) - 0.055 : 12.92 * r;
	g = g > 0.0031308 ? 1.055 * g ** (1 / 2.4) - 0.055 : 12.92 * g;
	blue = blue > 0.0031308 ? 1.055 * blue ** (1 / 2.4) - 0.055 : 12.92 * blue;

	return {
		r: Math.round(Math.max(0, Math.min(255, r * 255))),
		g: Math.round(Math.max(0, Math.min(255, g * 255))),
		b: Math.round(Math.max(0, Math.min(255, blue * 255))),
	};
}
