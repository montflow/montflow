---
name: montflow-add-reference
description: Registers a third-party repository as a reference — an https URL, a one-sentence purpose, an optional branch/tag/commit pin, a committed `REFERENCE.md` entry, and a clone under `.agents/references/`. Use when the user asks to add, register, pin, or track reference source code, or when a task needs a dependency's source available locally. A URL that is already registered routes to `update`; that notice is not a completed add.
id: f9ecf21554e66e1b
author: Daniel Montilla
version: 1.1.0
license: MIT
groups:
  - references
  - git
dependencies:
  - executing-skills
---

# When To Use

Use when the user wants a third-party repository registered as reference code: "add this repo as a reference", "track this library's source", "pin Effect at this commit", "clone that repo so I can read it". The skill writes the committed store entry and the clone through `mf-references` / `/mf-references`; it never builds a registry table and never clones by hand.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Resolve the slug

Read the slug the user named, if any. Otherwise let `add` derive it from the URL's final path segment.

A slug must match `^[a-z0-9]+(-[a-z0-9]+)*$`. Pass `--name <slug>` only when the user chose a name or the derived slug would collide with a different repository.

## 2. Register

Run the add verb. Use the binary form or the host slash form — they share one engine:

```bash
mf-references add <url> --purpose "<one sentence>" [--name <slug>] [--ref <branch|tag|commit>] --dir "$PWD"
```

```text
/mf-references add <url> --purpose "<one sentence>" [--name <slug>] [--ref <branch|tag|commit>] --dir "$PWD"
```

- `<url>` must be the **https** remote. ssh, scp-style, `file://`, and local paths are refused before any write; ask the user for the https URL and do not work around the refusal.
- `--purpose` is required for a URL that is not registered yet. It must be one sentence, 1–280 characters, end with `.`, and contain no `#` or `": "`.
- `--ref` is a branch, tag, or 7–40 character commit id. Omit it to track the default branch.
- Every verb is agent-first: the default output is compact and parseable. Pass `--human` for a readable table when a person will read the result, and `--verbose` for additive detail; `--human --verbose` composes. A routed add refuses a `--ref` it cannot apply rather than dropping it.
- `add` creates `.agents/references/`, its `.gitkeep`, and the `.gitignore` entry itself. Never run `mkdir`, `touch`, `git clone`, or edit `.gitignore` for it.
- When the binary is not on `PATH` but the montflow monorepo is the workspace, the equivalent local form is `bun run --cwd packages/references cli add … --dir "$PWD"`.

## 3. Read the result

`add` prints **exactly one** success line for a new entry and exits 0:

```text
created <slug> <url>
```

Two other outcomes must be read, not assumed:

- **A registered URL routes to `update`.** The first line is a notice, not a completed add:

  ```text
  routed add -> update <slug>: <url> is already registered as <slug>
  ```

  Success requires the update result that follows — `created`, `updated`, or `present` — **and** exit 0. If a `refused:` or `failed:` line follows, or the exit code is 1, the add did not succeed: surface that line to the user verbatim and do not retry `add`.

- **A refusal or failure is the whole output.** Print it unchanged (`refused: …`, `failed: …`) and stop. Common causes are a non-https URL, a missing or invalid `--purpose`, an invalid `--name`, a slug already registered for another URL, or a clone/checkout failure.

## 4. Verify the entry exists

```bash
mf-references show <slug> --dir "$PWD"
```

Confirm the frontmatter holds the URL, purpose, date, and optional ref the user asked for. The entry path is `.agents/@montflow/references/<slug>/REFERENCE.md`; the clone is `.agents/references/<slug>`.

## 5. Never hand-edit the registry

Do not write a markdown table of references, and do not edit `REFERENCE.md` beyond notes the user explicitly dictates. `add` and `update` are the only writers of frontmatter; a hand-edited entry is a `verify` failure waiting to happen.

# Reference

- **CLI surface** — `mf-references` and `/mf-references` are one engine with the same flags:

  | Verb     | Use                                                                   |
  | -------- | --------------------------------------------------------------------- |
  | `doctor` | Verify and repair scaffolding, installed skills, and the registry     |
  | `list`   | Every entry with clone presence and purpose (`--status installed\|missing`) |
  | `show`   | One entry's `REFERENCE.md` bytes                                      |
  | `verify` | Committed bytes, plus clone state with `--clones`; non-zero on issues |
  | `add`    | Register and clone one https URL; a registered URL routes to `update` |
  | `update` | Refresh one entry or `--all`, by name or URL (`--force`)              |
  | `sync`   | Materialize missing clones or repair checkouts (`<name>` or `--all`)  |
  | `status` | Clone state per entry; `--fetch` adds behind/ahead, never gates        |
  | `remove` | Unregister one entry; `--keep-clone` keeps the clone                  |

  Every verb takes `--dir <root>` (defaults to the working directory). The default output is agent-first; `--human` renders readable tables and prose, `--verbose` adds detail, and the two compose. `add` also takes `--name`, `--ref`, and `--purpose`; `verify` takes `--all` and `--clones`.

- **Binary / slash command**: `mf-references add …` and `/mf-references add …` — the same engine, the same output.
- **Store contract**: `.agents/@montflow/references/<slug>/REFERENCE.md` (`packages/references/src/modules/reference/reference.module.ts`).
- **Lifecycle**: `.agents/references/<slug>` is a plain clone; ownership, dirty state, and ref pins are `status`/`verify` jobs, not this skill's.
- **In-host tool**: `reference_add` performs the same registration and returns the same created/routed/refused strings; prefer it when the tool is available.
- **Changelog and migration**: [CHANGELOG.md](CHANGELOG.md).
