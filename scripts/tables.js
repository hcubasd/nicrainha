// Computes the renderer's lookup tables (src/ui/tables.ts) and writes them
// into dist/ui as tables.data.js, with its types. Runs after tsc.

import { copyFileSync, writeFileSync } from "node:fs";

import { buildTables, tablesModule } from "../dist/ui/tables.js";

const out = new URL("../dist/ui/", import.meta.url);
writeFileSync(new URL("tables.data.js", out), tablesModule(buildTables()));
copyFileSync(new URL("../src/ui/tables.data.d.ts", import.meta.url), new URL("tables.data.d.ts", out));
