---
id: I099
name: review-phase
type: review
originator: user
size: medium
depends-on: I001, I002, I003
related-tasks:
status: pending
---

# Task I099: review the status prompt phase

## Type: review

## Description

An independent hostile review of the read-only status path: does the prompt
report only derived truth, can it be mistaken for an executor, can a picker or
entry point guess the wrong spec, and do the prompt, doctor payload, CLI, slash
form, host tool, skill, and docs agree on the same report?

## Requirements

- Attack the report: every section maps to a source command I001 names, and no
  section re-derives readiness, locks, budgets, ids, or timestamps. A blocked or
  `inconsistent` spec names its code and repair; a complete spec claims no
  pending work; a spec with no active phase does not invent one.
- Confirm the prompt is read-only: no `SPEC.md`, `TASK.md`, `MEMORY.md`, or
  review write, no status or lock transition, no worker dispatch, and no git
  mutation. The only handoff is the explicit `spec-execute` next command.
- Confirm the `source: specs` picker preselects the branch guess and lists
  pending specs before complete ones, and that the binary, slash, and host
  surfaces never guess when the branch is detached, prefix-less, missing, or
  ambiguous.
- Confirm every surface renders the same template from
  `packages/specs/prompts/spec-status.json`, the doctor payload and installed
  copy match, `mf-prompts verify` passes, and no surface carries a copied
  template or a second state derivation.
- Confirm the CLI, slash help, `montflow-find-specs` skill, README, and prompt
  module docs name the same surface and do not claim a write or execution power
  the prompt does not have.
- Run `bun run mf:check` and the scoped package suites; every spec and prompt
  must remain clean.

## Completion

- [ ] Review written to `.agents/@montflow/reviews/montflow-spec-standard/I.md`
      and read by the human
- [ ] Every finding about a fabricated state, a write, a guessed spec, or a
      surface disagreement has a disposition
- [ ] `bun run mf:check` green with the status prompt and entry points in place
