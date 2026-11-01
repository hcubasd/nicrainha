import { describe, expect, it } from "vitest";

import {
	DEFAULT_LIGHTNESS,
	generatePalettes,
	NicrainhaBackground,
	NicrainhaGlass,
} from "../src/index.ts";
import {
	cellSize,
	colorStep,
	DECELERATION,
	flingTravel,
	flingVelocity,
	GAP_RATIO,
	glassLightness,
	IOR,
	MAX_DNDZ,
	overlaps,
} from "../src/ui/model.ts";
import { buildPermutation, maxDensity, perlin3, perlinCdf } from "../src/ui/noise.ts";
import { largestPalette } from "../src/ui/palette.ts";
import { tablesModule } from "../src/ui/tables.ts";

const key = ({ r, g, b }: { r: number; g: number; b: number }) => `${r},${g},${b}`;
const ring = (lightness: number) => generatePalettes(256, { lightness })[0];
// For each rotation, whether the size-color palette has distinct colors.
const uniqueRotations = (lightness: number, size: number) =>
	generatePalettes(size, { lightness }).map((palette) => new Set(palette.map(key)).size === size);

describe("largestPalette", () => {
	it("is the full 256-gon where all 256 colors are distinct", () => {
		expect(largestPalette(ring(DEFAULT_LIGHTNESS))).toEqual({ size: 256, rotation: 0 });
	});

	it("is a single color at L* 0 and 100", () => {
		expect(largestPalette(ring(0))).toEqual({ size: 1, rotation: 0 });
		expect(largestPalette(ring(100))).toEqual({ size: 1, rotation: 0 });
	});

	it.each([1, 5, 20, 90, 97])("is generatePalettes' largest unique n-gon at L* %s", (lightness) => {
		const { size, rotation } = largestPalette(ring(lightness));
		const rotations = uniqueRotations(lightness, size);
		expect(rotations.indexOf(true)).toBe(rotation);
		for (let larger = size + 1; larger <= 256; larger++) {
			expect(uniqueRotations(lightness, larger)).not.toContain(true);
		}
	});
});

describe("noise", () => {
	it("shuffles 0…255 deterministically", () => {
		const perm = buildPermutation(42);
		expect([...perm].sort((a, b) => a - b)).toEqual(Array.from({ length: 256 }, (_, i) => i));
		expect(buildPermutation(42)).toEqual(perm);
		expect(buildPermutation(43)).not.toEqual(perm);
	});

	it("stays within [−1, 1] and repeats every 256 cells", () => {
		const perm = buildPermutation(7);
		for (let i = 0; i < 2000; i++) {
			const [x, y, z] = [Math.sin(i) * 300, Math.cos(i * 1.3) * 300, i * 0.37];
			const value = perlin3(perm, x, y, z);
			expect(Math.abs(value)).toBeLessThanOrEqual(1);
			expect(perlin3(perm, x + 256, y - 256, z + 256)).toBeCloseTo(value, 9);
		}
	});

	it("measures a distribution from 0 to 1, rising", () => {
		const cdf = perlinCdf(64, [1, 2], 2e4);
		expect(cdf).toHaveLength(65);
		expect(cdf[0]).toBe(0);
		expect(cdf[64]).toBeCloseTo(1, 12);
		for (let i = 1; i < cdf.length; i++) expect(cdf[i]).toBeGreaterThanOrEqual(cdf[i - 1]);
		// Perlin noise piles up around 0: denser than uniform there.
		expect(maxDensity(cdf)).toBeGreaterThan(0.5);
	});

	it("has the density of a uniform distribution, 1/2, when uniform", () => {
		expect(maxDensity(Array.from({ length: 11 }, (_, i) => i / 10))).toBeCloseTo(0.5, 12);
	});
});

