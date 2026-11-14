# Memory

## Context

Task C009 implements the severity-aware review-cycle policy on top of C001's
derived state, C005's verb rail, and C006's shipped payloads. The contract is the
`TASK.md` decision matrix; the deliverables are the read-only `mf-specs review
decide` verb, the `minor-deferred` closure, the bounded overflow, the
`structure`/`next` budget exception, and the prompt/profile/skill wiring that
makes every orchestrator call the verb instead of counting rounds by hand.

Scope: review-policy source and tests, the review-link grammar extensions, the
spec store's round snapshot, the CLI verb, the named prompt/profile/skill files,
their generated payloads and doctor-installed copies, and this `MEMORY.md`.
Not touched: `SPEC.md`, any `TASK.md` status or checkbox, `GATES.md`, `PHASE.md`,
the review store, locks, another task's files, or the docs/ledger (C007).

## Progress

- 2026-11-03: read `TASK.md`, `GATES.md`, `MEMORY.md`, the live review series
  (`REVIEW.md`, `001/REVIEW.md` for the round grammar), and the C001/C005/C006
  handoffs.
- 2026-11-03: extended `modules/review-link` with round metadata, finding,
  overflow, deferral and closure parsing; added `review.overflow-exhausted`,
  `review.deferred-severity`, and an unconditional `verifyDeferrals`.
- 2026-11-03: added `modules/review-policy` with the ordered decision matrix,
  strictest-wins across expected series, and the text/JSON renderers.
- 2026-11-03: enriched `SpecStore.reviewSeries` with findings, deferral and
  overflow evidence, omitting empty fields so existing snapshots keep their
  shape.
- 2026-11-03: added `cli.review.module.ts` (`review decide`), registered the
  `review` command group, and exported `DecideUsageError`, `decideRun`, and
  `USAGE_EXIT_CODE` so the exit-2 path is testable.
- 2026-11-03: wired `packages/specs/prompts/spec-execute.json`, the
  `spec-execution-orchestrator` profile, and the `montflow-adversarial-review`
  skill to `review decide`, `minor-deferred`, and the overflow metadata.
- 2026-11-03: regenerated the specs, reviews and profiles embedded payloads and
  repaired the installed copies with each package's `doctor`.
- 2026-11-03: added table tests for every matrix row (budgets 1/2/3, both modes,
  multi-series strictest-wins), review-link closure/overflow tests, structure
  overflow/closure tests, and CLI read-only/usage tests.
- 2026-11-03: ran the seven gate commands; all exit 0.

## Findings

### Verb contract

`mf-specs review decide --name <spec> --phase <P> [--mode guided|autonomous]
[--json]` reads the phase tasks' derived budget, the phase's effective waiver
(`phaseEvidence(...).waived`), the reviewer profiles on the phase's review task,
and every review series the store reports. It prints:

```
decision <decision>
rounds <used>/<budget>
open <n> (critical a, major b, minor c, nit d)
reason <code>
series <name>: decision <d>, <n> round(s)/<budget>, open ..., reason <code>
```

`--json` prints the same fields including the `series` array. It exits 0 on a
decision and 2 on an invalid invocation; it never writes state and never reads a
mode from anywhere but `--mode`. An omitted `--mode` takes the conservative
`guided` branch (which escalates at the cap) rather than silently granting an
overflow.

### Decision matrix (evaluated in this order)

1. effective waiver → `waived` / `review.waived`
2. no attributed round in an expected series → `start` / `review.round-missing`
3. an unattributed round in an expected series → `escalate` /
   `review.phase-unattributed`
4. zero open findings → `pass` / `review.clean`
5. every open finding Minor/Nit → `fix-and-stop` / `review.minor-only`
6. open Critical/Major and `rounds < budget` → `rework` /
   `review.budget-remaining`
7. open Critical/Major and `rounds >= budget`:
   - guided → `escalate` / `review.escalate-cap`
   - autonomous and `rounds < budget + 1` → `overflow` /
     `review.overflow-eligible`
   - otherwise → `escalate` / `review.overflow-exhausted`
