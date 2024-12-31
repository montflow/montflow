import { defineConfig } from "tsup";

export default defineConfig({
  outDir: "./dist",
  entry: {
    index: "./src/index.ts",
    ["maybe/index"]: "./src/maybe/index.ts",
    ["result/index"]: "./src/result/index.ts",
  },
  clean: true,
  format: ["esm", "cjs"],
  minify: true,
  dts: true,
  treeshake: true,
  splitting: true,
});
