// The TeX engine: SwiftLaTeX's pdfTeX in a worker (public/engine), preloaded
// with every file the class supports (public/tex/tex.bundle, built by
// scripts/texbundle.mjs). The font catalog's files (public/tex/files) are
// fetched only when a deck uses them.

const BASE = import.meta.env.BASE_URL;
// A compile that runs longer is taken to be stuck (an endless macro loop).
const TIMEOUT = 30_000;
// Passes after the first, when LaTeX's references need them; at most this many.
const RERUNS = 2;

let bundle = null;

// The bundle's files as [[key, bytes], …], fetched and unpacked once.
async function loadBundle() {
	bundle ??= (async () => {
		// Always revalidated: a cached bundle from an older class would disagree
		// with this page.
		const response = await fetch(`${BASE}tex/tex.bundle`, { cache: "no-cache" });
		if (!response.ok) throw new Error(`Couldn't load the TeX files (${response.status}).`);
		const data = new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
		const length = new DataView(data.buffer).getUint32(0, true);
		const index = JSON.parse(new TextDecoder().decode(data.subarray(4, 4 + length)));
		let offset = 4 + length;
		return index.map(([key, size]) => [key, data.slice(offset, (offset += size))]);
	})();
	return bundle;
}

// A worker ready to compile: started, and preloaded with the bundle. Its
// replies resolve `reply()`; its progress, each page TeX finishes, goes to
// `engine.progress` while a compile runs.
async function startWorker() {
	const files = await loadBundle();
	const worker = new Worker(`${BASE}engine/swiftlatexpdftex.js`);
	const started = { worker, progress: null, reply: null };
	let pending = null;
	worker.onmessage = (event) => {
		if (event.data.cmd === "progress") started.progress?.(event.data.page);
		else pending?.resolve(event.data);
	};
	worker.onerror = (event) => pending?.reject(new Error(event.message || "The TeX engine failed to start."));
	started.reply = () => new Promise((resolve, reject) => (pending = { resolve, reject }));
	await started.reply();
	worker.postMessage({ cmd: "preload", files });
	await started.reply();
	// Files beyond the bundle, the font catalog's, come from public/tex/files
	// when TeX first asks for them.
	worker.postMessage({ cmd: "settexliveurl", url: new URL(`${BASE}tex/files/`, location.href).href });
	return started;
}

let engine = null;

// Starts the engine ahead of the first compile.
export function warmUp() {
	engine ??= startWorker();
	return engine;
}

let queue = Promise.resolve();

// Compiles `source` as main.tex beside `images` (name → bytes), after any
// compile already running, calling `progress(page)` as TeX finishes each
// page. Resolves to { pdf, log }, pdf null when TeX failed.
export function compile(source, images, progress) {
	const run = queue.then(() => compileNow(source, images, progress));
	queue = run.catch(() => {});
	return run;
}

async function compileNow(source, images, progress) {
	const started = await warmUp();
	const { worker, reply } = started;
	started.progress = progress;
	const send = (message) => {
		worker.postMessage(message);
		return reply();
	};
	await send({ cmd: "flushcache" });
	for (const [name, bytes] of images) await send({ cmd: "writefile", url: name, src: bytes });
	await send({ cmd: "writefile", url: "main.tex", src: source });
	worker.postMessage({ cmd: "setmainfile", url: "main.tex" });

	let result;
	for (let run = 0; run <= RERUNS; run++) {
		let timer;
		const timeout = new Promise((resolve) => (timer = setTimeout(resolve, TIMEOUT, null)));
		result = await Promise.race([send({ cmd: "compilelatex" }), timeout]);
		clearTimeout(timer);
		if (!result) {
			worker.terminate();
			engine = null;
			warmUp();
			return { pdf: null, log: `! TeX didn't finish within ${TIMEOUT / 1000} s: an endless loop?\n` };
		}
		// A fatal error aborts the engine, which can't compile again: the next
		// compile starts a fresh one.
		if (result.status === -254) {
			worker.terminate();
			engine = null;
			warmUp();
			break;
		}
		// LaTeX asks for another pass when cross-references changed; citations
		// still undefined after a pass may be BibTeX's, which runs after each
		// pass, for the next to read.
		if (result.status !== 0 || !/Rerun to get|There were undefined (references|citations)/.test(result.log)) break;
	}
	started.progress = null;
	return { pdf: result.status === 0 ? new Uint8Array(result.pdf) : null, log: result.log };
}

// What a log says went wrong: TeX's errors, each with its line, and the
// warnings worth fixing (overfull boxes; LaTeX, font, class and package
// warnings).
// Underfull boxes are left to the log.
export function report(log) {
	const lines = log.split("\n");
	const errors = [];
	const warnings = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// TeX's sign-off after an error repeats it.
		if (/^! (Emergency stop|\s*==> Fatal error)/.test(line)) continue;
		if (line.startsWith("! ")) {
			const at = lines.slice(i + 1, i + 30).find((next) => /^l\.\d+/.test(next));
			errors.push(at ? `Line ${at.match(/^l\.(\d+)/)[1]}: ${line.slice(2)}` : line.slice(2));
		} else if (/^Overfull \\[hv]box/.test(line)) {
			warnings.push(line);
		} else if (/^(LaTeX|LaTeX Font|Class \S+|Package \S+) Warning/.test(line) && !/Some font shapes were not available/.test(line)) {
			// A warning runs on until a blank line, its continuations indented.
			let text = line;
			while (lines[i + 1]?.trim() && /^\s|^\(/.test(lines[i + 1])) text += ` ${lines[++i].trim()}`;
			// filecontents writing its file is the compile's business, not the deck's.
			if (!/Writing or overwriting file|already exists on the system/.test(text)) warnings.push(text.replace(/\s+/g, " "));
		}
	}
	return { errors, warnings };
}
