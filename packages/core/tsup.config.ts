import { defineConfig } from "tsup";

export default defineConfig({
  outDir: "./dist",
  entry: {
    index: "./src/index.ts",
    ["array/index"]: "./src/array/index.ts",
    ["async/index"]: "./src/async/index.ts",
    ["fault/index"]: "./src/fault/index.ts",
    ["function/index"]: "./src/function/index.ts",
    ["iterable/index"]: "./src/iterable/index.ts",
    ["macro/index"]: "./src/macro/index.ts",
    ["maybe/index"]: "./src/maybe/index.ts",
    ["nothing/index"]: "./src/nothing/index.ts",
    ["number/index"]: "./src/number/index.ts",
    ["object/index"]: "./src/object/index.ts",
    ["random/index"]: "./src/random/index.ts",
    ["result/index"]: "./src/result/index.ts",
    ["string/index"]: "./src/string/index.ts",
  },
  clean: true,
  format: ["esm", "cjs"],
  dts: true,
});
