# @montflow/references

Reference-code management for OpenCode — a committed registry of third-party
repositories, plain git clones kept out of every commit, the `mf-references` CLI
(a binary, and the same command in the host as `/mf-references`), the
`reference_add` / `reference_find` tools, and the `montflow-add-reference` /
`montflow-find-reference` skills, shipped as package payload and installed by
`doctor`.

```typescript
import { Reference, Verifier } from '@montflow/references';

// The two trees the package derives from a workspace root.
Reference.STORE_DIR; // '.agents/@montflow/references'
Reference.CLONE_DIR; // '.agents/references'
```

## Store and clones

Two directories, three characters apart, owned by different rules:

```
.agents/@montflow/references/<slug>/REFERENCE.md   # committed registry entry
.agents/references/<slug>                          # gitignored plain git clone
```

- **The store is committed.** One directory per reference, named by its `slug`.
  `REFERENCE.md` carries `name`, `url`, `purpose`, `added`, and an optional
  `ref` (branch, tag, or commit); the body holds provenance notes. The slug is
  the directory name, the frontmatter `name`, and the clone directory name — one
  identity, no second copy.
- **The clone path is derived, never stored.** `add` clones, `update` refreshes,
  `sync` materializes a missing clone, `status` reports local state, and
  `remove` unregisters. `doctor` creates the clone root and its `.gitkeep` and
  keeps `.gitignore` ignoring `.agents/references`.
- **`url` is always `https://`.** ssh, scp-style, `file://`, and local-path
  arguments are refused before any clone, so a registered entry can never
  disagree with the one transport the verifier accepts.
- **Clones are never submodules and never dependencies.** They are full clones,
  ignored by git, materialized on demand.

## Commands

```bash
mf-references doctor [--check]                     # scaffolding and skills
mf-references list [--status installed|missing]
mf-references show <name>                          # the entry's bytes
mf-references verify [<name>|--all] [--clones]     # CI-safe registry check
mf-references add <url> [--name <slug>] [--ref <ref>] [--purpose <text>]
mf-references update <name|url>|--all [--force]
mf-references sync <name>|--all
mf-references status [<name>] [--fetch]
mf-references remove <name> [--keep-clone]
```

Every verb has a single-artifact form run from the workspace root:

```bash
bun run --cwd packages/references cli verify <slug> --dir $PWD
```

`--dir` is the **workspace root**, not the store. The agent default is compact
and stable; `--human` renders readable tables and `--verbose` adds detail, and
the two compose. Whole-store forms (`verify --all`, `sync --all`) belong to CI
and explicit requests, not to a one-artifact edit.

Inside OpenCode, the slash form is `/mf-references …`; from a shell it is
`mf-references …`. They are one CLI in two runtimes over one engine set.

## Plugin surfaces

- `/mf-references` — the whole CLI, headless, registered by the server plugin.
- `reference_add` — register and clone one git URL; routes to `update` when the
  URL is already registered.
- `reference_find` — read-only lookup over the store: exact slug, exact URL,
  then substring; reports purpose, URL, ref, and where to read the code.
- `mf-references doctor` — installs both skills and repairs the workspace
  scaffolding (store root, clone root, `.gitkeep`, the ignore rule).

Both tools are deterministic git and store operations; neither dispatches a
session. The TUI entry mounts nothing, matching every other plugin package.

## Skills

Two skills ship with the package and `doctor` installs them into
`.agents/skills/`, keeping them byte-identical to the package:

- `montflow-add-reference` — the add flow: resolve the slug, register with
  `mf-references add`, read the result, never hand-edit the registry
- `montflow-find-reference` — the lookup flow: list, show, offer to sync a
  missing clone, then report path, purpose, URL, and ref

```bash
mf-references doctor
```

## Migrating from the workspace skills

The two generic workspace skills that used to own this surface are retired:

| Retired              | Replacement                                                          |
| -------------------- | -------------------------------------------------------------------- |
| `adding-references`  | `montflow-add-reference` + `mf-references add`                       |
| `finding-references` | `montflow-find-reference` + `mf-references list` / `show` / `status` |

The 14-row registry table that lived in `finding-references/SKILL.md` is gone;
each row is now one `REFERENCE.md` under `.agents/@montflow/references/<slug>/`.
Names, URLs, and clone locations are unchanged, so the `opencode` entry stays
pinned at `cd9a14a6b688d4021bee381dfd39d2cef9c0f862` (tag `v2.0.18`) and every
existing citation keeps resolving. The old manual table check is replaced by
`bun run mf:check:references`, which runs the CI-safe verifier and
`doctor --check`.

## Status

Version `0.0.1`, private. Source-only — no build step: a local-path OpenCode
install loads the `.ts` files directly. Run `bun install` from the repo root for
dependencies, then `turbo` `test` / `ts:check` cover this package like the rest.
`bun run mf:check:references` gates the committed registry and the installed
skills; `bun run pack:plugins` picks the package up through `exports./server`.
