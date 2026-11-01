import "nicrainha";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { compile, report, warmUp } from "./tex.js";

// The showcase: a slide deck written in LaTeX with tex/nicrainha.cls,
// compiled in the browser and shown over nicrainha's background.
//
// It opens on a glass panel carrying `npm i nicrainha`, panning freely and
// wrapping around the window. Drop the deck's images, then its .tex file,
// anywhere on the page. While TeX compiles, a rolling cat and a progress bar
// sit on the bare background; then a prompt says how it went, over the bare
// background too. Errors return to the panel; otherwise the deck shows.
//
// Each slide is its PDF page, scaled to fit the window; its title sits on
// glass and its body on the bare background. The slides stack top to bottom:
// drag or scroll up and down freely, and wherever that stops, the deck
// settles on a slide. Space, ↓, →, PageDown go to the next slide; ↑, ←,
// PageUp, Shift+Space the previous. P builds and downloads the PDF, each slide
// on its own background, L downloads the log, and F toggles full screen.
//
// ?lightness=<L*> sets the background's lightness, 0 to 100; it's 87 otherwise.

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const background = document.querySelector("nicrainha-background");
const deck = document.getElementById("deck");
const home = document.getElementById("home");
const loading = document.getElementById("loading");
const bar = loading.querySelector(".bar div");
const cat = loading.querySelector(".cat img");

// The page's lightness: L* 87, above nicrainha's default, a light, even look
// for slides, chosen by eye; ?lightness=<L*> overrides it.
const PAGE_LIGHTNESS = 87;
const lightness = new URLSearchParams(location.search).get("lightness");
background.setAttribute("lightness", lightness?.trim() ? lightness : PAGE_LIGHTNESS);
// The loading bar is drawn in the ink, like text on the bare background.
document.documentElement.style.setProperty("--ink", inkFor(background.lightness));

// The page, in pt: tex/nicrainha.cls's.
const MM = 72 / 25.4;
const PAGE = { width: 160 * MM, height: 90 * MM };
// The glass behind a title, mm from the page's top left. Its corner radius is
// the largest that keeps the text on its flat middle, the glass inset by the
// radius: half the glass's smallest room around the text.
const radius = (glass, text) => Math.min(glass.width - text.width, glass.height - text.height) / 2;
// The banner sits half the slide's 8 mm margin from the page's edges, and
// half a margin from the title's capitals, whose height and descenders' depth
// the class logs; descenders hang into the half margin below the baseline.
const MARGIN = 8;
const BANNER_WIDTH = 160 - MARGIN;
function banner(caps, descent) {
	const box = { left: MARGIN / 2, top: MARGIN / 2, width: BANNER_WIDTH, height: caps / MM + MARGIN };
	return { ...box, radius: MARGIN / 2 - descent / MM };
}
// The title card: the title, author and date, whose size the class logs, with
// 4 mm around them, scaled up by CARD about the page's center, and no wider
// than the banner. Chosen by eye.
const CARD = 1.5;
function card(width, height) {
	const text = { width: width / MM, height: height / MM };
	const box = {
		width: Math.min((text.width + MARGIN) * CARD, BANNER_WIDTH),
		height: (text.height + MARGIN) * CARD,
	};
	return { left: (160 - box.width) / 2, top: (90 - box.height) / 2, ...box, radius: radius(box, text) };
}
// A wheel or trackpad has stopped once it has sent nothing for this long, ms:
// longer than the gaps between its events. Chosen by eye.
const WHEEL_REST = 150;
// Settling on a slide takes this long, ms, along CSS's default curve, ease.
// Chosen by eye.
const SETTLE = 300;
// A drag's release velocity: over the pointer's last 100 ms, and zero if it
// rested 40 ms before release (Android's VelocityTracker horizon and its
// "pointer stopped" time). The slide it settles on is where that velocity
// would carry the deck at iOS's scroll deceleration, 0.998 per ms. The same
// constants as nicrainha's own flings.
const VELOCITY_WINDOW = 100;
const STOPPED_TIME = 40;
const DECELERATION = 0.998;
const IMAGES = /\.(png|jpe?g|pdf)$/i;
const BIBLIOGRAPHIES = /\.bib$/i;
// The home panel, CSS px, shrunk to fit the window with this margin, and its
// corner radius as a fraction of the largest it allows. Chosen by eye.
const PANEL = { width: 560, height: 320, margin: 24 };
const CORNER = 0.38;

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// ── Dropping files ───────────────────────────────────────────────────────────

