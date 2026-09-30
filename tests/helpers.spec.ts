import { describe, expect, it } from "vitest";

import {
	buildEvenGaps,
	buildIndicesFromGaps,
} from "../src/helpers/bresenham.ts";
import { labToRgb, rgbToLab } from "../src/helpers/converters.ts";

describe("buildEvenGaps", () => {
	it("distributes remainder across trailing gaps", () => {
		expect(buildEvenGaps(10, 3)).toEqual([3, 3, 4]);
	});

	it("returns equal gaps when total divides evenly", () => {
		expect(buildEvenGaps(9, 3)).toEqual([3, 3, 3]);
	});

	it("handles n=1", () => {
		expect(buildEvenGaps(256, 1)).toEqual([256]);
	});

	it("handles n=total", () => {
		expect(buildEvenGaps(4, 4)).toEqual([1, 1, 1, 1]);
	});

	it("throws for non-positive total", () => {
		expect(() => buildEvenGaps(0, 1)).toThrow(RangeError);
	});

	it("throws for parts > total", () => {
		expect(() => buildEvenGaps(5, 6)).toThrow(RangeError);
	});
});

describe("buildIndicesFromGaps", () => {
	it("walks gaps from start=0", () => {
		expect(buildIndicesFromGaps(10, [3, 3, 4])).toEqual([0, 3, 6]);
	});

	it("wraps around the circle", () => {
		expect(buildIndicesFromGaps(10, [3, 3, 4], 7)).toEqual([7, 0, 3]);
	});

	it("normalizes negative start", () => {
		expect(buildIndicesFromGaps(10, [3, 3, 4], -3)).toEqual([7, 0, 3]);
	});

	it("throws for empty gaps", () => {
		expect(() => buildIndicesFromGaps(10, [])).toThrow(RangeError);
	});
});

describe("rgbToLab / labToRgb", () => {
	it("maps black to L=0, a=0, b=0", () => {
		const lab = rgbToLab(0, 0, 0);
		expect(lab.L).toBe(0);
		expect(lab.a).toBe(0);
		expect(lab.b).toBe(0);
	});

	it("maps white to L≈100, a≈0, b≈0", () => {
		const lab = rgbToLab(255, 255, 255);
		expect(lab.L).toBeCloseTo(100, 4);
		expect(lab.a).toBeCloseTo(0, 4);
		expect(lab.b).toBeCloseTo(0, 4);
	});

	it("round-trips red", () => {
		const { L, a, b } = rgbToLab(255, 0, 0);
		expect(labToRgb(L, a, b)).toEqual({ r: 255, g: 0, b: 0 });
	});

	it("round-trips an arbitrary color", () => {
		const { L, a, b } = rgbToLab(128, 64, 32);
		expect(labToRgb(L, a, b)).toEqual({ r: 128, g: 64, b: 32 });
	});

	it("labToRgb clamps out-of-gamut values to [0, 255]", () => {
		const { r, g, b } = labToRgb(50, 200, 200);
		expect(r).toBeGreaterThanOrEqual(0);
		expect(r).toBeLessThanOrEqual(255);
		expect(g).toBeGreaterThanOrEqual(0);
		expect(g).toBeLessThanOrEqual(255);
		expect(b).toBeGreaterThanOrEqual(0);
		expect(b).toBeLessThanOrEqual(255);
	});
});
