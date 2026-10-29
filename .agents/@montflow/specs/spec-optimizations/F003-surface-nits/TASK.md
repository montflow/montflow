---
id: F003
name: surface-nits
type: execution
originator: user
size: small
depends-on: 
related-tasks:
status: complete
---

# Task F003: surface-nits

## Type: execution

## Description

Four small surfaces disagree with their docs or their own semantics: the detailed sizing line labels a review task own size budget as `budget`, filtered JSON keeps a default outside the list, `which` prefix matching has no boundary, and the slash parser ignores flags a command does not implement.

## Requirements

- `sizing --human` prints `size budget N · contributes N · phase budget M`; a review task shows contribution 0 and the compact line is unchanged.
- `models --json --provider` sets `default` to null when the default model is outside the filtered document, or documents and tests the chosen alternative; the document still round-trips as `--catalog` input.
- `which` prefix matching requires the shorter name to end at a `-` boundary, or enforces an equivalent minimum length; exact matches still win and `feat/s` no longer matches `spec-optimizations`.
- The slash parser validates flags per command and fails `cli.invalid-argument` for unknown or misplaced flags; `/specs execute --scope repo`, `/specs check --json`, and `/specs status --task A001` are refused, while every documented flag still works.
- Tests cover each behavior, and the existing `which`, models JSON, sizing, and slash suites stay green.

## Completion

- [ ] The sizing budget line names task size budget and contribution
- [ ] A provider-filtered JSON default never points outside the document
- [ ] `which` prefix matching respects a boundary
- [ ] Slash commands refuse flags they do not implement
- [ ] All four regression tests pass