const images = new Map();
let source = null;
let name = "deck";

addEventListener("dragover", (event) => event.preventDefault());
addEventListener("drop", async (event) => {
	event.preventDefault();
	if (mode === "busy" || mode === "blank") return;
	const files = [...event.dataTransfer.files];
	const texs = files.filter((file) => /\.tex$/i.test(file.name));
	const pictures = files.filter((file) => IMAGES.test(file.name));
	const bibliographies = files.filter((file) => BIBLIOGRAPHIES.test(file.name));
	const others = [...pictures, ...bibliographies];
	const unused = files.filter((file) => !texs.includes(file) && !others.includes(file));
	const back = mode;
	if (texs.length > 1) {
		await prompt(() => alert("Drop one .tex file at a time."));
		return show(back);
	}
	if (unused.length) {
		await prompt(() =>
			alert(
				`Not used: ${unused.map((file) => file.name).join(", ")}.\n\nImages can be PNG, JPEG or PDF, bibliographies .bib, and the deck is a .tex file.`,
			),
		);
	}
	for (const file of others) images.set(file.name, new Uint8Array(await file.arrayBuffer()));
	if (pictures.length) {
		await prompt(() => alert(pictures.length === 1 ? "Image loaded!" : `${pictures.length} images loaded!`));
	}
	if (bibliographies.length) {
		await prompt(() => alert(bibliographies.length === 1 ? "Bibliography loaded!" : `${bibliographies.length} bibliographies loaded!`));
	}
	if (texs.length) {
		source = await texs[0].text();
		name = texs[0].name.replace(/\.tex$/i, "");
	}
	// Files after the deck compile it again: they may be what it was missing.
	if (texs.length || (others.length && source !== null)) build();
	else show(back);
});

async function build() {
	show("busy");
	// Progress: pages TeX has finished, of the slides and title page the
	// source asks for.
	const expected = (source.match(/\\begin\{slide\}/g)?.length ?? 0) + (/\\maketitle\b/.test(source) ? 1 : 0);
	progress(0);
	let result;
	try {
		const ink = new TextEncoder().encode(`\\def\\nicrainha@ink{${inkFor(background.lightness)}}\n`);
		result = await compile(source, new Map([...images, ["nicrainha-ink.tex", ink]]), (page) =>
			progress(page / Math.max(expected, page)),
		);
	} catch (error) {
		result = { pdf: null, log: `! ${error.message}\n` };
	}
	progress(1);
	// pdf.js takes the bytes it's given; the export needs its own.
	const output = result.pdf?.slice() ?? null;
	await load(output && (await pdfjs.getDocument({ data: result.pdf }).promise), glassOf(result.log));
	latest = { name, log: result.log, pdf: output, export: null };
	const { warnings } = report(result.log);
	await rollsEnd();
	if (!output) {
		if (await prompt(() => confirm("Contains errors! Download logs?"))) offerLog();
		return show("home");
	}
	if (warnings.length) {
		const count = `${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`;
		if (await prompt(() => confirm(`Contains ${count}! Download logs?`))) offerLog();
	} else if (await prompt(() => confirm("Compiled! Build PDF?"))) {
		await offerPdf();
	}
	show("deck");
}

// ── Screens ──────────────────────────────────────────────────────────────────
// The page shows one thing at a time over the background: the home panel, the
// rolling cat while something loads, nothing behind a prompt, or the deck.

let mode = "home";

