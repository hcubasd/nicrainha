import { defineConfig } from "vite";

import { tables } from "./tables.js";

// Relative base so the build works under the GitHub Pages project path.
export default defineConfig({ base: "./", plugins: [tables()] });
