---
id: A001
name: implement-require-complete
type: execution
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A001: implement require complete

## Type: execution

## Description

Add the verifier-side half: a `--require-complete` mode that turns "this spec is
not complete" into a normal check finding, so CI can gate a change on the specs
it names.

## Requirements

- `CheckOptions.requireComplete?: boolean`; when true, `check` appends one
  error per spec whose `SPEC.md` status is not `complete`:
  `Spec '<name>' is not complete (status: '<status>'); finish it or drop the 'Spec: <name>' trailer.`
- An unreadable `SPEC.md` reports `status: 'unreadable'` in that message; the
  tree verifier's own findings are kept, never replaced.
- The finding is an error, so it fails the spec and the run; warnings are not
  involved.
- Wire `--require-complete` through the `effect/cli` command and the slash form;
  it composes with `--name`, `--strict`, and `--concurrency`.
- Tests: an in-progress spec passes without the flag and fails with it; a
  complete spec (all tasks complete, phase A locked) passes with it; the slash
  form threads the flag.

## Completion

- [x] The two check tests and the slash test pass.
- [x] `bun run --cwd packages/specs test` passes.
