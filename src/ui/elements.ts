// <nicrainha-background> and <nicrainha-glass>, registered on import wherever
// custom elements exist; elsewhere (Node) importing them does nothing. The
// renderer and its tables load on demand, when a background connects.

import { DEFAULT_LIGHTNESS, generatePalettes } from "../colors.js";
import {
	DECELERATION,
	DEFAULT_SPEED,
	flingTravel,
	flingVelocity,
	overlaps,
	STOPPED_TIME,
	VELOCITY_WINDOW,
} from "./model.js";
import type { Panel, Renderer } from "./renderer.js";

const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

interface Point {
	x: number;
	y: number;
}

// Pointer presses on these don't start a pan.
const INTERACTIVE = "input, textarea, select, button, a[href], label, [contenteditable]";

// The background: nicrainha's endless, animated Perlin background filling
// the viewport, behind its children. The children are the UI, on an endless
// plane: drags, flings and wheels pan them, and so do scrollLeft, scrollTop,
// scrollTo and scrollBy. The background itself stays in place. Glass panels
// among the children refract it.
export class NicrainhaBackground extends Base {
	static observedAttributes = ["lightness", "speed"];

	#canvas: HTMLCanvasElement;
	#plane: HTMLElement;
	#renderer: Renderer | null = null;
	#frame = 0;
	#lastFrame: number | undefined;
	#pan: Point = { x: 0, y: 0 };
	#velocity: Point = { x: 0, y: 0 };
	#target: Point | null = null; // where a smooth scroll comes to rest
	#drag: { id: number; samples: { t: number; x: number; y: number }[] } | null = null;
	#moved = true;
	#lastPanels = "";
	#reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
	#resizeObserver: ResizeObserver | null = null;

	constructor() {
		super();
		const shadow = this.attachShadow({ mode: "open" });
		shadow.innerHTML = `
			<style>
				:host {
					position: fixed;
					inset: 0;
					display: block;
					overflow: hidden;
					touch-action: none;
					overscroll-behavior: none;
					user-select: none;
					cursor: grab;
				}
				canvas, [part="plane"] {
					position: absolute;
					left: 0;
					top: 0;
					width: 100%;
					height: 100%;
				}
				canvas { display: block; }
			</style>
			<canvas part="canvas"></canvas>
			<div part="plane"><slot></slot></div>
		`;
		this.#canvas = shadow.querySelector("canvas")!;
		this.#plane = shadow.querySelector("[part=plane]")!;
	}

	// ── Attributes ──────────────────────────────────────────────────────────

	// L* of the background, 0 to 100; nicrainha's default otherwise.
	get lightness(): number {
		const value = Number(this.getAttribute("lightness") ?? NaN);
		return value >= 0 && value <= 100 ? value : DEFAULT_LIGHTNESS;
	}
	set lightness(value: number) {
		this.setAttribute("lightness", String(value));
	}

	// Color steps the animation advances per displayed frame, 1 by default, 0
	// for still. Users who prefer reduced motion get a still background.
	get speed(): number {
		const value = Number(this.getAttribute("speed") ?? NaN);
		return value >= 0 ? value : DEFAULT_SPEED;
	}
	set speed(value: number) {
		this.setAttribute("speed", String(value));
	}

	attributeChangedCallback(name: string): void {
		if (name === "lightness") {
			this.#renderer?.setLightness(this.lightness);
			this.#fallback();
		}
		this.#moved = true;
	}

	// ── Panning ─────────────────────────────────────────────────────────────
	// The pan is the UI's position on the endless plane, CSS px, as an
	// element's scroll position: unbounded in every direction.

	override get scrollLeft(): number {
		return this.#pan.x;
	}
	override set scrollLeft(x: number) {
		this.#panTo({ x, y: this.#pan.y });
	}
	override get scrollTop(): number {
		return this.#pan.y;
	}
	override set scrollTop(y: number) {
		this.#panTo({ x: this.#pan.x, y });
	}

