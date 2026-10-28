---
id: B001
name: decide-integration-strategy
type: planning
originator: user
depends-on: A001
related-tasks: A001
status: pending
---

# Task B001: decide-integration-strategy

## Type: planning

## Description

Turn the Phase A inventory into decisions. Two questions dominate: how montflow
plugins stop breaking against the host's provided `effect`, and what one shared
picker contract looks like so prompts, skills, specs, profiles, and reviews all
get the same modal-and-insert behaviour instead of five bespoke ones.

The compatibility decision must survive the next host upgrade, not just this
one. A stopgap that copies package logic into `.opencode/plugins/` is evidence of
what a plugin can do, not a design to keep.

## Requirements

- Choose and justify one strategy for the effect/schema skew: align the repo's
  `effect`/`@opencode/plugin`/`@opencode/schema` versions to the installed host;
  remove `@opencode/schema` runtime construction from the adapter; or ship a
  compatibility layer. State the blast radius and the undo for each, and name
  the chosen one.
- Choose how the loader restriction is satisfied (subpath imports, adapter
  isolation, or a bundling step) and prove the choice against the actual
  rejected specifier list from A001.
- Specify the picker contract's seam in `@montflow/opencode`: the function or
  port a plugin calls, what it receives (store reader, insert formatter), and
  what it returns. The contract owns the dialog, the search, and the insertion;
  plugins supply data and formatting only.
- Specify the insertion rule per plugin: prompts paste the template, skills
  paste the skill name, specs paste the spec name, profiles the profile name,
  reviews the series/round. Each rule is stated as a testable expectation.
- Decide where pickers are registered (TUI part of each package) and how a
  package's directory-shaped entry exposes both `server.ts` and `tui.ts`.
- Decide what happens to the `.opencode/plugins/prompts/` stopgap: delete it, or
  keep it only as a dev harness with a stated lifetime.
- Define the verification that proves the result: which command loads each
  plugin through the host loader, and which signals success.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Chosen strategy and rejected alternatives recorded in `MEMORY.md`.
- [ ] Picker contract specified precisely enough to implement without re-deciding.
- [ ] Per-plugin insertion rule table written.
- [ ] Verification command named.
