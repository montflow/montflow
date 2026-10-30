---
id: B003
name: decide-cli-and-plugin-surfaces
type: planning
originator: user
depends-on: A002, B001, B002
related-tasks:
status: complete
---

# Task B003: Decide the CLI and plugin surfaces

## Type: planning

## Description

Fix the `mf-references` surface and what the OpenCode plugin exposes. The CLI
must match the other `mf-*` binaries in structure and style; the tools must be
deterministic git/store calls, not session dispatches; and the two skills must
be scoped to `montflow-*` and call the CLI instead of carrying a table.

## Requirements

- Decide the verb set and ordering: canonical `doctor`, `list`, `show`, `verify` plus domain `add`, `update`, `sync`, `status`, `remove`; state any verb that is dropped or aliased and why.
- Decide flags and defaults for every verb: `--dir`, `--human`, `--verbose`, `list --status installed|missing`, `verify [name] [--all] [--clones]`, `add <url> --name --ref --purpose`, `update <name|url> [--all] [--force]`, `sync [name] [--all]`, `status [name] [--fetch]`, `remove <name> [--keep-clone]`.
- Decide the two output modes: agent-first compact default (stable tokens, one summary line plus per-entry rows) and `--human` readable tables/prose; decide whether `--human` implies `--verbose` or composes with it, and which mode the tools and slash command use.
- Decide exit rules: failures as displayable strings, non-zero set inside the handler, no `process.exit`; state which verbs exit non-zero on a state finding (e.g. `status` with a missing clone) versus only on refusal.
- Decide the engine/renderer split so the binary, the slash command, and the tools all call the same engines, and name the tests each verb needs.
- Decide the scoped single-artifact invocation for every verb (positional name versus `--name`, `--dir $PWD`) and where it is documented, so no caller has to fall back to a whole-store check.
- Decide `doctor` scope: registry verification, clone-root and `.gitkeep` setup, the `.gitignore` entry, and packaged-skill install/freshness; state what it repairs and what it only reports under `--check`.
- Decide the server entry: plugin id, `/mf-references` command name/description, and the tools `reference_add` and `reference_find` with input schemas and return strings; state why no session dispatch is needed.
- Decide whether `reference_sync`, `reference_status`, `reference_update`, or `reference_remove` are exposed too, and the rule for adding a tool later.
- Decide the TUI entry: id-only no-op like `@montflow/skills`, or a workspace panel; if a panel is deferred, record it as out of scope with the reason.
- Decide the two skill names (`montflow-add-reference`, `montflow-find-reference`), their groups, their `executing-skills` dependency, the exact CLI calls in each pipeline, and the migration note for the retired generic names.
- Decide whether the package depends on `@montflow/skills` for skill verification or keeps a local shape check, and justify the coupling cost.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Verb, flag, output, and exit contract recorded
- [ ] Doctor scope, tool schemas, and deterministic-versus-dispatch rule recorded
- [ ] Skill names/pipelines, TUI decision, migration note, and dependency decision recorded
