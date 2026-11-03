# Memory

## Context

C008 finishes the v2 surfaces after B001's phase rail and C001/C002/C003/C005's
`PHASE.md`, derived state, gates, mail, and mechanical verbs. Every CLI command,
the `/specs` slash form, the OpenCode host tools, and the TUI picker must read
the phase tree and derive the lock from it; no surface may read a stored
`locked-phases` list or fall back to a flat task-id view. C006's payload/tier/
profile content and C009's review-cycle policy were left untouched.

## Progress

- 2026-11-03: read `TASK.md`, `GATES.md`, `MEMORY.md`, C001/C002/C003/C005
  memories, B004 F2/F3, and B005 F1/F2/F3 plus the C008 handoff.
- 2026-11-03: added per-phase `PHASE.md` views to `status`/`state`/`next`/`list`
  (review decision, gate kind, derived proof, derived lock) without reading or
  printing any stored lock list.
- 2026-11-03: extended `SLASH_COMMANDS`, `SLASH_FLAG_KINDS`, and
  `SLASH_COMMAND_FLAGS` with every F1 verb, added positional parsing for
  `gate run|record` and `tier <tier>`, repeated flags for `init`, and `--all`
  forwarding for gate.
- 2026-11-03: added `/specs init|new-phase|new-task|stamp|tier|claim|lock|waiver|gate|mail`
  arms that call the same engines as the binary, plus `--include-complete` on
  `/specs migrate`.
- 2026-11-03: added the `spec_tier { tier }` host tool and registered it beside
  the four existing tools; the server help text now names every new verb.
- 2026-11-03: changed the TUI picker to load entries through the binary's
  `status` engine, so each row previews derived state/phase/lock/review while
  only directories holding `SPEC.md` are offered.
- 2026-11-03: added CLI/slash, server-tool, and TUI tests for a v2 store with
  phase directories, including a root-level phase directory that must not be a
  spec; updated the server tool list test and TUI entry assertions.
- 2026-11-03: ran every gate from the repo root and exercised every listed
  command against this spec plus a throwaway store.

## Findings

### CLI derived state

- `StatusReport` now carries `phases: PhaseView[]`, built from each
  `<PHASE>/PHASE.md` record plus the lifecycle's derived locks and
  `phaseEvidence`'s waived/proven sets. `PhaseView` exposes `review`,
  `reviewReason`, `gate`, `status`, `locked`, `proven`, and `waived`.
- `status` prints `Phase <id> · [locked] · review <decision> · gate <kind>
  <proven|unproven> · budget …` for a v2 phase; a v1 phase with no record keeps
  the old `Phase <id> · budget …` shape. The top line keeps the derived
  `locked <phases>` list.
- `state` appends `· review <active>:<decision> · gate <kind> <proof>` for the
  active phase (or the last recorded phase when the spec is complete).
- `next` appends the same active-phase decision and gate state to its head.
- `list` appends `· locked <derived> · review <phase>:<decision>,…` only when
  the spec has `PHASE.md` records; a v1/frozen store keeps its original line.
- No surface reads or writes a lock file. `grep` over the changed source finds
  no `locked-phases` read; the word appears only in task/spec prose.
- `create` and `init` were already writing `SPEC.md spec-version: 2` plus
  `A/PHASE.md`, `A/MEMORY.md`, and task directories; the throwaway run below
  proves both still do. `next` derives the active phase from the task/phase
  tree through `summarize` → `nextOf`.

### Slash and host parity

- `SLASH_COMMANDS` is now the full binary surface: check, status, state, next,
  resolve, sizing, models, which, list, create, migrate, init, new-phase,
  new-task, stamp, tier, claim, lock, waiver, gate, mail, author, execute,
  sizing-config. `slashArm` is an exhaustive switch, so a missing arm is a
  compile error instead of a fall-through to `check`.
- New flag kinds cover the F1 verbs; repeatable flags (`init --phase/--task/
  --review/--review-reason`, `new-task --requirement`) are collected by
  `multi`; bare positionals feed `gate run|record` and `tier <tier>`.
- The new arms call the same engines the binary commands use (`init`,
  `newPhase`, `newTask`, `claim`, `lockPhase`, `setWaiver`, `runGate`,
  `recordGate`, `sendMail`, `readTier`) and render with the same renderers, so
  output, codes, and exit truth cannot drift.
- `spec_tier` reads the installed tier with `readTier`, compares the packaged
  copy, and returns the verbatim body or the same coded refusal as
  `mf-specs tier`.
- Existing `spec_author`/`spec_execute`/`spec_sizing`/`spec_models` tools were
  not re-specified; an added test proves `spec_execute` dispatches the same
  prompt text as the binary engine for the same spec/phase.
