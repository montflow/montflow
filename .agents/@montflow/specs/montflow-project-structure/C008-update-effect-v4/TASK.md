---
id: C008
name: update-effect-v4
type: execution
originator: planner:B002
depends-on: C001
related-tasks:
status: complete
---

# Task C008: Update `effect-v4`

## Type: execution

## Description

Align `effect-v4` with B001 decision #19 (error model) and reconcile its
module-surface example with the C001 module law.

## Requirements

- `Data.TaggedError` is canonical; retire the `Schema.TaggedErrorClass`
  mandate in `SKILL.md` and `references/`.
- State that the self-export module-surface example in
  `references/SERVICES_LAYERS.md` is an Effect API reference, not the module law.
- `.js` needs no change — `effect-v4` already uses `.js`.
- Update `CHANGELOG.md`.

## Completion

- [ ] `SKILL.md` and `references/` reflect `Data.TaggedError`
