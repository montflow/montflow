# Memory

## Context

C002 implements B004 F5 + B005 F1's gate contract: a `GATES.md` stage declares
`(mechanical)` or `(subjective)`, `gate run` executes mechanical commands and
records B004's exact JSONL shape, `gate record` lets the named reviewer record a
subjective verdict, and `check` refuses a complete owner whose mechanical gate
has no recorded pass. Existing unclassified gate files must keep verifying
unchanged, and the shipped `spec-execute` prompt must stop claiming no gate
runner exists.

In scope: `packages/specs` source/tests, the shipped prompt, its embedded payload,
and its installed copy. Out of scope: `claim` (C005), BOARD/MAILBOX/`mail`
(C003), docs/ledger (C007), slash/TUI parity (C008). This task added only the
minimal claim-registry reader C005 can build the `claim` verb on.

## Progress

- 2026-11-03: read `TASK.md`, `GATES.md`, `MEMORY.md`, B004 F5/F8/F9, B005 F1's
  `gate run` / `gate record` / `claim` sections, and the existing gate, phase,
  structure, and CLI modules.
- 2026-11-03: extended `modules/gates` with stage kinds/metadata, the strict
  result-record schema/parser, and the unproven/unjudged/owner-mismatch rules.
- 2026-11-03: wired `gate run` and `gate record` into the CLI, with the
  orchestrator-binding authority check reading
  `.agents/@montflow/.runtime/claims.json`.
- 2026-11-03: wired `gate.unproven`/`gate.unjudged`/result findings into
  `verifySpecTree` for task and phase owners; `phaseEvidence` now uses the one
  shared result parser.
- 2026-11-03: updated `packages/specs/prompts/spec-execute.json`, regenerated the
  embedded payload, and ran `mf-specs doctor` to repair the installed copy.
- 2026-11-03: added gate module and CLI test suites (grammar, metadata, result
  parsing, command failure, default stop, `--all`, unproven→proven, phase gate,
  subjective refusal/judging, authority) and re-ran every gate from the repo
  root.

## Findings

### Gate grammar and verification

- `parseGates` now returns `{heading,title,stage,kind,command,judge,metadata,items,line}`.
  An unclassified `## Stage N: …` heading stays `kind: undefined`, is never
  runnable, requires no result, and produces no new finding — which is why all
  143 live `GATES.md` files verify unchanged.
- Metadata is read only between a heading and its first checkbox:
  `command:` for mechanical, `judge:` for subjective, each exactly once, each
  forbidden on the other kind. Metadata on an unclassified stage is
  `gate.kind-missing`. Other `key:` lines are `gate.malformed-metadata`.
- `command:` is the literal shell command (one surrounding backtick pair
  stripped). A `<…>` token or a leading `TODO` is
  `gate.placeholder-command`; shell redirections such as `>&2` are valid.
- `verifyGatesFile` also rejects duplicate stage numbers
  (`gate.duplicate-stage`) and keeps every existing shape rule.
- `parseGateResults` decodes each JSONL line against a strict Effect Schema
  (`onExcessProperty: 'error'`) for B004's exact mechanical/subjective keys.
  A bad line is `gate.results-malformed` with its line number; a mechanical
  record whose verdict disagrees with its exit is `gate.result-inconsistent`.
- `verifyGateResults` reports a record naming an undeclared stage as
  `gate.result-owner-mismatch`; on a complete owner it reports
  `gate.unproven` (error) for every mechanical stage whose latest record is not
  a pass with the same command, and `gate.unjudged` (warning) for a subjective
  stage with no recorded pass. Unfinished owners get no unproven/unjudged
  finding.
- `verifyGateProgress` now also accepts a recorded passing result in place of a
  ticked box; an all-unchecked complete legacy gate with no result still fails
  `gate.unchecked`.

### `gate run` / `gate record`

- CLI: `mf-specs gate run --name <spec> --phase <id> [--task <id>] [--stage <n> | --all] [--timeout <s>] [--dir <root>]`
  and `mf-specs gate record … --stage <n> --judge <slug> --verdict pass|fail --note <text>`.
