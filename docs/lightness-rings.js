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
//
// It also measures each row's roughness ρ (noise.js), from which the page
// takes the running maximum toward its own lightness.

import { generatePalettes } from "nicrainha";

import { roughness } from "./noise.js";

// 256 rows step L* by 100/255 ≈ 0.39: about one 8-bit sRGB level, so finer
// rows would mostly repeat colors.
export const ROWS = 256;

// ROWS × 256 RGB triples, row-major, and each row's roughness.
export function buildRings() {
  const data = new Uint8Array(ROWS * 256 * 3);
  const rowRoughness = [];
  const defaultPalette = generatePalettes(256)[0];
  for (let row = 0; row < ROWS; row++) {
    const lightness = (100 * row) / (ROWS - 1);
    const palette = generatePalettes(256, { lightness })[0];
    palette.forEach(({ r, g, b }, vertex) => {
      data.set([r, g, b], (row * 256 + vertex) * 3);
    });
    rowRoughness.push(roughness(palette, defaultPalette));
  }
  return { data, rowRoughness };
}

// Vite plugin exposing the table as an ES module.
export function lightnessRings() {
  const id = "virtual:lightness-rings";
  return {
    name: "lightness-rings",
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(resolved) {
      if (resolved !== `\0${id}`) return null;
      const { data, rowRoughness } = buildRings();
      const base64 = Buffer.from(data).toString("base64");
      const roughnesses = JSON.stringify(rowRoughness.map((rho) => +rho.toFixed(4)));
      return `export const ROWS = ${ROWS};\nexport const RGB = "${base64}";\nexport const ROUGHNESS = ${roughnesses};\n`;
    },
  };
}
