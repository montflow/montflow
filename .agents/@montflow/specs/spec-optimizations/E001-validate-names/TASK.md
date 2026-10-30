---
id: E001
name: validate-names
type: execution
originator: user
size: small
depends-on: 
related-tasks:
status: complete
---

# Task E001: validate-names

## Type: execution

## Description

The audit found every spec-name surface trusts its `--name` and `--phase` values. `status --name ..` reads the specs parent and mixes 112 tasks from every spec, and `sizing-config --name ../../etc` renders a write target outside the specs root. Only `create` validates a name today.

Add one name guard and one phase guard, apply them at every boundary before the store or the prompt is touched, and preserve the deliberate D003 behavior for well-formed unknown identifiers.

## Requirements

- Export one shared spec-name guard and one phase guard. A spec name is valid only when it matches `SLUG_PATTERN`; a phase id is valid only when it matches `PHASE_PATTERN`.
- Apply the guards before any store read or prompt render in `status`, `next`, `state`, `resolve`, `sizing`, `models --verify --name`, `execute --name`, and `sizing-config --name`; the slash arms inherit the same checks.
- A malformed name fails `cli.invalid-argument` with `field --name`, the rejected value as `actual`, the slug rule as `expected`, and a `fix` that names a valid slug. A malformed phase fails with `field --phase`.
- Reject blank, `.`, `..`, path separators, absolute paths, uppercase, spaces, and every value outside the slug grammar before the store is touched; `..` must no longer read the specs parent.
- Keep the D003 decision: `sizing-config` still renders a wizard for a well-formed but unknown spec or phase, and the wizard reports the missing target; only malformed identifiers are refused.
- Add table-driven CLI tests for every guarded surface with `..`, `../../etc`, `a/b`, `a\b`, `Spec`, `A`, empty, and whitespace. Assert the code, field, fix, non-zero exit, and that no parent tasks or out-of-root paths appear. Keep every valid-slug test green.

## Completion

- [ ] Every guarded surface refuses malformed names and phases before any store read
- [ ] `status --name ..` and `sizing-config --name ../../etc` fail with `cli.invalid-argument` and no out-of-root output
- [ ] Well-formed unknown slugs keep the D003 sizing-config behavior
- [ ] New tests cover every surface and every malformed value; package checks pass
