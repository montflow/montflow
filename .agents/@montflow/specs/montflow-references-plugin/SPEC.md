---
name: montflow-references-plugin
status: in-progress
workspace-type: in-place
author: Daniel Montilla
created: 2026-10-26
locked-phases: A, B
---

# montflow-references-plugin

## Description

The reference workflow is the only montflow domain with no package behind it.
It is two workspace-only skills (`adding-references`, `finding-references`,
both v2.2.0), a hand-edited markdown table inside `finding-references/SKILL.md`
that is the sole registry of 14 third-party repos, and plain git clones under
`.agents/references/` that `.gitignore` keeps out of every commit. Adding a
reference means running clone commands by hand and then editing prose in a
skill; finding one means globbing a directory and reading a table; nothing
checks that a registered URL is reachable, that a clone is present, that a
clone is at the pinned ref the specs expect, or that the two skills agree. Ten
spec files cite the pinned `.agents/references/opencode/` clone, and
`tooling/oxlint/anti-slop/` is vendored from the `anti-slop` reference, so the
workflow is load-bearing but unverified.

Turn it into a first-class `@montflow/references` plugin whose skills are
scoped to the `montflow-*` namespace, shaped exactly like `@montflow/skills` /
`@montflow/profiles` / `@montflow/reviews`. The registry becomes a committed
store at `.agents/@montflow/references/<slug>/REFERENCE.md`; the clones stay
plain git clones under the gitignored `.agents/references/`; and the
`mf-references` CLI owns the whole lifecycle: `add` a git repo (routing to
`update` when it is already registered), `update` by name or URL, `sync` one
or all into a fresh worktree, `status` the local state, `verify` the registry
(CI-safe), and `doctor` the registry plus the ignore rule. Every command is
agent-first: compact default output, with `--human` for readable tables and
`--verbose` for additive detail. The OpenCode server entry registers
`/mf-references` plus `reference_add` / `reference_find` tools; `doctor`
installs `montflow-add-reference` and `montflow-find-reference` into
`.agents/skills/`; and `mf:check:references` joins the repo gate and CI matrix.
A final alignment phase brings every skill and doc that names references into
line with the shipped CLI. A scoping phase then makes the verification rule
explicit across every CLI: commands always run against the artifact being
changed, and whole-store gates are reserved for CI, cross-scope changes, or an
explicit request. The migration is data-preserving: all 14 current registry
rows become store entries, and the pinned `opencode` clone the specs cite keeps
resolving.

## Requirements

