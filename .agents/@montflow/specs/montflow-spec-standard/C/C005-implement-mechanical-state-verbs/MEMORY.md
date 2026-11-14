# Memory

## Context

C005 ships the remaining mechanical state generators on top of C001–C004:
`init`, `new-phase`, `new-task`, `stamp`, `claim`, `lock`, `waiver`, `tier`,
the `next` extension, `migrate --include-complete`, and the live-store v2 wave.
It consumes B003's tier contract, B004's `PHASE.md`/lock/claim model, and B005's
exact verb signatures and failure codes; it does not re-specify `state`, `next`,
`status`, `list`, or `create`.

In scope: `packages/specs` source/tests, the shipped prompts and the
`montflow-create-specs` skill, their embedded payload and installed copies, the
`migrate --all` output in the live store, `.gitignore`, and this `MEMORY.md`.
Out of scope and left to siblings: C006 tier/profile payload content, C007 docs
and the ledger, C008 slash/TUI parity, C009 review policy.

The working tree already held uncommitted C001–C004 task records, their
`SPEC.md` rows, their prompt/payload files, and the C002/C003 gate/mail/channel
sources when this run started; those were preserved.

## Progress

- 2026-11-03: read C005 `TASK.md`/`GATES.md`/`MEMORY.md`, C001–C004 memories,
  B003 F1–F7, B004 F0–F12, and B005 F1–F8.
- 2026-11-03: added `modules/tier` (enum, contract, waiver predicate, split
  shape), `modules/creation` (`## Creation` read/render), and `modules/init`
  (default plans, allocation, tier-contract validation, tree render).
- 2026-11-03: added the claim transaction (`commitTransaction`,
  temp-then-rename with rollback), the registry lock, status/row/phase writers,
  and the `claim` engine plus CLI.
- 2026-11-03: added `init`, `new-phase`, `new-task`, `stamp`, `tier`, `lock`,
  and `waiver` CLI verbs; registered them in the root command; extended
  `next` to `sortKey` ordering.
- 2026-11-03: added `migrate --include-complete` and duplicate-id renumbering.
- 2026-11-03: added tier paths to `doctor.paths`, `.runtime/` to `.gitignore`,
  and applied the tier `records-only` predicate to `phaseEvidence`.
- 2026-11-03: taught `spec-execute` the new generators (claim/lock/stamp) and
  removed hand-typed status/lock instructions from `spec-execute` and
  `montflow-create-specs`; regenerated the payload and repaired the installed
  copies with `mf-specs doctor`.
- 2026-11-03: ran `mf-specs migrate --all` over `.agents/@montflow/specs`;
  recorded the per-spec result below.
- 2026-11-03: added module/CLI tests for init plans, claim atomicity and
  authority, tier/stamp/lock/waiver, next ordering, and migrate fixtures; ran
  all five gates.

## Findings

### Verb signatures and codes (B005 F1)

| Verb | Signature | Writes |
| --- | --- | --- |
| `init` | `--name --tier [--author] [--description] [--workspace-type] [--phase <objective>]... [--task <PHASE>:<name>:<type>[:<size>][:after=...]]... [--review <PHASE>:<required|waived>]... [--review-reason <PHASE>:<line>]... [--reviewer-profiles] [--dir]` | `SPEC.md` (`## Creation`, `spec-version: 2`), each `PHASE.md`/`MEMORY.md`/`BOARD.md`, `GATES.md`, `TASK.md`/`MEMORY.md`/`MAILBOX.md` per contract |
| `new-phase` | `--name --objective [--review] [--review-reason] [--gate] [--gate-judge] [--board|--no-board] [--dir]` | next `PHASE.md`, phase `MEMORY.md`, optional phase `GATES.md`/`BOARD.md` |
| `new-task` | `--name --phase --task --type [--size] [--gates] [--depends-on] [--related-tasks] [--originator] [--finding-ref] [--reviewer-profiles] [--description] [--requirement]... [--dir]` | next `TASK.md`, `MEMORY.md`, optional `GATES.md`, sorted `SPEC.md` row, waived-phase evidence |
| `stamp` | `[--format instant|date]` | nothing; one UTC clock |
| `claim` | `--name --task [--session] [--orchestrator] [--start|--close|--block --reason|--release [--force]] [--dir]` | registry only for bind/release; task status + `SPEC.md` row + `PHASE.md` mirror + registry for transitions |
| `lock` | `--name --phase [--dir]` | nothing |
| `waiver` | `--name --phase (--waived --reason | --required) [--dir]` | `PHASE.md` `review`/`review-reason`/`review-evidence` |
| `tier` | `<micro|standard|full> [--dir]` (positional) | nothing; installed file verbatim |
| `migrate` | `--name|--all [--dry-run] [--include-complete]` | flat moves, `PHASE.md`/phase `MEMORY.md`, re-id rewrites, `spec-version: 2` |

