// The background noise: its permutation table and its value distribution.
// The shader (shaders.ts) evaluates the noise per pixel; this is the same
// noise in TypeScript, for measuring it.

// Seeded Fisher–Yates shuffle of 0…255 (classic LCG).
export function buildPermutation(seed: number): Uint8Array {
	const perm = new Uint8Array(256);
	for (let i = 0; i < 256; i++) perm[i] = i;
	let s = seed;
	const random = () => {
		s = (s * 9301 + 49297) % 233280;
		return s / 233280;
	};
	for (let i = 255; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[perm[i], perm[j]] = [perm[j], perm[i]];
	}
	return perm;
}

// Ken Perlin's improved noise (2002) over permutation `perm`. Its values span
// exactly [−1, 1], and it repeats every 256 lattice units on every axis.
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function grad(hash: number, x: number, y: number, z: number): number {
	const h = hash & 15;
	const u = h < 8 ? x : y;
	const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
	return (h & 1 ? -u : u) + (h & 2 ? -v : v);
}

export function perlin3(
	perm: Uint8Array,
	px: number,
	py: number,
	pz: number,
): number {
	const P = (i: number) => perm[i & 255];
	const X = Math.floor(px);
	const Y = Math.floor(py);
	const Z = Math.floor(pz);
	const x = px - X;
	const y = py - Y;
	const z = pz - Z;
	const u = fade(x);
	const v = fade(y);
	const w = fade(z);
	const A = P(X) + Y;
	const AA = P(A) + Z;
	const AB = P(A + 1) + Z;
	const B = P(X + 1) + Y;
	const BA = P(B) + Z;
	const BB = P(B + 1) + Z;
	return lerp(
		lerp(
			lerp(grad(P(AA), x, y, z), grad(P(BA), x - 1, y, z), u),
			lerp(grad(P(AB), x, y - 1, z), grad(P(BB), x - 1, y - 1, z), u),
			v,
		),
		lerp(
			lerp(grad(P(AA + 1), x, y, z - 1), grad(P(BA + 1), x - 1, y, z - 1), u),
			lerp(
				grad(P(AB + 1), x, y - 1, z - 1),
				grad(P(BB + 1), x - 1, y - 1, z - 1),
				u,
			),
			v,
		),
		w,
	);
}

// The noise's cumulative distribution, CDF(v) = share of the noise below v,
// at `bins` + 1 values evenly from −1 to 1. Measured from random points over
// the noise's whole period, averaged over several permutations, so it holds
// for any seed.
export function perlinCdf(
	bins = 1024,
	seeds: readonly number[] = [1, 777, 4242, 31337],
	samples = 1e6,
): number[] {
	const counts = new Float64Array(bins);
	for (const seed of seeds) {
		const perm = buildPermutation(seed);
		let s = seed;
		const random = () => {
			s = (s * 1103515245 + 12345) % 2147483648;
			return s / 2147483648;
		};
		for (let i = 0; i < samples; i++) {
			const value = perlin3(perm, random() * 256, random() * 256, random() * 256);
			counts[Math.min(bins - 1, Math.floor(((value + 1) / 2) * bins))]++;
		}
	}
	const cdf = [0];
	let total = 0;
	for (const count of counts) cdf.push((total += count) / (seeds.length * samples));
	return cdf;
}

// The distribution's steepest slope, per unit of noise value: the density of
// the commonest value.
export function maxDensity(cdf: readonly number[]): number {
	const bins = cdf.length - 1;
	let density = 0;
	for (let i = 0; i < bins; i++) {
		density = Math.max(density, ((cdf[i + 1] - cdf[i]) * bins) / 2);
	}
	return density;
}