	override scrollTo(xOrOptions?: number | ScrollToOptions, y?: number): void {
		const target =
			typeof xOrOptions === "object"
				? { x: xOrOptions.left ?? this.#pan.x, y: xOrOptions.top ?? this.#pan.y }
				: { x: xOrOptions ?? this.#pan.x, y: y ?? this.#pan.y };
		const smooth = typeof xOrOptions === "object" && xOrOptions.behavior === "smooth";
		this.#panTo(target, smooth);
	}

	override scrollBy(xOrOptions?: number | ScrollToOptions, y?: number): void {
		const delta =
			typeof xOrOptions === "object"
				? { x: xOrOptions.left ?? 0, y: xOrOptions.top ?? 0 }
				: { x: xOrOptions ?? 0, y: y ?? 0 };
		const smooth = typeof xOrOptions === "object" && xOrOptions.behavior === "smooth";
		this.#panTo({ x: this.#pan.x + delta.x, y: this.#pan.y + delta.y }, smooth);
	}

	// Jumps to `target`, or, smoothly, flings there: a fling that comes to
	// rest exactly at the target, with the same deceleration as a release.
	#panTo(target: Point, smooth = false): void {
		if (smooth && !this.#reducedMotion?.matches) {
			this.#velocity = {
				x: flingVelocity(target.x - this.#pan.x),
				y: flingVelocity(target.y - this.#pan.y),
			};
			this.#target = { ...target };
			return;
		}
		this.#stop();
		this.#pan = { ...target };
		this.#moved = true;
	}

	// Ends any fling or smooth scroll.
	#stop(): void {
		this.#velocity = { x: 0, y: 0 };
		this.#target = null;
	}

	#onPointerDown = (event: PointerEvent): void => {
		if (event.pointerType === "mouse" && event.button !== 0) return;
		const target = event.composedPath()[0];
		if (target instanceof Element && target.closest(INTERACTIVE)) return;
		this.setPointerCapture(event.pointerId);
		this.#stop();
		this.#drag = { id: event.pointerId, samples: [{ t: event.timeStamp, x: event.clientX, y: event.clientY }] };
	};