Codes are exported from `INIT_CODES`, `CLAIM_CODES`, `WAIVER_CODES`, `CODES`
(tier), and the existing `SURFACE_CODES`. Every refusal renders a code, path,
field, problem, expected/actual, fix, and rerun.

### `init` tier contract

- Defaults: `micro`/`standard` one `A:implement:execution:medium`; `full`
  `A:explore:exploratory:medium` + `B:implement:execution:medium` with B
  depending on A. `micro` defaults to a waiver with B005's reason; `standard`
  and `full` default to required. Phase and task ids are allocated from plan
  order (`A`, `B`, …; `A001`, `A002`, …), never from argv.
- Rejections implemented with B005's codes: `init.exploration-missing`,
  `init.exploration-forbidden`, `init.exploration-count`,
  `init.exploration-placement`, `init.gate-kind`, `init.waiver-policy`
  (`micro` exempt from `records-only`; `full` uses `tier.waiver-forbidden`),
  `init.review-task`, `init.review-type`, `init.review-reason`,
  `init.phase-count`, `init.task-ceiling`, `init.phase-unknown`,
  `init.task-duplicate`, `init.depends-unknown`, `init.depends-ambiguous`,
  `task.review-waived`, `init.exists`.
- Generated review tasks exist exactly for non-waived phases; a waived phase
  records `review-evidence` for every stage it generated (`A001:0`, `phase:0`).
- `## Creation` is written as `tier: <tier>`, `questions 0/<budget>`,
  `unresolved: none`.

### `claim`

- Forms: default bind, `--orchestrator`, `--start` (`pending → in-progress`),
  `--block --reason` (`pending|in-progress → blocked`), `--close`
  (`in-progress → complete`), orchestrator `--release`
  (`blocked|in-progress → pending`), worker `--release` (own binding only,
  status unchanged). `--force` is accepted only with `--release` or
  `--orchestrator`.
- Authority: `holdsOrchestrator` gates `--start`, `--block`, `--close`, a
  resetting `--release`, `--force`, and `--orchestrator` replacement. A worker
  gets `claim.not-orchestrator`; a worker release of another binding is
  `claim.not-owner`.
