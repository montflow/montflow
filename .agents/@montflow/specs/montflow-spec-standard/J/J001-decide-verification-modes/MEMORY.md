# Memory

## Context

J001 decides the light/full verification contract for J002/J003. Phase J objective: parameterize strictness per dispatch target, default light, so capable models skip repo-wide gates and final review while weaker models retain them. Scoped read-only source: SPEC Phase J + Requirements, README sizing/review-decide/lock/gate, sizing module + CONTEXT + tests, both sizing.json files. Evidence: /tmp/J001.log (claim + read-only scan).

## Progress

1. Bound J001, no status change (`claim --task J001` exit 0).
2. Read TASK, phase MEMORY brief, PHASE, BOARD, sizing module, README sections, both sizing.json, J002/J003/J004 TASKs.
3. Decision below; product edits none (`write-scope: none`).

## Findings

**Modes.** `light` = task-local mechanical gates only. It keeps every `<task>/GATES.md` mechanical stage proven (`gate run --task <id>`, orchestrator, once per task); it skips phase `GATES.md` phase-shared/repo-wide checks (scope repo, heavy lane, `bun run mf:gate` at boundary) and skips final review dispatch. `full` = task + phase + repo-wide gates + final review (current behavior unchanged). Task gates are always proven in both modes; light never relaxes a task gate, subjective stage, scheduler key/reuse, or `check` truthfulness.

**Sizing schema (J002 builds, no re-decision).** Field `verification: light|full` beside `model`/`effort` in `SizeEntry`. New code: `VERIFICATIONS=['light','full']`, `DEFAULT_VERIFICATION='light'`, `CODES.malformedVerification='sizing.malformed-verification'` (expected `light, full`, fix `Set <field>.verification to "light" or "full"`). `verification` without `model` is invalid via existing `missing-model` (whole entry, never half-used). Merge is whole-entry replace repo→spec→phase via `mergedEntry`/`merge`: the most specific layer defining a size wins the entire entry; fields never partly inherit, so a phase entry omitting `verification` resolves `light`, not the spec's `full`. Empty/absent resolves: entry present + `verification` absent → `light`; no layer defines size → `target inherit` + `verification light`; absent config → same; `{}` entry → invalid missing-model.

**Resolve/output (J002).** `resolve()` returns `Resolved` + required `verification` (`entry` now carries explicit `verification?`; `targetOf()` unchanged `model#effort`). Inherit: `{size, target:'inherit', verification:'light'}`. `sizing --task` compact appends `· verification light|full`; `--verbose/--human` adds `verification` + matrix column. `resolve` stdout stays bare `provider/model#effort`; `--json` adds `{size,target,source,verification}`. `status`/`next` append per ready line `· verification light|full`; phase head under light: `phase-gate skipped (verification light)`, under full: existing `phase-gate <kind> repo · shared once at boundary`.

**Lock/review/execution (J003).** Execution: light `gate run --task` only, no phase `gate run`, no repo-wide gate, no review dispatch; full adds phase gate, one repo-wide gate at boundary, review round. Lock (`lock --phase <id>`, exit 0 `locked <phase>` else blocker codes): full = all tasks complete + all task+phase mechanical gates proven + closed round/waiver/`review: none`; light = all tasks complete + all task-gate mechanical stages proven, phase-gate proof and round not required, same lockable path as waived/`review: none` (phase-gate stale blockers suppressed). `review decide --phase <id> [--mode] [--json]` (read-only): light → `waived` with `reason verification.light`, no rounds counted, exit 0; full → existing order waiver→waived, no round→start, pass/fix-and-stop/rework/overflow/escalate, strictest across series. Audit line: orchestrator writes one line in each task `MEMORY.md` before close: `verification: light · model: provider/model#effort` (or `verification: full · model: …` / `model: inherit`); `check` warns if absent.

## Gates

Planning task: no official gate, no `gate run`, no repo-wide check. Read-only scans only; full output /tmp/J001.log, quoted: `✓ bound J001`, `exit:0`, `verification beside model/effort`, `whole-entry replace`, `BOARD empty`, `MAILBOX absent`.

## Open Questions

None. J002/J003 proceed on fields/commands above without re-decision.

## Handoff

J002 implements schema + `resolve`/`sizing`/`status`/`next` shape. J003 wires execution/lock/`review decide` + audit line. J004 attacks light-for-repo-gap and confirms full + audit.

## Deviations

None. No SPEC/PHASE/status/lock/channel write; only this MEMORY.md.
