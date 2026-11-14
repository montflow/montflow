---
name: montflow-find-specs
description: Finds and filters montflow specs under .agents/@montflow/specs/ with the `mf-specs list` CLI (or `/specs list` in the OpenCode host), reporting each spec's derived lifecycle state. Use when an agent must answer "what is pending?", pick a spec to resume, or list specs by state.
id: f21093485cea4b44
author: Daniel Montilla
version: 1.7.0
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
`<repo>/.agents/skills/`. Idempotent — a current skill is left untouched;
`doctor` reports and repairs a stale copy whose files differ from the package.

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
○ ship-login  in-progress · pending · 3 complete · 4 pending · locked A · review A:required,B:required
2 specs · 2 matched
```

Each line is `<mark> <name>  <declared> · <derived> · <task counts>`, plus a
`· locked <phases>` and `· review <phase>:<decision>,…` suffix when the spec has
`PHASE.md` records, and `· ✗ <n>` when it fails mechanical verification. Derived
states: `pending` (idle), `in-progress` (work has started), `blocked`,
`complete`, or `inconsistent` (the spec contradicts itself). Drill into one spec
with `status --name <spec>`; verify the whole root with `check`.

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

## 7. Report One Spec Read-Only

When the question is "what is this spec's state?" rather than "do the work",
render the read-only report instead of executing or re-deriving anything:

```bash
bun run --cwd packages/specs cli status-report [--name <spec>] [--focus <text>]
```

Inside the host the same engine is `/specs status-report` or the `spec_status`
tool; both dispatch the rendered `spec-status` prompt on a session and return the
agent's reply. Only the binary prints the prompt. The report itself quotes
`state`, `status`, `next`, `check`, and `review decide`. With no
`--name` it uses `which`; an explicit name always wins, and an absent or
ambiguous branch fails with the candidates and asks the user instead of
picking one. It never edits a record, status, lock, or worktree.

## 8. Read the Execution Channels and Scheduler

A phase has two channels and the orchestrator is the only writer:
`BOARD.md` is broadcast (`mail --to all`) and carries phase boundaries, shared
checks that ran or were reused, closed dependencies, and lane config;
`MAILBOX.md` is targeted (`mail --to <task-id>`) to one task. A worker reads both
at start and again before its receipt, and a channel never substitutes for a
`depends-on` edge.

`gate run` is scheduled: each attempt is keyed by `gate-v1:` over the normalized
command, its scopes, and a fingerprint of the files those scopes cover. One
attempt per key runs at a time, a matching pass is reused, and a failed,
timed-out, or cancelled result reruns. The heavy lane defaults to one run at a
time while light checks never wait behind it; both count toward the in-flight cap
in `.agents/@montflow/gate.json`. A phase-shared check therefore runs once for
the phase instead of once per worker.

## 9. Do Not Guess

The listing reflects the spec files on disk. If `list` reports no specs,
none exist under the root — do not invent one. To author a new spec use
`montflow-create-specs` (or scaffold the skeleton with
`mf-specs create --name <spec>`); to run work against an existing spec,
dispatch `subagent` sessions from the orchestrator.

# Reference

- **Specs**: `.agents/@montflow/specs/<name>/` — `SPEC.md` plus one directory per
  phase (`PHASE.md`, `MEMORY.md`, `BOARD.md`, optional `GATES.md`), each holding
  one directory per task (`TASK.md`, `MEMORY.md`, optional `GATES.md`,
  `MAILBOX.md`).
- **Channels**: `BOARD.md` is broadcast and `MAILBOX.md` is targeted; the
  orchestrator writes with `mail`, and a worker reads both at start and before
  its receipt.
- **Scheduler**: `gate run` keys an attempt by command, scope, and file
  fingerprint, runs one attempt per key, reuses an unchanged pass, reruns a
  failure, and bounds the heavy lane and in-flight count through
  `.agents/@montflow/gate.json`.
- **Parallel phase**: a phase is the widest ready set; `depends-on` carries only
  a real dependency and every task declares `write-scope:`.
- **Commands**: `mf-specs list` (or `/specs list`), `mf-specs which [--branch <name>]`
  (or `/specs which`), `mf-specs status-report [--name <spec>] [--focus <text>]`
  (or `/specs status-report`, or the `spec_status` tool), and
  `mf-specs execute [--name <spec>] [--mode guided|autonomous]`
  (or `/specs execute`) which loads the `spec-execute` prompt. `state` and
  `status` show the phase's derived lock and review decision; `lock` confirms a
  derived lock and writes nothing.
- **Prompts**: `packages/specs/prompts/spec-execute.json` (`spec-execute`) and
  `packages/specs/prompts/spec-status.json` (`spec-status`), doctor-installed
  into `.agents/@montflow/prompts/`; both declare this skill, and the execute
  prompt also declares the review skills.
- **CLI engine**: `packages/specs/src/apps/cli/cli.apps.module.ts` —
  `list`, `renderList`, `resolveListOptions`, `which`, `statusReport`,
  `execute`, `scaffold` (the `create` engine).
- **Lifecycle contract**: `packages/specs/src/modules/lifecycle/lifecycle.module.ts`
  — the derived states and their meanings.
