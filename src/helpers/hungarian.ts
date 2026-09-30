// O(n³) Kuhn-Munkres: minimum-cost perfect matching for square cost matrices.
export function hungarian(cost: readonly (readonly number[])[]): {
	total: number;
	assignment: number[];
} {
	if (!Array.isArray(cost) || cost.length === 0) {
		throw new RangeError("cost must be a non-empty square matrix.");
	}

	const n = cost.length;
	for (const row of cost) {
		if (!Array.isArray(row) || row.length !== n) {
			throw new RangeError("cost must be a square matrix.");
		}

		for (const value of row) {
			if (!Number.isFinite(value) || value < 0) {
				throw new RangeError(
					"cost entries must be finite non-negative numbers.",
				);
			}
		}
	}

	const inf = Number.POSITIVE_INFINITY;
	const u = new Float64Array(n + 1);
	const v = new Float64Array(n + 1);
	const p = new Int32Array(n + 1);
	const way = new Int32Array(n + 1);

	for (let i = 1; i <= n; i++) {
		p[0] = i;
		let j0 = 0;

		const minVal = new Float64Array(n + 1).fill(inf);
		const used = new Uint8Array(n + 1);

		do {
			used[j0] = 1;
			const i0 = p[j0];
			let delta = inf;
			let j1 = -1;

			for (let j = 1; j <= n; j++) {
				if (used[j]) continue;

				const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
				if (cur < minVal[j]) {
					minVal[j] = cur;
					way[j] = j0;
				}
				if (minVal[j] < delta) {
					delta = minVal[j];
					j1 = j;
				}
			}

			for (let j = 0; j <= n; j++) {
				if (used[j]) {
					u[p[j]] += delta;
					v[j] -= delta;
				} else {
					minVal[j] -= delta;
				}
			}

			j0 = j1;
		} while (p[j0] !== 0);

		do {
			p[j0] = p[way[j0]];
			j0 = way[j0];
		} while (j0 !== 0);
	}

	const assignment = new Int32Array(n);
	for (let j = 1; j <= n; j++) {
		if (p[j] !== 0) {
			assignment[p[j] - 1] = j - 1;
		}
	}

	const total = assignment.reduce((sum, col, row) => sum + cost[row][col], 0);
	return { total, assignment: Array.from(assignment) };
}
