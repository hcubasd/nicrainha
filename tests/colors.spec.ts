import { describe, expect, it } from "vitest";

import { findRadius } from "../src/helpers/radiusFinder.ts";
import {
	DEFAULT_LIGHTNESS,
	generatePalettes,
	mapColors,
} from "../src/index.ts";
import type { RgbColor } from "../src/index.ts";

const RED: RgbColor = { r: 255, g: 0, b: 0 };
const GREEN: RgbColor = { r: 0, g: 255, b: 0 };
const BLUE: RgbColor = { r: 0, g: 0, b: 255 };
const AMBER: RgbColor = { r: 255, g: 200, b: 0 };

const key = ({ r, g, b }: RgbColor) => `${r},${g},${b}`;

function expectValidRgb({ r, g, b }: RgbColor): void {
	for (const channel of [r, g, b]) {
		expect(Number.isInteger(channel) && channel >= 0 && channel <= 255).toBe(
			true,
		);
	}
}

describe("DEFAULT_LIGHTNESS", () => {
	it("maximizes the 256-gon radius over [0, 100]", () => {
		const peak = findRadius(DEFAULT_LIGHTNESS);
		for (let L = 0; L <= 100; L += 0.1) {
			expect(findRadius(L)).toBeLessThanOrEqual(peak);
		}
	});

	it("is within 1e-3 of the true peak", () => {
		const peak = findRadius(DEFAULT_LIGHTNESS);
		expect(findRadius(DEFAULT_LIGHTNESS - 1e-3)).toBeLessThan(peak);
		expect(findRadius(DEFAULT_LIGHTNESS + 1e-3)).toBeLessThan(peak);
	});
});

describe("generatePalettes", () => {
	it("always returns 256 palettes", () => {
		for (const size of [1, 3, 256]) {
			expect(generatePalettes(size)).toHaveLength(256);
		}
	});

	it("each palette has exactly size entries with valid RGB", () => {
		for (const size of [1, 3, 12]) {
			for (const palette of generatePalettes(size)) {
				expect(palette).toHaveLength(size);
				palette.forEach(expectValidRgb);
			}
		}
	});

	it("index r is the palette starting at 256-gon vertex r", () => {
		const vertices = generatePalettes(256)[0];
		const palettes = generatePalettes(3);
		for (let rotation = 0; rotation < 256; rotation++) {
			expect(palettes[rotation][0]).toEqual(vertices[rotation]);
		}
	});

	it("keeps duplicate rotations so indices stay aligned", () => {
		const palettes = generatePalettes(4);
		expect(palettes[64].map(key).sort()).toEqual(palettes[0].map(key).sort());
	});

	it("gives 256 distinct vertices at the default lightness", () => {
		expect(new Set(generatePalettes(256)[0].map(key)).size).toBe(256);
	});

	it("uses DEFAULT_LIGHTNESS when lightness is omitted", () => {
		expect(generatePalettes(3)).toEqual(
			generatePalettes(3, { lightness: DEFAULT_LIGHTNESS }),
		);
	});

	it("matches miniature-waffle output", () => {
		const L75 = generatePalettes(3, { lightness: 75 });
		expect(L75[0]).toEqual([
			{ r: 134, g: 188, b: 255 },
			{ r: 253, g: 160, b: 152 },
			{ r: 131, g: 200, b: 147 },
		]);
		expect(L75[17]).toEqual([
			{ r: 179, g: 178, b: 249 },
			{ r: 242, g: 168, b: 129 },
			{ r: 94, g: 203, b: 175 },
		]);
		expect(generatePalettes(5, { lightness: 40 })[200]).toEqual([
			{ r: 21, g: 105, b: 102 },
			{ r: 56, g: 98, b: 134 },
			{ r: 123, g: 81, b: 112 },
			{ r: 129, g: 83, b: 66 },
			{ r: 88, g: 99, b: 57 },
		]);
	});

	it("returns independent color objects", () => {
		const palettes = generatePalettes(4);
		const original = { ...palettes[64][0] };
		palettes[0][0].r = -1;
		expect(palettes[64].map(key)).toContain(key(original));
	});

	it("lightness 0 gives all blacks, 100 all whites", () => {
		for (const [lightness, color] of [
			[0, { r: 0, g: 0, b: 0 }],
			[100, { r: 255, g: 255, b: 255 }],
		] as const) {
			const palettes = generatePalettes(3, { lightness });
			expect(palettes).toHaveLength(256);
			for (const palette of palettes) {
				for (const entry of palette) expect(entry).toEqual(color);
			}
		}
	});

	it("throws for size outside [1, 256] or non-integer", () => {
		for (const size of [0, 257, 2.5, Number.NaN]) {
			expect(() => generatePalettes(size)).toThrow(RangeError);
		}
	});

	it("throws for lightness outside [0, 100] or non-finite", () => {
		for (const lightness of [-1, 101, Number.NaN, Infinity]) {
			expect(() => generatePalettes(3, { lightness })).toThrow(RangeError);
		}
	});
});

