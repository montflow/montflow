---
id: A002
name: wire-ci-and-convention
type: execution
originator: user
depends-on: A001
related-tasks:
status: complete
---

# Task A002: wire CI and the convention

## Type: execution

## Description

Make the gate real in CI and discoverable for contributors: a `Spec:` trailer
names the specs a change closes, and a dedicated job fails when one of them is
not complete.

## Requirements

- `.github/workflows/verify.yml` gains a `spec-completion` job (after `install`,
  parallel to `build`) with full history: it reads `^Spec: <name>` from the
  pushed range (`github.event.before..HEAD` when available, otherwise
  `origin/<base>..HEAD`), deduplicates, and runs
  `bun run --cwd packages/specs cli check --dir "" --name <name> --require-complete`
  for each. No trailer is a skip with a notice; an invalid trailer, a missing
  spec, or a non-complete spec fails the job.
- The job does not depend on the build artifact (the CLI runs from source) and
  is a standalone job, not a `verify` matrix cell.
- `AGENTS.md` gains a "Spec completion gate" section: the trailer form, the CI
  job, the local command, and the rule that a declared spec must be complete.
- `packages/specs/README.md` documents `--require-complete` on `check`.
- The convention applies to every spec in the store; only declared specs are
  gated, so unrelated in-progress specs do not block a change.

## Completion

- [x] The workflow job is syntactically valid and runs the gate per trailer.
- [x] A change with no trailer skips; a change declaring an in-progress spec fails with the completion message.
- [x] Both docs name the trailer and the local command.
