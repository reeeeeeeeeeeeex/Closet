import { defineConfig } from "vite";
import path from "node:path";
export default defineConfig({
  root: path.resolve("mobile"), base: "./", publicDir: path.resolve("public"),
  resolve: { alias: { "@": path.resolve(".") } },
  build: { outDir: path.resolve("dist/mobile"), emptyOutDir: true, target: "chrome100", license: { fileName: "third-party-licenses.md" }, rollupOptions: { onwarn(warning, warn) { if (warning.code === 'MODULE_LEVEL_DIRECTIVE' || warning.code === 'SOURCEMAP_ERROR') return; warn(warning); } } },
  css: { postcss: path.resolve(".") },
});
