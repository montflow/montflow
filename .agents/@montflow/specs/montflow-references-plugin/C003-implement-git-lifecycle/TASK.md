---
id: C003
name: implement-git-lifecycle
type: execution
originator: user
depends-on: C002, B002
related-tasks:
status: complete
---

# Task C003: Implement the git lifecycle

## Type: execution

## Description

Implement the clone/checkout engine behind `add`, `update`, `sync`, and
`status`. This is the task that makes a fresh worktree usable and keeps the
gitignored clone root in step with the committed registry. No CLI surface yet.

## Requirements

- Implement `add`: validate the git URL, derive or accept the slug, ensure the clone root and ignore rule, clone, then write the entry; when the name or URL is already registered, route to `update` and report it; refuse a slug collision with a different URL; roll the clone back when the entry write fails.
- Implement `update`: resolve by name or URL, fast-forward a default-branch entry, check out a recorded `ref`, refuse a dirty worktree unless forced, and fail an unregistered URL with an add-it-first message.
- Implement `sync`: clone every missing entry or the named one, check out recorded refs, report created/skipped/refused per entry, and never write the registry.
- Implement `status`: derive `missing`, `present`, `dirty`, `ref-mismatch`, and with `--fetch` `behind`/`ahead`; keep the default path offline.
- Implement the network policy from B002: which verbs contact a remote, how `--fetch`/`--force` change that, and how a network failure leaves the clone unchanged.
- Implement ref handling for default branch, branch, tag, and commit, plus the origin-URL check that proves a clone belongs to its entry.
- Cover add success, add→update routing by name and by URL, slug-collision refusal, add rollback, update fast-forward, pinned checkout, dirty refusal, sync all, sync one, and every status state with tests.
- `bun run --cwd packages/references test` and `ts:check` pass.
- No file outside `packages/references/` and `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Add, update, sync, and status engines implemented with the B002 semantics
- [ ] Rollback, dirty refusal, pinned refs, and network failures covered by tests
- [ ] Registry is never written by sync or status
