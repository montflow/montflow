import { defineConfig } from "tsup";

export default defineConfig({
  outDir: "./dist",
  entry: {
    index: "./src/index.ts",
    ["array/index"]: "./src/array/index.ts",
    ["async/index"]: "./src/async/index.ts",
    ["fault/index"]: "./src/fault/index.ts",
    ["function/index"]: "./src/function/index.ts",
    ["macro/index"]: "./src/macro/index.ts",
    ["maybe/index"]: "./src/maybe/index.ts",
    ["nothing/index"]: "./src/nothing/index.ts",
    ["number/index"]: "./src/number/index.ts",
    ["object/index"]: "./src/object/index.ts",
    ["result/index"]: "./src/result/index.ts",
    ["string/index"]: "./src/string/index.ts",
  },
  sourcemap: true,
  clean: true,
  format: ["esm", "cjs"],
  minify: true,
  dts: true,
  treeshake: true,
  splitting: true,
});
