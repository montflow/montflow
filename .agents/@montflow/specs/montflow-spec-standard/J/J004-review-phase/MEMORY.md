# Memory

## Context

- Task J004 `review-phase` (type review, write-scope none); bound `claim --task J004` only, no status change.
- Scope: attack light where repo gate is needed despite task gates passing; confirm full enforces review + repo gate + audit line.
- Inputs: TASK.md, phase `J/MEMORY.md ## Execution Brief`, BOARD.md `# Board` (empty), MAILBOX.md absent; J001/J002/J003 per brief inline. No other MEMORYs, payloads, lockfiles, or rounds read.

## Progress

- Read `phaseVerification`/`review-policy` branches, `renderVerificationAudit`/`parseVerificationAudit`, sizing `resolve`/`mergedEntry`, lock/claim wiring.
- Ran read-only CLI to `/tmp/J004.log` (132 lines, 5 exits): `resolve --json J003`, `review decide --phase J --mode guided`, `lock --phase J`, `status`, `next`.
- No product edits; no `review decide` round created; no official/repo gate run (review task).

## Findings

### A. Attacks on light (repo gate needed but task gates pass)

1. **Cross-task break (Major) — NOT stopped.** Task A passes its own mechanical gate but breaks Task B/phase contract. Evidence: `phase.module.ts:815-817` light proves on `taskMechanical.every(pass)` only; comment `:723-725` says phase gate "not required."
2. **Phase-gate-only check (Critical) — NOT stopped.** A check declared only at phase level (owner `phase`) is skipped in light. Evidence: `phaseEvidence` collects `refs` then light branch ignores `refs`/`mechanical` entirely; phase-only integration never gates lock.
3. **Stale-result camouflage (Major) — NOT stopped by light.** Evidence: `phase.module.ts:786-801` `collect()` sets `pass = kind matches && verdict === 'pass'` on `latestResults`; no freshness/tree arg in this path, so an old PASS record locks until any other check fails.
4. **Whole-entry merge escape (Major) — NOT stopped.** Evidence: `sizing.module.ts:873-881` winning layer "replaces the whole entry"; `resolve:924,930` then applies `found.entry.verification ?? DEFAULT_VERIFICATION (light)`. A phase/spec model-only override shadows a repo `full` and silently drops to light.
5. **`inherit → light` default (Critical) — NOT stopped; code causes it.** Evidence: `sizing.module.ts:52,924` `DEFAULT_VERIFICATION='light'`, missing entry → light; `cli.sizing.module.ts:95` unknown size → light; `taskVerifications:117-121` therefore always supplies `light` to `phaseVerification`, so its conservative `missing → full` branch (`phase.module.ts:672`) is dead on the CLI path. A no-config spec resolves light and locks without review/repo gate.
6. **Close/lock actor without boundary gate (Major) — NOT stopped.** Evidence: `cli.claim.module.ts:656-671` review `--close` passes via `reviewDecisionPassed` when `phaseVerification === 'light'`; `review-policy.module.ts:348,371` short-circuits to `passed`; `cli.state.module.ts:404-405` light skips review blocker and `evidence.light` bypasses `reviewVerdict`. Orchestrator may never have run the repo-wide gate; CLI does not enforce it.

### B. Full mode + audit — CONFIRMED with one prompt finding

- `phaseVerification` (`phase.module.ts:666-673`): light iff **every non-review** task is light; review tasks never decide mode; empty map → full. Tests `phase.test.ts:374-421` pin all three.
- Full requires review: `review-policy.module.ts:265-269` waives only if `verification === 'light'`; else normal matrix; `reviewVerdict:365-378` additionally requires a closed round in every expected series (070 `passed === true`). `reviewDecisionPassed:348` passes only on waived/light/`pass`.
- Audit renders/parses: `phase.module.ts:684-703` `verification: <light|full> · model: <target>` with regex; tests `:424-443` round-trip both modes; J003 MEMORY carries `verification: light · model: opencode-go/crouton-alpha-free#max` (per brief).
- **Finding (Major): shipped prompt surface omits verification wording.** Grep `packages/specs/src/modules/prompt` returns only `tests/lean-contract.test.ts:62` `repo-wide gate once per phase boundary`, no `verification`/`light`/`full` contract. Enforcement lives only in CLI derivation; an agent following prompts alone would not learn to demand full or the boundary gate.
- **Verdict:** light is correctly wired but **does not force** the repo/boundary gate; six escape routes above stand. Full derivation itself is sound; default-light + whole-entry + prompt omission mean "full" must be declared explicitly per winning entry to be safe.

## Gates

- None run (review type, write-scope none). If a stage is subjective: future gate must re-run `lock --phase J` after J004 completes plus a phase-boundary repo gate before `lock` is confirmed.

## Open Questions

- Should `DEFAULT_VERIFICATION` flip to `full` or should `phaseVerification` treat `inherit` as `full` to close findings 4–5?
- Should light require an explicit opting entry per phase instead of a per-size default?
- Should shipped `spec-execute`/`spec-status` prompts name verification mode and the boundary-gate actor?

## Handoff

- Next: orchestrator decides disposition of 6 light gaps + prompt omission; `review decide --phase J` currently `waived · verification.light · 0/2` but hostile verdict is this file.
- Evidence: `/tmp/J004.log` — quote only:
  - `resolve … J003` exit 0: `{"verification":"light","target":"opencode-go/crouton-alpha-free#max",…}`
  - `review decide --phase J --mode guided` exit 0: `decision waived · rounds 0/2 · reason verification.light`
  - `lock --phase J` exit 1: `not locked J · montflow-spec-standard · task.in-progress` (expected while J004 in-progress)
  - `status` exit 0: `Phase J · … J001/J002/J003 ✓ … light`, `J004 • … light`; `next` exit 0: `state pending · phase J · budget 2 · review J:required · gate none · ready none`

## Deviations

- None. No `claim --start/--block/--close`, no `gate run/record`, no `mail`, no round created, no BOARD/MAILBOX writes.