describe("mapColors", () => {
	it("returns one color per input, in input order", () => {
		const result = mapColors([RED, GREEN, BLUE]);
		expect(result).toHaveLength(3);
		result.forEach(expectValidRgb);
	});

	it("maps every input to a distinct palette color", () => {
		const result = mapColors([RED, GREEN, BLUE, AMBER]);
		expect(new Set(result.map(key)).size).toBe(4);
	});

	it("maps onto a rotation of generatePalettes at the same lightness", () => {
		const result = mapColors([RED, GREEN, BLUE, AMBER]).map(key).sort();
		const palettes = generatePalettes(4).map((p) => p.map(key).sort());
		expect(palettes).toContainEqual(result);
	});

	it("matches miniature-waffle output", () => {
		const input = [RED, GREEN, BLUE, AMBER];
		expect(mapColors(input, { lightness: 75 })).toEqual([
			{ r: 253, g: 157, b: 176 },
			{ r: 70, g: 204, b: 194 },
			{ r: 151, g: 185, b: 254 },
			{ r: 198, g: 186, b: 114 },
		]);
		expect(mapColors(input, { lightness: 53.2124 })).toEqual([
			{ r: 178, g: 106, b: 120 },
			{ r: 36, g: 141, b: 134 },
			{ r: 101, g: 127, b: 179 },
			{ r: 137, g: 128, b: 74 },
		]);
	});

	it("uses DEFAULT_LIGHTNESS when lightness is omitted", () => {
		expect(mapColors([RED, BLUE])).toEqual(
			mapColors([RED, BLUE], { lightness: DEFAULT_LIGHTNESS }),
		);
	});

	it("accepts the least chromatic non-gray colors", () => {
		expect(() => mapColors([{ r: 10, g: 9, b: 9 }])).not.toThrow();
	});

	it("lightness 0 gives black, 100 gives white", () => {
		expect(mapColors([RED], { lightness: 0 })).toEqual([{ r: 0, g: 0, b: 0 }]);
		expect(mapColors([RED], { lightness: 100 })).toEqual([
			{ r: 255, g: 255, b: 255 },
		]);
	});

	it("throws for any gray input", () => {
		for (const v of [0, 128, 255]) {
			expect(() => mapColors([RED, { r: v, g: v, b: v }])).toThrow(
				/index 1 lies on the gray axis/,
			);
		}
	});

	it("throws for duplicate inputs", () => {
		expect(() => mapColors([RED, BLUE, { ...RED }])).toThrow(
			/index 2 duplicates the color at index 0/,
		);
	});

	it("throws for invalid channels", () => {
		for (const bad of [
			{ r: 300, g: 0, b: 0 },
			{ r: -1, g: 0, b: 0 },
			{ r: 1.5, g: 0, b: 0 },
			{ r: Number.NaN, g: 0, b: 0 },
			{ r: 0, g: 0 },
			null,
		]) {
			expect(() => mapColors([bad as RgbColor])).toThrow(
				/integer r, g, b in \[0, 255\]/,
			);
		}
	});

	it("throws for empty or oversized input", () => {
		expect(() => mapColors([])).toThrow(RangeError);
		const tooMany = Array.from({ length: 257 }, (_, i) => ({
			r: i % 256,
			g: 0,
			b: 1,
		}));
		expect(() => mapColors(tooMany)).toThrow(RangeError);
	});

	it("throws for lightness outside [0, 100] or non-finite", () => {
		for (const lightness of [-1, 101, Number.NaN]) {
			expect(() => mapColors([RED], { lightness })).toThrow(RangeError);
		}
	});
});
