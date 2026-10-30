---
id: H002
name: profile-existence-check
type: execution
originator: user
size: tiny
depends-on: G004
related-tasks:
status: complete
---

# Task H002: profile-existence-check

## Type: execution

## Description

`reviewer-profiles` accepts any kebab-case slug. `mf-specs create` validates the
grammar and duplicates, and `mf-specs check` validates only the field's shape, so
a typo or a profile deleted later costs a full extra review series with no
reviewer behind it and surfaces only at dispatch time. The declaration is one
more round per cycle, so the mistake is paid every cycle, silently.

Make an unknown declared profile visible at check time.

## Requirements

- Resolve the profiles root beside the specs root: `.agents/@montflow/profiles`
  for the same `--dir` or default the specs root uses.
- `mf-specs check` emits a warning-severity `reviewer-profile.unknown` finding
  for each declared slug with no `<profiles-root>/<slug>/PROFILE.md`. The finding
  names the spec, the task id, the field `reviewer-profiles`, the slug, and the
  fix.
- When the profiles root does not exist the finding is skipped entirely, so a
  repo that does not use the profiles plugin never sees it. The check stays
  host-free and reads no network.
- The finding never fails the check: warnings keep exit `0`, and `--strict`
  promotes it like every other warning.
- A declared profile that exists produces nothing, and a non-`review` task
  carrying the field keeps its existing error.
- Tests cover a declared profile that exists, one that is absent, a missing
  profiles root, several slugs on one task, and strict promotion.

## Completion

- [ ] `check` warns on a declared profile with no `PROFILE.md` and still exits `0`
- [ ] The finding is silent when `.agents/@montflow/profiles` does not exist
- [ ] `--strict` promotes the warning to a failure
- [ ] Present, absent, missing-root, multi-slug, and strict tests pass
- [ ] Package test, lint, format, and typecheck pass
