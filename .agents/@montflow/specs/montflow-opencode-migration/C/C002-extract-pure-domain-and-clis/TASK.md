---
id: C002
name: extract-pure-domain-and-clis
type: execution
originator: user
depends-on: 
related-tasks:
status: complete
---

# Task C002: extract-pure-domain-and-clis

## Type: execution

## Description

Extract the host-agnostic domain libraries and their filesystem-only CLIs, and
delete the two dead packages. No adapter seams are exercised (B001 §1/§4, A006 §5.1).

## Requirements

- Create `@montflow/workflows` from `pi-workflows` and drop the vestigial `@earendil-works/pi-coding-agent` peer.
- Delete `pi-notifications` (no-op stub) and `pi-workflows`.
- Split `@montflow/{profiles,prompts,reviews,skills}` into a library face plus `bin` with no plugin face yet.
- Assert zero `@earendil` runtime imports remain in the extracted packages; each `mf-*` CLI runs from the filesystem alone.
- `verify:montflow` green; scoped `turbo` test/lint/ts:check per changed package.

## Completion

- [x] `@montflow/workflows` extracted from `pi-workflows`; vestigial `@earendil` peer dropped.
- [x] `pi-notifications` and `pi-workflows` removed.
- [x] `@montflow/{profiles,prompts,reviews,skills}` renamed with a library face + `bin`, no plugin face yet.
- [x] Zero `@earendil` runtime imports in the extracted packages (type-only remains); each `mf-*` CLI runs from the filesystem alone.
- [x] `verify:montflow` green (17/17 turbo tasks, all extension verifies 0 issues).
