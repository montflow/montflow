---
id: A003
name: verify-profile-runner
type: execution
originator: user
size: small
depends-on: A002
write-scope: packages/prompts/src/,packages/profiles/src/
related-tasks:
status: pending
---

# Task A003: verify-profile-runner

## Type: execution

## Description

Add verification for the `profile-runner` prompt: its render/execute path through
`mf-prompts` (using the `profiles` variable source) and the
`mf-profiles doctor` payload sync behavior that installs and keeps the prompt
current under `.agents/@montflow/prompts/`.

The render/execute path is covered in `packages/prompts/src/` — a test that a
prompt with a `source: "profiles"` variable resolves the profile picker to the
installed profiles and renders with the chosen profile, exercising the
`profile-source` module added by A001 and the `profile-runner` prompt added by
A002. The doctor payload sync is covered in `packages/profiles/src/` — a test
that `mf-profiles doctor` (repair) installs the `profile-runner` prompt under
`.agents/@montflow/prompts/` and `mf-profiles doctor --check` reports it healthy,
following the same shape as the existing `packages/profiles/src/apps/doctor`
tests.

## Requirements

- A test in `packages/prompts/src/` covers the `profiles` variable source and
  the `profile-runner` render path: the caller picks a valid installed profile
  and the prompt renders against it.
- A test in `packages/profiles/src/` covers the `mf-profiles doctor` payload sync
  for the `profile-runner` prompt: repair installs it under
  `.agents/@montflow/prompts/` and `--check` reports it healthy.
- Both tests are package-scoped and runnable via the package `test` scripts.

## Completion

- [ ] `bun run --cwd packages/prompts test -- <render/execute test>` passes for
  the `profile-runner` prompt and `profiles` source.
- [ ] `bun run --cwd packages/profiles test -- <doctor sync test>` passes for the
  `profile-runner` prompt payload.
- [ ] `bun run --cwd packages/prompts ts:check` and
  `bun run --cwd packages/profiles ts:check` pass for the touched packages.

## Execution

Follow the Phase A execution brief in `A/MEMORY.md`; read only the scoped source
paths it names and run the task's own gate in `A003-verify-profile-runner/GATES.md`.