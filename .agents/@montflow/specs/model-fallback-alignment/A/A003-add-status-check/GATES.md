## Stage 0: Verification

- [x] `bun run --cwd packages/model-fallback test` passes
- [x] `bun run --cwd packages/model-fallback ts:check` passes
- [x] `bun run --cwd packages/model-fallback lint:check` passes
- [x] `bun run --cwd packages/model-fallback format:check` passes

## Stage 1: Contract

- [x] Missing store exits `0` and reports "not configured"
- [x] Invalid store exits `1` and names every issue
- [x] `--json` carries `ok` and `issues` for every case
- [x] `status` never requires a running host

## Stage 2: Gate

- [x] Root `mf:check:model-fallback` runs the check
- [x] The repo's own workspace passes the gate
- [x] `verify` still fails on catalog-unreachable and points at `status` for shape errors
