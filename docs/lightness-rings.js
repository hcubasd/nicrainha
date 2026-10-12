// Build-time palette table, served to the page as the virtual module
// "virtual:lightness-rings" (see vite.config.js). Runs in Node, never in the
// browser: computing these rings takes about a second, and they depend on
// nothing that varies per page load.
//
// Row k holds the 256 vertices of nicrainha's 256-gon, in vertex order, at
// lightness 100 · k / (ROWS − 1). Every lightness shares the same 256 hue
// angles, so a vertex index keeps its hue from row to row, and the glass over
// any background moves along a column of this table. Rotation r of the
// 256-color palette starts at vertex r, so the page applies its random
// rotation as an index offset.

import { generatePalettes } from "nicrainha";

// 256 rows step L* by 100/255 ≈ 0.39: about one 8-bit sRGB level, so finer
// rows would mostly repeat colors.
export const ROWS = 256;

// ROWS × 256 RGB triples, row-major.
export function buildRings() {
  const data = new Uint8Array(ROWS * 256 * 3);
  for (let row = 0; row < ROWS; row++) {
    const lightness = (100 * row) / (ROWS - 1);
    generatePalettes(256, { lightness })[0].forEach(({ r, g, b }, vertex) => {
      data.set([r, g, b], (row * 256 + vertex) * 3);
    });
  }
  return data;
}

// Vite plugin exposing the table as an ES module.
export function lightnessRings() {
  const id = "virtual:lightness-rings";
  return {
    name: "lightness-rings",
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(resolved) {
      if (resolved !== `\0${id}`) return null;
      const base64 = Buffer.from(buildRings()).toString("base64");
      return `export const ROWS = ${ROWS};\nexport const RGB = "${base64}";\n`;
    },
  };
}