- an open finding with an unparsable severity → `escalate` /
  `review.severity-unparsable`, never a silent Minor.

Rows 2 and 3 are evaluated per series in matrix order and combined by
strictness: `escalate > overflow > rework > start > fix-and-stop > pass >
waived`. `latestRoundForPhase` selects the highest-numbered attributed round per
series; only its findings feed the open counts. `open` is the sum of the latest
round in every expected series. Only `Resolved` and `Won't Fix` are terminal;
`Open`, `In Review` and `Escalated` count as open, and an unrecognized status
stays open so it can never pass silently.

### `minor-deferred` closure

A round with `- Disposition: minor-deferred` and `- Deferred: F1, F3` in
`## Metadata` passes only when every named finding exists and is Minor/Nit.
`roundPassed` accepts either `- Status: closed` or a valid closure, so
`passedPhases`/`lock`/`state` treat it as a pass. A deferred Critical/Major is
`review.deferred-severity` and the closure never passes. `verifyDeferrals` runs
in `verifySpecTree` unconditionally (not gated by `requireRounds`), so `check`
and `next` report the code even for a disk-driven run; `check` on the fixture
confirms it.

### Overflow

A round past the budget is legal only with `- Overflow: <reason>` and
`- Overflow-authorized: autonomous|user`. `verifyBudgets` accepts an authorized
overflow; autonomous is capped at one overflow per phase per series
(`budget + 1`), guided has no fixed cap but every overflow must be
`user`-authorized. A round past the budget with no `Overflow` line stays
`review.budget-exceeded`; an `Overflow` line with an empty reason or a missing/
unknown authorization is `review.overflow-exhausted`.

### Mode source and budget

The budget comes from `phaseReviewBudget` over the phase's task sizes. The mode
is only the caller's flag. `decide` is pure; the CLI builds its input from one
store snapshot and one review-series read.

## Open Questions

- None blocking. The `--mode` default is deliberately `guided` (the conservative
  branch) and documented; if the orchestrator ever needs to refuse an omitted
  mode at the cap instead, that is a one-line change in
  `cli.review.module.ts` (`DEFAULT_REVIEW_MODE`).
- The policy treats an `Escalated` finding as open so it can never pass
  silently; the matrix has no dedicated `escalated` row. A future decision could
  map it directly to `escalate`, but that code is not in the C009 contract.

## Handoff

- **C007** documents this verb and the policy; this task did not touch docs or
  the ledger. The public contract to document is the matrix above, the
  `minor-deferred` closure, and the overflow metadata.
- **C099** reviews the implementation. The live series has no phase-C round, so
  `review decide --phase C` returns `start`; the matrix, closure and overflow
  evidence live in the tests and in the temp-store demos below. Do not edit the
  review store to manufacture a round.
- **Orchestrator** can rely on the shipped prompt/profile calling
  `mf-specs review decide` after every round and before a fixer or another
  reviewer. The installed copies were repaired with doctor.

## Deviations

- The decision verb is a new `review` command group registered as a root
  subcommand only; the slash-command surface and TUI parity remain C008's scope.
- `verifyDeferrals` was split out of `verify` so the closure error is reported
  even when `check` passes `requireRounds: false` for historical specs.
- Existing tests that asserted the old prompt's hand-counting sentences were
  updated to the new `review decide` wording
  (`prompt.test.ts`, `author-execute.test.ts`, `spec-tools.test.ts`,
  `run-slash.test.ts`), the same class of test edit C006 made when it changed
  prompt text.
- No `BOARD.md`/`MAILBOX.md` was written; this task's write scope is source,
  tests, the named payload files and copies, and this `MEMORY.md`.

## Gate evidence

All run from `/home/daniel/dev/montflow/spec-standard` on 2026-11-03.

