---
name: profiles-runner-prompt
status: in-progress
workspace-type: in-place
author: spec-worker
created: 2026-11-15
spec-version: 2
---

# profiles-runner-prompt

## Description

GitHub issue #18: `mf-profiles` should ship a reusable prompt for running an
existing profile on a bounded scope, and `mf-prompts` should learn a `profiles`
variable source so a caller picks a valid installed profile instead of typing an
unchecked name.

### Problem

Today an agent that wants to apply one installed profile (say
`effect-reviewer`) to just a slice of the tree has no prompt to drive it. The
`effect-review` prompt already shipped by `packages/profiles/prompts/` shows the
shape, but it is hard-coded to one reviewer. There is no general, reusable
"run a profile on this scope" prompt. Meanwhile the `profiles` package ships its
`prompts/` directory as payload only via `payload.manifest.yaml`; its
`payload.json` declares only `kind: profile` entries, so `mf-profiles doctor`
has no `prompt` payload to install, sync, or keep current under
`.agents/@montflow/prompts/`.

On the `mf-prompts` side, a prompt variable may carry a dynamic `source`. Today
only `source: "specs"` exists (a `Schema.Literals(['specs'])` union resolved in
`packages/prompts/src/tui.ts` against `.agents/@montflow/specs/`). A prompt that
wants the caller to choose a profile would otherwise force an unvalidated
free-text name, which a mistyped or uninstalled profile would not reject.

### Proposal

- Add a new prompt, `profile-runner`, to `packages/profiles/prompts/`. It lets
  the caller pick an existing profile from `.agents/@montflow/profiles/`, accept
  a scope (paths or directories), load the chosen `PROFILE.md` and its declared
  skills, and apply that profile only to the supplied scope. It is renderable
  and executable with `mf-prompts`, so its profile variable is a dynamic picker.
- Wire the prompt into `packages/profiles/payload.json` as a `kind: prompt`
  payload (source `prompts/profile-runner.json`, target
  `.agents/@montflow/prompts/profile-runner.json`) so `mf-profiles doctor`
  installs and keeps it current. The `prompts` kind is already declared in
  `packages/profiles/payload.manifest.yaml`; the missing piece is the concrete
  `prompt` payload entry.
- Add a `profiles` variable source to `mf-prompts`: a `profile-source` module
  that lists `.agents/@montflow/profiles/`, widen the `source` schema union to
  `['specs', 'profiles']`, and resolve the new source in the fill path so the
  caller picks a valid installed profile.
- Add verification: tests covering the prompt render/execute path (with the new
  `profiles` source) and the `mf-profiles doctor` payload sync behavior.

### Task dependency

A single `light` phase, `A`, holds all three tasks. A001 lands the `profiles`
variable source in `mf-prompts`; A002 ships the `profile-runner` prompt whose
profile variable declares that source (the prompt cannot pass `mf-prompts
verify` until the source literal exists, so A002 depends on A001); A003
verifies both the prompt render/execute path and the `mf-profiles doctor` payload
sync, and depends on A002 because it exercises the artifact A002 ships.

## Requirements

- A new prompt `profile-runner` exists in `packages/profiles/prompts/` and is
  declared in `packages/profiles/payload.json` as a `kind: prompt` payload so
  `mf-profiles doctor` installs and keeps it current under
  `.agents/@montflow/prompts/`.
- The prompt lets the caller choose an existing profile from
  `.agents/@montflow/profiles/`, accepts a scope (paths or directories), loads
  the chosen `PROFILE.md` and its declared skills, and applies that profile only
  to the supplied scope.
- The prompt is renderable and executable with `mf-prompts`.
- `mf-prompts` supports a `profiles` variable source in addition to `specs`, so
  the caller picks a valid installed profile rather than typing an unchecked
  name; a prompt variable with `source: "profiles"` passes `mf-prompts verify`.
- Verification covers both the prompt render/execute path and the
  `mf-profiles doctor` payload sync behavior.

## Creation

- rigor: light
- questions 0/1
- unresolved: none

## Tasks

| ID | Name | Type | Status | Gates |
| --- | --- | --- | --- | --- |
| A001 | add-profiles-variable-source | execution | pending | Yes |
| A002 | add-profile-runner-prompt | execution | pending | Yes |
| A003 | verify-profile-runner | execution | pending | Yes |