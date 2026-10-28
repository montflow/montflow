---
name: syncing-skills
description: Copies this repo's public skills into a workspace's `.agents/skills/` store with the in-repo `mf-skills sync` command. Resolves the source checkout (a local clone or a registered reference), syncs project-locally, verifies with `--check`, and reports each skill's outcome. Use when the user wants to install, sync, or update skills from this repo.
id: 2eb6346337a80569
author: Daniel Montilla
version: 4.0.0
license: MIT
metadata:
  internal: true
dependencies:
  - executing-skills
groups:
  - skills
  - workflow
---

# When To Use

Use when the user wants this repo's skills copied into a project's
`.agents/skills/` store, or refreshed from a newer checkout. This is a **sync**
flow:

1. Resolve the source checkout — a local clone, or a reference registered by
   [adding-references](../adding-references/SKILL.md)
2. Sync the public skills into the target workspace with `mf-skills sync`
3. Verify with `--check` (or update with `--force` when a skill diverged), then
   report each skill's outcome

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md)
> skill before running this pipeline. It governs how skills are loaded,
> executed, and verified.

Sync is project-local by design: it writes into `<target>/.agents/skills/`,
never a machine-wide skill directory. There is no npm package and no network
hop — the source is a checkout already on disk.

# Pipeline

## 1. Resolve the Source Checkout

Prefer a checkout already on disk:

- **This repository** — when the skill runs from a montflow clone, that clone is
  the source; no reference step needed.
- **A registered reference** — `.agents/references/montflow`, registered by the
  [adding-references](../adding-references/SKILL.md) pipeline and confirmed with
  [finding-references](../finding-references/SKILL.md).
- **No checkout at all** — run `adding-references` against
  `https://github.com/montflow/montflow` first. Do not clone by hand.

Record the path; pass it as `--source` whenever it is not the checkout the CLI
runs from (`--from` is still accepted as an alias):

```bash
S=.agents/references/montflow
```

Install the checkout's dependencies once, and again after pulling:

```bash
(cd "$S" && bun install)
```

## 2. Present the Scope

Name the source and the target before writing anything:

- **Target** — `--target <workspace root>`, defaulting to the current
  directory. Ask when the user's intent is ambiguous. (`--dir` remains an
  alias.)
- **Source** — `--source <checkout>`, defaulting to the montflow checkout the
  package runs from. (`--from` remains an alias.)
- **Public only** — a skill whose `SKILL.md` frontmatter carries
  `metadata.internal: true` is skipped, reported, and never copied.
  `syncing-skills` itself is internal, so it never lands in a target.

## 3. Sync

```bash
# into the current workspace, from the checkout the CLI runs from
bun run --cwd "$S/packages/skills" cli sync --target "$PWD"

# explicit source and target
bun run --cwd "$S/packages/skills" cli sync --source "$S" --target "$PWD"
```

Sync is idempotent and leaves unrelated skills untouched. The report groups
skills as `Created`, `Updated`, `Unchanged`, and `Skipped` (internal), with a
count line beneath.

## 4. Verify

```bash
bun run --cwd "$S/packages/skills" cli sync --source "$S" --target "$PWD" --check
```

`--check` reports the same outcomes, writes nothing, and exits `1` on drift. A
non-zero exit means the target is behind the source — re-run step 3. Each
outcome is `current`, `stale`, `diverged`, or `unmanaged`; a `diverged` skill
was edited locally, so review the named files before passing `--force`.

Sync writes `.agents/skills/.montflow-sync.json` recording the source path,
remote, commit, ref, version, and a version plus hash per skill. `mf-skills
version --dir <workspace>` reports it. The full update path, including
re-syncing a store, is [guides/updating.md](../../../guides/updating.md).

## 5. Report

Summarize per skill: `name`, `version` (from its `SKILL.md` frontmatter), and
outcome. Call out skipped internal skills once, not per skill.

If the target is a git repo, ask whether to commit the `.agents/skills/` changes.

# Reference

- **Source repo**: `https://github.com/montflow/montflow`
- **Install guide**: `guides/installation.md` in the repo
- **References**: [adding-references](../adding-references/SKILL.md),
  [finding-references](../finding-references/SKILL.md)
- **Skill authoring**: [authoring-skills](../authoring-skills/SKILL.md)
- **Skill execution**: [executing-skills](../executing-skills/SKILL.md)
