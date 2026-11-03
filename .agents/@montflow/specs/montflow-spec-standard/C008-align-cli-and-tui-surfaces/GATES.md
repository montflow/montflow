# GATES

## Stage 0: CLI parity

- [ ] `check`, `status`, `state`, `next`, `list`, `create`, `author`, `execute`, `sizing`, `resolve`, `models`, `which`, and `doctor` run against a v2 store
- [ ] `status` and `state` report the derived lock and `PHASE.md` review decision with no `locked-phases`

## Stage 1: TUI and host parity

- [ ] The TUI test proves a phase directory is never listed as a spec
- [ ] The host slash and tool forms match the binary on one spec, one phase, and one failure case

## Stage 2: Verification

- [ ] `ts:check`, `lint:check`, `format:check`, and `mf:check:specs` pass
