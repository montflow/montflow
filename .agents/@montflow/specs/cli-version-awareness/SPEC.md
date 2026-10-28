---
name: cli-version-awareness
status: in-progress
workspace-type: worktree
author: Daniel Montilla
created: 2026-10-28
locked-phases:
---

# cli-version-awareness

## Description

The `mf-*` CLIs are distributed as a git checkout: there is no npm package, no
release tag, and no version number that changes. `--version` prints a hardcoded
`0.0.1` in all five packages, `.changeset/config.json` ignores every one of
them, and `guides/installation.md`'s entire update story is "re-run `bun install`
after `git pull`". So an agent that runs a six-month-old `mf-specs` has no way to
learn it is stale, and an installed workspace has no record of what version of
the skills it received.

This spec makes the git repository the source of truth for versions and gives
every consumer two things it currently lacks: a way to *detect* that it is
behind, and a *single documented place* to update. Each CLI gains a real version
identity (package version plus commit), a cached upstream check that prints one
warning line when the CLI is stale, and a `version` subcommand an agent can parse.
Changesets starts versioning and tagging the five private CLI packages so the
check has something to compare against. `mf-skills sync` starts recording what it
installed, so a workspace installed through the guide can report and update its
own state. `guides/updating.md` becomes the destination every warning names.

## Requirements

- Every `mf-*` CLI reports its identity — package name, package version, git
  commit, dirty state, and checkout — derived from its own `package.json` and the
  checkout, never hardcoded, with a stable JSON form (`version --json`).
- Every `mf-*` CLI prints one plain-text line on stderr when it is behind
  upstream, and changes nothing else: no stdout pollution, no exit-code change.
- The upstream check is cached (24 hours on success, 1 hour on failure), capped
  at one request and a 2-second timeout, and skippable by
  `MONTFLOW_NO_UPDATE_CHECK=1`, `--no-update-check`, or `CI=true`; no TTY
  detection, because agents capture output.
- The git repository is the source of truth: a release produces a version, a
  `CHANGELOG.md` entry, and an `@montflow/<package>@<version>` tag, and the
  update check compares against those tags with a commit comparison as fallback.
- The five private CLI packages are versioned and tagged by changesets without
  being published to npm, share one fixed version, and keep `workspace:*`
  internal dependencies resolving.
- `mf-skills sync` writes a manifest recording the source path, remote, commit,
  ref, version, timestamp, and a per-skill version and content hash.
- An installed workspace distinguishes `current`, `stale`, `diverged`, and
  `unmanaged`, and never silently overwrites a locally edited skill.
- `guides/updating.md` is the single update destination, linked from
  `guides/installation.md` and `README.md`; every warning names the anchor for
  the CLI it came from, and that anchor exists.
- No shipped document promises an update step the code does not implement, and
  no document tells a reader to install a CLI globally or through npm.
- `@montflow/core` keeps its existing public release cadence and is not pulled
  into the CLI fixed group.
- Package tests, `mf:check`, lint, format, and typecheck stay green.

## Tasks

| ID   | Name                      | Type      | Status  | Gates |
| ---- | ------------------------- | --------- | ------- | ----- |
| A001 | add-version-package       | execution | complete | Yes   |
| A002 | wire-version-command      | execution | complete | Yes   |
| A099 | review-phase              | review    | complete | No    |
| B001 | add-update-check-engine   | execution | complete | Yes   |
| B002 | wire-update-notice        | execution | complete | Yes   |
| B099 | review-phase              | review    | complete | No    |
| C001 | configure-changesets      | execution | complete | Yes   |
| C002 | add-release-guard         | execution | complete | Yes   |
| C099 | review-phase              | review    | complete | No    |
| D001 | add-sync-manifest         | execution | complete | Yes   |
| D002 | add-store-drift-states    | execution | complete | Yes   |
| D003 | write-updating-guide      | execution | complete | Yes   |
| D099 | review-phase              | review    | in-progress | No    |
