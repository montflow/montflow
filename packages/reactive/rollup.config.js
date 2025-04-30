import typescript from "@rollup/plugin-typescript";
import { cleandir } from "rollup-plugin-cleandir";

/** @type {import("rollup").RollupOptions} */
export default {
  input: "src/index.ts",
  output: [
    { file: "build/index.cjs", format: "cjs", sourcemap: true },
    { file: "build/index.mjs", format: "esm", sourcemap: true },
  ],
  external: ["@montflow/core"],
  plugins: [
    cleandir(["./build/"]),
    typescript({
      tsconfig: "./tsconfig.build.json",
      module: "nodenext",
      moduleResolution: "nodenext",
    }),
  ],
};
