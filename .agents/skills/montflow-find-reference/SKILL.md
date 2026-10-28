---
name: montflow-find-reference
description: Finds registered third-party source code in the reference store and reports its slug, clone path, purpose, URL, and pinned ref. Use when the user asks where a library's source lives, whether a reference is cloned, or which registered reference covers a topic. Resolves through the store, offers `sync` for a missing clone, and never claims git state it did not read.
id: 02784d07a0e2c73f
author: Daniel Montilla
version: 1.1.0
license: MIT
groups:
  - references
  - workflow
dependencies:
  - executing-skills
---

# When To Use

Use when the user asks "where is the source for X?", "is the Effect reference cloned?", "which reference covers this framework?", or wants to read code from a registered third-party repository. The skill resolves against the committed store, then points at the clone; it does not carry a registry table of its own.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Ensure the skills are installed

```bash
mf-references doctor --dir "$PWD"
```

```text
/mf-references doctor --dir "$PWD"
```

Idempotent: it installs `montflow-add-reference` and `montflow-find-reference` into `.agents/skills/` when missing and repairs stale copies. It also repairs the clone root, `.gitkeep`, and the ignore rule. `--check` reports without writing and exits 1 on drift.

## 2. List what exists

```bash
mf-references list --dir "$PWD"
```

Each row is `installed|missing <slug>  <purpose>`. Read the state and the purpose column to answer a topic question. `installed` means the clone path exists; it is not a claim that the clone is clean or on the recorded pin. The default output is agent-first: add `--human` when a person will read the table, and `--verbose` for additive detail (`--human --verbose` composes).

For a narrower ask, filter:

```bash
mf-references list --status missing --dir "$PWD"
mf-references list --status installed --dir "$PWD"
```

## 3. Open one entry

```bash
mf-references show <slug> --dir "$PWD"
```

That is the entry's `REFERENCE.md` byte for byte: `url`, `purpose`, `added`, optional `ref`, and the notes body. The clone path is always derived, never stored:

```text
<workspace>/.agents/references/<slug>
```

## 4. Offer to materialize a missing clone

Only with the user's agreement, and only for the one entry:

```bash
mf-references sync <slug> --dir "$PWD"
```

Never run `sync --all`: that clones or fetches every registered repository in one network-bound step. If the clone exists but is dirty, foreign, or on the wrong ref, report the state and let `status` / `update` own the repair; this skill does not fix clones.

## 5. Report and read

Report the slug, clone path, purpose, URL, and ref (when the entry records one). Then read files under the clone path.

Never claim git state you did not read:

- `installed` / `missing` comes from the filesystem only.
- Dirty, foreign, behind/ahead, and ref mismatch belong to `mf-references status <slug> [--fetch]`.
- The tool `reference_find` is the same read-only lookup inside the OpenCode host; it returns the exact entry block including the derived path.

# Reference

- **CLI surface** — `mf-references` and `/mf-references` are one engine with the same flags:
  - `doctor` — verify and repair scaffolding, installed skills, and the registry
  - `list` — every entry with clone presence and purpose (`--status installed|missing`)
  - `show` — one entry's `REFERENCE.md` bytes
  - `verify` — committed bytes, plus clone state with `--clones`; non-zero on issues
  - `add` — register and clone one https URL; a registered URL routes to `update`
  - `update` — refresh one entry or `--all`, by name or URL (`--force`)
  - `sync` — materialize missing clones or repair checkouts (`<name>` or `--all`)
  - `status` — clone state per entry; `--fetch` adds behind/ahead, never gates
  - `remove` — unregister one entry; `--keep-clone` keeps the clone

  Every verb takes `--dir <root>` (defaults to the working directory). The default output is agent-first; `--human` renders readable tables and prose, `--verbose` adds detail, and the two compose.

- **Binary / slash command**: `mf-references` and `/mf-references`; `list`, `show`, `sync`, and `status` are the verbs this pipeline uses. In the montflow monorepo, `bun run --cwd packages/references cli <verb>` is the same engine.
- **Store contract**: `.agents/@montflow/references/<slug>/REFERENCE.md` is the registry; clones live at `.agents/references/<slug>` and are gitignored.
- **In-host tool**: `reference_find` matches a query against slug, URL, purpose, and notes, and reports the clone path with a `sync` hint when it is missing.
- **Changelog and migration**: [CHANGELOG.md](CHANGELOG.md).