- A new private package `packages/references` (`@montflow/references`) exports `.`, `./server`, and `./tui`, ships `bin.mf-references`, and follows the existing utility-plugin anatomy: `src/apps/cli` (engines, renderers, binary, slash, main), `src/modules` (reference entity, verifier, git lifecycle), `src/services/reference-store` (the Effect store), `src/apps/doctor`, `skills/`, and a payload generator.
- The registry is a committed store at `<root>/.agents/@montflow/references/<slug>/REFERENCE.md`, one directory per reference; the slug is the directory name and frontmatter `name`; no registry row lives in skill prose any more.
- `REFERENCE.md` frontmatter carries `name`, `url`, `purpose`, `added`, and an optional `ref` (branch, tag, or commit); the body carries notes. The clone path is derived as `<root>/.agents/references/<slug>` and is never stored in the entry, so path and entry cannot drift.
- Clones remain plain git clones under `.agents/references/`, gitignored, never submodules and never dependencies; `doctor` ensures the directory and `.gitkeep` exist and that `.gitignore` carries the entry, and `add` does the same before cloning.
- `mf-references add <git-url>` validates the URL, derives the slug or accepts `--name`, clones into the derived path, and writes the entry only after the clone succeeds; a failed clone leaves neither a clone nor an entry. When the name or URL is already registered, `add` routes to `update` and says so; a slug collision with a different URL is refused.
- `mf-references update <name|url>` accepts either the registered name or the URL, fast-forwards a default-branch entry, checks out a recorded `ref` for a pinned entry, and refuses a dirty worktree unless `--force` is passed; an unknown URL fails with an add-it-first message.
- `mf-references sync [name] [--all]` materializes the registry in a fresh worktree: it clones every missing entry, checks out each recorded `ref`, reports what it created, and never changes the registry. `sync` with no name and no `--all` is a usage error.
- `mf-references status [name]` reports per entry `missing`, `present`, `dirty`, or `ref-mismatch`, and with `--fetch` also `behind` or `ahead`; it exits 0 with a summary and non-zero only on a refusal.
- `mf-references doctor` verifies the registry and the workspace scaffolding together: store entries parse, `.agents/references/` exists, `.gitkeep` is present, `.gitignore` ignores `.agents/references`, and the packaged skills are installed and current; it repairs what it can, and `--check` reports without writing.
- `mf-references verify` is CI-safe (committed registry and skills only) and `verify --clones` adds local clone presence, git validity, cleanliness, and ref match; every issue names the entry and the field, and a clone-less CI checkout verifies clean.
- The CLI follows the shared standard: canonical `doctor`, `list`, `show`, `verify` plus domain `add`, `update`, `sync`, `status`, `remove`; `--dir` is the workspace root, binary and slash share one engine set, and a refusal sets the exit code inside the handler.
- Every verb is agent-first: the default output is compact and stable enough to parse, `--human` renders readable tables and prose, and `--verbose` stays the additive detail flag; `--human` and `--verbose` compose, and the tools use the same default rendering.
- The OpenCode server entry registers the `/mf-references` slash command over the same engines and the tools `reference_add` and `reference_find`; both are deterministic (git and store operations), never session dispatches, and report a displayable failure string.
- The package ships exactly two skills, `montflow-add-reference` and `montflow-find-reference`, in the `montflow-*` namespace; `doctor` installs and freshness-checks them from `packages/references/skills/` with the embedded-payload fallback, and the generic `adding-references` / `finding-references` workspace skills are retired with a migration note.
- Both packaged skills call `mf-references` / `/mf-references` instead of carrying a table: the find skill resolves a request against the store, offers to sync a missing entry, and reports path, purpose, URL, and ref; the add skill runs the add flow and never hand-edits a registry.
- The existing 14 registry rows are migrated verbatim into store entries, including the `opencode` pin the specs cite; no spec, consumer, or vendored copy changes behaviour.
- `mf:check:references` runs the CI-safe verifier plus `doctor --check`, is added to `mf:check`, the CI matrix, and the verification docs; `bun run pack:plugins` discovers the package through `exports./server` with no workspace-specifier leak.
- A final alignment phase audits the whole skill surface: both packaged skills teach the shipped add→update routing and output modes, every other skill that names references is updated or repointed, and no generic reference skill or stale link remains.
- `AGENTS.md` states the verification rule unconditionally: every check is scoped to the artifact being changed; whole-store and repo-wide gates run only when the change spans scopes, at the final gate, or when the user asks.
- Every `mf-*` CLI documents its single-artifact scoped invocation (owning package `cli`, `--dir $PWD`, artifact name), the spec skills and profiles use that form, and no documented local example runs `mf:check:<domain>` or `mf:check` for one artifact.
- A scoped-verification phase audits every CLI, fixes every broken or unscoped example, adds the scoped command to each CLI's docs, and lands a mechanical guard that fails when a documented local invocation is unscoped — or records why the guard is not worth its cost.
- The docs that name the reference surface are updated: root README package list and skill-sync matrix, INSTALL plugin list, AGENTS verification scopes, `.agents/documentation/author-mf-utility-cli.md` CLI surface table, and the `authoring-skills` groups table.
- The new package, its two skills, and every touched doc ship changelog entries; `bun run mf:check` passes for every scope, and the spec's own `mf-specs check` reports zero issues.

## Tasks

| ID   | Name                            | Type        | Status  | Gates |
| ---- | ------------------------------- | ----------- | ------- | ----- |
| A001 | map-reference-surface           | exploratory | complete | No    |
| A002 | map-package-anatomy             | exploratory | complete | No    |
| A003 | map-consumers-and-migration     | exploratory | complete | No    |
| A099 | review-phase                    | review      | complete | No    |
| B001 | decide-registry-store-contract  | planning    | complete | No    |
| B002 | decide-git-lifecycle            | planning    | complete | No    |
| B003 | decide-cli-and-plugin-surfaces  | planning    | complete | No    |
| B099 | review-phase                    | review      | complete | No    |
| C001 | scaffold-package-and-store      | execution   | complete | Yes   |
| C002 | implement-registry-and-verify   | execution   | complete | Yes   |
| C003 | implement-git-lifecycle         | execution   | complete | Yes   |
| C004 | implement-cli-and-slash         | execution   | complete | Yes   |
| C005 | implement-plugin-tools          | execution   | complete | Yes   |
| C006 | ship-skills-and-doctor          | execution   | complete | Yes   |
| C007 | migrate-registry-and-wire-gate  | execution   | complete | Yes   |
| C099 | review-phase                    | review      | pending | No    |
| D001 | align-skills                    | execution   | pending | Yes   |
| D002 | align-docs-and-verify           | execution   | pending | Yes   |
| D099 | review-phase                    | review      | pending | No    |
| E001 | audit-scoped-verification       | exploratory | pending | No    |
| E002 | fix-agents-rule-and-spec-scoping | execution  | pending | Yes   |
| E003 | document-scoping-per-cli        | execution   | pending | Yes   |
| E099 | review-phase                    | review      | pending | No    |
