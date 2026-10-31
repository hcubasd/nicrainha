import type { RgbColor } from "../types.js";

// The palette a lightness uses: the largest evenly spaced palette of unique
// colors. That is the largest n for which some rotation of nicrainha's
// n-gon, generatePalettes(n)[rotation], has n distinct colors, and the first
// such rotation. Every n-gon is a subset of the 256-gon, rotation r taking
// vertices r + ⌊k · 256 / n⌋, so the 256-gon, `ring` (256 colors in vertex
// order), answers every n. Uniqueness isn't monotone in n once any rotation
// may be chosen, so n is scanned down from 256.
export interface Palette {
	size: number;
	rotation: number;
}

export function largestPalette(ring: readonly RgbColor[]): Palette {
	const color = ring.map(({ r, g, b }) => (r << 16) | (g << 8) | b);
	// Pairs of vertices with the same color.
	const pairs: [number, number][] = [];
	for (let i = 0; i < 256; i++) {
		for (let j = i + 1; j < 256; j++) {
			if (color[i] === color[j]) pairs.push([i, j]);
		}
	}
	const taken = new Uint8Array(256);
	for (let size = 256; size > 1; size--) {
		for (let rotation = 0; rotation < 256; rotation++) {
			taken.fill(0);
			for (let k = 0; k < size; k++) {
				taken[(rotation + Math.floor((k * 256) / size)) & 255] = 1;
			}
			if (!pairs.some(([i, j]) => taken[i] && taken[j])) return { size, rotation };
		}
	}
	return { size: 1, rotation: 0 };
}
