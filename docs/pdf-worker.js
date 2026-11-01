import { PDFDocument } from "pdf-lib";

// Assembles the PDF to download, off the page's thread so the page keeps
// moving: TeX's pages, each over its background. Messages, handled in order:
//   { tex }         TeX's PDF; replies { pages: <count> }
//   { page, png }   page's background, a PNG; replies { done: page }
//   { save: true }  replies { pdf }, the PDF's bytes
// Any failure replies { error }.

let output = null;
let pages = [];
let queue = Promise.resolve();

onmessage = ({ data }) => {
	queue = queue.then(() => handle(data)).catch((error) => postMessage({ error: error.message }));
};

async function handle(data) {
	if (data.tex) {
		const tex = await PDFDocument.load(data.tex);
		output = await PDFDocument.create();
		pages = await output.embedPdf(tex, tex.getPageIndices());
		postMessage({ pages: pages.length });
	} else if (data.png) {
		const page = pages[data.page];
		const image = await output.embedPng(data.png);
		const sheet = output.addPage([page.width, page.height]);
		sheet.drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
		sheet.drawPage(page);
		postMessage({ done: data.page });
	} else if (data.save) {
		const pdf = await output.save();
		postMessage({ pdf }, [pdf.buffer]);
	}
}
