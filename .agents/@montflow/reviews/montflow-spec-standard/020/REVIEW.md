# Review: montflow-spec-standard / 020

## Metadata
- Target: spec montflow-spec-standard phase J
- Round: 020
- Phase: J
- Type: standalone
- Isolation: isolated
- Max Attempts: 1
- Status: closed
- Created: 2026-11-06

## Findings

### F1 — Cross-task break passes task gates but breaks the phase contract

- Severity: Major
- Location: `packages/specs/src/modules/phase/phase.module.ts:815-817`
- Status: Escalated
- Problem: Light proves a phase on `taskMechanical.every(pass)` only; a task whose own gate passes can break a sibling or phase contract and the phase still locks.
- Impact: A phase can lock with an integration break no task gate catches.
- Suggestion: Require phase-shared evidence for integration points, or declare the cross-task gap accepted for light.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Reviewer] 2026-11-06 — Hostile verdict.**

- Decision `review decide --phase J` is `waived` (`reason verification.light`), so this round records the J004 hostile verdict rather than opening a fix loop. The seven findings are the J004 MEMORY verdict; disposition is escalated to the user, who chose to file defects, close, and lock.

### F2 — Phase-gate-only checks never gate a light phase

- Severity: Critical
- Location: `packages/specs/src/modules/phase/phase.module.ts:786-817`
- Status: Escalated
- Problem: A check declared only at phase level is collected in `refs` then ignored by the light branch, so an integration or repo-scope stage never gates light lock.
- Impact: Any correctness check owned solely by the phase gate is skipped for every light phase.
- Suggestion: Keep phase-scoped mechanical stages in the light proof, or declare them out of scope and document the gap.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F3 — Stale PASS records lock until another signal fails

- Severity: Major
- Location: `packages/specs/src/modules/phase/phase.module.ts:786-801`
- Status: Escalated
- Problem: `collect()` marks a stage passed from the latest `GATE-RESULTS.jsonl` entry with no freshness or tree argument on this path, so an old PASS record can lock a light phase after inputs change.
- Impact: A light phase can lock on history that no longer covers current inputs.
- Suggestion: Reuse the scheduler freshness check on this path, or declare stale acceptance for light.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F4 — Whole-entry merge silently drops a full to light

- Severity: Major
- Location: `packages/specs/src/modules/sizing/sizing.module.ts:873-881,924,930`
- Status: Escalated
- Problem: The winning layer replaces the whole entry and `resolve` then applies `entry.verification ?? DEFAULT_VERIFICATION` (`light`), so a model-only phase or spec override shadows a repo `full` and silently becomes light.
- Impact: A config intended as `full` can downgrade to `light` without a visible decision.
- Suggestion: Carry the repo mode through whole-entry merge when the winning entry omits `verification`, or require explicit mode on every entry.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F5 — `inherit` resolves to light and its conservative branch is dead

- Severity: Critical
- Location: `packages/specs/src/modules/sizing/sizing.module.ts:52,924`, `packages/specs/src/apps/cli/cli.sizing.module.ts:95`, `packages/specs/src/modules/phase/phase.module.ts:672`
- Status: Escalated
- Problem: `DEFAULT_VERIFICATION` is `light`, a missing size resolves to `light`, and `taskVerifications` always supplies `light` on the CLI path, so `phaseVerification`'s `missing → full` branch never fires.
- Impact: A no-config or unresolved spec locks without review or repo gate by default.
- Suggestion: Default unresolved or `inherit` to `full`, or require an explicit opting entry per phase for light.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F6 — Close and lock can pass without any boundary gate

- Severity: Major
- Location: `packages/specs/src/apps/cli/cli.claim.module.ts:656-671`, `packages/specs/src/modules/review-policy/review-policy.module.ts:348,371`, `packages/specs/src/apps/cli/cli.state.module.ts:404-405`
- Status: Escalated
- Problem: A light `claim --close` and `lock` pass via `reviewDecisionPassed` short-circuit and the `light` evidence bypass; the CLI never enforces that the orchestrator ran the repo-wide phase-boundary gate.
- Impact: A light phase can lock with zero boundary evidence.
- Suggestion: Enforce a boundary-gate proof for light lock, or declare boundary run a manual discipline.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F7 — Shipped prompts omit the verification contract

- Severity: Major
- Location: `packages/specs/prompts/spec-execute.json`
- Status: Escalated
- Problem: The prompt surface carries no `verification` or `light`/`full` contract; an agent following prompts alone cannot learn to demand full or the boundary gate.
- Impact: Enforcement lives only in CLI derivation while the shipped guidance is silent.
- Suggestion: Name the mode, the boundary-gate actor, and the light/full split in the execution and status prompts.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

## Summary

- Critical: 2
- Major: 5
- Minor: 0
- Nit: 0
- Open: 7
- Escalated: 7
