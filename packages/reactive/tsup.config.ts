import { defineConfig } from "tsup";

export default defineConfig({
  outDir: "./dist",
  entry: {
    index: "./src/index.ts",
    ["source/index"]: "./src/source/index.ts",
    ["watcher/index"]: "./src/watcher/index.ts",
    ["state/index"]: "./src/state/index.ts",
    ["computed/index"]: "./src/computed/index.ts",
  },
  clean: true,
  format: ["esm", "cjs"],
  minify: true,
  dts: true,
  treeshake: true,
  splitting: true,
});
