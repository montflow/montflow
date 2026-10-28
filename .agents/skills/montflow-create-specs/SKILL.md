---
name: montflow-create-specs
description: Authors a spec under .agents/@montflow/specs/ — SPEC.md plus one directory per task (TASK.md, MEMORY.md, GATES.md) — by scaffolding with `mf-specs create` then filling in the rules below. Use when an agent must create a spec directly, without dispatching a session.
id: 6ebf45d24cb3d3a1
author: Daniel Montilla
version: 2.3.0
license: MIT
dependencies:
  - executing-skills
groups:
  - planning
---

# When To Use

Use when a new **spec** must be authored under
`.agents/@montflow/specs/<kebab-name>/`. Scaffold the skeleton with the
`mf-specs create` CLI, then fill it in from the rules below. The agent authors
the spec itself — it does not dispatch an authoring session.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Choose the Name

`<kebab-name>` becomes the spec directory and equals the `name` in the
frontmatter. Create exactly one spec, then stop. Author the spec; do not
execute it.

## 2. Scaffold the Tree with `mf-specs create`

The mechanical skeleton is one deterministic, model-free command that already
writes a tree passing `mf-specs check`:

```bash
bun run --cwd packages/specs cli create --name <kebab-name> \
  [--description "<one line>"] [--author "<name>"] \
  [--workspace-type in-place|worktree] \
  [--tasks "build:execution:gates,explore:exploratory"] \
  [--reviewer-profiles "<a>,<b>"]
```

- `<kebab-name>` is required and must be the final directory name.
- Each `--tasks` entry is `name[:type[:gates]]`. `type` defaults to
  `execution` (one of exploratory | execution | planning | interruptor | defect);
  the trailing `gates` token (or `true`) emits a `GATES.md`.
- With no `--tasks`, it creates one `implement` execution task.
- It always appends the phase's `<PHASE>099-review-phase` review task, refuses
  to overwrite an existing spec, and prints the files it wrote.
- `--reviewer-profiles` seeds the review task's `reviewer-profiles` list
  (comma-separated, ordered).
- Inside the OpenCode host the same engine is
  `/specs create --name <kebab-name> …`.

Then edit the rendered `SPEC.md` and `TASK.md` files so they carry the real
requirements. If you write the files by hand instead, follow steps 3–6 exactly.

## 3. Write `SPEC.md`

Frontmatter: `name` (kebab-case, equals the directory), `status: in-progress`,
`workspace-type: in-place`, `author`, `created` (YYYY-MM-DD), `locked-phases:`
(empty).

Body sections: `## Description`, `## Requirements`, `## Tasks`.

`## Tasks` is a table `| ID | Name | Type | Status | Gates |` with `Gates`
either `Yes` or `No`.

## 4. Write One Directory per Task

`<PHASE_LETTERS><NNN>-<kebab-name>/` containing `TASK.md` and `MEMORY.md`, plus
`GATES.md` when the task's `Gates` is `Yes`.

`TASK.md` frontmatter: `id` (`<LETTERS><NNN>`, matches the directory), `name`
(matches the directory name after the id), `type`, `originator`, `depends-on`,
`related-tasks`, `reviewer-profiles`, `status`.

`TASK.md` body sections: `## Type: <type>`, `## Description`,
`## Requirements`, `## Completion`.

- `type`: exploratory | execution | planning | interruptor | defect | review.
- `status`: pending | in-progress | complete | blocked (`defect` is a type, never a status).
- `originator`: `user`, `defect:<task-id>`, or `planner:<task-id>`.
- `depends-on` may reference only tasks in the same phase or an earlier phase.
- `reviewer-profiles` (`review` tasks only): comma-separated ordered reviewer
  profile slugs (`reviewer-profiles: effect-reviewer, generic-reviewer`). Empty
  or absent keeps the single general reviewer; each entry adds a
  `<kebab-name>-<profile>` review series that the phase's review round is also
  written to. Declare `effect-reviewer` on **code phases** — any phase holding an
  `execution` or `defect` task; exploration and planning phases stay empty.

## 5. Follow the Phase Rules

A phase is the leading letters of a task id (`A001` is phase `A`). End every
phase with exactly one `review` task named `<PHASE>099-review-phase`. Leave
`locked-phases:` empty and the spec `status: in-progress`.

## 6. Ask Only When the Decision Is the User's

Ask with `ask_user` only when the decision is theirs — scope, naming, or real
ambiguity; otherwise decide and proceed. Use `notify_user` for progress the user
should see. Do not invent extra context.

## 7. Self-Check Before You Stop

Only edit files if you skipped the `create` scaffold or changed the tree by
hand; a fresh `create` output already verifies.

- Every task directory matches a row in `## Tasks`, and every row has a directory.
- Each `TASK.md` `id` equals its directory id, and `name` equals the directory name after the id.
- Each phase ends with exactly one `<PHASE>099-review-phase` review task.
- `depends-on` references stay in the same phase or an earlier phase.
- `locked-phases:` is empty and the spec is `status: in-progress`.
- Nothing outside `.agents/@montflow/specs/` was touched.
- `mf-specs check --name <kebab-name>` reports zero issues
  (run `bun run --cwd packages/specs cli check --name <kebab-name>`).

# Reference

- **Specs**: `.agents/@montflow/specs/<name>/` — `SPEC.md` plus one directory per task (`TASK.md`, `MEMORY.md`, `GATES.md`).
- **Scaffold CLI**: `mf-specs create` (or `/specs create` in the OpenCode host) — flags `--name`, `--description`, `--author`, `--workspace-type`, `--tasks`, `--reviewer-profiles`.
- **Contract source**: `packages/specs/src/skills/authoring-spec.ts`, `modules/scaffold`, `modules/lifecycle`, `modules/structure`.
