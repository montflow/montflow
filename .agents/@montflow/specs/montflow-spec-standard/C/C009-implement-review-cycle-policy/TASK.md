---
id: C009
name: implement-review-cycle-policy
type: execution
originator: user
size: medium
depends-on: C001, C005, C006
related-tasks: C002, C007, C099
status: pending
---

# Task C009: implement review-cycle policy

## Type: execution

## Description

The review loop stops only on a terminal reviewer verdict or the phase budget. A
Minor/Nit-only round therefore spends another full review, and a Major finding at
the last round has no bounded path except an ad-hoc escalation. This task adds a
deterministic decision verb, the severity-aware stop, and the bounded overflow,
and teaches the orchestrator and the shipped payloads to obey the verb instead of
hand-counting rounds.

## Requirements

- **The verb.** `mf-specs review decide --name <spec> --phase <P> [--mode guided|autonomous] [--json]`
  is read-only and exits `0` whenever it produces a decision (`2` on invalid
  arguments). It reads: every round attributed to the phase in every expected
  series (`<spec>` plus one `<spec>-<profile>` per declared reviewer profile),
  the latest round's findings and their severities/statuses, the phase budget
  from `phaseReviewBudget`, the phase's effective waiver, and the mode. It never
  writes and never infers the mode.
- **Output.** One text line and the same fields under `--json`:
  `decision`, `rounds <used>/<budget>`, `open <n> (critical <a>, major <b>, minor <c>, nit <d>)`,
  `reason <code>`, and a per-series breakdown. The decision is the strictest
  across the expected series.
- **Decision matrix**, evaluated in this order:
  1. an effective phase waiver → `waived` (`review.waived`)
  2. no round attributed to the phase in an expected series → `start` (`review.round-missing`)
  3. a round with no `- Phase:` attribution → `escalate` (`review.phase-unattributed`)
  4. zero open findings → `pass` (`review.clean`)
  5. every open finding is Minor/Nit → `fix-and-stop` (`review.minor-only`), regardless of remaining budget
  6. any open Critical/Major and `rounds < budget` → `rework` (`review.budget-remaining`)
  7. any open Critical/Major and `rounds >= budget`:
     - `--mode guided` → `escalate` (`review.escalate-cap`)
     - `--mode autonomous` and `rounds < budget + 1` → `overflow` (`review.overflow-eligible`)
     - otherwise → `escalate` (`review.overflow-exhausted`)
  - Severity parsing follows the review series grammar; an unparsable severity is
    `escalate` (`review.severity-unparsable`), never a silent Minor.
- **`fix-and-stop` closure.** The orchestrator may close a round with
  `- Disposition: minor-deferred` and `- Deferred: <ids>` in `## Metadata` only
  when every open finding is Minor/Nit. It records the evidence for each
  deferred fix in the phase `MEMORY.md` and opens a defect task for anything not
  fixed. `review-link` accepts `closed` or a valid `minor-deferred` closure as a
  passing round; a deferred Critical/Major is `review.deferred-severity` and
  never passes. Deferral is a closure, not a waiver: the findings keep their
  terminal dispositions in the round.
- **Overflow.** A round may carry `- Overflow: <reason>` and
  `- Overflow-authorized: autonomous|user` in `## Metadata`. `structure` and
  `next` stop reporting `review.budget-exceeded` for that round and report
  `review.overflow-exhausted` only when the authorization rules are broken:
  - autonomous: at most one overflow per phase per series (`budget + 1` rounds);
  - guided: every overflow carries `- Overflow-authorized: user` and the user
    decides each time (no fixed cap); `review decide --mode guided` returns
    `escalate` at the cap so the orchestrator asks before opening one.
- **Wire the orchestrator.** `packages/specs/prompts/spec-execute.json`, the
  installed `spec-execution-orchestrator` profile payload, and the
  `montflow-adversarial-review` skill (in `packages/reviews`) state the rule:
  call `review decide` after collecting findings and before dispatching a fixer
  or another reviewer, obey `start|pass|fix-and-stop|rework|overflow|escalate|waived`,
  and never compute rounds or severities by hand.
- **Tests.** A table-driven suite covers every matrix row, both modes, budgets
  1/2/3, multiple series (strictest wins), missing/unattributed rounds, an
  unparsable severity, a minor-deferred closure, a deferred Critical/Major
  error, one autonomous overflow, the second autonomous overflow, and a guided
  user-authorized overflow. The verb writes nothing (fixture mtime/content
  check). `structure`/`next` tests prove the budget exception is scoped to an
  authorized round.
- No task status, lock, or verdict is written by the verb.

## Completion

- [ ] `mf-specs review decide` exists, is read-only, and prints `decision`, `rounds`, `open`, `reason` (and JSON) for this spec
- [ ] Every matrix row is table-tested, including both modes and the profile-series strictest-wins rule
- [ ] `minor-deferred` closes a Minor/Nit-only round and a deferred Critical/Major is refused with `review.deferred-severity`
- [ ] Autonomous allows exactly one overflow, then `review.overflow-exhausted`; guided asks and accepts a user-authorized overflow
- [ ] `structure` and `next` no longer hard-error an authorized overflow, and still error an unauthorized one
- [ ] The shipped prompt and orchestrator profile call the verb instead of hand-counting
- [ ] `ts:check`, `lint:check`, `fmt:check`, `mf-specs:check`, and `mf-reviews:check` pass
