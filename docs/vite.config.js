import { defineConfig } from "vite";

// Relative base so the build works under the GitHub Pages project path. A
// multi-page app answers missing files 404, as Pages does, instead of with
// index.html: the TeX engine probes for files that may not exist.
export default defineConfig({ base: "./", appType: "mpa" });
