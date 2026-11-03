---
id: I002
name: implement-status-prompt
type: execution
originator: user
size: medium
depends-on: I001
related-tasks: I003, I099
status: pending
---

# Task I002: implement the status prompt

## Type: execution

## Description

Ship I001's `spec-status` prompt as a real doctor payload. The prompt is the
read-only counterpart to `spec-execute`: it takes one spec from the shared
`source: specs` picker, reports the derived state, ready set, budget, gate and
review evidence, and verification blockers, and names the exact command that
moves the spec forward. It writes nothing.

## Requirements

- Add `packages/specs/prompts/spec-status.json` with I001's template and
  variable table. `name` is required and declares `source: specs`, so the
  `/mf-prompts` picker preselects the branch guess and lists unfinished specs
  before complete ones through the existing `SpecSource` helpers. Add `focus`
  only when I001 decided it earns its place.
- The template reads the derived truth through `mf-specs status`,
  `mf-specs state`, `mf-specs next`, and `mf-specs check` (or the internal
  values I001 chose). It never re-derives readiness, locks, budgets, ids, or
  timestamps, and it never edits a record.
- Report every section I001 fixed, in order: declared status, derived state,
  active phase, locked phases, task counts, phase review budget, ready set,
  verification result and blocking codes, review evidence, and the next
  command. A clean spec says what is left; a complete spec says it is complete;
  an `inconsistent` or blocked spec names the code and the repair command.
- Carry the read-only boundary in the template in imperative language: no
  `SPEC.md`, `TASK.md`, `MEMORY.md`, or review writes; no status or lock edits;
  no worker dispatch; no git mutation. When work remains, hand off to
  `spec-execute` rather than executing it.
- Register the prompt in `packages/specs/payload.json`, the doctor ownership
  list (`SPEC_PROMPT_NAMES`), and every `rerunOf`/advisory mapping that names
  the shipped prompts. Regenerate
  `packages/specs/src/modules/doctor/embedded-payload.generated.ts`, install
  `.agents/@montflow/prompts/spec-status.json`, and keep the packaged and
  installed bytes equal.
- Update the prompt module and doctor context/docs that enumerate the shipped
  prompts, including the `@montflow/specs` description and any `PROMPT_NAMES`
  comment. Do not claim a status surface I003 has not wired yet; describe the
  prompt and its `/mf-prompts` path first.
- Tests cover: the prompt passes `mf-prompts verify`; `name` is required and
  sourced from `specs`; a render carries every I001 section; an
  `inconsistent` render names the blocker; a complete render claims no pending
  work; the doctor payload equals the packaged file; and the prompt text
  contains no write or dispatch instruction.
- Run the scoped prompt, doctor, and spec suites; every installed prompt and
  every spec in the store stays clean.

## Completion

- [ ] `packages/specs/prompts/spec-status.json` exists, verifies, and declares the I001 variables in order
- [ ] The report renders every I001 section from derived commands, never from prompt-side reasoning
- [ ] The prompt is read-only and hands execution off to `spec-execute`
- [ ] The payload manifest, doctor ownership list, embedded payload, and installed copy agree
- [ ] The picker preselects the branch guess and shows pending specs first
- [ ] Scoped prompt and doctor tests are green
