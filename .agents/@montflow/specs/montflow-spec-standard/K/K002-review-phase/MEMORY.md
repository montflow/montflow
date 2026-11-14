# Memory
## Context

- K002 hostile review of K001 (light-fixture regression fix).
- Brief: fixtures explicit full, light per-entry default, barrel restored, check
  NO_SIZING swallow, compact pins `phase  light`; K/PHASE: "bare specs must
  keep full review/lock/check behavior; light opt-in per size entry".

## Progress

- Bound K002; read TASK, K/MEMORY brief, K/BOARD; no MAILBOX.
- Read K diff (24 files) and scoped tests.
- Proved with temp stores `/tmp/K002-bare` (no sizing.json), `/tmp/K002-full`
  (explicit full), plus the real store; full output in `/tmp/K002.log`.

## Findings

1. **Critical — bare spec still light, review waived.** `DEFAULT_VERIFICATION =
   'light'` (sizing.module.ts:52) is returned for a missing entry (:924) and a
   missing size (cli.sizing.module.ts:95). CLI: bare resolve ->
   `{"target":"inherit","verification":"light"}`; `lock A` -> `locked A` exit 0;
   `review decide A` -> `decision waived`, `reason verification.light` exit 0.
   Contradicts K/PHASE; K001 edited five fixtures instead of this branch. NOT
   stopped.
2. **Major — unsized tasks light under explicit full.** Full store `lock A` ->
   `locked A` (A's exploratory/defect tasks have no size); `lock B` and
   `review decide B` correctly fail `phase.review-missing` /
   `review.round-missing`. Full cannot be forced for unsized phases. NOT stopped.
3. **Major — whole-entry merge drops full.** A phase override of only
   model/effort loses a less specific `verification: full`
   (sizing.module.ts:873-884, 929-930); the new test pins "defaults to light
   instead of inheriting full". Light is implicit, not explicit opt-in. NOT
   stopped.
4. **Major — light proof vacuous with zero task gates.**
   `taskMechanical.every(pass)` on an empty array proves (phase.module.ts:817);
   a light phase with no GATES.md locks with no gate and no review. NOT stopped.
5. **Minor — `summarize` defaults `sizing = NO_SIZING`** (cli.status.module.ts:231),
   making any sizing-less caller light; `create` is one (cli.create.module.ts:131).
6. **Minor — check maps failed `loadSizing` to `NO_SIZING`** ->
   light (cli.check.module.ts:533-536). rootIssues reports the read error and
   exits 1, so no false green, but the spec verdict is unsafe. Partial stop.
7. **Minor — status prints declared, not effective, review.** Phase line says
   `review required` for a light phase (cli.status.module.ts:180-184); only the
   per-task column shows `light`. NOT stopped.
8. **Nit — barrel cycle.** claim/review/state import `taskVerifications` from
   `cli.apps`, which re-exports them (57/31/52). Deferred use only; matches
   existing check style.
9. **Minor (pre-existing, sharpened) — lock trusts GATE-RESULTS without check's
   freshness re-fingerprint**, and light has no review backstop.

## Confirmations

- Explicit full only in claim, migrate, review-decide, review-gate, run-slash;
  grep-confirmed.
- claim/review/state route via `cli.apps`; no direct `cli.sizing` import.
- NO_SIZING swallow present; compact tests pin `... phase  light` and
  `... verification light`.
- E002 + I003 green is dependency evidence, not re-run; no new stale camouflage.

## Gates
- No official/task/repo gate. Read-only CLI only: resolve, review decide, lock,
  status, next, check on /tmp copies; log `/tmp/K002.log`. Required commands
  lacked `--dir`/`--name`; rerun with them plus bare/full runs.

## Open Questions

- Absent config/entry -> full (K/PHASE) or light (SPEC.md)? Owner must decide;
  K's later defect objective should win. Should all-unsized phases be forceable
  to full?

## Handoff

- Do not accept K001. Fix: absent entry/size -> full; light requires explicit
  mode; preserve full across whole-entry overrides; require >=1 task mechanical
  gate for light; default `summarize` to full; add bare-spec lock/review tests.
- Verdict: **NOT APPROVED** (2 Critical, 3 Major).

## Deviations

- Added `--dir`/`--name`; experiments in /tmp copies; no product edits.