- Authority is checked before any gate read or write: the caller session
  (`OPENCODE_SESSION_ID`, read through `Config`, not `process.env`) must match a
  `{spec, task: 'orchestrator', session}` entry. A worker binding yields
  `gate.not-orchestrator`.
- Selection: `--stage` runs exactly one stage; `--all` runs every mechanical
  stage in ascending stage-number order and continues after a failure; neither
  runs every mechanical stage in ascending order and stops at the first failure
  (already-run records stay). `--stage` + `--all` is `gate.argument-conflict`.
- Execution is `sh -c <command>` from the workspace root (the parent of
  `.agents/@montflow/specs`), default 600 s. Timeout records exit 124; a spawn
  failure records exit 127. Combined stdout+stderr is captured verbatim with no
  truncation.
- Writes are one JSON line per executed stage, appended with `flag: 'a'` to the
  owner's `GATE-RESULTS.jsonl` only. A corrupt existing results file refuses the
  run before executing anything (`gate.results-malformed`).
- `gate record` writes only the subjective shape (`stage,title,kind,judge,verdict,at,note`),
  requires a profile-slug judge and a non-empty note, refuses a mechanical stage
  (`gate.not-subjective`), and has no path that derives a subjective pass by
  itself.
- `phaseEvidence` now shares `parseGateResults`/`latestResults`; malformed-result
  reporting lives with `verifyGateResults` so a file is reported once.

### Claim registry reader (for C005)

- `modules/claim` exports `CLAIMS_FILE`, `claimsPath(workspace)`,
  `ORCHESTRATOR`, `Claim`, `parseClaims`, `readClaims`, `holdsOrchestrator`, and
  `renderClaims`.
- Canonical document is `{schema:1,claims:[{spec,task,session,at}]}`; a bare
  array is accepted. A malformed document yields no authority rather than an
  error. No writer is implemented here — C005 owns the `claim` verb and the
  registry lock.

## Gates

All commands run from the repo root on 2026-11-03. Logs are under
`/tmp/opencode/c002-gates/`; excerpts below are verbatim.

### `bun run --cwd packages/specs test -- --run`

Exit code: 0.

```
 Test Files  104 passed (104)
      Tests  1505 passed (1505)
Type Errors  no errors
```

New coverage: `src/modules/gates/tests/gates.test.ts` (grammar, metadata,
result parsing, unproven/unjudged/owner-mismatch, legacy silence, instant) and
`src/apps/cli/tests/gate.test.ts` (failed command recorded, default
stop-at-first-failure, `--all` continues and records every stage, `--stage`,
`--stage`+`--all` conflict, worker authority, unproven→proven, phase gate,
subjective refusal + judge record + mechanical record refusal).

### `bun run mf-specs:check`

Exit code: 0.

```
14 specs · 0 failed · 0 issues · 14 warnings
✓ spec skills and prompts are installed and up to date.
✓ spec-execute: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-execute.json
```

The 14 warnings are the existing one-per-spec `spec.version-outdated` warnings.
This run is also the proof that all existing (unclassified) gate files verify
unchanged.

### `bun run ts:check`

Exit code: 0.

```
 Tasks:    17 successful, 17 total
Cached:    14 cached, 17 total
  Time:    764ms
```

### `bun run lint:check`

Exit code: 0.

```
@montflow/specs:lint:check: Found 0 warnings and 0 errors.
 Tasks:    17 successful, 17 total
```

### `bun run fmt:check`

Exit code: 0.

```
@montflow/specs:format:check: All matched files use the correct format.
 Tasks:    17 successful, 17 total
```

## Completion evidence

A throwaway workspace was built at `/tmp/opencode/c002-demo` with two v2 specs
(`gate-demo`, `gate-pass`) and one registry holding `sess-orch` as
`orchestrator` and `sess-worker` as a task binding. Commands were run as
`bun run --cwd packages/specs cli …` from the repo root.

### A mechanical gate runs a real command and records it