describe("model", () => {
	it("spans the long side with 2 cells unless the short side would exceed 1", () => {
		expect(cellSize(1000, 600)).toBe(600);
		expect(cellSize(600, 1000)).toBe(600);
		expect(cellSize(1600, 600)).toBe(800);
		expect(cellSize(1000, 1000)).toBe(1000);
		expect(cellSize(0, 0)).toBe(1);
	});

	it("steps the animation by one vertex of the 256-gon at the steepest pixel", () => {
		expect(colorStep(1.66) * 256 * 1.66 * MAX_DNDZ).toBeCloseTo(1, 12);
	});

	it("uses the largest refractive index with no total internal reflection", () => {
		// The steepest ray, entering at the vertical rim, leaves the bottom
		// while n · sin(angle) = √(n² − 1) ≤ 1.
		expect(Math.sqrt(IOR * IOR - 1)).toBeCloseTo(1, 12);
	});

	it("floats the glass at its edge's back focal distance", () => {
		expect(GAP_RATIO).toBeCloseTo(1 / (Math.SQRT2 - 1) - 1 / Math.SQRT2, 12);
		expect(GAP_RATIO).toBeCloseTo(1.7071, 4);
	});

	it("moves lightness linearly toward the default with the path in glass", () => {
		expect(glassLightness(20, 0, 60)).toBe(20);
		expect(glassLightness(20, 30, 60)).toBeCloseTo((20 + DEFAULT_LIGHTNESS) / 2, 12);
		expect(glassLightness(20, 60, 60)).toBeCloseTo(DEFAULT_LIGHTNESS, 12);
		expect(glassLightness(20, 90, 60)).toBeCloseTo(DEFAULT_LIGHTNESS, 12);
		expect(glassLightness(DEFAULT_LIGHTNESS, 40, 60)).toBe(DEFAULT_LIGHTNESS);
		// Flat glass is the limit: the default lightness all over.
		expect(glassLightness(95, 0, 0)).toBe(DEFAULT_LIGHTNESS);
	});

	it("counts only panels that share area with the window", () => {
		const window = { left: 0, top: 0, right: 800, bottom: 600 };
		const at = (left: number, top: number, size = 100) => ({ left, top, right: left + size, bottom: top + size });
		expect(overlaps(at(350, 250), window)).toBe(true);
		expect(overlaps(at(-50, -50), window)).toBe(true);
		expect(overlaps(at(750, 550), window)).toBe(true);
		expect(overlaps(at(-100, 0), window)).toBe(false);
		expect(overlaps(at(800, 0), window)).toBe(false);
		expect(overlaps(at(1600, 250), window)).toBe(false);
		expect(overlaps(at(0, 600), window)).toBe(false);
		expect(overlaps(at(0, -100), window)).toBe(false);
		expect(overlaps(at(300, 300, 0), window)).toBe(false);
	});

	it("advances a fling the same whatever the frame rate", () => {
		const whole = flingTravel(2, 100);
		let split = 0;
		let velocity = 2;
		for (let i = 0; i < 10; i++) {
			split += flingTravel(velocity, 10);
			velocity *= DECELERATION ** 10;
		}
		expect(split).toBeCloseTo(whole, 9);
	});

	it("flings to rest exactly at a smooth scroll's target", () => {
		expect(flingTravel(flingVelocity(1234), 1e6)).toBeCloseTo(1234, 6);
		expect(flingTravel(flingVelocity(-80), 1e6)).toBeCloseTo(-80, 6);
	});
});

describe("tables module", () => {
	it("encodes the tables as an ES module", () => {
		const source = tablesModule({
			rgb: Uint8Array.from([1, 2, 3]),
			sizes: [1, 256],
			rotations: [0, 7],
			cdf: [0, 0.123456789, 1],
		});
		expect(source).toContain('export const RGB = "AQID";');
		expect(source).toContain("export const SIZES = [1,256];");
		expect(source).toContain("export const ROTATIONS = [0,7];");
		expect(source).toContain("export const CDF = [0,0.123457,1];");
	});
});

describe("elements", () => {
	it("import without a DOM and register nothing", () => {
		expect(typeof NicrainhaBackground).toBe("function");
		expect(typeof NicrainhaGlass).toBe("function");
		expect(typeof NicrainhaBackground.prototype.capture).toBe("function");
		expect(globalThis.customElements).toBeUndefined();
	});
});
