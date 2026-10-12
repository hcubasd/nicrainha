import { DEFAULT_LIGHTNESS } from "nicrainha";

import { CORNER, modeFor, Z_PER_SECOND } from "./gl.js";
import { createScene } from "./scene.js";

// The showcase: an endless nicrainha background you can pan in any
// direction, under a glass panel carrying the label. The panel moves with
// the background, and once it has left the window on one side it comes back
// in from the opposite one.
//
// ?lightness=<L*> sets the background's lightness, 0 to 100 (nicrainha's
// default otherwise). Backgrounds where white text has more contrast than
// black get white text and glass that darkens toward black ("dark" mode);
// the rest get black text and glass that lightens toward white.

// Glass size in CSS px, shrunk to fit the window with this margin.
const PANEL = { width: 560, height: 320, margin: 24 };
// Fling deceleration: velocity is multiplied by this every millisecond.
// iOS's own scroll deceleration (UIScrollView.DecelerationRate.normal).
const DECELERATION = 0.998;
// Release velocity is measured over the pointer's last 100 ms, and is zero if
// it rested 40 ms before release: Android's VelocityTracker horizon and its
// "pointer stopped" time.
const VELOCITY_WINDOW = 100;
const STOPPED_TIME = 40;
// Steepest rate at which one octave of noise changes with z:
// max |∂n/∂z| ≈ 3.09, measured over 8 million points and refined by local
// search.
const MAX_DNDZ = 3.09;
// Redraw interval while nothing moves, in ms: the time the steepest pixel
// takes to step one palette color (2/256 of one octave's span, see
// glass.glsl). Fractal noise can change `rate` times faster (noise.js).
const animationInterval = (rate) => (1000 * (2 / 256)) / (Z_PER_SECOND * MAX_DNDZ * rate);

function requestedLightness() {
  const param = new URLSearchParams(location.search).get("lightness");
  const value = param?.trim() ? Number(param) : NaN;
  return value >= 0 && value <= 100 ? value : DEFAULT_LIGHTNESS;
}

const lightness = requestedLightness();
document.documentElement.dataset.mode = modeFor(lightness);

const canvas = document.getElementById("canvas");
const scene = createScene(canvas, lightness);

const label = document.querySelector(".label");

// ── Panning ─────────────────────────────────────────────────────────────────
// `pan` is the window's position on the endless background, CSS px. Drags
// move the background with the pointer, releases fling it with decaying
// momentum, and wheels and trackpads pan it directly (trackpads already add
// their own momentum).

const pan = { x: 0, y: 0 };
let velocity = { x: 0, y: 0 };  // of `pan`, CSS px per ms
let drag = null;                // { id, samples: [{ t, x, y }] }
let moved = true;               // whether pan or layout changed since the last draw

const root = document.documentElement;

root.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  root.setPointerCapture(event.pointerId);
  velocity = { x: 0, y: 0 };
  drag = { id: event.pointerId, samples: [{ t: event.timeStamp, x: event.clientX, y: event.clientY }] };
});

root.addEventListener("pointermove", (event) => {
  if (event.pointerId !== drag?.id) return;
  const last = drag.samples.at(-1);
  pan.x -= event.clientX - last.x;
  pan.y -= event.clientY - last.y;
  moved = true;
  drag.samples.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
  while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].t > VELOCITY_WINDOW) drag.samples.shift();
});

function release(event) {
  if (event.pointerId !== drag?.id) return;
  const first = drag.samples[0], last = drag.samples.at(-1);
  const dt = last.t - first.t;
  if (event.type === "pointerup" && dt > 0 && event.timeStamp - last.t < STOPPED_TIME) {
    velocity = { x: -(last.x - first.x) / dt, y: -(last.y - first.y) / dt };
  }
  drag = null;
}
root.addEventListener("pointerup", release);
root.addEventListener("pointercancel", release);

root.addEventListener("wheel", (event) => {
  if (event.ctrlKey) return;  // pinch-zoom: leave it to the browser
  event.preventDefault();
  const unit = event.deltaMode === 1 ? parseFloat(getComputedStyle(root).fontSize)
    : event.deltaMode === 2 ? window.innerHeight : 1;
  pan.x += event.deltaX * unit;
  pan.y += event.deltaY * unit;
  velocity = { x: 0, y: 0 };
  moved = true;
}, { passive: false });

// A resized window redraws on the next frame, once the canvas has its new
// size.
new ResizeObserver(() => { moved = true; }).observe(canvas);

// Advances a fling by `dt` ms, exactly: velocity decays by DECELERATION per
// ms, so the distance covered is v · (d^dt − 1) / ln d. It stops once all the
// travel it has left is under half a device pixel.
function fling(dt) {
  if (drag || (!velocity.x && !velocity.y)) return;
  const decay = DECELERATION ** dt;
  const travel = (decay - 1) / Math.log(DECELERATION);
  pan.x += velocity.x * travel;
  pan.y += velocity.y * travel;
  velocity = { x: velocity.x * decay, y: velocity.y * decay };
  moved = true;
  const remaining = Math.hypot(velocity.x, velocity.y) / -Math.log(DECELERATION);
  if (remaining < 0.5 / (window.devicePixelRatio || 1)) velocity = { x: 0, y: 0 };
}

// ── Glass ───────────────────────────────────────────────────────────────────
// A rounded rectangle, centered at first, moving with the background. It
// wraps with a period of the window plus its own size, so it leaves the
// window entirely before coming back in from the other side. Its corner
// radius sets its thickness, and with it the air gap and the lightness.

const wrap = (value, period) => ((value % period) + period) % period;

function glass() {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const halfWidth = Math.max(0, Math.min(PANEL.width, width - 2 * PANEL.margin) / 2);
  const halfHeight = Math.max(0, Math.min(PANEL.height, height - 2 * PANEL.margin) / 2);
  return {
    x: wrap(width / 2 + halfWidth - pan.x, width + 2 * halfWidth) - halfWidth,
    y: wrap(height / 2 + halfHeight - pan.y, height + 2 * halfHeight) - halfHeight,
    halfWidth,
    halfHeight,
    radius: CORNER * Math.min(halfWidth, halfHeight),
  };
}

// ── Frames ──────────────────────────────────────────────────────────────────
// A frame is drawn when the view moved, and otherwise as often as the
// animation needs, rounded to whole display frames. The label moves in the
// same frame as the glass, so it never lags it.

let lastFrame, lastDraw = -Infinity;

function frame(now) {
  const period = lastFrame === undefined ? 0 : now - lastFrame;
  lastFrame = now;
  fling(period);
  if (moved || now - lastDraw >= animationInterval(scene.rate()) - period / 2) {
    const panel = glass();
    label.style.transform = `translate(${panel.x}px, ${panel.y}px) translate(-50%, -50%)`;
    scene.draw(now, [panel], pan);
    lastDraw = now;
    moved = false;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