Command:

```
OPENCODE_SESSION_ID=sess-orch bun run --cwd packages/specs cli gate run \
  --dir /tmp/opencode/c002-demo --name gate-pass --phase A --task A001
```

Output:

```
✓ stage 0 Suite (mechanical) pass · exit 0 · printf 'pass-ok'
1/1 stage passed · A/A001-implement/GATE-RESULTS.jsonl
EXIT=0
```

Recorded line:

```json
{"stage":0,"title":"Suite","kind":"mechanical","command":"printf 'pass-ok'","exit":0,"verdict":"pass","at":"2026-11-03T12:53:13Z","output":"pass-ok"}
```

### A failing command is recorded, and the default stops at it

```
OPENCODE_SESSION_ID=sess-orch … gate run --name gate-demo --phase A --task A001
✗ stage 0 Failing command (mechanical) fail · exit 7 · printf 'demo-out'; printf 'demo-err' >&2; exit 7
0/1 stage passed · A/A001-implement/GATE-RESULTS.jsonl
Stopped at the first failing stage; later stages were not run. Use --all to run them.
EXIT=1
```

The record kept the command verbatim, `exit:7`, `verdict:"fail"`, an instant,
and the combined output `demo-outdemo-err`.

### `--all` continues and records every stage

```
OPENCODE_SESSION_ID=sess-orch … gate run --name gate-demo --phase A --task A001 --all
✗ stage 0 Failing command (mechanical) fail · exit 7 · …
✓ stage 1 Passing command (mechanical) pass · exit 0 · printf 'demo-pass'
1/2 stages passed · A/A001-implement/GATE-RESULTS.jsonl
EXIT=1
```

`GATE-RESULTS.jsonl` then held three lines (two stage-0 failures plus stage-1
pass); `check` kept only stage 0 unproven.

### `--stage` + `--all` conflict

```
gate run … --stage 0 --all
code     gate.argument-conflict
problem  `--stage` and `--all` cannot be combined.
EXIT=1
```

### A worker cannot run a gate

```
OPENCODE_SESSION_ID=sess-worker … gate run --name gate-demo --phase A --task A001
code     gate.not-orchestrator
problem  Session 'sess-worker' does not hold the orchestrator binding for 'gate-demo'.
EXIT=1
```

No `GATE-RESULTS.jsonl` was created by that call.

### Unproven gate fails `check`, passes once recorded

Before (`gate-pass`, complete task, no results):

```
code     gate.unproven
problem  Task 'A001' is complete but mechanical stage 0 'Suite' has no recorded passing result (no recorded result).
1 spec · 1 failed · 2 issues · 1 warning
EXIT=1
```

After the `gate run` above:

```
✓ gate-pass (1 warning)
1 spec · 0 failed · 0 issues · 1 warning
EXIT=0
```

The phase owner has the same rule, covered by the test "records a phase gate and
clears the phase unproven finding"; it asserts a `Phase 'A'` unproven finding
before the run and its absence afterward.

### Subjective is never auto-passed

`gate run --stage 2` on `gate-demo`:

```
code     gate.not-mechanical
problem  Stage 2 is subjective; a reviewer records it, the CLI never runs it.
EXIT=1
```

`check` before the verdict was invalid (`gate.unchecked`) and carried
`gate.unjudged × 1`. After the explicit reviewer record:

```
✓ recorded pass for stage 2 from effect-reviewer · A/A001-implement/GATE-RESULTS.jsonl
{"stage":2,"title":"Reviewer judgment","kind":"subjective","judge":"effect-reviewer","verdict":"pass","at":"2026-11-03T12:53:09Z","note":"Every failure is a tagged error; no string throws."}
```

`check` then carried no `gate.unjudged`; the sole remaining error was the
intentionally failing stage 0. A mechanical stage recorded as subjective is
refused by the test "refuses to record a mechanical stage as subjective".

### Existing gate files verify unchanged

`bun run mf-specs:check` above reports `14 specs · 0 failed · 0 issues`; grep over
the store finds 143 `GATES.md` files, all unclassified, and none gained a new
finding.

