# Review Series: montflow-spec-standard

## Metadata
- Target: montflow-spec-standard
- Status: open
- Rounds: 10
- Created: 2026-11-03

## Rounds

| Round | Status | Open | In Review | Resolved | Won't Fix | Escalated |
| ----- | ------ | ---- | --------- | -------- | --------- | --------- |
| 001 | closed | 0 | 0 | 20 | 0 | 0 |
| 002 | closed | 0 | 0 | 12 | 1 | 0 |
| 003 | closed | 0 | 0 | 3 | 0 | 0 |
| 004 | closed | 0 | 0 | 10 | 0 | 0 |
| 005 | open | 0 | 10 | 0 | 0 | 0 |
| 006 | open | 0 | 7 | 8 | 0 | 0 |
| 007 | open | 0 | 4 | 7 | 0 | 0 |
| 008 | open | 0 | 3 | 4 | 0 | 0 |
| 009 | open | 0 | 3 | 3 | 0 | 0 |
| 010 | open | 2 | 0 | 2 | 0 | 0 |

## Findings

| Round | ID | Severity | Status | Title |
| ----- | -- | -------- | ------ | ----- |
| 001 | F1 | Major | Resolved | B002's retrofit both leaves provable gate items unchecked and ticks other items from a general reconstruction |
| 001 | F2 | Major | Resolved | B001's `migrate` leaves a half-migrated tree when post-move verification fails |
| 001 | F3 | Major | Resolved | `init` claims to validate the tier contract, but its defaults and failure list do not enforce exploration, gate kind, or waiver policy |
| 001 | F4 | Major | Resolved | A standard phase's required `review-task` contradicts its `records-only` waiver and B004's "no review task on a waived phase" |
| 001 | F5 | Major | Resolved | The single-writer rule is not enforceable from the verb contract, and `lock` is assigned a write it is declared not to make |
| 001 | F6 | Major | Resolved | No Phase C task owns running `migrate --all` on the store |
| 001 | F7 | Major | Resolved | C004 cannot satisfy its own completion before C006, and it names a non-existent `mf-sessions` binary |
| 001 | F8 | Major | Resolved | C006 ships five profiles while B005 decides six |
| 001 | F9 | Minor | Resolved | Unclassified `GATES.md` stages are both legacy-valid and a phase-gate error |
| 001 | F10 | Minor | Resolved | `gate run --all` is documented but absent from the signature, and default failure behavior is undefined |
| 001 | F11 | Minor | Resolved | C005's completion does not cover four of the verbs it must ship |
| 001 | F12 | Minor | Resolved | B003's `grilling` tier row is not in `TierContract` or the drift test |
| 001 | F13 | Minor | Resolved | B099/C099 completion names a flat `B.md`/`C.md`, not the review series the verifier reads |
| 001 | F14 | Minor | Resolved | B001 left the reserved `099` review-task generator in `scaffold` despite its delete requirement |
| 001 | F15 | Minor | Resolved | The interaction budgets are self-reported; no transcript artifact exists for the review to compare |
| 001 | F16 | Major | Resolved | `claim` no longer writes status, so verifier-checked status transitions have no generator |
| 001 | F17 | Major | Resolved | B003 says `micro` waivers use the `records-only` check, while B004/B005 exempt `micro` and the default micro tree would never lock |
| 001 | F18 | Minor | Resolved | `new-task --type review` can create a review task on a waived phase |
| 001 | F19 | Minor | Resolved | C006's prompt task is stale against the F15/F16 decisions |
| 001 | F20 | Major | Resolved | A blocked task has no verb that returns it to `pending` |
| 002 | F1 | Critical | Resolved | A v2 spec can complete with no review round and `check` stays green |
| 002 | F2 | Critical | Resolved | The derived lock ignores open findings and the other expected review series |
| 002 | F3 | Major | Resolved | `gate record` is not authority-checked and a worker can self-approve a subjective gate |
| 002 | F4 | Major | Resolved | The `init` mechanical gate is an `echo` placeholder that `gate run` records as a pass |
| 002 | F5 | Major | Resolved | The checked-in `@montflow/specs` embedded payload is stale and the test/CI gate fails |
| 002 | F6 | Major | Resolved | `new-task` can add an execution task with no `GATES.md` and close it unproven |
| 002 | F7 | Major | Resolved | `migrate` upgrades to v2 but leaves the deleted `locked-phases` field |
| 002 | F8 | Major | Resolved | The tier waiver policy is skipped when `## Creation`/tier is absent |
| 002 | F9 | Major | Resolved | `phase.objective` accepts `TODO` and every phase in the standard's spec is a placeholder |
| 002 | F10 | Minor | Resolved | `create`/`new-task` do not wire the review task to the work; `claim --start` can bypass the ready set |
| 002 | F11 | Minor | Resolved | `montflow-find-specs` still says `doctor` leaves a present skill untouched |
| 002 | F12 | Minor | Resolved | The D phase is required but has no review task; the warning is real but deferrable |
| 002 | F13 | Minor | Won't Fix | C003's live-delivery claim is a PATH shim, not a live session |
| 003 | F1 | Minor | Resolved | A bare skill directory counts as an installed skill, so a broken reference still verifies clean |
| 003 | F2 | Minor | Resolved | `--strict` is unreachable from the slash `verify` surfaces |
| 003 | F3 | Nit | Resolved | A004's MEMORY contradicts the warning behavior it shipped |
| 004 | F1 | Major | Resolved | Worker and orchestrator both execute the task gate, so "once per task" is false |
| 004 | F2 | Major | Resolved | The worker is banned from commands its own GATES.md names, and the skill forbids that gate shape |
| 004 | F3 | Major | Resolved | The orchestrator is told to start the phase review with a command that does not exist |
| 004 | F4 | Major | Resolved | The prompt still sends workers to BOARD.md/MAILBOX.md while the edited worker profile excludes them |
| 004 | F5 | Minor | Resolved | The drift test asserts phrase presence, so a contradicted contract stays green |
| 004 | F6 | Minor | Resolved | The brief check is an empty-heading check, and completion and lock never consult it |
| 004 | F7 | Minor | Resolved | Scaffolded phase and task memories omit the brief and two of the fixed sections |
| 004 | F8 | Minor | Resolved | `mf-profiles verify` only warns on an uninstalled skill, but both skills say it validates every skill |
| 004 | F9 | Minor | Resolved | The brief/gate "name it once" rule is circular |
| 004 | F10 | Nit | Resolved | D001's memory says Phase D has no review task, but D004 is required |
| 005 | F1 | Major | In Review | A forced or retried run silently consumes the old record when a lane/in-flight slot is busy |
| 005 | F2 | Major | In Review | `check` recomputes freshness from the record's own scope, so a later pass under a different scope hides the stale one |
| 005 | F3 | Major | In Review | `heartbeatSeconds >= leaseSeconds` is accepted, letting a live owner's lease expire and a second requester double-run the key |
| 005 | F4 | Major | In Review | `writeRunState` swallows every write error, so the single-flight claim can silently not exist |
| 005 | F5 | Major | In Review | Contract findings `task.write-scope-missing`, `phase.write-scope-overlap`, `phase.serial-chain-unexplained`, `gate.shared-check-in-task`, `gate.duplicate-command` are taught as `check` output but never implemented |
| 005 | F6 | Minor | In Review | A deleted or renamed scope makes a keyed pass unverifiable and `check` treats that as green |
| 005 | F7 | Minor | In Review | A complete owner's unkeyed pass is exempt, so a hand-written green passes `check --require-complete` |
| 005 | F8 | Minor | In Review | Run states are never pruned, and every fingerprint change adds one that `status` and every poll must read |
| 005 | F9 | Minor | In Review | Drift markers are bare tokens that survive deletion of the rule they are meant to protect |
| 005 | F10 | Minor | In Review | Orchestrator guidance claims `heavy.inFlight` bounds dispatch concurrency, but that bound only exists inside `gate run` |
| 006 | F1 | Major | Resolved | A forced or retried run silently consumes the old record when a lane/in-flight slot is busy |
| 006 | F2 | Major | Resolved | `check` recomputes freshness from the record's own scope, so a later pass under a different scope hides the stale one |
| 006 | F3 | Major | Resolved | `heartbeatSeconds >= leaseSeconds` is accepted, letting a live owner's lease expire and a second requester double-run the key |
| 006 | F4 | Major | In Review | `writeRunState` swallows every write error, so the single-flight claim can silently not exist |
| 006 | F5 | Major | Resolved | Contract findings `task.write-scope-missing`, `phase.write-scope-overlap`, `phase.serial-chain-unexplained`, `gate.shared-check-in-task`, `gate.duplicate-command` are taught as `check` output but never implemented |
| 006 | F11 | Major | In Review | The generators default every execution task to `write-scope: .`, so two independent execution tasks collide and `check` fails |
| 006 | F12 | Major | In Review | A keyed mechanical record with no `scope` bypasses freshness, so a hand-written pass still greens a completed owner |
| 006 | F6 | Minor | Resolved | A deleted or renamed scope makes a keyed pass unverifiable and `check` treats that as green |
| 006 | F7 | Minor | Resolved | A complete owner's unkeyed pass is exempt, so a hand-written green passes `check --require-complete` |
| 006 | F8 | Minor | Resolved | Run states are never pruned, and every fingerprint change adds one that `status` and every poll must read |
| 006 | F9 | Minor | In Review | Drift markers are bare tokens that survive deletion of the rule they are meant to protect |
| 006 | F10 | Minor | Resolved | Orchestrator guidance claims `heavy.inFlight` bounds dispatch concurrency, but that bound only exists inside `gate run` |
| 006 | F13 | Minor | In Review | `gate run --scope` records a scope the freshness check then rejects, so the documented override leaves a permanent `gate.stale-result` |
| 006 | F14 | Minor | In Review | The Phase E records still describe the pre-fix verifier |
| 006 | F15 | Nit | In Review | A stray JSDoc swallows a duplicated `gateExitCode` and documents it as the subjective-verdict recorder |
| 007 | F4 | Major | Resolved | `writeRunState` swallows every write error, so the single-flight claim can silently not exist |
| 007 | F11 | Major | Resolved | The generators default every execution task to `write-scope: .`, so two independent execution tasks collide and `check` fails |
| 007 | F12 | Major | Resolved | A keyed mechanical record with no `scope` bypasses freshness, so a hand-written pass still greens a completed owner |
| 007 | F16 | Major | In Review | The post-append `resultIndex` write can mark a newer attempt finished and re-open single flight |
| 007 | F9 | Minor | Resolved | Drift markers are bare tokens that survive deletion of the rule they are meant to protect |
| 007 | F13 | Minor | Resolved | `gate run --scope` records a scope the freshness check then rejects, so the documented override leaves a permanent `gate.stale-result` |
| 007 | F14 | Minor | Resolved | The Phase E records still describe the pre-fix verifier |
| 007 | F17 | Minor | In Review | The documented `scope=` task token is rejected by `init` and silently ignored by `create` |
| 007 | F18 | Minor | In Review | A non-covering `--scope` is detected per stage, after earlier stages already ran and recorded |
| 007 | F19 | Minor | In Review | C6, the README, and E002 still describe an exact scope match, not the shipped covering rule |
| 007 | F15 | Nit | Resolved | A stray JSDoc swallows a duplicated `gateExitCode` and documents it as the subjective-verdict recorder |
| 008 | F16 | Major | Resolved | The post-append `resultIndex` write can mark a newer attempt finished and re-open single flight |
| 008 | F22 | Major | In Review | The terminal state write still marks whichever attempt is last finished, so a resumed owner clobbers a reclaimed attempt |
| 008 | F17 | Minor | Resolved | The documented `scope=` task token is rejected by `init` and silently ignored by `create` |
| 008 | F18 | Minor | Resolved | A non-covering `--scope` is detected per stage, after earlier stages already ran and recorded |
| 008 | F19 | Minor | Resolved | C6, the README, and E002 still describe an exact scope match, not the shipped covering rule |
| 008 | F20 | Minor | In Review | A later stage's missing or nonexistent declared scope is still discovered only after earlier stages ran and recorded |
| 008 | F21 | Minor | In Review | `create --tasks` splits on commas, so a documented multi-path `scope=` silently becomes a second task |
| 009 | F22 | Major | Resolved | The terminal state write still marks whichever attempt is last finished, so a resumed owner clobbers a reclaimed attempt |
| 009 | F20 | Minor | Resolved | A later stage's missing or nonexistent declared scope is still discovered only after earlier stages ran and recorded |
| 009 | F21 | Minor | Resolved | `create --tasks` splits on commas, so a documented multi-path `scope=` silently becomes a second task |
| 009 | F23 | Major | In Review | A resumed owner still appends an authoritative failure record after the newer attempt's pass, so `check` reports the stage unproven |
| 009 | F24 | Major | In Review | The pre-pass fingerprints every selected stage before any stage runs, so an earlier stage's writes make a later stage's recorded key stale |
| 009 | F25 | Minor | In Review | `create --tasks` absorbs a later bare-name task into the preceding `scope=` list |
| 010 | F23 | Major | Open | A resumed owner still appends an authoritative failure record after the newer attempt's pass, so `check` reports the stage unproven |
| 010 | F24 | Major | Resolved | The pre-pass fingerprints every selected stage before any stage runs, so an earlier stage's writes make a later stage's recorded key stale |
| 010 | F25 | Minor | Resolved | `create --tasks` absorbs a later bare-name task into the preceding `scope=` list |
| 010 | F26 | Minor | Open | `create --tasks` refuses a three-path scope, and its diagnostic names the wrong fragment |
