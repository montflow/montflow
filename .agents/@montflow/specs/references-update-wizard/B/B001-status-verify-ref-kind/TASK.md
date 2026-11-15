---
id: B001
name: status-verify-ref-kind
type: execution
originator: user
size: small
depends-on:
write-scope: packages/references/src/modules/git/lifecycle.module.ts,packages/references/src/modules/git/git.module.ts,packages/references/src/modules/verifier/verifier.module.ts,packages/references/src/apps/cli/renderers.apps.module.ts,packages/references/src/apps/cli/engines.apps.module.ts,packages/references/src/apps/cli/tests/,packages/references/src/modules/git/tests/,packages/references/src/modules/verifier/tests/
related-tasks: B002
status: pending
---

# Task B001: status-verify-ref-kind

## Type: execution

## Description

Make the tracking-vs-pinned distinction visible in `status` and `verify`. Today
a `ref:` that is a branch name and a `ref:` that is a commit hash both render
the same way. Tools that expect a pinned commit (for example, a consumer's
bootstrap that needs a full 40-character id) need to tell the difference. This
task classifies a recorded `ref:` into `commit`, `tag`, or `branch` (the existing
`RefKind`/`RefClass` in `git.module.ts`) and surfaces it in the `status` and
`verify` output and in the shared renderers.

A branch-named `ref:` is reported as `tracking <branch>`; a commit or tag is
reported as `pinned to <sha7>` (full 40-hex with `--verbose`). The `list` renderer
can also show the distinction in its `--verbose` ref column.

## Requirements

- A recorded `ref:` is classified into `commit`, `tag`, or `branch` using the existing resolution in `git.module.ts`.
- `status` reports an entry whose `ref:` is a branch as `tracking <branch>` instead of a bare ref value; a commit/tag `ref:` is `pinned to <sha7>`.
- `verify` (and `verify --clones`) attributes ref findings to the classified kind: a branch is a tracking relationship, a commit/tag is a pin.
- The renderers print `tracking <branch>` vs `pinned to <sha7>` in both agent and human modes; `--verbose` shows the full 40-hex id for a pin.
- The `list` renderer's `--verbose` ref column shows the same distinction (e.g. `ref=branch:main` vs `ref=commit:abc1234`).
- A 7-char abbreviated commit hash stored in `ref:` is normalized to its resolved full 40-hex id when reported as a pin.
- The distinction is carried through the status/verify row/report data structures so the renderers do not re-parse the ref string.
- New status/verify/renderer code carries tests in the corresponding `tests/` directories.

## Completion

- [ ] `status` reports `tracking <branch>` for a branch `ref:` and `pinned to <sha7>` for a commit/tag.
- [ ] `verify` attributes ref findings to the classified kind.
- [ ] The renderers show the distinction in agent and human modes; `--verbose` shows the full pin.
- [ ] The `list` renderer's `--verbose` ref column shows the distinction.
- [ ] An abbreviated commit hash is normalized to its full resolved id when reported.
- [ ] New status/verify/renderer tests pass.