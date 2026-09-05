# @montflow/tooling-typescript

Shared TypeScript configuration for all montflow packages.

## Files

- `tsconfig.base.json` — strict check config (`tsc --noEmit`). Extends nothing.
  Packages extend it and add their own `include`/`exclude`.
- `tsconfig.package.json` — build config (extends `./tsconfig.base.json`).
  Sets `NodeNext`, `declaration`, `rootDir: src`, `outDir: build/esm`,
  `declarationDir: build/dts`. Packages extend it and add `exclude` for
  configs/tests as needed.

## Usage (e.g. `packages/format`)

`tsconfig.json`:

```json
{
  "extends": "../../tooling/typescript/tsconfig.base.json",
  "include": ["src/**/*.ts", "vitest.config.ts"]
}
```

`tsconfig.build.json`:

```json
{
  "extends": "../../tooling/typescript/tsconfig.package.json",
  "exclude": ["**/*.config.ts", "**/*.test.ts"]
}
```
