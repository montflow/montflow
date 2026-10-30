# Memory

## Context

`status` is implemented in `engines.status` and the `status` subcommand:

- Offline: reads the store, the legacy options, and reports `path`, `present`,
  `source`, `chain`, `triggers`, and field-scoped `issues`.
- Exit codes: `0` for valid and for "not configured"; `1` only when a store
  exists and is malformed (`binary.apps.module.ts` sets `process.exitCode`).
- `--json` returns the same facts plus `ok`.
- The root gate `mf:check:model-fallback` runs `status --dir $PWD` after
  `doctor --check`; the repo's own workspace passes with `source: store`.
- `verify` is unchanged in meaning and points at `status` when the shape is the
  problem.
- `status` never touches the catalog; the test asserts this with a dead
  `--server` URL and no injected deps.

## Progress

- complete — shape matrix, exit codes, JSON output, gate wiring, docs.

## Open Questions

- None.

## Deviations

- A separate `--check` flag was unnecessary: exit codes already make `status`
  usable as a gate, so one command serves both report and check.

## Handoff

- Phase review (A099) is the remaining task.
