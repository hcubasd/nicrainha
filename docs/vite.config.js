import { defineConfig } from "vite";

import { lightnessRings } from "./lightness-rings.js";

// Relative base so the build works under the GitHub Pages project path.
export default defineConfig({ base: "./", plugins: [lightnessRings()] });
