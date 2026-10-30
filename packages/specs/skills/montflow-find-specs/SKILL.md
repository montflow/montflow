---
name: montflow-find-specs
description: Finds and filters montflow specs under .agents/@montflow/specs/ with the `mf-specs list` CLI (or `/specs list` in the OpenCode host), reporting each spec's derived lifecycle state. Use when an agent must answer "what is pending?", pick a spec to resume, or list specs by state.
id: f21093485cea4b44
author: Daniel Montilla
version: 1.5.0
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

Run `mf-specs doctor` (or `bun run --cwd packages/specs cli doctor`).
It installs `montflow-find-specs` and `montflow-create-specs` into
`<repo>/.agents/skills/`. Idempotent — a present skill is left untouched.

## 2. Run `list`

```bash
bun run --cwd packages/specs cli list
```

Inside the OpenCode host the same engine is the `/specs list` slash command.
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
bun run --cwd packages/specs cli list --pending

# finished and idle specs
bun run --cwd packages/specs cli list --status=complete,pending
```

## 4. Read the Output

One line per matched spec, then a matched-of-total summary:

```
• montflow-project-structure  in-progress · inconsistent · 9 complete
1 spec · 1 matched
```

Each line is `<mark> <name>  <declared> · <derived> · <task counts>`, plus a
`· ✗ <n>` suffix when the spec fails mechanical verification. Derived states:
`pending` (idle), `in-progress` (work has started), `blocked`, `complete`, or
`inconsistent` (the spec contradicts itself). Drill into one spec with
`status --name <spec>`; verify the whole root with `check`.

## 5. Resolve the Spec the Branch Names

When you are driving rather than listing, let the branch select the spec:

```bash
bun run --cwd packages/specs cli which
bun run --cwd packages/specs cli which --branch feat/ship-login
```

Inside the host the same engine is `/specs which`. A branch is
`<prefix>/<feature-name>`: a lowercase conventional prefix (`feat`, `fix`,
`chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `release`,
`hotfix`) and the feature name after the first `/`, lowercased with `/` and `_`
normalized to `-`. Matching is exact first, then a unique prefix match between
the feature name and a spec name — never fuzzy, edit-distance, or keyword.

Success prints exactly one spec name. A detached HEAD, a branch without a
prefix, no candidate, two or more prefix candidates, or unreadable git metadata
exit non-zero with the branch, every candidate, and the exact `--name`. Ask the
user which spec to run; never pick one.

## 6. Begin or Resume with `execute`

```bash
bun run --cwd packages/specs cli execute [--name <spec>] [--phase <id>] [--focus <text>] [--mode guided|autonomous]
```

`execute` loads the `spec-execute` prompt, derives state and the ready set from
the spec, and covers both beginning a fresh spec and resuming one in progress.
With no `--name` it uses `which`; an explicit name always wins. Inside the host
the same verb is `/specs execute` or the `spec_execute` tool.

`--mode` takes exactly `guided` (the default) or `autonomous`. `guided` may ask
whenever a decision benefits from it. `autonomous` asks only for a destructive
or irreversible action, a very dangerous tool call, or a decision it genuinely
cannot make from the spec; every other decision is recorded in `MEMORY.md`. The
mode changes interaction only — dispatch, gates, review, locking, and
verification are identical in both.

## 7. Do Not Guess

The listing reflects the spec files on disk. If `list` reports no specs,
none exist under the root — do not invent one. To author a new spec use
`montflow-create-specs` (or scaffold the skeleton with
`mf-specs create --name <spec>`); to run work against an existing spec,
dispatch `subagent` sessions from the orchestrator.

# Reference

- **Specs**: `.agents/@montflow/specs/<name>/` — `SPEC.md` plus
  one directory per task (`TASK.md`, `MEMORY.md`, `GATES.md`).
- **Commands**: `mf-specs list` (or `/specs list`), `mf-specs which [--branch <name>]`
  (or `/specs which`), and `mf-specs execute [--name <spec>] [--mode guided|autonomous]`
  (or `/specs execute`) which loads the `spec-execute` prompt.
- **Prompt**: `packages/specs/prompts/spec-execute.json` (`spec-execute`),
  doctor-installed into `.agents/@montflow/prompts/`; it declares this skill
  plus the review skills.
- **CLI engine**: `packages/specs/src/apps/cli/cli.apps.module.ts` —
  `list`, `renderList`, `resolveListOptions`, `which`, `execute`, `scaffold`
  (the `create` engine).
- **Lifecycle contract**: `packages/specs/src/modules/lifecycle/lifecycle.module.ts`
  — the derived states and their meanings.