function show(next) {
	mode = next;
	home.hidden = next !== "home";
	loading.hidden = next !== "busy";
	deck.hidden = next !== "deck";
	// Every loading screen starts at the roll's first frame.
	if (next === "busy") for (const animation of cat.getAnimations()) animation.currentTime = 0;
	if (next === "home") {
		background.scrollTo(0, 0);
		sizeHome();
	}
}

// The loading screen lasts whole rolls of the cat: at least one, and once
// the work is done, until the roll under way ends. The cat's roll, ms: the
// GIF's 33 frames of 20 ms (styles.css).
const ROLL = 660;
const FRAME = 20;

async function rollsEnd() {
	const [animation] = cat.getAnimations();
	if (!animation) return;
	for (;;) {
		const time = Number(animation.currentTime);
		const into = time % ROLL;
		// Within a frame past a roll's end: done. A timer the busy page ran
		// late waits for the next end instead.
		if (time >= ROLL && into < FRAME) return;
		await new Promise((resolve) => setTimeout(resolve, time < ROLL ? ROLL - time : ROLL - into));
	}
}

// The loading bar, filled to `fraction`.
function progress(fraction) {
	bar.style.width = `${Math.min(1, Math.max(0, fraction)) * 100}%`;
}

// Runs a prompt over the bare background, once it shows, and returns its answer.
async function prompt(ask) {
	show("blank");
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	return ask();
}

// The home panel starts centered and pans with the background's plane,
// wrapping with a period of the window plus its own size: its place on the
// plane is its place on screen plus the pan.
let halfWidth;
let halfHeight;
const wrap = (value, period) => ((value % period) + period) % period;

function sizeHome() {
	halfWidth = Math.max(0, Math.min(PANEL.width, innerWidth - 2 * PANEL.margin) / 2);
	halfHeight = Math.max(0, Math.min(PANEL.height, innerHeight - 2 * PANEL.margin) / 2);
	home.style.width = `${2 * halfWidth}px`;
	home.style.height = `${2 * halfHeight}px`;
	home.style.borderRadius = `${CORNER * Math.min(halfWidth, halfHeight)}px`;
	placeHome();
}

function placeHome() {
	const { scrollLeft: x, scrollTop: y } = background;
	const centerX = wrap(innerWidth / 2 + halfWidth - x, innerWidth + 2 * halfWidth) - halfWidth;
	const centerY = wrap(innerHeight / 2 + halfHeight - y, innerHeight + 2 * halfHeight) - halfHeight;
	home.style.left = `${centerX - halfWidth + x}px`;
	home.style.top = `${centerY - halfHeight + y}px`;
}

// ── Downloads ────────────────────────────────────────────────────────────────
// Browsers let a page start a download only right after the person acts, one
// file at a time; OK in a prompt counts. The log is ready at once. The PDF
// takes a moment to make, so once it's made a second prompt offers it, and
// that OK saves it.

// The last compile: its name, log, and TeX's PDF (null when it failed), and
// the PDF to download, once asked for.
let latest = null;

function offerLog() {
	if (latest) download(`${latest.name}.log`, new Blob([latest.log], { type: "text/plain" }));
}

// Builds the PDF under the rolling cat, then offers it over the bare
// background.
async function offerPdf() {
	if (!latest?.pdf) return;
	const made = latest;
	show("busy");
	progress(0);
	try {
		made.export ??= exportPdf(made.pdf, progress);
		const bytes = await made.export;
		await rollsEnd();
		if (await prompt(() => confirm("Download PDF?"))) {
			download(`${made.name}.pdf`, new Blob([bytes], { type: "application/pdf" }));
		}
	} catch (error) {
		made.export = null;
		await prompt(() => alert(`The PDF couldn't be made: ${error.message}`));
	}
}

// The ink for text on the bare background: black or white, whichever has
// more contrast (WCAG's ratio) on it. Every color of a nicrainha background
// has its L*, so one relative luminance: black wins from Y ≈ 0.179, L* ≈ 49.4.
function inkFor(lightness) {
	const f = (lightness + 16) / 116;
	const y = lightness > 8 ? f ** 3 : lightness / 903.3;
	return (y + 0.05) / 0.05 >= 1.05 / (y + 0.05) ? "black" : "white";
}

