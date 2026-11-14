# GATES

## Stage 0: CLI parity

- [x] `check`, `status`, `state`, `next`, `list`, `create`, `author`, `execute`, `sizing`, `resolve`, `models`, `which`, and `doctor` run against a v2 store
- [x] `status` and `state` report the derived lock and `PHASE.md` review decision with no `locked-phases`

## Stage 1: TUI and host parity

- [x] The TUI test proves a phase directory is never listed as a spec
- [x] The host slash and tool forms match the binary on one spec, one phase, and one failure case

## Stage 2: Verification

- [x] `ts:check`, `lint:check`, `fmt:check`, and `mf-specs:check` pass