- Preconditions before any write: spec exists/readable/not complete, task
  exists, `SPEC.md` row exists (`claim.row-missing`), dependencies complete
  (`claim.not-ready`), legal transition (`claim.invalid-transition`), block
  reason, close completion checklist (`claim.completion-unchecked`) and
  mechanical results (`claim.gate-unproven` via C002's reader).
- Transaction: each record is staged to a sibling temp and renamed
  `TASK.md → SPEC.md → PHASE.md → registry`; a failed rename restores every
  renamed target from saved bytes (or removes a created file) and deletes the
  remaining temps. Registry read-modify-write runs under `claims.lock`
  (`wx`, 25 ms retry, 5 s cap, `claim.locked` on timeout). `--close` derives the
  spec status from the resulting task statuses, so the last close writes
  `status: complete`.

### `lock`, `waiver`, `tier`, `next`, `migrate`

- `lock` writes nothing. It derives `complete AND proven AND (closed round OR
  effective waiver)`, prints `locked <phase>` at exit 0, or one blocker code per
  line (`task.pending`, `gate.unproven`, `phase.review-missing`,
  `phase.waiver-unproven`, …) at exit 1. A frozen v1 phase still reads; it has
  no review decision record, so only a closed round completes it.
- `waiver` recomputes evidence from the phase `GATES.md` then task gates in
  sort-key/stage order, returns `waiver.no-stages`,
  `waiver.unclassified-stage`, `waiver.waiver-policy`, `phase.locked`,
  `phase.waiver-with-review-task`, or `waiver.invalid-reason` before writing,
  and preserves every other `PHASE.md` byte. `--required` clears reason and
  evidence.
- `tier` is positional, validates the enum (`tier.unknown`), requires the
  installed copy (`tier.missing`), compares the packaged copy (`tier.stale`),
  and prints the installed bytes and nothing else. The package/installed files
  are C006's; before C006 both are absent, so the live CLI reports `tier.missing`
  and the success path is proven with the injected fixture directories.
- `next` keeps its shipped signature and active-phase rule, now ordering the
  ready set by `sortKey` (so `A002` precedes `A010`) instead of string order.
- `migrate --include-complete` opts a complete frozen spec into the upgrade;
  without it the spec is `frozen`. A flat tree whose task directories collide on
  an id is renumbered: the moved `TASK.md` `id` and its `SPEC.md` row are
  rewritten (`oldId`/`newId` on the move), the rest of the bytes are preserved,
  and the post-write verifier decides the result. A version bump without the
  transformation is still rejected by `spec.version-untransformed`.

## Gates

Commands run from the repo root on 2026-11-03; logs are in
`/tmp/opencode/c005-gates/` (`test-final.log`, `final-*.log`). Excerpts are
verbatim.

### `bun run --cwd packages/specs test -- --run`

Exit code: 0.

```
 Test Files  122 passed (122)
      Tests  1645 passed (1645)
Type Errors  no errors
```

New coverage: `modules/init/tests/init.test.ts` (tier plans, allocation,
exploration rules, waivers, micro lock, empty/duplicate phases),
`modules/claim/tests/claim.test.ts` (status/row/phase writers, transaction
rollback, lock cleanup), `apps/cli/tests/claim.test.ts` (full graph, taken,
worker authority, worker bind/release, close refusals, forced rollback,
micro lock), `apps/cli/tests/state.test.ts` (tier success/stale/unknown, stamp,
premature lock, frozen v1 lock, waived evidence, waiver policy, new-task ids),
`apps/cli/tests/next-order.test.ts` (sort key and dependency ordering), and
`apps/cli/tests/migrate.test.ts` (re-id, include-complete, existing fixtures).

### `bun run mf-specs:check`

Exit code: 0.

```
14 specs · 0 failed · 0 issues · 13 warnings
✓ spec skills and prompts are installed and up to date.
✓ montflow-create-specs: up to date → /home/daniel/dev/montflow/spec-standard/.agents/skills/montflow-create-specs
✓ montflow-find-specs: up to date → /home/daniel/dev/montflow/spec-standard/.agents/skills/montflow-find-specs
✓ spec-create: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-create.json
✓ spec-execute: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-execute.json
✓ spec-sizing: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-sizing.json
```

The 13 warnings are 12 frozen v1 `spec.version-outdated` warnings plus
`phase.review-task-missing` on `montflow-spec-standard/D/PHASE.md` (the D phase
has no historical review task; migrated as `review: required`, warning only).

### `bun run ts:check`

Exit code: 0.

```
 Tasks:    17 successful, 17 total
  Time:    866ms
```

### `bun run lint:check`

Exit code: 0.

```
 Tasks:    17 successful, 17 total
  Time:    439ms
```

### `bun run fmt:check`

Exit code: 0.

```
 Tasks:    17 successful, 17 total
  Time:    534ms
```

## Completion evidence

A throwaway workspace `/tmp/opencode/c005-demo` holds `demo-micro`,
`demo-standard`, `demo-full`, and `demo-waived`; `/tmp/opencode/c005-tier`
holds the injected tier fixture; `/tmp/opencode/c005-frozen` holds a copy of a
frozen spec.

### Every verb exercised

```
$ mf-specs init --dir /tmp/opencode/c005-demo --name demo-micro --tier micro
✓ created 'demo-micro' · tier micro · phases A · 1 task
  SPEC.md
  A/PHASE.md
  A/MEMORY.md
  A/A001-implement/TASK.md
  A/A001-implement/MEMORY.md
  A/A001-implement/GATES.md

$ mf-specs check --dir /tmp/opencode/c005-demo --name demo-micro
1 spec · 0 failed · 0 issues

$ mf-specs init ... --name demo-standard --tier standard
✓ created 'demo-standard' · tier standard · phases A · 2 tasks
$ mf-specs check ... --name demo-standard
1 spec · 0 failed · 0 issues

$ mf-specs init ... --name demo-full --tier full
✓ created 'demo-full' · tier full · phases A,B · 4 tasks
$ mf-specs check ... --name demo-full
1 spec · 0 failed · 0 issues

$ mf-specs stamp
2026-11-03T13:20:44Z
$ mf-specs stamp --format date
2026-11-03
$ mf-specs stamp --format epoch
code     cli.invalid-argument
problem  Unknown stamp format 'epoch'.

$ mf-specs tier split --dir /tmp/opencode/c005-demo
code     tier.unknown
problem  'split' is not a tier.
expected micro, standard, full
actual   split
$ mf-specs tier micro --dir /tmp/opencode/c005-demo
code     tier.missing
path     /tmp/opencode/c005-demo/.agents/@montflow/tiers/micro.md
problem  The installed tier file '.../tiers/micro.md' is missing.
```

`tier` success path (fixture dirs, because C006 owns the packaged files):

```
$ bun -e "... readTier({tier:'micro', installedDir:'/tmp/opencode/c005-tier/installed',
                        shippedDir:'/tmp/opencode/c005-tier/shipped'}) ..."
---
tier: micro
---

# Tier: micro

This run may ask at most 0 questions.
```

`new-phase` and `new-task`:

```
$ mf-specs new-phase --dir /tmp/opencode/c005-demo --name demo-standard --objective "Ship the second slice" --review required
✓ added phase B · demo-standard
  B/PHASE.md
  B/MEMORY.md
  B/BOARD.md

$ mf-specs new-task --dir /tmp/opencode/c005-demo --name demo-standard --phase B --task ship --type execution --gates --depends-on A001
✓ added B001 in phase B · demo-standard
  B/B001-ship/TASK.md
  B/B001-ship/MEMORY.md
  B/B001-ship/GATES.md
  SPEC.md

$ mf-specs new-task ... --phase A --task second --type execution --gates
✓ added A003 in phase A · demo-standard
```

`state` and `next`:

```
$ mf-specs state --dir /tmp/opencode/c005-demo --name demo-standard
demo-standard · in-progress · state pending · phase A · locked none

$ mf-specs next --dir /tmp/opencode/c005-demo --name demo-standard
state pending · phase A · budget 3
A001  gated  execution  implement  medium  inherit
A003  gated  execution  second  medium  inherit

$ mf-specs state --name montflow-spec-standard --dir "$PWD"
montflow-spec-standard · in-progress · state pending · phase C · locked B

$ mf-specs next --name montflow-spec-standard --dir "$PWD"
state pending · phase C · budget 3
C005  gated  execution  implement-mechanical-state-verbs  large  inherit
```

`lock`:

```
$ mf-specs lock --dir /tmp/opencode/c005-demo --name demo-standard --phase A
not locked A · demo-standard
  gate.unproven
  phase.review-missing
  task.pending
EXIT=1

$ mf-specs lock --dir /tmp/opencode/c005-demo --name demo-micro --phase A
locked A · demo-micro
EXIT=0

$ mf-specs lock --name montflow-spec-standard --phase B --dir "$PWD"
locked B · montflow-spec-standard
EXIT=0
```

`waiver`:

```
$ mf-specs waiver --dir /tmp/opencode/c005-demo --name demo-waived --phase A --required
✓ required review for A · demo-waived · reason and evidence cleared

$ mf-specs waiver ... --name demo-waived --phase A --waived --reason "One reversible gate"
✓ waived review for A · demo-waived · evidence A001:0

$ mf-specs waiver ... --name demo-standard --phase A --waived --reason "The gates prove this phase"
code     phase.waiver-with-review-task
problem  A waived phase must not hold a review task; a phase either reviews or waives.

$ mf-specs waiver ... --name demo-standard --phase B --waived --reason Placeholder
code     waiver.waiver-policy
problem  A standard phase holding execution/defect/interruptor work is not records-only and cannot waive.
```

### Invalid tier plans rejected

Each was a real `init` run; all exited 1 with no directory written:

```
full without exploration:
  code init.exploration-missing
  problem A full plan needs a dedicated exploration phase A holding an exploratory task.

micro exploration:
  code init.exploration-forbidden
  problem A micro plan declares an exploratory task; micro has no exploration step.
  code init.gate-kind

micro prose-only gate:
  code init.gate-kind
  problem Micro task 'plan' is planning: it has no command gate...

standard waived with code:
  code init.waiver-policy
  problem Phase 'A' holds execution/defect/interruptor work, so it is not records-only.

waived phase given a review task:
  code task.review-waived
  problem Phase 'A' is waived, so it cannot hold a review task...

standard with two exploratory tasks:
  code init.exploration-count
  problem A standard plan declares 2 exploratory tasks; it allows at most one.

standard exploratory task outside the first phase:
  code init.exploration-placement
  problem A standard exploratory task must sit in the first phase.
```

### Claim atomicity, graph, authority

Full graph, from a fresh micro tree:

```
$ OPENCODE_SESSION_ID=sess-orch mf-specs claim ... --orchestrator
✓ bound orchestrator to sess-orch · demo-micro
$ ... --task A001 --start
✓ started A001 · demo-micro · in-progress
  wrote TASK.md status, SPEC.md row, PHASE.md mirror · demo-micro
$ ... --task A001 --block --reason "Waiting on the fixture"
✓ blocked A001 · demo-micro · blocked
  wrote TASK.md status, SPEC.md row, PHASE.md mirror · demo-micro
$ ... --task A001 --release
✓ released A001 · demo-micro · pending
  wrote TASK.md status, SPEC.md row, PHASE.md mirror · demo-micro
$ ... --task A001 --start
✓ started A001 · demo-micro · in-progress
$ ... --task A001 --close   (after gate pass and a checked completion item)
✓ closed A001 · demo-micro · complete
$ mf-specs lock ... --name demo-micro --phase A
locked A · demo-micro
```

After each transition, `TASK.md` held `status: <new>`, the `SPEC.md` row held the
same status, and `A/PHASE.md` mirrored the derived phase status. The
`blocked → release → pending` return path is the fourth command above.

Rollback (test `rolls all three records and the registry back when a rename
fails`): with an injected failure on the third rename, the call returns
`claim.write-failed`, and all four files are byte-identical to before the call;
the same is proven at module level in `Claim.transaction runtime`.

Second claim of a taken task:

```
$ OPENCODE_SESSION_ID=sess-worker mf-specs claim ... --task A001
code     claim.taken
problem  Task 'A001' is already bound to session 'sess-orch'.
```

Worker bind/release changes no status:

```
$ OPENCODE_SESSION_ID=sess-worker mf-specs claim ... --task A001
✓ bound A001 to sess-worker · demo-standard
status: pending
$ OPENCODE_SESSION_ID=sess-worker mf-specs claim ... --task A001 --release
✓ released A001 · demo-standard · pending
status: pending
```

Worker denial:

```
$ OPENCODE_SESSION_ID=sess-worker mf-specs claim ... --task A001 --start
code     claim.not-orchestrator
problem  Session 'sess-worker' does not hold the orchestrator binding for 'demo-standard'.

$ OPENCODE_SESSION_ID=sess-worker mf-specs gate run ... --name demo-standard --phase A --task A001
code     gate.not-orchestrator

$ OPENCODE_SESSION_ID=sess-worker mf-specs mail ... --name demo-standard --to A001 --text nope
code     mail.not-orchestrator
```

Premature lock is shown above; the default `micro` tree locks once its task
closes and its gate is recorded (`locked A · demo-micro`).

### Migrate fixtures

```
flat v1 → v2 (fixture test):
  report.specs[0].status === 'migrated'
  verifySpecTree({ name:'ship-login', files }, NO_REVIEW).valid === true

re-id fixture:
  plan.moves[1] === { from:'A001-two', to:'A/A002-two', oldId:'A001', newId:'A002' }
  after migrate: A/A002-two/TASK.md contains 'id: A002'; the result verifies

frozen fixture:
  migrate --name installation-guide                  → 1 spec · 0 upgraded · 1 frozen · 0 failed
  migrate --name installation-guide --include-complete → 1 spec · 1 upgraded · 0 frozen · 0 failed
  check --name installation-guide                    → 0 failed · 0 issues
```

### Live `mf-specs migrate --all`

```
$ bun run --cwd packages/specs cli migrate --all --dir /home/daniel/dev/montflow/spec-standard
...
14 specs · 0 migrated · 2 upgraded · 0 planned · 12 frozen · 0 failed
```

Per-spec result for C007:

| Spec | Result | Version after | `PHASE.md` files |
| --- | --- | --- | --- |
| `cli-version-awareness` | frozen (complete) | 1 | 0 |
| `installation-guide` | frozen (complete) | 1 | 0 |
| `model-fallback-alignment` | frozen (complete) | 1 | 0 |
| `montflow-ci-verification` | frozen (complete) | 1 | 0 |
| `montflow-multi-reviewer` | frozen (complete) | 1 | 0 |
| `montflow-opencode-migration` | frozen (complete) | 1 | 0 |
| `montflow-phase-directories` | frozen (complete) | 1 | 0 |
| `montflow-project-structure` | frozen (complete) | 1 | 0 |
| `montflow-references-plugin` | frozen (complete) | 1 | 0 |
| `montflow-references-tui` | upgraded | 2 | 1 (`G`) |
| `montflow-spec-completion-gate` | frozen (complete) | 1 | 0 |
| `montflow-spec-standard` | upgraded | 2 | 9 (`A`–`I`) |
| `plugin-host-integration` | frozen (complete) | 1 | 0 |
| `spec-optimizations` | frozen (complete) | 1 | 0 |

After the wave, `mf-specs check --name montflow-spec-standard` and the whole
store check report 0 failed / 0 issues; no task `status:` or `SPEC.md` task row
was changed by the migration. The only `SPEC.md` byte the migration added is
`spec-version: 2`; the C001–C004 status rows were already complete in the
uncommitted working tree before this run.

## Open Questions

- **`claim --block --reason` persistence.** B005 says block "records the
  reason", but B004 defines no verifier-checked reason field and block removes
  the binding. The reason is validated and shown in output but not persisted;
  persisting it would need a new field decision. Non-blocking; the transition
  itself is recorded by `status: blocked`.
- **Tier files at C005 time.** `packages/specs/tiers/` and
  `.agents/@montflow/tiers/` do not exist yet (C006 owns them), so the live
  `tier micro` command reports `tier.missing`. The success path is proven with
  injected fixture directories and the unit test; C006's files will make the
  live path succeed and enable `tier.stale`.
- **Profiles still speak pre-v2.** `spec-execution-orchestrator` says "Only you
  write … PHASE.md status, locks"; the canonical profile files are C006's
  payload. The prompts are corrected here; C006 must correct the profiles.
- **`GATES.md` static item.** The C005 `GATES.md` checklist is not edited by
  this worker (hard limit). Its two Stage 0 and three Stage 1 items are
  evidenced above; the orchestrator records the checkbox.

## Handoff

- **C006** — write `packages/specs/tiers/{micro,standard,full}.md` and their
  manifest entries. `init` writes a clean full phase gate with a runnable
  `echo` placeholder; `new-phase --gate mechanical` writes B005's literal
  `TODO:` command and therefore refuses `gate.run` until the owner replaces it.
  Rewrite the profiles' hand-typed status/lock lines to `claim`/`lock`.
- **C007** — the table above is the live `migrate --all` result. Twelve complete
  specs are frozen at v1 (12 `spec.version-outdated` warnings); two in-progress
  specs are upgraded to v2. `montflow-spec-standard/D/PHASE.md` carries
  `phase.review-task-missing` because the phase has no historical review task.
- **C008** — the new verbs are root-command subcommands only; `SLASH_COMMANDS`
  and the TUI remain unchanged. Add `/specs init|new-phase|new-task|stamp|tier|claim|lock|waiver`
  parity and keep `claim` restricted forms CLI/slash-only (not host tools).
- **C009** — `claim --close` treats a subjective `gate.unjudged` as a warning,
  not a blocker, matching B004; if review policy tightens it, change the close
  precondition and `verifyGateResults` together.
- **Orchestrator** — before recording C005 complete, note that `tier` live
  success depends on C006's files; all other completion items are proven above.

## Deviations

- `init`'s generated mechanical gate uses a runnable
  `echo 'replace with …'` command so a fresh tier tree verifies clean (C005
  `GATES.md` Stage 1). B005's `new-phase` gate keeps the literal `TODO:` command
  as specified, which intentionally fails `check` until replaced.
- `init` writes `full` phase gates with one mechanical stage and
  `gate: mechanical`; `standard` and `micro` write no phase gate.
- The claim transaction writes the registry in the same temp-then-rename
  transaction as the three status records; B005's "new registry entry removed"
  rollback is achieved by restoring the saved registry bytes.
- `claim --start` does not create a task binding. The worker binds its own
  session; the orchestrator start's registry change is a byte-identical write
  inside the transaction. This preserves "a second bind of a taken task fails"
  and lets the worker own the live binding.
- `migrate` renumbers only duplicate flat task ids; ambiguous old-id references
  are left for the post-write verifier rather than guessed. Re-id writes the
  moved `TASK.md` id and its `SPEC.md` row; no other prose is rewritten.
- No `BOARD.md`/`MAILBOX.md` broadcast was written into this spec; the phase has
  no board and this run's write scope is the task `MEMORY.md` plus code/tests,
  prompts/skill, payload, and the files the `migrate --all` verb wrote.
- No slash/TUI parity, docs, tier files, profile rewrites, or review policy
  changes were made; they belong to C006–C009.

## Files touched

Source and tests under `packages/specs/src`:

- new modules `modules/tier`, `modules/creation`, `modules/init`,
  `modules/claim/claim.write.module.ts`; `modules/phase/phase.module.ts`
  (`renderPhaseReview`, tier waiver predicate), `modules/task/task.module.ts`
  (`sortKey`), `modules/doctor/doctor.paths.module.ts` (tier paths),
  `modules/index.ts`, `modules/claim/claim.module.ts` (lock).
- CLI: `cli.claim.module.ts`, `cli.init.module.ts`, `cli.newphase.module.ts`,
  `cli.newtask.module.ts`, `cli.state.module.ts`, `cli.authoring.helpers.ts`;
  `cli.status.module.ts` (sortKey), `cli.migrate.module.ts` (include-complete,
  re-id), `cli.apps.module.ts`, `cli.slash.module.ts` (root subcommands).
- Tests: `modules/init/tests/init.test.ts`,
  `modules/claim/tests/claim.test.ts`, `apps/cli/tests/claim.test.ts`,
  `apps/cli/tests/state.test.ts`, `apps/cli/tests/next-order.test.ts`,
  `apps/cli/tests/migrate.test.ts`.
- Prompts/payload: `prompts/spec-execute.json`, `prompts/spec-create.json`,
  `skills/montflow-create-specs/SKILL.md`, the regenerated
  `modules/doctor/embedded-payload.generated.ts`, and the installed copies
  under `.agents/`.

Store and repo files written by the `migrate --all` verb: 9 phase
`PHASE.md`/`MEMORY.md` pairs under `montflow-spec-standard/A…I`, one pair under
`montflow-references-tui/G`, and `spec-version: 2` in both `SPEC.md` files.
`.gitignore` gained `.agents/@montflow/.runtime/`. This `MEMORY.md` is the only
task record written by this run.

## Orchestrator Verification (2026-11-03)

Independent gate run from the repo root after the worker receipt:

```
$ bun run --cwd packages/specs test -- --run
 Test Files  122 passed (122)
      Tests  1645 passed (1645)
Type Errors  no errors
EXIT=0

$ bun run mf-specs:check
14 specs · 0 failed · 0 issues · 13 warnings
EXIT=0

$ bun run mf:gate:fast   # lint:check + fmt:check + ts:check + mf:check
 Tasks:    17 successful, 17 total   (lint)
 Tasks:    17 successful, 17 total   (format)
 Tasks:    17 successful, 17 total   (ts)
summary entries=14 issues=0 warnings=0
summary checks=8 failed=0 repaired=0
EXIT=0

$ mf-specs state -> in-progress · phase C · locked B
$ mf-specs next  -> C005 (still pending before this record)
```

The live `migrate --all` wrote `spec-version: 2`, `PHASE.md`, and phase
`MEMORY.md` for this spec and `montflow-references-tui`; the C001-C004 task
statuses and every `SPEC.md` task row were preserved. The 13 warnings are 12
frozen `spec.version-outdated` plus `phase.review-task-missing` on phase D.
All C005 completion items are supported by the recorded runs; task recorded
complete by the orchestrator.