// Each page's glass, from the class's lines in the log: page index → box.
function glassOf(log) {
	const [, caps, descent] = log.match(/^nicrainha: title caps ([\d.]+)pt descent ([\d.]+)pt$/m) ?? [];
	const title = caps && banner(+caps, +descent);
	const glass = new Map();
	for (const [, page, , width, height] of log.matchAll(
		/^nicrainha: page (\d+) has a (title banner|title card ([\d.]+)pt ([\d.]+)pt)$/gm,
	)) {
		// A page whose glass has no size, from a class that doesn't log it, has none.
		const box = width ? card(+width, +height) : title;
		if (box) glass.set(page - 1, box);
	}
	return glass;
}

function download(filename, blob) {
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = filename;
	link.click();
	// Some browsers read the file after the click returns; a URL revoked too
	// soon loses a large one.
	setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

// ── Slides ───────────────────────────────────────────────────────────────────
// Slide i sits one window below slide i − 1 on the background's plane. Only
// the slides in view and their neighbors are in the page, each rendered at
// the window's size.

let pdf = null;
let pages = 0;
let glass = new Map();
const mounted = new Map();

async function load(doc, kinds) {
	for (const i of [...mounted.keys()]) unmount(i);
	await pdf?.loadingTask.destroy();
	pdf = doc;
	pages = doc ? doc.numPages : 0;
	glass = kinds;
	stop();
	background.scrollTo(0, 0);
	arrange();
}

// CSS px per pt.
const scale = () => Math.min(innerWidth / PAGE.width, innerHeight / PAGE.height);

function mount(i) {
	const slide = document.createElement("div");
	slide.className = "slide";
	if (glass.has(i)) slide.append(document.createElement("nicrainha-glass"));
	const canvas = document.createElement("canvas");
	slide.append(canvas);
	mounted.set(i, { slide, canvas, task: null });
	deck.append(slide);
	place(i);
}

function unmount(i) {
	const entry = mounted.get(i);
	entry.task?.cancel();
	entry.slide.remove();
	mounted.delete(i);
}

// Sizes slide i and its glass to the window, and renders its page.
async function place(i) {
	const entry = mounted.get(i);
	const s = scale();
	const width = PAGE.width * s;
	const height = PAGE.height * s;
	Object.assign(entry.slide.style, {
		left: `${(innerWidth - width) / 2}px`,
		top: `${i * innerHeight + (innerHeight - height) / 2}px`,
		width: `${width}px`,
		height: `${height}px`,
	});
	const panel = entry.slide.querySelector("nicrainha-glass");
	if (panel) shape(panel, glass.get(i), s * MM);

	const page = await pdf.getPage(i + 1);
	if (mounted.get(i) !== entry) return;
	const { canvas } = entry;
	canvas.width = Math.round(width * devicePixelRatio);
	canvas.height = Math.round(height * devicePixelRatio);
	entry.task?.cancel();
	entry.task = page.render({
		canvas,
		// pdf.js's own context would be opaque.
		canvasContext: canvas.getContext("2d", { alpha: true }),
		viewport: page.getViewport({ scale: canvas.width / page.view[2] }),
		background: "rgba(0, 0, 0, 0)",
	});
	await entry.task.promise.catch(() => {});
}

// Places a glass panel from its box in mm, at `mm` CSS px per mm.
function shape(panel, box, mm) {
	Object.assign(panel.style, {
		left: `${box.left * mm}px`,
		top: `${box.top * mm}px`,
		width: `${box.width * mm}px`,
		height: `${box.height * mm}px`,
		borderRadius: `${box.radius * mm}px`,
	});
}

// Mounts the slides in view and their neighbors, and unmounts the rest.
function arrange() {
	const at = background.scrollTop / innerHeight;
	const keep = new Set();
	for (let i = Math.floor(at) - 1; i <= Math.ceil(at) + 1; i++) if (i >= 0 && i < pages) keep.add(i);
	for (const i of [...mounted.keys()]) if (!keep.has(i)) unmount(i);
	for (const i of keep) if (!mounted.has(i)) mount(i);
}

let resizing;
addEventListener("resize", () => {
	clearTimeout(resizing);
	resizing = setTimeout(() => {
		if (mode === "home") return sizeHome();
		background.scrollTo(0, nearest() * innerHeight);
		for (const i of mounted.keys()) place(i);
		arrange();
	}, 100);
});

// ── Exporting ────────────────────────────────────────────────────────────────
// The PDF to download: each page is that slide's background, a fresh one as
// a page load would draw it, its glass included, as a lossless image under
// TeX's own page. The text stays vector and selectable.

// The background image's size, px: 16:9, like the page.
const EXPORT = { width: 1920, height: 1080 };

// The PDF's bytes, assembled by pdf-worker.js while the page captures each
// slide's background and hands it over. Calls `progress` with the share of
// slides done.
function exportPdf(bytes, progress) {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL("./pdf-worker.js", import.meta.url), { type: "module" });
		const fail = (error) => {
			worker.terminate();
			reject(error);
		};
		let count = 0;
		worker.onerror = (event) => fail(new Error(event.message || "The PDF worker failed."));
		worker.onmessage = async ({ data }) => {
			if (data.error) return fail(new Error(data.error));
			if (data.pdf) {
				worker.terminate();
				return resolve(data.pdf);
			}
			if (data.done !== undefined) return progress((data.done + 1) / count);
			count = data.pages;
			try {
				for (let i = 0; i < count; i++) {
					const png = await (await backgroundOf(i)).arrayBuffer();
					worker.postMessage({ page: i, png }, [png]);
				}
				worker.postMessage({ save: true });
			} catch (error) {
				fail(error);
			}
		};
		worker.postMessage({ tex: bytes });
	});
}

