# Memory

## Context
- I001 (planning, `write-scope: none`): fix the `spec-status` prompt contract so I002 ships the template and I003 exposes it. Bound with `mf-specs claim`; read TASK.md, phase brief/BOARD, README, the three prompts, CLI, and prompts schema.
- Sources: README L60-83,167-169,179-192,252-277,344-363,504-532; cli.status L364-460,476-580,600-780; cli.author L119-322; cli.review L227-290; cli.sizing L541-605; which L57-58,205-213; slash.parse L22-47,148-152; slash L335-408,558-607; spec-tools L109-190; server.ts L74-86; prompts.module L40-58,253,430-482; spec-source L62-90.

## Progress
- Contract decided and recorded below; no file outside this MEMORY was changed.

## Findings

### Report contract (fixed order; quote CLI output, never recompute)

| # | Section | Source command | Content |
| - | ------- | -------------- | ------- |
| 1 | Declared status | `mf-specs state --name <spec>` | `SPEC.md` status token: `in-progress` or `complete` (`unreadable` when absent) |
| 2 | Derived lifecycle state | `mf-specs state --name <spec>` | `state <pending/in-progress/blocked/complete/inconsistent>` |
| 3 | Active phase | `mf-specs state --name <spec>` | `phase <id or none>` |
| 4 | Locked phases | `mf-specs state --name <spec>` | `locked <ids or none>` |
| 5 | Task counts | `mf-specs status --name <spec>` | `tasks <n> · <count> <status>…` |
| 6 | Phase review budgets | `mf-specs status --name <spec>` | per phase `Phase <id> · review <required/waived/none> · budget <n>` |
| 7 | Ready set | `mf-specs next --name <spec>` | head plus one line per ready task, or `ready none`, verbatim |
| 8 | Verification result + blocking codes | `mf-specs check --name <spec>`; `state` for codes | `verify <✓ verified or ✗ n issues>`; `blocked <sorted unique codes>` from `state` |
| 9 | Review evidence | `mf-specs review decide --name <spec> --phase <active> --json` | decision, rounds used/budget, open by severity, reason, per-series; fallback `status` per-phase decision when no active phase or `review: none` |
| 10 | Next command | terminal table below (`state`/`check` supply codes) | one exact command, never a list |

### Variables (declaration = first-appearance order)

| Pos | Name | Type | Required | Source | Notes |
| --- | ---- | ---- | -------- | ------ | ----- |
| 1 | `name` | text | yes | `specs` | Picker preselects the branch guess and orders pending before complete (`spec-source` L62-90) |
| 2 | `focus` | text | no (`default: ""`) | — | Optional steer; guarded by `{{#if focus}}` |

- No `internal` variables: the agent runs the five commands itself, so broken/complete specs still render a prompt. `spec-execute` keeps its internal `state`/`next`; this prompt must not copy that snapshot.

### Read-only boundary and `spec-execute` handoff

- May run only `status`, `state`, `next`, `check`, `review decide`, `which`; quote their output. May read `PHASE.md`/`TASK.md` only to locate a field a command names.
- Never write `SPEC.md`, `TASK.md`, `MEMORY.md`, a channel, a gate result, or a review record; never `claim`, `gate run/record`, `mail`, `stamp`, `waiver`, `lock`, worktree/branch changes, or any git mutation.
- When `next` lists a ready task, hand off to `spec-execute` (`/specs execute` or `spec_execute`); do not dispatch workers or start work.
- When `state complete`, say so and stop; never invent tasks, gates, or reviews, and never print a generic "next steps" list (TASK L53).

### Terminal closing lines (one per state; code when one exists)

| State | Closing line |
| ----- | ------------ |
| `inconsistent` | `inconsistent · codes <check codes or none> · next mf-specs check --name <spec> --verbose` |
| `blocked` | `blocked <state blocker codes or no codes> · next mf-specs status --name <spec>` |
| `complete` | `complete · every phase locked · next mf-specs check --name <spec> --require-complete` |
| no active phase | `no active phase · spec.no-active-phase · next mf-specs status --name <spec>` |
| missing/unreadable `SPEC.md` | `unreadable SPEC.md · <spec.not-found → mf-specs list; no code / SPEC.md → mf-specs check --name <spec> --verbose>` |

### Entry points

| Surface | Form | Behavior |
| ------- | ---- | -------- |
| Binary | `mf-specs status-report [--name <spec>] [--focus <text>] [--dir <path>] [--verbose]` | New verb (not `status`; its panel output is unchanged). Explicit `--name` wins; absent resolves through `which`. Renders `spec-status` model-free and prints it; doctor gate applies. It reads no spec, so every terminal state renders. |
| Slash | `/specs status-report [--name <spec>] [--focus <text>]` | Same engine; add `status-report` to `SLASH_COMMANDS`, its flag row (`name`, `focus`), and the exhaustive `slashArm`. |
| Host tool | `spec_status` exists | Input `{ name?, focus?, model? }`; renders and dispatches through the shared `PromptExecutor` like `spec_execute`. Read-only by prompt contract, not by tool privilege. |

### Ambiguity rule (all surfaces)

- Reuse `which`'s rule: exact name first, then a unique segment-boundary prefix; an explicit `--name` always wins. Never fuzzy.
- Detached HEAD, non-conventional branch, no candidate, or two prefix candidates: fail `SPEC_NO_MATCH` / `SPEC_AMBIGUOUS` with the branch, every candidate, and each exact `--name <candidate>` (which L57-58,205-213,305-330).
- The prompt's rule: on such a failure ask the user which spec to report; never pick, shorten, or infer one.
- An explicit `--name` bypasses the branch entirely; a malformed name is `cli.invalid-argument` before any read.

## Gates
- None: no task `GATES.md`; no official, repo-wide, or heavy gate was run.

## Open Questions
- None. I002/I003 implement this contract without re-deciding it.

## Handoff
- I002: write `packages/specs/prompts/spec-status.json` (name `spec-status`, description, template, the two variables in table order) and add it to `packages/specs/payload.json`.
- I003: add the `status-report` binary command/engine, slash arm + flag row, and the `spec_status` tool; reuse `which`, never overload `status`.

## Deviations
- None.
