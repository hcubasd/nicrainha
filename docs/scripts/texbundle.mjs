// Builds public/tex/tex.bundle: every file the showcase's TeX engine needs,
// in one gzipped file it preloads; and public/tex/files, the font catalog's
// files, which the engine fetches one by one when a deck uses a family.
//
//   node scripts/texbundle.mjs
//
// Needs a local TeX Live (kpsewhich) and Playwright's Chromium. It runs the
// engine itself in a headless browser, serving it files from TeX Live:
//   1. builds the LaTeX format with the engine (a format only loads in the
//      pdfTeX that made it);
//   2. compiles tex/coverage.tex with that format, recording every file TeX
//      reads;
//   3. does the same for TikZ, with tex/coverage-tikz.tex, for babel's
//      languages, with tex/coverage-babel.tex, and for BibTeX,
//      with tex/coverage-bib.tex in each of the standard bibliography styles;
//   4. compiles tex/coverage-font.tex once per family in tex/fonts.json,
//      and writes the files it reads beyond the bundle's to
//      public/tex/files/pdftex/<key>, where the engine looks for them;
//   5. trims TeX Live's font map to the fonts the bundle and catalog have;
//   6. writes the bundle's files and the format to the bundle.
// The class, tex/nicrainha.cls, is served from tex/ over TeX Live.
//
// Bundle layout: a little-endian uint32 n, n bytes of JSON index
// [[key, size], …], then the files' bytes in order, all gzipped. A key is
// the engine's lookup "<kpathsea format>/<name>", as in "26/article.cls".

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname;
const FORMAT = "10/swiftlatexpdftex.fmt";
const BIBLIOGRAPHY_STYLES = ["plain", "unsrt", "abbrv", "alpha"];
// Extensions kpathsea tries for a bare name, by format.
const EXTENSIONS = { 3: ".tfm", 6: ".bib", 7: ".bst", 10: ".fmt", 11: ".map", 26: ".tex", 32: ".pfb", 33: ".vf", 44: ".enc" };

const files = new Map();
let recording = null;

function resolve(format, name) {
	const names = extname(name) ? [name] : [name + (EXTENSIONS[format] ?? ""), name];
	for (const candidate of names) {
		const local = join(root, "tex", candidate);
		if (existsSync(local)) return readFileSync(local);
		try {
			const path = execFileSync("kpsewhich", ["-progname=pdftex", candidate]).toString().trim();
			if (path) return readFileSync(path);
		} catch {}
	}
	return null;
}

