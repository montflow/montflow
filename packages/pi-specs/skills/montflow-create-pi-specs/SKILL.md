---
name: montflow-create-pi-specs
description: Authors a spec under .agents/@montflow/specs/ — SPEC.md plus one directory per task (TASK.md, MEMORY.md, GATES.md) — from the rules below. Use when an agent must create a spec directly, without dispatching a run or shelling out.
id: 6ebf45d24cb3d3a1
author: Daniel Montilla
version: 2.0.0
license: MIT
dependencies:
  - executing-skills
groups:
  - planning
---

# When To Use

Use when a new **spec** must be authored under
`.agents/@montflow/specs/<kebab-name>/`. The agent writes the files itself
from the rules below — it does not dispatch a run and does not call a CLI.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Choose the Name

`<kebab-name>` becomes the spec directory and equals the `name` in the
frontmatter. Create exactly one spec, then stop. Author the spec; do not
execute it.

## 2. Write `SPEC.md`

Frontmatter: `name` (kebab-case, equals the directory), `status: in-progress`,
`workspace-type: in-place`, `author`, `created` (YYYY-MM-DD), `locked-phases:`
(empty).

Body sections: `## Description`, `## Requirements`, `## Tasks`.

`## Tasks` is a table `| ID | Name | Type | Status | Gates |` with `Gates`
either `Yes` or `No`.

## 3. Write One Directory per Task

`<PHASE_LETTERS><NNN>-<kebab-name>/` containing `TASK.md` and `MEMORY.md`, plus
`GATES.md` when the task's `Gates` is `Yes`.

`TASK.md` frontmatter: `id` (`<LETTERS><NNN>`, matches the directory), `name`
(matches the directory name after the id), `type`, `originator`, `depends-on`,
`related-tasks`, `status`.

`TASK.md` body sections: `## Type: <type>`, `## Description`,
`## Requirements`, `## Completion`.

- `type`: exploratory | execution | planning | interruptor | defect | review.
- `status`: pending | in-progress | complete | blocked (`defect` is a type, never a status).
- `originator`: `user`, `defect:<task-id>`, or `planner:<task-id>`.
- `depends-on` may reference only tasks in the same phase or an earlier phase.

## 4. Follow the Phase Rules

A phase is the leading letters of a task id (`A001` is phase `A`). End every
phase with exactly one `review` task named `<PHASE>099-review-phase`. Leave
`locked-phases:` empty and the spec `status: in-progress`.

## 5. Ask Only When the Decision Is the User's

Ask with `ask_user` only when the decision is theirs — scope, naming, or real
ambiguity; otherwise decide and proceed. Use `notify_user` for progress the user
should see. Do not invent extra context.

## 6. Self-Check Before You Stop

- Every task directory matches a row in `## Tasks`, and every row has a directory.
- Each `TASK.md` `id` equals its directory id, and `name` equals the directory name after the id.
- Each phase ends with exactly one `<PHASE>099-review-phase` review task.
- `depends-on` references stay in the same phase or an earlier phase.
- `locked-phases:` is empty and the spec is `status: in-progress`.
- Nothing outside `.agents/@montflow/specs/` was touched.

# Reference

- **Specs**: `.agents/@montflow/specs/<name>/` — `SPEC.md` plus one directory per task (`TASK.md`, `MEMORY.md`, `GATES.md`).
- **Contract source**: `packages/pi-specs/src/skills/authoring-spec.ts`, `modules/lifecycle`, `modules/structure`.
