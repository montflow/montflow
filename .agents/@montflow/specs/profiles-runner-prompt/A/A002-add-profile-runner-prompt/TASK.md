---
id: A002
name: add-profile-runner-prompt
type: execution
originator: user
size: medium
depends-on: A001
write-scope: packages/profiles/prompts/,packages/profiles/payload.json
related-tasks: A003
status: pending
---

# Task A002: add-profile-runner-prompt

## Type: execution

## Description

Add the reusable `profile-runner` prompt to `packages/profiles/prompts/` and wire
it into the package payload so `mf-profiles doctor` installs and keeps it current
under `.agents/@montflow/prompts/`.

The prompt:

- Declares a `profile` variable with `source: "profiles"` so the caller picks a
  valid installed profile from `.agents/@montflow/profiles/` rather than typing an
  unchecked name. It also declares a `scope` variable (paths or directories),
  optionally a `focus`, and any extra variables it needs.
- Instructs the caller to load the chosen `PROFILE.md` and its declared skills,
  then apply that profile only to the supplied scope, without editing anything
  outside that scope.
- Is renderable and executable with `mf-prompts`, so it passes `mf-prompts
  verify`.

Wire it into `packages/profiles/payload.json` as a `kind: prompt` payload entry:
`source: "prompts/profile-runner.json"`, `target:
".agents/@montflow/prompts/profile-runner.json"`, following the same `prompt`
payload shape the `specs` package uses for its shipped prompts. The
`packages/profiles/payload.manifest.yaml` already declares the `prompts` kind
against `.agents/@montflow/prompts/`, so adding the concrete `prompt` entry is the
missing piece that makes `mf-profiles doctor` sync it.

## Requirements

- `packages/profiles/prompts/profile-runner.json` exists and describes a
  reusable prompt for running an existing profile on a bounded scope.
- The prompt's `profile` variable uses `source: "profiles"` (which passes
  `mf-prompts verify` after A001 lands the literal), and its `scope` variable is
  declared for paths or directories.
- `packages/profiles/payload.json` gains a `kind: prompt` entry named
  `profile-runner` with source `prompts/profile-runner.json` and target
  `.agents/@montflow/prompts/profile-runner.json`.
- `mf-profiles doctor` (repair) installs the prompt under
  `.agents/@montflow/prompts/` and `mf-profiles doctor --check` reports it healthy.

## Completion

- [ ] The `profile-runner` prompt file exists in `packages/profiles/prompts/` and
  its `profile` variable declares `source: "profiles"`.
- [ ] `packages/profiles/payload.json` lists the `profile-runner` prompt payload.
- [ ] `mf-prompts verify <name>` and `mf-profiles doctor --check --dir $PWD` pass
  for the new prompt and payload.

## Execution

Follow the Phase A execution brief in `A/MEMORY.md`; read only the scoped source
paths it names and run the task's own gate in
`A002-add-profile-runner-prompt/GATES.md`.