// Slide i's background, EXPORT px, from a background out of view sized to it.
async function backgroundOf(i) {
	const px = 1 / devicePixelRatio;
	const capture = document.createElement("nicrainha-background");
	capture.lightness = background.lightness;
	capture.speed = 0;
	capture.style.cssText = `inset: auto; left: -100000px; top: 0; width: ${EXPORT.width * px}px; height: ${EXPORT.height * px}px`;
	if (glass.has(i)) {
		const panel = document.createElement("nicrainha-glass");
		panel.style.position = "absolute";
		shape(panel, glass.get(i), (EXPORT.width * px) / 160);
		capture.append(panel);
	}
	document.body.append(capture);
	try {
		return await capture.capture();
	} finally {
		capture.remove();
	}
}

// ── Scrolling ────────────────────────────────────────────────────────────────
// Home pans freely, the background's own way. The deck scrolls vertically
// only, so there the showcase takes the pointers and wheels from the
// background, which would pan both ways. Dragging and wheels move it freely,
// up to one slide past either end; once they stop, it settles on a slide. The
// keys settle on the next or previous one. Nothing moves while loading or
// behind a prompt.

background.addEventListener("scroll", () => {
	if (mode === "home") placeHome();
	else arrange();
});

const nearest = () => Math.max(0, Math.min(pages - 1, Math.round(background.scrollTop / innerHeight)));
const scrollTo = (top) => background.scrollTo(0, Math.max(-innerHeight, Math.min(pages * innerHeight, top)));

let settling = null;
// The slide the deck is settling on.
let aim = null;

function settle(i) {
	const target = Math.max(0, Math.min(pages - 1, i));
	stop();
	const from = background.scrollTop;
	const to = target * innerHeight;
	if (reducedMotion.matches || Math.abs(to - from) < 0.5) return scrollTo(to);
	aim = target;
	const start = performance.now();
	const current = (settling = {});
	requestAnimationFrame(function step(now) {
		if (settling !== current) return;
		const t = Math.min(1, (now - start) / SETTLE);
		scrollTo(from + (to - from) * ease(t));
		if (t < 1) requestAnimationFrame(step);
		else stop();
	});
}

