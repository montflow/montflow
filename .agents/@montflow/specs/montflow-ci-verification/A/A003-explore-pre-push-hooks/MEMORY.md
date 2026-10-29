# Memory

## Context

Task A003: survey pre-push hook mechanisms usable under this repo's bare-repo
worktree layout, and recommend one. Git-native behaviour was verified against
git 2.55.0 with scratch repositories; this repo's own config was not modified.
Third-party managers (husky/lefthook/simple-git-hooks) were **not** installed
or exercised — their rows are expectations, marked as such.

## Progress

- 2026-10-07: complete (revised after A099 review).

## Findings

### This repo's git layout

- `git rev-parse --show-toplevel` → `/home/daniel/dev/montflow/main`.
- `.git` is a **file** (`gitdir: /home/daniel/dev/montflow/.bare/worktrees/main`).
- Common dir `.bare`; default hooks live in the **shared**
  `/home/daniel/dev/montflow/.bare/hooks`.
- `core.hooksPath` is unset; `extensions.worktreeConfig` is unset.
- Only two worktrees exist: the bare repo and `main`.

### Mechanisms

| Mechanism         | Install                                  | Config location                     | Extra dep | Clean-clone behaviour        | Evidence |
| ----------------- | ---------------------------------------- | ----------------------------------- | --------- | ---------------------------- | -------- |
| `core.hooksPath` + committed dir | `git config core.hooksPath .githooks` | common `.bare/config` (all worktrees) | none    | one documented command       | verified |
| husky             | `husky install` via `prepare`            | `core.hooksPath` + `.husky/_`       | yes       | expected: auto via `bun install` | untested |
| lefthook          | `lefthook install` via `prepare`         | `core.hooksPath` + `lefthook.yml`   | yes       | expected: auto via `bun install` | untested |
| simple-git-hooks  | `simple-git-hooks` via `prepare`         | `core.hooksPath` + package.json     | yes       | expected: auto via `bun install` | untested |
| flake `shellHook` | direnv/nix shell entry                   | `flake.nix`                         | none      | only inside the nix shell    | untested |

### Verified git behaviour

- A relative `core.hooksPath` (`.githooks`) is resolved against the
  **working-tree top level**, not the current directory: running
  `git hook run pre-push` from a subdirectory still executed
  `<root>/.githooks/pre-push`.
- A non-existent hooks directory makes `git hook run` fail, but a real
  `git push` silently skips a missing hook (no error, push proceeds).
- A **non-executable** hook is also silently skipped: with mode `644`, `git
  push` prints a hint and proceeds. The hook must be committed as `100755`;
  losing the mode bit silently removes the local gate.
- `core.hooksPath` set without `--worktree` lands in the common config, so it
  applies to every worktree; each worktree then resolves the relative path
  against its own root. A worktree without the committed `.githooks` therefore
  gets no hook, silently.
- Bypass: `git push --no-verify` skips the hook.
- "Does not run when there is no repository": hooks are only ever invoked by
  git, so outside a repository no hook runs at all. The installer command
  itself fails harmlessly outside a repo (`git config` errors) and can be
  guarded with `git rev-parse --is-inside-work-tree`.

### Recommendation

Commit `.githooks/pre-push` (mode `100755`, delegating to the shared C001 entry
point) and provide one installer command
(`git config core.hooksPath .githooks`, wrapped in a `hooks:install` script).
Rationale: no new dependency, version-controlled, discoverable, works from any
subdirectory, and survives `bun install`. Trade-offs: it must be installed once
per clone (unless a `prepare` script is added); the config is shared across
worktrees, so a worktree on an older commit silently lacks the hook; and a
missing or non-executable hook fails open with no signal.

husky/lefthook/simple-git-hooks would auto-install via `prepare` but add a
dependency and a second config surface for a gate that already has CI as a
backstop. The flake `shellHook` couples verification to the nix shell and is
not recommended as the primary mechanism. The manager rows are unverified
expectations, not measurements.

## Open Questions

- Whether to auto-install via a `prepare`/`hooks:install` script or require one
  documented manual command. Phase B decision.
- Whether the bare repo itself (no worktree) ever needs the hook — currently no.
- Whether the hook should detect and warn about a non-executable mode.

## Handoff

- Feeds A004 synthesize-ci-contract.

## Deviations

- None.