	#onPointerMove = (event: PointerEvent): void => {
		const drag = this.#drag;
		if (event.pointerId !== drag?.id) return;
		const last = drag.samples.at(-1)!;
		this.#pan = { x: this.#pan.x - (event.clientX - last.x), y: this.#pan.y - (event.clientY - last.y) };
		this.#moved = true;
		drag.samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
		while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].t > VELOCITY_WINDOW) drag.samples.shift();
	};

	// A release keeps the pointer's velocity over its last 100 ms, unless it
	// rested 40 ms before releasing.
	#onPointerUp = (event: PointerEvent): void => {
		const drag = this.#drag;
		if (event.pointerId !== drag?.id) return;
		const first = drag.samples[0];
		const last = drag.samples.at(-1)!;
		const dt = last.t - first.t;
		if (event.type === "pointerup" && dt > 0 && event.timeStamp - last.t < STOPPED_TIME) {
			this.#velocity = { x: -(last.x - first.x) / dt, y: -(last.y - first.y) / dt };
		}
		this.#drag = null;
	};

	// Wheels and trackpads pan directly; trackpads add their own momentum.
	// Pinch (a wheel with Ctrl) is left to the browser.
	#onWheel = (event: WheelEvent): void => {
		if (event.ctrlKey) return;
		event.preventDefault();
		const unit =
			event.deltaMode === 1
				? parseFloat(getComputedStyle(this).fontSize)
				: event.deltaMode === 2
					? this.clientHeight
					: 1;
		this.#stop();
		this.#pan = { x: this.#pan.x + event.deltaX * unit, y: this.#pan.y + event.deltaY * unit };
		this.#moved = true;
	};

	// Advances a fling by `dt` ms, exactly. It stops once all the travel it
	// has left is under half a device pixel; a smooth scroll then lands on its
	// target.
	#fling(dt: number): void {
		const { x, y } = this.#velocity;
		if (this.#drag || (!x && !y)) return;
		this.#pan = { x: this.#pan.x + flingTravel(x, dt), y: this.#pan.y + flingTravel(y, dt) };
		const decay = DECELERATION ** dt;
		this.#velocity = { x: x * decay, y: y * decay };
		this.#moved = true;
		const remaining = Math.hypot(x, y) * decay / -Math.log(DECELERATION);
		if (remaining < 0.5 / devicePixelRatio) {
			if (this.#target) this.#pan = this.#target;
			this.#stop();
		}
	}

	// ── Lifecycle ───────────────────────────────────────────────────────────

	connectedCallback(): void {
		this.addEventListener("pointerdown", this.#onPointerDown);
		this.addEventListener("pointermove", this.#onPointerMove);
		this.addEventListener("pointerup", this.#onPointerUp);
		this.addEventListener("pointercancel", this.#onPointerUp);
		this.addEventListener("wheel", this.#onWheel, { passive: false });
		this.#observeSize();
		this.#fallback();
		import("./renderer.js").then(({ createRenderer }) => {
			if (!this.isConnected || this.#renderer) return;
			this.#renderer = createRenderer(this.#canvas, this.lightness);
			this.#fallback();
			this.#moved = true;
		});
		this.#frame = requestAnimationFrame(this.#onFrame);
	}

	disconnectedCallback(): void {
		this.removeEventListener("pointerdown", this.#onPointerDown);
		this.removeEventListener("pointermove", this.#onPointerMove);
		this.removeEventListener("pointerup", this.#onPointerUp);
		this.removeEventListener("pointercancel", this.#onPointerUp);
		this.removeEventListener("wheel", this.#onWheel);
		this.#resizeObserver?.disconnect();
		cancelAnimationFrame(this.#frame);
		this.#renderer?.dispose();
		this.#renderer = null;
	}

	// Without WebGL2, the background is one nicrainha color at its lightness.
	#fallback(): void {
		if (this.#renderer) {
			this.style.removeProperty("background");
			return;
		}
		const { r, g, b } = generatePalettes(1, { lightness: this.lightness })[0][0];
		this.style.background = `rgb(${r} ${g} ${b})`;
	}

	// One canvas pixel per device pixel: a canvas the browser rescales blends
	// colors. At fractional pixel ratios, rounding CSS px × devicePixelRatio
	// can miss by one, so the browser's own device-pixel size is used where it
	// reports it (not Safari).
	#observeSize(): void {
		this.#resizeObserver = new ResizeObserver(([entry]) => {
			const exact = entry.devicePixelContentBoxSize?.[0];
			this.#canvas.width = exact ? exact.inlineSize : Math.round(entry.contentRect.width * devicePixelRatio);
			this.#canvas.height = exact ? exact.blockSize : Math.round(entry.contentRect.height * devicePixelRatio);
			this.#moved = true;
		});
		try {
			this.#resizeObserver.observe(this.#canvas, { box: "device-pixel-content-box" });
		} catch {
			this.#resizeObserver.observe(this.#canvas);
		}
	}

	// ── Frames ──────────────────────────────────────────────────────────────
	// Every displayed frame: advance any fling, move the UI to the pan and
	// announce it ("scroll"), measure the glass, and draw. The UI, the glass
	// and the background all move in this one frame, so they never drift
	// apart. A still background draws only when something changed.

	#onFrame = (now: number): void => {
		this.#frame = requestAnimationFrame(this.#onFrame);
		this.#fling(this.#lastFrame === undefined ? 0 : now - this.#lastFrame);
		this.#lastFrame = now;
		const moved = this.#moved;
		if (moved) {
			this.#plane.style.transform = `translate3d(${-this.#pan.x}px, ${-this.#pan.y}px, 0)`;
			this.dispatchEvent(new Event("scroll"));
			this.#moved = false;
		}
		if (!this.#renderer) return;
		const panels = this.#panels();
		const key = JSON.stringify(panels);
		const speed = this.#reducedMotion?.matches ? 0 : this.speed;
		if (speed > 0 || moved || key !== this.#lastPanels) {
			this.#renderer.draw(panels, speed);
			this.#lastPanels = key;
		}
	};

	// The glass panels among the children that are in view, in device px. A
	// panel's size and position are its layout box; its corner radius is its
	// border radius, at most half its shorter side. Panels out of view are
	// left out: they would change no pixel, yet every pixel would test them.
	#panels(): Panel[] {
		const dpr = devicePixelRatio;
		const origin = this.getBoundingClientRect();
		const boxes = [...this.querySelectorAll("nicrainha-glass")].map((glass) => ({ glass, box: glass.getBoundingClientRect() }));
		return boxes.filter(({ box }) => overlaps(box, origin)).map(({ glass, box }) => {
			const radius = getComputedStyle(glass).borderTopLeftRadius;
			const length = parseFloat(radius) || 0;
			const px = radius.endsWith("%") ? (length / 100) * box.width : length;
			return {
				x: (box.left - origin.left + box.width / 2) * dpr,
				y: (box.top - origin.top + box.height / 2) * dpr,
				halfWidth: (box.width / 2) * dpr,
				halfHeight: (box.height / 2) * dpr,
				radius: Math.min(px, box.width / 2, box.height / 2) * dpr,
			};
		});
	}
}

// A glass panel: any element among a background's children. Its layout box
// and border radius are its shape; text on it is black, the most contrast
// on the glass's middle, nicrainha's default lightness. Panels must not
// overlap.
export class NicrainhaGlass extends Base {
	constructor() {
		super();
		this.attachShadow({ mode: "open" }).innerHTML = `
			<style>:host { display: block; color: #000; }</style>
			<slot></slot>
		`;
	}
}

if (globalThis.customElements) {
	if (!customElements.get("nicrainha-background")) customElements.define("nicrainha-background", NicrainhaBackground);
	if (!customElements.get("nicrainha-glass")) customElements.define("nicrainha-glass", NicrainhaGlass);
}

declare global {
	interface HTMLElementTagNameMap {
		"nicrainha-background": NicrainhaBackground;
		"nicrainha-glass": NicrainhaGlass;
	}
}
