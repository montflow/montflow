---
name: installation-guide
status: complete
workspace-type: worktree
author: Daniel Montilla
created: 2026-10-26
locked-phases: A, B, C
---

# installation-guide

## Description

The installation story is harness-bound while the skills it installs are
portable. `guides/installation.md` teaches `opencode.jsonc` plugin arrays, a
dashboard, `/reload`, host-specific skill directories, and global installs, and
the only skills-install path it offers is the external `npx skills` CLI. Two
consequences: installing skills needs npm and network even when a montflow
checkout is already on disk, and the global path mixes one workspace's skills
into every project on the machine.

This spec rebuilds the guide around the two modes readers actually arrive in.
**Remote** — no checkout yet: the agent registers montflow in
`.agents/references/` (per `adding-references`), reads the reference inventory
(per `finding-references`), then continues. **Local** — a checkout on disk:
skills come from `mf-skills sync`, the `mf-*` CLIs run from that clone, and
verification uses the existing `--dir` convention.

Utilities are optional. The guide has one section per `mf-*` CLI — skills, specs,
prompts, profiles, reviews — each installable on its own, plus an install-all
recipe for readers who want the lot. When a request does not name utilities, the
agent asks before writing anything; it never installs everything by default.

The guide is the deliverable. Everything else in this spec exists so the guide
is true: the skills CLI gains the `sync` command the local mode documents, and
every doc that still names `npx skills` or a global install is retargeted at the
same flow.

## Requirements

- `guides/installation.md` documents remote mode, then local mode, and states
  the handoff between them.
- Remote mode requires the agent to register the montflow reference and read the
  reference skill before installing anything.
- Local mode installs skills with `mf-skills sync --dir <target>` — project
  local, never machine-wide — and verifies with `--check`.
- The guide carries no harness-specific installation: no plugin config arrays,
  no dashboard, no reload step, no host-specific skill directories, no
  OpenCode-era troubleshooting.
- Every utility with an `mf-*` CLI — skills, specs, prompts, profiles, reviews —
  has an optional install section that runs on its own and states what it adds,
  the store it owns, and how to verify it.
- When the request does not name utilities, the agent asks which to install —
  all, none, or a subset — before writing anything, and installs nothing by
  default.
- An install-all recipe exists for the "all" answer, runs the same commands as
  the sections in a fixed order, and stops on the first failure.
- No shipped document (README, `guides/`, `.agents/skills/`,
  `.agents/documentation/`, package docs, or source comments) names
  `npx skills`, and none tells a reader to install skills globally.
- `mf-skills sync` copies every public skill from the source checkout into
  `<root>/.agents/skills/<name>/`, carrying each file in the skill directory
  (`SKILL.md`, `CHANGELOG.md`, `GATES.md`).
- Public means the `SKILL.md` frontmatter does not carry `metadata.internal:
  true`. Internal skills are skipped, reported, and never copied.
- Sync is idempotent, leaves unrelated skills untouched, supports `--from <path>`
  (defaulting to the montflow checkout the package runs from) and `--check`
  (report-only, exit 1 on drift), and names each skill by outcome — added,
  updated, unchanged, or skipped.
- `/mf-skills sync` shares one engine with the binary; no domain rule lives in a
  front end, and refusals name a typeable form (`mf-skills sync` vs
  `/mf-skills sync`).
- The `syncing-skills` skill, both READMEs, and the utility-CLI doc describe the
  `mf-skills sync` flow instead of the external installer.
- Review load is lean: every phase reviews in one cycle with the general
  reviewer, no specialized reviewer profiles.
- Package tests, `mf:check:skills`, `mf:check:specs`, lint, format, and
  typecheck stay green.

## Tasks

| ID   | Name                            | Type      | Status  | Gates |
| ---- | ------------------------------- | --------- | ------- | ----- |
| A001 | rewrite-installation-guide      | execution | complete | Yes   |
| A002 | retarget-skill-install-references | execution | complete | Yes |
| A099 | review-phase                    | review    | complete | No    |
| B001 | add-sync-engine                 | execution | complete | Yes   |
| B002 | add-sync-cli-surface            | execution | complete | Yes   |
| B003 | add-sync-tests                  | execution | complete | Yes   |
| B004 | conformance-and-changelogs      | execution | complete | Yes   |
| B099 | review-phase                    | review    | complete | No    |
| C001 | document-utility-installs       | execution | complete | Yes   |
| C002 | add-utility-selection-flow      | execution | complete | Yes   |
| C003 | add-install-all-recipe          | execution | complete | Yes   |
| C099 | review-phase                    | review    | complete | No    |
