# GATES

## Stage 0: Entry point

- [ ] `verify:montflow`, `verify:montflow:fast`, `verify:montflow:extensions` exist
- [ ] each check step is independently attributable and exits non-zero on failure
- [ ] extension steps use the correct `--dir`/cwd for this repo

## Stage 1: Baseline

- [ ] `bun run verify:montflow` is green on a clean checkout
