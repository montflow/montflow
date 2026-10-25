## Stage 0: Extraction

- [ ] no `@earendil-works` runtime import remains in the extracted packages
- [ ] `pi-notifications` and `pi-workflows` are removed
- [ ] each `mf-*` CLI runs from the filesystem alone

## Stage 1: Gate

- [ ] scoped `turbo test`, `lint:check`, and `ts:check` pass per changed package
- [ ] `verify:montflow` reports zero issues
