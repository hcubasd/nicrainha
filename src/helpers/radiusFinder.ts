// Radius of the largest regular 256-gon (anchored at -b, k=0) inscribed in the sRGB gamut at lightness L.
const N_VERTICES = 256;

const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

const DELTA = 6 / 29;
const DELTA_SQ = DELTA * DELTA;
const EPSILON = 1e-12;

const M = [
	[3.2404542, -1.5371385, -0.4985314],
	[-0.969266, 1.8760108, 0.041556],
	[0.0556434, -0.2040259, 1.0572252],
] as const;

function fi(t: number): number {
	return t > DELTA ? t ** 3 : 3 * DELTA_SQ * (t - 4 / 29);
}

function uniqueSorted(values: Array<number | null>): number[] {
	const sorted = values
		.filter(
			(value): value is number =>
				value !== null && Number.isFinite(value) && value >= -EPSILON,
		)
		.sort((a, b) => a - b);

	const unique: number[] = [];
	for (const value of sorted) {
		const normalized = Math.abs(value) < EPSILON ? 0 : value;
		if (
			unique.length === 0 ||
			Math.abs(normalized - unique[unique.length - 1]) > EPSILON
		) {
			unique.push(normalized);
		}
	}
	return unique;
}

function crossingRadius(p: number, q: number): number | null {
	if (Math.abs(q) < EPSILON) return null;
	const radius = (DELTA - p) / q;
	return radius > EPSILON ? radius : null;
}

function quadraticRoots(A: number, B: number, C: number): number[] {
	if (Math.abs(A) < EPSILON) {
		return Math.abs(B) < EPSILON ? [] : [-C / B];
	}

	const discriminant = B * B - 4 * A * C;
	if (discriminant < -EPSILON) return [];

	if (Math.abs(discriminant) <= EPSILON) {
		return [-B / (2 * A)];
	}

	const sqrtDiscriminant = Math.sqrt(discriminant);
	const q = -0.5 * (B + Math.sign(B || 1) * sqrtDiscriminant);
	return [q / A, C / q];
}

function cubicRoots(A: number, B: number, C: number, D: number): number[] {
	if (Math.abs(A) < EPSILON) {
		return quadraticRoots(B, C, D);
	}

	const a = B / A;
	const b = C / A;
	const c = D / A;

	const p = b - (a * a) / 3;
	const q = (2 * a ** 3) / 27 - (a * b) / 3 + c;
	const discriminant = (q * q) / 4 + (p * p * p) / 27;
	const shift = a / 3;

	if (discriminant > EPSILON) {
		const sqrtDiscriminant = Math.sqrt(discriminant);
		const u = Math.cbrt(-q / 2 + sqrtDiscriminant);
		const v = Math.cbrt(-q / 2 - sqrtDiscriminant);
		return [u + v - shift];
	}

	if (Math.abs(discriminant) <= EPSILON) {
		if (Math.abs(q) <= EPSILON) {
			return [-shift];
		}

		const u = Math.cbrt(-q / 2);
		return [2 * u - shift, -u - shift];
	}

	const radius = 2 * Math.sqrt(-p / 3);
	const angle = Math.acos(-q / 2 / Math.sqrt(-(p * p * p) / 27));

	return [
		radius * Math.cos(angle / 3) - shift,
		radius * Math.cos((angle + 2 * Math.PI) / 3) - shift,
		radius * Math.cos((angle + 4 * Math.PI) / 3) - shift,
	];
}

function fiPolynomial(
	p: number,
	q: number,
	useCubicBranch: boolean,
): [number, number, number, number] {
	if (useCubicBranch) {
		return [q ** 3, 3 * p * q ** 2, 3 * p ** 2 * q, p ** 3];
	}

	return [0, 0, 3 * DELTA_SQ * q, 3 * DELTA_SQ * (p - 4 / 29)];
}

function scaleAndAdd(
	target: [number, number, number, number],
	scale: number,
	[a, b, c, d]: readonly [number, number, number, number],
): void {
	target[0] += scale * a;
	target[1] += scale * b;
	target[2] += scale * c;
	target[3] += scale * d;
}