const server = createServer((request, response) => {
	const url = decodeURIComponent(request.url.split("?")[0]);
	const lookup = url.match(/^\/texlive\/pdftex\/(\d+)\/([^/]+)$/);
	if (lookup) {
		const key = `${lookup[1]}/${lookup[2]}`;
		const bytes = files.get(key) ?? resolve(lookup[1], lookup[2]);
		if (!bytes) {
			response.writeHead(301);
			return response.end();
		}
		recording?.set(key, bytes);
		response.writeHead(200);
		return response.end(bytes);
	}
	if (url === "/") {
		response.writeHead(200, { "content-type": "text/html" });
		return response.end("<!doctype html><title>texbundle</title>");
	}
	const file = join(root, "public", url);
	if (!existsSync(file) || statSync(file).isDirectory()) {
		response.writeHead(404);
		return response.end();
	}
	const type = { ".js": "text/javascript", ".wasm": "application/wasm" }[extname(file)];
	response.writeHead(200, type ? { "content-type": type } : {});
	response.end(readFileSync(file));
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	await page.goto(origin);
	// Runs `files` (name → text) through the engine as `main` and returns its
	// status, log and output.
	const run = (command, main, sources) =>
		page.evaluate(
			async ({ command, main, sources, origin }) => {
				const worker = new Worker("/engine/swiftlatexpdftex.js");
				// Replies, skipping the engine's page progress.
				const next = () =>
					new Promise((reply) => (worker.onmessage = (event) => event.data.cmd !== "progress" && reply(event.data)));
				await next();
				worker.postMessage({ cmd: "settexliveurl", url: `${origin}/texlive/` });
				for (const [name, src] of Object.entries(sources)) {
					worker.postMessage({ cmd: "writefile", url: name, src });
					await next();
				}
				worker.postMessage({ cmd: "setmainfile", url: main });
				worker.postMessage({ cmd: command });
				const result = await next();
				worker.terminate();
				return { status: result.status, log: result.log, output: result.pdf ? [...new Uint8Array(result.pdf)] : null };
			},
			{ command, main, sources, origin },
		);

	const format = await run("compileformat", "pdflatex.ini", { "pdflatex.ini": "\\input pdftexconfig.tex\n\\input latex.ltx\n" });
	if (format.status !== 0) throw new Error(`Format failed:\n${format.log}`);
	files.set(FORMAT, Buffer.from(format.output));

	recording = new Map([[FORMAT, files.get(FORMAT)]]);
	const coverage = await run("compilelatex", "main.tex", { "main.tex": readFileSync(join(root, "tex/coverage.tex"), "utf8") });
	if (coverage.status !== 0) throw new Error(`Coverage failed:\n${coverage.log}`);
	const problems = coverage.log.split("\n").filter((line) => /^(!|LaTeX Font Warning|Missing character)/.test(line));
	if (problems.length) throw new Error(`Coverage has problems:\n${problems.join("\n")}`);
	const tikz = await run("compilelatex", "main.tex", { "main.tex": readFileSync(join(root, "tex/coverage-tikz.tex"), "utf8") });
	const tikzProblems = tikz.log.split("\n").filter((line) => /^(!|LaTeX Font Warning|Missing character)/.test(line));
	if (tikz.status !== 0 || tikzProblems.length) throw new Error(`TikZ coverage failed:\n${tikzProblems.join("\n") || tikz.log}`);
	const babel = await run("compilelatex", "main.tex", { "main.tex": readFileSync(join(root, "tex/coverage-babel.tex"), "utf8") });
	const babelProblems = babel.log.split("\n").filter((line) => /^!|No hyphenation patterns/.test(line));
	if (babel.status !== 0 || babelProblems.length) throw new Error(`Language coverage failed:\n${babelProblems.join("\n") || babel.log}`);
	// BibTeX runs after each pass; one small deck per bibliography style
	// records its .bst.
	for (const style of BIBLIOGRAPHY_STYLES) {
		const deck = readFileSync(join(root, "tex/coverage-bib.tex"), "utf8").replaceAll("STYLE", style);
		const bib = await run("compilelatex", "main.tex", { "main.tex": deck });
		if (bib.status !== 0 || !recording.has(`7/${style}`) || /There w(as|ere) \d+ error/.test(bib.log)) {
			throw new Error(`BibTeX with ${style} failed:\n${bib.log}`);
		}
	}

	// The font catalog: each family's files beyond the bundle's.
	const core = recording;
	const catalog = new Map();
	for (const { name, preamble } of JSON.parse(readFileSync(join(root, "tex/fonts.json"), "utf8"))) {
		recording = new Map();
		const deck = readFileSync(join(root, "tex/coverage-font.tex"), "utf8").replace("PREAMBLE", () => preamble);
		const font = await run("compilelatex", "main.tex", { "main.tex": deck });
		const errors = font.log.split("\n").filter((line) => line.startsWith("!"));
		if (font.status !== 0 || errors.length) throw new Error(`${name} failed:\n${errors.join("\n") || font.log}`);
		for (const [key, bytes] of recording) if (!core.has(key)) catalog.set(key, bytes);
	}
	recording = core;
	const tree = join(root, "public/tex/files");
	rmSync(tree, { recursive: true, force: true });
	for (const [key, bytes] of catalog) {
		const path = join(tree, "pdftex", key);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, bytes);
	}
	const catalogSize = [...catalog.values()].reduce((sum, bytes) => sum + bytes.length, 0);
	console.log(`catalog: ${catalog.size} files, ${(catalogSize / 1e6).toFixed(1)} MB`);

	// The font map, cut to the fonts there are metrics for: TeX Live's lists
	// every font installed.
	const metrics = new Set([...core.keys(), ...catalog.keys()].filter((key) => key.startsWith("3/")).map((key) => key.slice(2)));
	const map = core.get("11/pdftex.map").toString("latin1").split("\n");
	core.set("11/pdftex.map", Buffer.from(map.filter((line) => metrics.has(line.split(/\s/)[0])).join("\n") + "\n", "latin1"));

	const entries = [...recording].sort(([a], [b]) => a.localeCompare(b));
	const index = Buffer.from(JSON.stringify(entries.map(([key, bytes]) => [key, bytes.length])));
	const header = Buffer.alloc(4);
	header.writeUInt32LE(index.length);
	const bundle = gzipSync(Buffer.concat([header, index, ...entries.map(([, bytes]) => bytes)]), { level: 9 });
	writeFileSync(join(root, "public/tex/tex.bundle"), bundle);
	const raw = entries.reduce((sum, [, bytes]) => sum + bytes.length, 0);
	console.log(`${entries.length} files, ${(raw / 1e6).toFixed(1)} MB, ${(bundle.length / 1e6).toFixed(1)} MB gzipped`);
} finally {
	await browser.close();
	server.close();
}
