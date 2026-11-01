// The background and glass model: every constant they use, and the formulas
// that follow from them. Pure functions, shared by the renderer, the
// elements, the build-time tables and the tests.

import { DEFAULT_LIGHTNESS } from "../colors.js";

// ── Background ───────────────────────────────────────────────────────────────

// Noise lattice cell, in device px, for a window `width` × `height` device
// px: the long side spans 2 cells, unless that would make the short side span
// more than one. Whole pixels. The one value chosen by eye.
export function cellSize(width: number, height: number): number {
	const short = Math.min(width, height);
	const long = Math.max(width, height);
	return Math.max(1, Math.round(Math.max(short, long / 2)));
}

// Steepest rate at which the noise changes with depth: max |∂n/∂z| ≈ 3.09,
// measured over 8 million points and refined by local search.
export const MAX_DNDZ = 3.09;

// The smallest step in depth, in lattice units, that can change a pixel's
// color: the steepest pixel crossing one vertex of the 256-gon, the finest
// palette, through the color mapping at its densest, `maxDensity` (the
// steepest slope of the noise's distribution, per unit of noise value). Any
// smaller step changes no pixel.
export function colorStep(maxDensity: number): number {
	return 1 / (256 * maxDensity * MAX_DNDZ);
}

// Default animation speed: color steps per displayed frame. At 1, every
// frame shows the next step and no pixel skips a color.
export const DEFAULT_SPEED = 1;

// Lightness rows of the renderer's palette table: L* 100/255 ≈ 0.39 apart,
// about one 8-bit sRGB level, so finer rows would mostly repeat colors.
export const TABLE_ROWS = 256;

// ── Glass ────────────────────────────────────────────────────────────────────

// Refractive index: the largest at which no ray entering the glass from
// straight above is totally reflected inside it. The steepest such ray
// enters at the rim, where the surface is vertical, and meets the flat
// bottom at an angle whose sine, times n, is √(n² − 1); it can leave while
// that is at most 1, so n ≤ √2.
export const IOR = Math.SQRT2;

// Air gap between the glass and the background, as a multiple of the corner
// radius R: the back focal distance of the edge, a plano-convex lens of
// radius R, 1/(n − 1) − 1/n (≈ 1.707 for n = √2). The background lies in
// the edge's focal plane, at every radius.
export const GAP_RATIO = 1 / (IOR - 1) - 1 / IOR;

// Corner radii below one device pixel are flat glass: no curvature a pixel
// could resolve.
export const MIN_RADIUS = 1;

// L* under glass, where a ray travels `path` inside glass of corner radius
// `radius`: linear from the background's L* at no glass to nicrainha's
// default L* (its most saturated palette) at the longest path, R, straight
// down through the flat middle. Flat glass (radius 0) is the limit: the
// default L* over all of it.
export function glassLightness(
	lightness: number,
	path: number,
	radius: number,
): number {
	const travel = radius > 0 ? Math.min(path / radius, 1) : 1;
	return lightness + (DEFAULT_LIGHTNESS - lightness) * travel;
}

// Whether two boxes share any area. A panel changes only the pixels it
// covers, so one that shares none with the window changes none.
export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}
export function overlaps(a: Box, b: Box): boolean {
	return (
		Math.max(a.left, b.left) < Math.min(a.right, b.right) &&
		Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom)
	);
}

// ── Panning ──────────────────────────────────────────────────────────────────

// Fling deceleration: velocity is multiplied by this every millisecond, iOS's
// own scroll deceleration (UIScrollView.DecelerationRate.normal).
export const DECELERATION = 0.998;

// Release velocity is measured over the pointer's last 100 ms, and is zero if
// it rested 40 ms before release: Android's VelocityTracker horizon and its
// "pointer stopped" time.
export const VELOCITY_WINDOW = 100;
export const STOPPED_TIME = 40;

// Distance a fling at `velocity` (px per ms) covers in `dt` ms, exactly:
// v · (d^dt − 1) / ln d.
export function flingTravel(velocity: number, dt: number): number {
	return (velocity * (DECELERATION ** dt - 1)) / Math.log(DECELERATION);
}

// The velocity of a fling that comes to rest exactly `distance` px away: a
// fling's whole travel is v / −ln d.
export function flingVelocity(distance: number): number {
	return distance * -Math.log(DECELERATION);
}