function channelPolynomial(
	L: number,
	cosTheta: number,
	sinTheta: number,
	mRow: readonly [number, number, number],
	sampleR: number,
): [number, number, number, number] {
	const [mx, my, mz] = mRow;
	const p = (L + 16) / 116;
	const qx = cosTheta / 500;
	const qz = -sinTheta / 200;

	const fxPoly = fiPolynomial(p, qx, p + qx * sampleR > DELTA);
	const fzPoly = fiPolynomial(p, qz, p + qz * sampleR > DELTA);
	const yValue = fi(p);

	const channel: [number, number, number, number] = [0, 0, 0, my * YN * yValue];
	scaleAndAdd(channel, mx * XN, fxPoly);
	scaleAndAdd(channel, mz * ZN, fzPoly);
	return channel;
}

function channelValue(
	L: number,
	a: number,
	b: number,
	mRow: readonly [number, number, number],
): number {
	const fy = (L + 16) / 116;
	const fx = a / 500 + fy;
	const fz = fy - b / 200;

	const x = fi(fx) * XN;
	const y = fi(fy) * YN;
	const z = fi(fz) * ZN;

	const [mx, my, mz] = mRow;
	return mx * x + my * y + mz * z;
}

function isInsideGamut(
	L: number,
	radius: number,
	cosTheta: number,
	sinTheta: number,
): boolean {
	const a = radius * cosTheta;
	const b = radius * sinTheta;

	for (const row of M) {
		const channel = channelValue(L, a, b, row);
		if (channel < -EPSILON || channel > 1 + EPSILON) {
			return false;
		}
	}

	return true;
}

function intervalSample(lower: number, upper: number): number {
	if (upper === Infinity) {
		return lower + Math.max(1, Math.abs(lower));
	}

	return (lower + upper) / 2;
}

function polynomialRootsInInterval(
	polynomial: readonly [number, number, number, number],
	lower: number,
	upper: number,
): number[] {
	const [A, B, C, D] = polynomial;
	return cubicRoots(A, B, C, D).filter((root) => {
		if (!Number.isFinite(root)) return false;
		if (root < lower - EPSILON) return false;
		if (upper !== Infinity && root > upper + EPSILON) return false;
		return true;
	});
}

function exactBoundaryRadius(
	L: number,
	cosTheta: number,
	sinTheta: number,
): number {
	const p = (L + 16) / 116;
	const qx = cosTheta / 500;
	const qz = -sinTheta / 200;

	const breakpoints = uniqueSorted([
		0,
		crossingRadius(p, qx),
		crossingRadius(p, qz),
	]);
	const intervalEnds = [...breakpoints.slice(1), Infinity];
	const events = [...breakpoints];

	for (let index = 0; index < breakpoints.length; index++) {
		const lower = breakpoints[index];
		const upper = intervalEnds[index];
		const sampleR = intervalSample(lower, upper);

		for (const row of M) {
			const polynomial = channelPolynomial(L, cosTheta, sinTheta, row, sampleR);
			for (const target of [0, 1]) {
				events.push(
					...polynomialRootsInInterval(
						[
							polynomial[0],
							polynomial[1],
							polynomial[2],
							polynomial[3] - target,
						],
						lower,
						upper,
					),
				);
			}
		}
	}

	const sortedEvents = uniqueSorted(events);

	for (let index = 0; index < sortedEvents.length - 1; index++) {
		const lower = sortedEvents[index];
		const upper = sortedEvents[index + 1];

		if (upper - lower <= EPSILON) continue;

		if (!isInsideGamut(L, (lower + upper) / 2, cosTheta, sinTheta)) {
			return lower;
		}
	}

	const lastEvent = sortedEvents[sortedEvents.length - 1] ?? 0;
	if (
		!isInsideGamut(L, intervalSample(lastEvent, Infinity), cosTheta, sinTheta)
	) {
		return lastEvent;
	}

	throw new Error(
		`Failed to find gamut boundary for L=${L}, theta=${Math.atan2(sinTheta, cosTheta)}`,
	);
}

export function findRadius(L: number): number {
	let radius = Infinity;

	for (let k = 0; k < N_VERTICES; k++) {
		const theta = (3 * Math.PI) / 2 + (k * 2 * Math.PI) / N_VERTICES;
		const boundary = exactBoundaryRadius(L, Math.cos(theta), Math.sin(theta));
		if (boundary < radius) radius = boundary;
	}

	return radius;
}
