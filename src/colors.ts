import { buildEvenGaps, buildIndicesFromGaps } from "./helpers/bresenham.js";
import { labToRgb, rgbToLab } from "./helpers/converters.js";
import { hungarian } from "./helpers/hungarian.js";
import { findRadius } from "./helpers/radiusFinder.js";
import type { RgbColor } from "./types.js";

const N = 256;
const ANCHOR_THETA = (3 * Math.PI) / 2;

// Lightness at which the inscribed 256-gon radius peaks (r ≈ 40.188).
export const DEFAULT_LIGHTNESS = 73.9124;

export interface ColorOptions {
	lightness?: number;
}

function validateLightness(lightness: number): void {
	if (!Number.isFinite(lightness) || lightness < 0 || lightness > 100) {
		throw new RangeError("lightness must be a finite number in [0, 100].");
	}
}

function isChannel(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 0 &&
		value <= 255
	);
}

function circlePoints(lightness: number): { a: number; b: number }[] {
	const radius = findRadius(lightness);
	return Array.from({ length: N }, (_, k) => {
		const theta = ANCHOR_THETA + (k * 2 * Math.PI) / N;
		return { a: radius * Math.cos(theta), b: radius * Math.sin(theta) };
	});
}

export function generatePalettes(
	size: number,
	{ lightness = DEFAULT_LIGHTNESS }: ColorOptions = {},
): RgbColor[][] {
	validateLightness(lightness);
	if (!Number.isInteger(size) || size < 1 || size > N) {
		throw new RangeError(`size must be an integer in [1, ${N}].`);
	}

	if (lightness === 0 || lightness === 100) {
		const color = labToRgb(lightness, 0, 0);
		return Array.from({ length: N }, () =>
			Array.from({ length: size }, () => ({ ...color })),
		);
	}

	const vertices = circlePoints(lightness).map(({ a, b }) =>
		labToRgb(lightness, a, b),
	);

	const gaps = buildEvenGaps(N, size);
	return Array.from({ length: N }, (_, rotation) =>
		buildIndicesFromGaps(N, gaps, rotation).map((i) => ({ ...vertices[i] })),
	);
}

export function mapColors(
	colors: readonly RgbColor[],
	{ lightness = DEFAULT_LIGHTNESS }: ColorOptions = {},
): RgbColor[] {
	validateLightness(lightness);
	if (!Array.isArray(colors) || colors.length < 1 || colors.length > N) {
		throw new RangeError(`colors must have between 1 and ${N} entries.`);
	}

	const seen = new Map<string, number>();
	const projected = colors.map((color, i) => {
		const { r, g, b }: Partial<RgbColor> = color ?? {};
		if (!isChannel(r) || !isChannel(g) || !isChannel(b)) {
			throw new RangeError(
				`Color at index ${i} must have integer r, g, b in [0, 255].`,
			);
		}
		if (r === g && g === b) {
			throw new RangeError(`Color at index ${i} lies on the gray axis.`);
		}
		const key = `${r},${g},${b}`;
		const first = seen.get(key);
		if (first !== undefined) {
			throw new RangeError(
				`Color at index ${i} duplicates the color at index ${first}.`,
			);
		}
		seen.set(key, i);

		const lab = rgbToLab(r, g, b);
		return { a: lab.a, b: lab.b };
	});

	const circle = circlePoints(lightness);
	const gaps = buildEvenGaps(N, colors.length);

	let bestTotal = Infinity;
	let bestAssignment: number[] = [];
	let bestStart = 0;

	for (let start = 0; start < N; start++) {
		const indices = buildIndicesFromGaps(N, gaps, start);
		const palette = indices.map((i) => circle[i]);
		const cost = projected.map((p) =>
			palette.map((v) => Math.hypot(p.a - v.a, p.b - v.b)),
		);
		const { total, assignment } = hungarian(cost);
		if (total < bestTotal) {
			bestTotal = total;
			bestAssignment = assignment;
			bestStart = start;
		}
	}

	const bestIndices = buildIndicesFromGaps(N, gaps, bestStart);
	const paletteRgb: RgbColor[] = bestIndices.map((i) =>
		labToRgb(lightness, circle[i].a, circle[i].b),
	);

	return projected.map((_, i) => ({ ...paletteRgb[bestAssignment[i]] }));
}
