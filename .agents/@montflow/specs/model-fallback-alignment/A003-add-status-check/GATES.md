## Stage 0: Verification

- [ ] `bun run --cwd packages/model-fallback test` passes
- [ ] `bun run --cwd packages/model-fallback ts:check` passes
- [ ] `bun run --cwd packages/model-fallback lint:check` passes
- [ ] `bun run --cwd packages/model-fallback format:check` passes

## Stage 1: Contract

- [ ] Missing store exits `0` and reports "not configured"
- [ ] Invalid store exits `1` and names every issue
- [ ] `--json` carries `ok` and `issues` for every case
- [ ] `status` never requires a running host

## Stage 2: Gate

- [ ] Root `mf:check:model-fallback` runs the check
- [ ] The repo's own workspace passes the gate
- [ ] `verify` still fails on catalog-unreachable and points at `status` for shape errors
