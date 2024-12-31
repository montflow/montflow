import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["./src/index.ts"],
    outDir: "./dist",
    clean: true,
    format: ["esm", "cjs"],
    minify: false,
    treeshake: true,
    splitting: true,
    dts: true,
  },
]);
