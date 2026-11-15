---
id: A001
name: add-profiles-variable-source
type: execution
originator: user
size: medium
depends-on:
write-scope: packages/prompts/src/
related-tasks: A002
status: pending
---

# Task A001: add-profiles-variable-source

## Type: execution

## Description

Add a `profiles` variable source to `mf-prompts` so a prompt variable can offer
the caller a picker of valid installed profiles instead of an unchecked free-text
name. Today a prompt variable may declare only `source: "specs"`: the union is
`Schema.optionalKey(Schema.Literals(['specs']))` in
`packages/prompts/src/modules/prompts/prompts.module.ts`, and the fill path in
`packages/prompts/src/tui.ts` resolves `variable.source === 'specs'` by listing
`.agents/@montflow/specs/` through the `spec-source` module.

Mirror that for profiles:

- Add a `profile-source` module (parallel to `spec-source`) under
  `packages/prompts/src/modules/profile-source/` that lists profile directories
  under `.agents/@montflow/profiles/`. Each entry is a profile name and a
  one-line description read from its `PROFILE.md`. Profiles are plain installed
  entries, so there is no state to rank — order alphabetically, stably.
- Widen the `source` schema union in `prompts.module.ts` (both the JSON-variable
  and the resolved-variable shape, plus the `source?:` type aliases) from
  `['specs']` to `['specs', 'profiles']`.
- Resolve the new source in the fill path (TUI and any shared picker resolution):
  `variable.source === 'profiles'` lists `.agents/@montflow/profiles/` through the
  `profile-source` module similarly to the `specs` branch. The interactive and
  CLI fill paths stay consistent with the TUI branch.
- Export the new module from `packages/prompts/src/modules/index.ts`.

## Requirements

- A prompt variable with `source: "profiles"` passes `mf-prompts verify` (the
  literal is accepted).
- The fill path resolves `source: "profiles"` to the installed profile
  directories under `.agents/@montflow/profiles/`, ordered stably, and never
  lets an arbitrary unchecked name through as a profile.
- `source: "specs"` keeps working unchanged.
- A `profile-source` module lives under
  `packages/prompts/src/modules/profile-source/` and is exported from the
  modules index.

## Completion

- [ ] `source: "specs"` and `source: "profiles"` are both accepted literals in
  `prompts.module.ts`, and a `profiles`-source prompt verifies clean.
- [ ] The `profile-source` module lists the installed profiles under
  `.agents/@montflow/profiles/` and the fill path resolves a `profiles` variable
  to a valid installed profile.
- [ ] `mf-prompts verify` and the fill/render path for the new source are covered
  by tests in `packages/prompts/src/`.

## Execution

Follow the Phase A execution brief in `A/MEMORY.md`; read only the scoped source
paths it names and run the task's own gate in
`A001-add-profiles-variable-source/GATES.md`.