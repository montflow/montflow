# Review: montflow-spec-standard / 021

## Metadata
- Target: spec montflow-spec-standard phase K
- Round: 021
- Phase: K
- Type: standalone
- Isolation: isolated
- Max Attempts: 1
- Status: closed
- Created: 2026-11-06

## Findings

### F1 — Bare spec still resolves light and waives review/lock

- Severity: Critical
- Location: `packages/specs/src/modules/sizing/sizing.module.ts:52,924`, `packages/specs/src/apps/cli/cli.sizing.module.ts:95`
- Status: Escalated
- Attempts: 1
- First Seen: 021
- Problem: A bare store with no `sizing.json` resolves `inherit` + `light`, so `lock A` passes and `review decide A` is `waived` (`verification.light`).
- Impact: Any spec without config locks without review.
- Suggestion: Default absent config/entry to `full`; light requires an explicit opt-in entry.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Reviewer] 2026-11-06 — Hostile verdict.**

- Decision `review decide --phase K` is `waived` (`reason verification.light`), so this round records the K002 hostile verdict. Disposition is escalated to the user, who chose to file defects, close, and lock.

### F2 — Unsized tasks resolve light under an explicit-full store

- Severity: Critical
- Location: `packages/specs/src/apps/cli/cli.sizing.module.ts:95`, `packages/specs/src/modules/phase/phase.module.ts:672`
- Status: Escalated
- Attempts: 1
- First Seen: 021
- Problem: In a store whose sized tasks carry `verification: "full"`, unsized exploratory/defect tasks still resolve `light`, so `lock A` passes.
- Impact: A full store can still lock a phase whose work was never sized.
- Suggestion: Force all-unsized phases to `full`, or require explicit light per phase.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F3 — Whole-entry merge drops a less-specific full

- Severity: Major
- Location: `packages/specs/src/modules/sizing/sizing.module.ts:873-884,929-930`
- Status: Escalated
- Attempts: 1
- First Seen: 021
- Problem: A phase override carrying only `model`/`effort` discards a repo or spec `verification: "full"` and resolves `light`.
- Impact: Light is implicit where an explicit full was configured.
- Suggestion: Preserve the less-specific mode across whole-entry overrides, or require every entry to name its mode.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F4 — Light proof is vacuous with zero task gates

- Severity: Major
- Location: `packages/specs/src/modules/phase/phase.module.ts:817`
- Status: Escalated
- Attempts: 1
- First Seen: 021
- Problem: `taskMechanical.every(pass)` on an empty array proves, so a light phase with no task `GATES.md` locks with no mechanical evidence and no review.
- Impact: Light lock can stand on zero gate proof.
- Suggestion: Require at least one proven mechanical task gate for a light lock.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F5 — `summarize` defaults sizing to NO_SIZING (light)

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.status.module.ts:231`, `packages/specs/src/apps/cli/cli.create.module.ts:131`
- Status: Escalated
- Attempts: 1
- First Seen: 021
- Problem: Callers that omit sizing default to `NO_SIZING`, which resolves every task light, so `create` scaffolds a light phase by default.
- Impact: Sizing-less callers inherit light silently.
- Suggestion: Default the summary path to `full` unless a size entry exists.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F6 — Failed sizing load maps to light in check

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.check.module.ts:533-536`
- Status: Escalated
- Attempts: 1
- First Seen: 021
- Problem: `loadSizing` failure degrades to `NO_SIZING` (light); the run exits 1 via `rootIssues store.error`, so no false green, but the spec verdict is unsafe.
- Impact: An unreadable sizing file reads as light for downstream derivation.
- Suggestion: Treat a failed load as `full` for phase derivation.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F7 — Status prints declared review, not effective verification

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.status.module.ts:180-184`
- Status: Escalated
- Attempts: 1
- First Seen: 021
- Problem: The phase line says `review required` for a light phase; only the per-task column shows `light`.
- Impact: A reader can miss that review is waived in practice.
- Suggestion: Print the effective verification beside the phase review line.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F8 — Barrel re-export cycle for taskVerifications

- Severity: Nit
- Location: `packages/specs/src/apps/cli/cli.apps.module.ts`
- Status: Escalated
- Attempts: 1
- First Seen: 021
- Problem: `cli.claim`/`cli.review`/`cli.state` import `taskVerifications` from the `cli.apps` barrel that re-exports them (deferred use only, matching existing check style).
- Impact: A latent import cycle risk.
- Suggestion: Move the helper to a leaf module both sides can import.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F9 — Lock trusts GATE-RESULTS without freshness re-fingerprint

- Severity: Minor
- Location: `packages/specs/src/modules/phase/phase.module.ts`
- Status: Escalated
- Attempts: 1
- First Seen: 021
- Problem: `lock` trusts recorded passes without re-fingerprinting inputs, and light has no review backstop to catch camouflage.
- Impact: A stale PASS can lock light.
- Suggestion: Re-check freshness on the lock path or keep a review backstop for light.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

## Summary

- Critical: 2
- Major: 2
- Minor: 4
- Nit: 1
- In Review: 0
- Resolved: 0
- Won't Fix: 0
- Open: 0
- Escalated: 9
