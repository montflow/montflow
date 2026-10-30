---
id: B002
name: decide-git-lifecycle
type: planning
originator: user
depends-on: A001, A003
related-tasks:
status: complete
---

# Task B002: Decide the git lifecycle

## Type: planning

## Description

Fix what `add`, `update`, `sync`, and `status` mean before any git code is
written. The clone root is gitignored, so a fresh worktree has no clones and
must be able to materialize them from the committed registry. The same verbs
must stay honest for default-branch entries, pinned-ref entries, dirty clones,
and a machine that is offline.

## Requirements

- Decide `add <url>`: URL validation, slug derivation from the URL versus `--name`, clone arguments, what is written on success, and the exact rollback when the entry write fails.
- Decide the idempotent path: when the name or URL is already registered, `add` routes to `update` and reports that it did; decide how a slug collision with a different URL is refused, and whether routing happens before or after URL validation.
- Decide `update <name|url>`: resolution by name or URL, default-branch fast-forward versus pinned-ref checkout, dirty-worktree refusal and `--force`, and the message for an unregistered URL.
- Decide `sync [name] [--all]`: clone missing entries, checkout recorded refs, skip or repair dirty/mismatched clones, output per entry, and why sync never edits the registry.
- Decide `status [name]`: the state vocabulary (`missing`, `present`, `dirty`, `ref-mismatch`, and `behind`/`ahead`), which states are offline, what `--fetch` adds, and the exit-code rule.
- Decide the network policy per verb: which verbs may contact a remote by default, which need `--fetch` or `--force`, and how a network failure is reported without corrupting the clone.
- Decide ref semantics in git terms: default branch (no `ref`), branch, tag, and commit; how each is cloned, checked out, and compared in `status` and `verify --clones`.
- Decide how a clone is proven to belong to the entry (origin URL match) and what happens when it does not.
- Record a verb × state matrix: for each verb and each entry state, the action and the resulting state.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Add/update/sync/status semantics recorded with clone and checkout commands
- [ ] Network policy and ref handling recorded
- [ ] Verb × state matrix recorded
