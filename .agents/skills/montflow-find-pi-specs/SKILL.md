---
name: montflow-find-pi-specs
description: Finds and filters montflow specs under .agents/@montflow/specs/ with the `mf-specs list` CLI (or `/mf-specs list` in Pi), reporting each spec's derived lifecycle state. Use when an agent must answer "what is pending?", pick a spec to resume, or list specs by state.
id: f21093485cea4b44
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - executing-skills
groups:
  - workflow
---

# When To Use

Use when you need to know **which specs exist** and how far along they
are — answering "what is pending?", choosing a spec to resume, or listing
specs by state. This skill only reads and filters specs; it never authors,
edits, or executes them.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Ensure the Skill Is Installed

Run `mf-specs doctor` (or `bun run --cwd packages/pi-specs cli doctor`).
It installs `montflow-find-pi-specs` and `montflow-create-pi-specs` into
`<repo>/.agents/skills/`. Idempotent — a present skill is left untouched.

## 2. Run `list`

```bash
bun run --cwd packages/pi-specs cli list
```

Inside a Pi session the same engine is the `/mf-specs list` slash command.
`list` defaults to the root `.agents/@montflow/specs`; override with `--dir`.

## 3. Filter by State

- `--pending` — every **unfinished** spec (derived state is not `complete`).
  This is the flag for "what is still pending?".
- `--status <list>` — exact derived states, comma-separated:
  `pending`, `in-progress`, `blocked`, `complete`, `inconsistent`.
  `completed` is accepted as an alias for `complete`.
- `--pending` and `--status` are mutually exclusive — pick one.
- `--verbose` also prints the resolved root.

```bash
# unfinished work only
bun run --cwd packages/pi-specs cli list --pending

# finished and idle specs
bun run --cwd packages/pi-specs cli list --status=complete,pending
```

## 4. Read the Output

One line per matched spec, then a matched-of-total summary:

```
• montflow-project-structure  in-progress · inconsistent · 9 complete
1 spec · 1 matched
```

Each line is `<mark> <name>  <declared> · <derived> · <task counts>`, plus a
`· ✗ <n>` suffix when the spec fails mechanical verification. Derived states:
`pending` (idle), `in-progress` (a live run is bound), `blocked`, `complete`, or
`inconsistent` (the spec contradicts itself). Drill into one spec with
`status --name <spec>`; verify the whole root with `check`.

## 5. Do Not Guess

The listing reflects the spec files on disk. If `list` reports no specs,
none exist under the root — do not invent one. To author a new spec use
`montflow-create-pi-specs`; to run work against an existing spec use the
`montflow-dispatch-pi-runs` skill.

# Reference

- **Specs**: `.agents/@montflow/specs/<name>/` — `SPEC.md` plus
  one directory per task (`TASK.md`, `MEMORY.md`, `GATES.md`).
- **CLI engine**: `packages/pi-specs/src/apps/cli/cli.apps.module.ts` —
  `list`, `renderList`, `resolveListOptions`.
- **Lifecycle contract**: `packages/pi-specs/src/modules/lifecycle/lifecycle.module.ts`
  — the derived states and their meanings.