function stop() {
	settling = aim = null;
}

// CSS's ease, cubic-bezier(0.25, 0.1, 0.25, 1): its y at x = t.
function ease(t) {
	const bezier = (u, a, b) => 3 * a * u * (1 - u) ** 2 + 3 * b * u ** 2 * (1 - u) + u ** 3;
	let low = 0;
	let high = 1;
	for (let i = 0; i < 30; i++) {
		const mid = (low + high) / 2;
		if (bezier(mid, 0.25, 0.25) < t) low = mid;
		else high = mid;
	}
	return bezier((low + high) / 2, 0.1, 1);
}

let drag = null;
const capture = { capture: true };

addEventListener(
	"pointerdown",
	(event) => {
		if (mode === "home") return;
		event.stopPropagation();
		if (mode !== "deck") return;
		if (drag || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
		stop();
		drag = { id: event.pointerId, y: event.clientY, top: background.scrollTop, samples: [{ t: event.timeStamp, y: event.clientY }] };
	},
	capture,
);
addEventListener(
	"pointermove",
	(event) => {
		if (mode === "home") return;
		event.stopPropagation();
		if (event.pointerId !== drag?.id) return;
		scrollTo(drag.top - (event.clientY - drag.y));
		drag.samples.push({ t: event.timeStamp, y: event.clientY });
		while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].t > VELOCITY_WINDOW) drag.samples.shift();
	},
	capture,
);
for (const type of ["pointerup", "pointercancel"]) {
	addEventListener(
		type,
		(event) => {
			if (mode === "home") return;
			event.stopPropagation();
			if (event.pointerId !== drag?.id) return;
			const first = drag.samples[0];
			const last = drag.samples.at(-1);
			const dt = last.t - first.t;
			const moving = type === "pointerup" && dt > 0 && event.timeStamp - last.t < STOPPED_TIME;
			const velocity = moving ? -(last.y - first.y) / dt : 0;
			drag = null;
			settle(Math.round((background.scrollTop + velocity / -Math.log(DECELERATION)) / innerHeight));
		},
		capture,
	);
}

let wheeling;
addEventListener(
	"wheel",
	(event) => {
		if (mode === "home") return;
		event.stopPropagation();
		if (mode !== "deck") return;
		// Pinch (a wheel with Ctrl) is left to the browser.
		if (event.ctrlKey) return;
		event.preventDefault();
		const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
		stop();
		scrollTo(background.scrollTop + event.deltaY * unit);
		clearTimeout(wheeling);
		wheeling = setTimeout(() => settle(nearest()), WHEEL_REST);
	},
	{ capture: true, passive: false },
);

// F toggles full screen, the page's whole document; the deck follows the
// window's new size.
function fullscreen() {
	const page = document.documentElement;
	if (document.fullscreenElement ?? document.webkitFullscreenElement) {
		(document.exitFullscreen ?? document.webkitExitFullscreen).call(document);
	} else {
		(page.requestFullscreen ?? page.webkitRequestFullscreen)?.call(page);
	}
}

function go(step) {
	if (!pages) return;
	settle((aim ?? nearest()) + step);
}

addEventListener("keydown", (event) => {
	if (event.metaKey || event.ctrlKey || event.altKey) return;
	if ((event.key === "f" || event.key === "F") && (mode === "home" || mode === "deck")) {
		event.preventDefault();
		return fullscreen();
	}
	if (mode !== "deck") return;
	if ([" ", "ArrowDown", "ArrowRight", "PageDown"].includes(event.key) && !event.shiftKey) go(1);
	else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key) || (event.key === " " && event.shiftKey)) go(-1);
	else if (event.key === "Home") go(-pages);
	else if (event.key === "End") go(pages);
	else if (event.key === "p" || event.key === "P") offerPdf().then(() => show("deck"));
	else if (event.key === "l" || event.key === "L") offerLog();
	else return;
	event.preventDefault();
});

show("home");
warmUp().catch(() => {});