### Prompt

`packages/specs/prompts/spec-execute.json` §3 now names
`mf-specs gate run --name <spec> --phase <id> [--task <id>]`, its `--stage` /
`--all` / default-stop semantics, `GATE-RESULTS.jsonl`, `gate.unproven`, and
`gate record` for subjective stages. The old sentence "`mf-specs` ships no gate
runner" is gone. The embedded payload was regenerated with
`bun run --cwd packages/specs generate:payload`, and
`bun run --cwd packages/specs cli doctor --dir $PWD` repaired the installed copy;
`mf-specs:check` now reports it up to date.

## Open Questions

- None blocking. The gate contract is implemented as B004 F5 and B005 F1
  specify it; `gate record` was included because B005's handoff assigns both
  verbs to C002 and because it is the only path that can record who judged a
  subjective stage.
- Non-blocking: B004 says a command "must not contain `<…>`"; this treats a
  paired `<…>` token as the placeholder and permits shell redirections such as
  `>&2`, which a literal any-angle-bracket rule would wrongly reject. If a bare
  `<`/`>` is meant to be refused, the pattern is one line in
  `modules/gates/gates.module.ts` and `cli.gate.module.ts`.
- Non-blocking: `gate record` accepts a valid judge slug even if it differs from
  the stage's `judge:` line. B005 only requires a slug and a named judge; if the
  reviewer identity must match exactly, that is one comparison in `recordGate`.

## Handoff

- C005: build `claim` on `modules/claim`'s `Claim`, `parseClaims`, `readClaims`,
  `holdsOrchestrator`, and `renderClaims`; the registry is one workspace file at
  `.agents/@montflow/.runtime/claims.json`. For `claim --close`'s
  `claim.gate-unproven`, reuse `verifyGateResults({…, complete: true})` (or its
  exported `parseGateResults`/`latestResults`) so the close precondition and
  `check` name the same unproven stage.
- C003: `mail` authority should call `readClaims` + `holdsOrchestrator` exactly as
  `gate run` does; the sender remains derived from the binding.
- C006: the prompt change here is the mechanical-proof paragraph only; it still
  says "`mf-specs` ships no lock verb", which C005/C006 own.
- C007: no docs were updated; the gate verbs are discoverable from `mf-specs gate
  --help` and the module doc comments.
- C008: `gate` is a CLI subcommand only; it is not in `SLASH_COMMANDS`, so slash
  parity remains C008's work.

## Deviations

- Added `gate record` in addition to `gate run`: B005's C002 handoff owns both,
  and subjective "record who judged them" has no other writer.
- Added the minimal claim-registry reader (not the `claim` verb), as the
  orchestrator allowed.
- No `BOARD.md`/`MAILBOX.md` was written: neither exists for this phase, and the
  orchestrator limited writes to this task's `MEMORY.md` plus in-scope source,
  tests, and the shipped prompt/payload.
- Pre-existing working-tree changes to `SPEC.md` and the C001/C004 task records
  were already present before this run and were not touched.

## Orchestrator Verification (2026-11-03)

Independent gate run from the repo root after the worker receipt:

```
$ bun run --cwd packages/specs test -- --run
 Test Files  104 passed (104)
      Tests  1505 passed (1505)
Type Errors  no errors
EXIT=0

$ bun run mf-specs:check
14 specs · 0 failed · 0 issues · 14 warnings
✓ spec-execute: up to date
EXIT=0

$ bun run mf:gate:fast   # lint:check + fmt:check + ts:check + mf:check
summary entries=14 issues=0 warnings=0
summary checks=8 failed=0 repaired=0
EXIT=0
```

The task reports the completion demos (real mechanical pass/fail, stop-at-first-
failure vs `--all`, `gate.not-orchestrator`, `gate.unproven` -> pass after
recording, `gate.not-mechanical` for a subjective stage, and unchanged legacy
gate files). All completion items are supported; task recorded complete by the
orchestrator.