```
$ bun run --cwd packages/specs test -- --run
Test Files  128 passed (128)
     Tests  1765 passed (1765)
Type Errors  no errors
EXIT=0

$ bun run --cwd packages/reviews test
Test Files  24 passed (24)
     Tests  160 passed (160)
Type Errors  no errors
EXIT=0

$ bun run mf-specs:check
14 specs · 0 failed · 0 issues · 13 warnings
✓ spec skills and prompts are installed and up to date.
✓ spec-execute: up to date → .agents/@montflow/prompts/spec-execute.json
✓ micro/standard/full: up to date
EXIT=0

$ bun run mf-reviews:check
2 files · 0 issues
✓ review skills are installed and up to date.
✓ montflow-adversarial-review: up to date
✓ montflow-addressing-adversarial-review: up to date
EXIT=0

$ bun run ts:check
 Tasks:    17 successful, 17 total
EXIT=0

$ bun run lint:check
 Tasks:    17 successful, 17 total
EXIT=0

$ bun run fmt:check
 Tasks:    17 successful, 17 total
EXIT=0
```

## Completion evidence

### 1. `review decide` exists, is read-only, and prints the four fields for this spec

Live spec (no phase-C round):

```
$ bun run --cwd packages/specs cli review decide --name montflow-spec-standard --phase C --dir $PWD
decision start
rounds 0/3
open 0 (critical 0, major 0, minor 0, nit 0)
reason review.round-missing
series montflow-spec-standard: decision start, 0 rounds/3, open 0 (...), reason review.round-missing
EXIT=0
```

`--mode autonomous --json` returns the same decision with the per-series array
(`budget: 3`, `rounds: 0`, `series[0].series: "montflow-spec-standard"`),
`EXIT=0`.

Temp copy with a phase-C round (`/tmp/opencode/c009-live`, copied spec + review
series plus `004/REVIEW.md` with an open Major):

```
$ ... review decide --name montflow-spec-standard --phase C --mode guided --dir /tmp/opencode/c009-live
decision rework
rounds 1/3
open 1 (critical 0, major 1, minor 0, nit 0)
reason review.budget-remaining
series montflow-spec-standard: decision rework, 1 round/3, ...
EXIT=0
```

`--mode autonomous --json` returns `"decision": "rework"`, `"reason":
"review.budget-remaining"`, `"rounds": 1`, `"budget": 3`, and the same open
counts and series entry.

No-write proof: a recursive `sha256sum` and `find -printf '%T@ %s %p'` snapshot
of `/tmp/opencode/c009-live` before and after the JSON run diffed empty:

```
NO-WRITE: content and mtimes unchanged
```

Invalid arguments:

```
$ ... review decide --name montflow-spec-standard --phase ZZ --dir $PWD
code cli.invalid-argument · field --phase · problem "Phase 'ZZ' does not exist ..."
EXIT=2

$ ... review decide --name montflow-spec-standard --phase C --mode bogus --dir $PWD
code cli.invalid-argument · field --mode · problem "'bogus' is not a review mode."
EXIT=2
```

Missing `--name`/`--phase` also return exit 2 (`reviewDecide usage` tests).

### 2. Every matrix row is table-tested; both modes and strictest-wins

`packages/specs/src/modules/review-policy/tests/review-policy.test.ts` is a
table over 19 cases covering `waived`, `start`, `phase-unattributed`, `clean`,
`minor-only`, `budget-remaining`, `escalate-cap`, `overflow-eligible`,
`overflow-exhausted`, unparsable severity (unknown and empty), budgets 1/2/3,
both modes, a missing profile series, and three multi-series strictest-wins
cases. `review-link.test.ts` covers the parsing/closure grammar and
`verify-spec-tree.test.ts` covers the `structure` path. Suite result: 1765
passed, 0 type errors.

### 3. `minor-deferred` closure

Temp fixture `/tmp/opencode/c009-closure` (phase A, budget 1, round 001 with
`- Disposition: minor-deferred` + `- Deferred: F1` and F1 `Minor`/`Won't Fix`):

