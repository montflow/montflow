## Phase 1: Common Files

- [ ] Target directory exists under `packages/<name>/` or `services/<name>/`
- [ ] `src/index.ts` exists with `export {}`
- [ ] `package.json` has `type: "module"` and `private: true`
- [ ] `package.json` has `clean`, `lint`, `lint:check`, `format`, `format:check` scripts
- [ ] `package.json` has shared devDependencies (`@pokerbids/typescript`, `oxfmt`, `oxlint`, `rimraf`, `tslib`)
- [ ] `tsconfig.json` extends `@pokerbids/typescript/tsconfig.base.json` with `module: "ESNext"`, `moduleResolution: "bundler"`, `rootDir: "src"`, `include: ["src"]`
- [ ] `bun install` resolves workspace dependencies without errors

## Phase 2: Package Setup (if `packages/`)

- [ ] `typescript` and `tsdown` in devDependencies
- [ ] `files: ["build"]`, `main: "./build/index.js"`, `types: "./build/index.d.ts"`, `exports` configured
- [ ] `dev`, `build`, `ts:check` scripts in package.json
- [ ] `tsconfig.build.json` extends `@pokerbids/typescript/tsconfig.package.json`
- [ ] `tsdown.config.ts` has correct entry, outDir, platform, format `"esm"`, dts
- [ ] Platform-specific exports (`.mjs`/`.d.mts` for node)
- [ ] `bun run build` produces `build/` directory

## Phase 3: Service Setup (if `services/`)

- [ ] No `tsdown`, `typescript`, or `tsx` in devDependencies
- [ ] `outDir` set in `tsconfig.json`
- [ ] Runtime dependencies in `dependencies` (not devDependencies)
- [ ] No `files`, `main`, `types`, or `exports` fields in package.json

## Phase 4: Verification

- [ ] `bun run lint:check` passes
- [ ] `bun run format:check` passes
- [ ] `bun run clean` succeeds
- [ ] `bun run build` succeeds (packages only)
- [ ] `bun run ts:check` passes (packages only)