- The TUI forwards `author`, `execute` (adding the guided/autonomous chooser
  only when `--mode` is absent, as before), and `sizing-config` unchanged via
  `forwardNonListToServer`; only the selected entry's `name` is inserted.

## Gates

All commands run from the repo root on 2026-11-03. Logs are under
`/tmp/opencode/c008-gates/`; excerpts below are verbatim.

### `bun run --cwd packages/specs test -- --run`

Exit code: 0.

```
 Test Files  124 passed (124)
      Tests  1687 passed (1687)
Type Errors  no errors
```

New/updated coverage: `src/apps/cli/tests/run-slash.test.ts` (v2 status/state/
next review+gate display, lock, stamp, init phase tree, new-phase + new-task,
tier refusal, gate subcommand refusal), `src/apps/server/tests/spec-tools.test.ts`
(`spec_tier` success/unknown/missing and execute-prompt parity),
`src/tests/server.test.ts` (five tools and every new verb in the slash help),
`src/tests/tui.test.ts` (v2 phase directories, root phase directory excluded,
derived picker preview).

### `bun run mf-specs:check`

Exit code: 0.

```
14 specs · 0 failed · 0 issues · 13 warnings
✓ spec skills and prompts are installed and up to date.
✓ micro: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/tiers/micro.md
✓ standard: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/tiers/standard.md
✓ full: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/tiers/full.md
```

The warnings are the pre-existing frozen-v1 `spec.version-outdated` warnings
plus `phase.review-task-missing` on phase D.

### `bun run ts:check`

Exit code: 0.

```
 Tasks:    17 successful, 17 total
Cached:    14 cached, 17 total
  Time:    773ms
```

### `bun run lint:check`

Exit code: 0.

```
 Tasks:    17 successful, 17 total
Cached:    16 cached, 17 total
  Time:    424ms
```

### `bun run fmt:check`

Exit code: 0.

```
 Tasks:    17 successful, 17 total
Cached:    16 cached, 17 total
  Time:    562ms
```

## Completion evidence

All commands below were run as
`bun run --cwd packages/specs cli <verb> --dir /home/daniel/dev/montflow/spec-standard …`;
logs are in `/tmp/opencode/c008-evidence/`.

### Every listed command reads this spec's v2 tree

- `check --name montflow-spec-standard` → `✓ montflow-spec-standard (1 warning)`,
  `1 spec · 0 failed · 0 issues · 1 warning`, exit 0.
- `status` → `state pending`, `locked B`, and per-phase lines such as
  `Phase B · locked · review required · gate none · budget 3`,
  `Phase C · review required · gate none · budget 3`, exit 0.
- `state` → `montflow-spec-standard · in-progress · state pending · phase C ·
  locked B · review C:required · gate none`, exit 0.
- `next` → `state pending · phase C · budget 3 · review C:required · gate none`
  then `C006` and `C008`, exit 0.
- `list` → 14 specs, including
  `○ montflow-spec-standard  in-progress · pending · 16 complete · 28 pending ·
  locked B · review A:required,B:required,C:required,D:required,E:required,
  F:required,G:required,H:required,I:required`, exit 0.
- `resolve --name … --task C008` → `inherit`, exit 0.
- `sizing --name … --task C008` → `C008  medium  inherit`, exit 0.
- `models --verify --name … --catalog <fixture>` →
  `0 entries checked · 0 skipped · repo 0 checked, 0 skipped · spec 0 checked, 0 skipped`, exit 0.
- `which --branch feat/montflow-spec-standard` → `montflow-spec-standard`, exit 0.
- `doctor --check` → all skills, prompts, and the three tiers up to date, exit 0.
- `author --request 'Surface parity check'` → rendered `spec-create` prompt,
  exit 0.
- `execute --name montflow-spec-standard` → rendered `spec-execute` prompt with
  `phase C · locked B · review C:required · gate none`, exit 0.
- `create --name demo-create --tasks implement,review-phase:review` in
  `/tmp/opencode/c008-demo` → `✓ created 'demo-create' · phase A · 2 tasks`
  and files `SPEC.md`, `A/PHASE.md`, `A/MEMORY.md`,
  `A/A001-implement/{TASK,MEMORY}.md`, `A/A002-review-phase/{TASK,MEMORY}.md`.
- `init --name demo-init --tier micro` in the same store →
  `✓ created 'demo-init' · tier micro · phases A · 1 task` and files
  `SPEC.md`, `A/PHASE.md`, `A/MEMORY.md`,
  `A/A001-implement/{TASK,MEMORY,GATES}.md`.
- `check` over that throwaway store → `2 specs · 0 failed · 0 issues`, exit 0.

### TUI exclusion

A root-level `C/PHASE.md` was added beside the two demo specs (a phase
directory where a spec could sit), then `loadSpecs` was run against the store:

```
["demo-create","demo-init"]
demo-create · pending · A · locked none
demo-init · pending · A · locked none
```

`C` is never offered, and neither is any task directory. The TUI test also
covers a task directory and a stray non-spec directory.

### Host/slash/tool parity and one failure

The one-off parity run (same workspace, same v2 spec) printed:

```
SLASH_STATE_MATCHES_BINARY=true
STATE_OUTPUT=montflow-spec-standard · in-progress · state pending · phase C · locked B · review C:required · gate none
SLASH_FAIL_OK=false
SLASH_FAIL_CODE=spec.phase-not-active
SPEC_TIER_TOOL_MATCHES_BINARY=true
TIER_HEAD=# Tier: micro
```

The binary failure for the same invocation is:

```
$ mf-specs execute --dir $PWD --name montflow-spec-standard --phase B
code     spec.phase-not-active
path     montflow-spec-standard
field    phase
problem  Phase 'B' is not the active phase of spec 'montflow-spec-standard' (it is locked).
expected phase C
actual   B
next     mf-specs check --name montflow-spec-standard
EXIT=1
```

So the slash form, the binary, and the host tool agree on the spec, phase, and
derived state, and the failure code matches exactly.

## Open Questions

- None blocking. The TUI previews derived state by calling the binary `status`
  engine once per spec at picker open; if a large store makes that visible, a
  future change can batch the snapshots, but it does not change which
  directories are offered.
- `gate`/`mail` slash arms inherit the binary's orchestrator-binding
  requirement. A slash invocation must therefore carry `--session` or inherit
  `OPENCODE_SESSION_ID`, exactly like the command line; this is parity, not a
  new restriction.

## Handoff

- C007 can document the new `/specs` verbs and the `spec_tier` tool; the server
  help text is the source.
- C009's review policy is untouched: `status`/`state` only display the
  `PHASE.md` decision and the derived lock C001/C005 already define.
- Orchestrator: every GATES.md item is evidenced above; this worker did not tick
  the task checkboxes or mark the task complete.

## Deviations

- Split the slash surface into `cli.slash.parse.module.ts` (parser, flag table,
  diagnostics) and `cli.slash.commands.module.ts` (the new verbs) so no CLI
  source file exceeds the existing 1000-line structure limit. `cli.apps.module.ts`
  re-exports both; `cli.slash.module.ts` keeps `runSlash`, the root command, and
  the original arms.
- The TUI `loadSpecs` return type changed from `string[]` to `SpecEntry[]` so
  the picker can preview derived state; the inserted text is still the bare
  spec name and the existing picker test was updated to assert names.
- No `BOARD.md`/`MAILBOX.md` was written: the phase has no board, and this run
  wrote only its own `MEMORY.md` plus CLI/server/TUI source and tests.

## Files touched

- `packages/specs/src/apps/cli/cli.apps.module.ts`
- `packages/specs/src/apps/cli/cli.status.module.ts`
- `packages/specs/src/apps/cli/cli.create.module.ts`
- `packages/specs/src/apps/cli/cli.slash.module.ts`
- `packages/specs/src/apps/cli/cli.slash.parse.module.ts` (new)
- `packages/specs/src/apps/cli/cli.slash.commands.module.ts` (new)
- `packages/specs/src/apps/cli/tests/run-slash.test.ts`
- `packages/specs/src/apps/server/spec-tools.apps.module.ts`
- `packages/specs/src/apps/server/tests/spec-tools.test.ts`
- `packages/specs/src/server.ts`
- `packages/specs/src/tests/server.test.ts`
- `packages/specs/src/tui.ts`
- `packages/specs/src/tests/tui.test.ts`
- `.agents/@montflow/specs/montflow-spec-standard/C/C008-align-cli-and-tui-surfaces/MEMORY.md`

## Orchestrator Verification (2026-11-03)

Independent gate run from the repo root after the worker receipt:

```
$ bun run --cwd packages/specs test -- --run
 Test Files  124 passed (124)
      Tests  1687 passed (1687)
Type Errors  no errors
EXIT=0

$ bun run mf-specs:check
14 specs · 0 failed · 0 issues · 13 warnings
EXIT=0

$ bun run mf:gate:fast   # lint + fmt + ts + mf:check
 Tasks:    17 successful, 17 total   (lint)
 Tasks:    17 successful, 17 total   (format)
 Tasks:    17 successful, 17 total   (ts)
summary entries=14 issues=0 warnings=0
summary checks=8 failed=0 repaired=0
EXIT=0

$ mf-specs state -> in-progress · phase C · locked B · review C:required · gate none
$ mf-specs status -> locked B, per-phase review decision, no lock file read
static: tui.test.ts covers a phase directory with PHASE.md but no SPEC.md as not
a spec.
```

All completion items are supported; task recorded complete by the orchestrator.