```
$ ... check --dir /tmp/opencode/c009-closure --name mock-history
1 spec · 0 failed · 0 issues · 1 warning
$ ... review decide --name mock-history --phase A --mode guided --dir /tmp/opencode/c009-closure
decision pass
rounds 1/1
open 0 (critical 0, major 0, minor 0, nit 0)
reason review.clean
```

Changing F1 to `Major`:

```
$ ... check --dir /tmp/opencode/c009-closure --name mock-history
  code     review.deferred-severity
1 spec · 1 failed · 1 issue · 1 warning

$ ... lock --name mock-history --phase A --dir /tmp/opencode/c009-closure
not locked A · mock-history
  phase.review-missing
EXIT=1
```

The round is not a passing closure; `verifyDeferrals` reports the code even
though `check` uses `requireRounds: false`.

### 4. Autonomous one overflow, second exhausted; guided asks and accepts user authorization

On `/tmp/opencode/c009-live` with three open-Major rounds (004–006), budget 3:

```
$ ... review decide --phase C --mode guided
decision escalate · rounds 3/3 · reason review.escalate-cap
$ ... review decide --phase C --mode autonomous
decision overflow · rounds 3/3 · reason review.overflow-eligible
```

Adding round 007 with `- Overflow: ...` and
`- Overflow-authorized: autonomous`:

```
$ ... review decide --mode autonomous
decision escalate · rounds 4/3 · reason review.overflow-exhausted
```

`check` on the authorized round: `1 spec · 0 failed · 0 issues`. Removing the
`Overflow` declaration: `code review.budget-exceeded`. Keeping `Overflow` but
removing the authorization: `code review.overflow-exhausted`. Changing the
authorization to `user`: `0 issues`. The second autonomous overflow is also
covered by the structure test.

### 5. `structure` and `next` budget exception

`next` on the same temp spec:

```
$ ... next --name montflow-spec-standard --dir /tmp/opencode/c009-live
(user-authorized overflow) EXIT=0
(broken authorization)       code review.overflow-exhausted · EXIT=1
```

`structure` tests cover: authorized autonomous overflow → `[]`; no overflow
declaration → `review.budget-exceeded`; second autonomous → 
`review.overflow-exhausted`; valid `minor-deferred` → `[]`; deferred Major →
`review.deferred-severity`.

### 6. Shipped surfaces call the verb

`grep -c "review decide"`:

- `.agents/@montflow/prompts/spec-execute.json` → 1 (same in the package copy)
- `.agents/@montflow/profiles/spec-execution-orchestrator/PROFILE.md` → 2
- `.agents/skills/montflow-adversarial-review/SKILL.md` → 1

The installed copies are byte-identical to the package sources; doctor reports
them current. The skill names `- Disposition: minor-deferred`, `- Deferred:`,
`- Overflow:`, and `- Overflow-authorized: autonomous | user`.

## Orchestrator Verification (2026-11-03)

Independent gate run from the repo root after the worker receipt:

```
$ bun run --cwd packages/specs test -- --run
 Test Files  128 passed (128)
      Tests  1765 passed (1765)
Type Errors  no errors
EXIT=0

$ bun run --cwd packages/reviews test
 Test Files  24 passed (24)
      Tests  160 passed (160)
EXIT=0

$ bun run mf-specs:check  -> 14 specs · 0 failed · 0 issues · 13 warnings, EXIT=0
$ bun run mf-reviews:check -> 2 files · 0 issues, EXIT=0
$ bun run mf:gate:fast     -> lint/fmt/ts 17/17, mf:check 8/8, EXIT=0

$ review decide --name montflow-spec-standard --phase C --mode guided
decision start
rounds 0/3
open 0 (critical 0, major 0, minor 0, nit 0)
reason review.round-missing
series montflow-spec-standard: ... EXIT=0
$ review decide ... --json  -> same fields plus series breakdown, EXIT=0
$ review decide ... --phase ZZ -> cli.invalid-argument, EXIT=2
```

All completion items are supported; task recorded complete by the orchestrator.
