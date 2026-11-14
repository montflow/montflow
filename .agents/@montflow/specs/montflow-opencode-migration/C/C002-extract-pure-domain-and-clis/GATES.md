## Stage 0: Extraction

- [x] no `@earendil-works` runtime import remains in the extracted packages
- [x] `pi-notifications` and `pi-workflows` are removed
- [x] each `mf-*` CLI runs from the filesystem alone

## Stage 1: Gate

- [x] scoped `turbo test`, `lint:check`, and `ts:check` pass per changed package
- [x] `verify:montflow` reports zero issues
