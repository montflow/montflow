---
name: montflow-spec-standard
status: in-progress
workspace-type: in-place
author: Daniel Montilla
created: 2026-10-07
spec-version: 2
---

# Montflow spec standard overhaul

## Description

A spec today is a flat list of task directories whose "phase" is only the
leading letters of a task id (`A001` is phase `A`), whose locks are typed by
hand, and whose `GATES.md` is a checkbox list that the verifier checks only for
*shape* — it never runs the command a gate names. There is no phase entity, so
a phase cannot hold an objective, a gate, a memory, or a verdict. There is no
complexity tier, so a hotfix is required to carry the same `099-review-phase`
ceremony as a multi-package refactor, and both existing specs grew to 15-17
task directories. Execution lives in a TypeScript template literal
(`skills/executing-spec.ts`), so the protocol an agent follows is not something
the verifier can check.

Overhaul the concept and the structure. Phases become real directories holding
their own gate, memory, and blackboard; tasks live inside them and may run in
parallel under a single state-writer. Gates become stages that are either
mechanical (the CLI runs them and records the result) or subjective (a reviewer
role judges them). Locks, ids, timestamps, and status transitions become
derived or CLI-generated, never hand-typed. A fast, strictly surface-level
appraiser picks a complexity tier from a defined enum and the tier decides
which phases, reviews, gates, and user questions a spec gets — including
whether an exploration phase is needed at all, and whether the request should
be split into several specs. Two pipelines drive it: creation
(orchestrator, appraiser, bookkeeper) and execution (orchestrator, workers with
specialist roles, bookkeeper, appraiser), communicating through a phase
broadcast board and per-task mailboxes.

None of that can land on the current primitive: `Issue` carries no severity, so
the first warning ever added turns CI red. So this spec goes foundation-first.
Phase A inventories the verification and payload surfaces and lands two rails:
a severity channel, and reference resolution for the `skills:` lists in profiles
and prompts (today a bogus skill name verifies clean). Phase B reconciles main,
then decides the tiers, the v2 standard, and the tooling contract. Phase C
implements them, ships the five spec-role profiles and the two pipeline prompts
as package payloads installed by `doctor`, and adds the generator verbs that
retire hand-written mechanics.

Main moved while this spec was paused. `spec-optimizations` landed task sizes,
the sizing config and catalogue, the shipped prompts, the doctor module, review
budgets, and the `author` / `execute` / `sizing-config` verbs; the same period
reverted the phase-directory layout that `montflow-phase-directories` had already
completed. This standard overrides that flat layout. B001 reconciles the two:
keep the landed sizing, prompt, doctor, and review-budget work, restore the phase
tree, delete the hand-written lock list and the reserved review task, and teach
every CLI and TUI surface the derived phase state before Phase B decides
anything. B002 then hardens the record checks and retrofits every completed
task's completion and gate checklist, so a `complete` status can no longer
contradict its own record.

Phase D closes a profile-discovery gap found while authoring this spec. The
shipped prompt and skill tell the author to read `.agents/@montflow/profiles/`
directly, so an author that never opens the store can miss a reviewer whose
focus fits the phase. D001 makes the profiles CLI the discovery step: list the
store, read each candidate's description, and show a full profile only when its
instructions and checklist decide the choice. The same task makes the review
rule explicit: a small, fully gated phase may ship without a review task, and
the waiver reason is recorded rather than implied. D002 applies that CLI-first
rule to the remaining authoring skills, replacing manual store scans and
self-checks with `mf-prompts verify`, `mf-profiles verify`, `mf-reviews resume`,
and `mf-skills list` where they already answer.

Phase E makes parallelism the default instead of an accident. Phases are still
authored as serial task lists, so a phase that could expose four independent
tasks dispatches one worker at a time and the board and mailbox channels C003
ships have no protocol for when to use them. Verification has the opposite
failure: every worker runs its own copy of a heavy check, so parallel agents
typecheck or test the same scope at once and thrash the machine for identical
results. E001 decides the phase shape, the channel protocol, and a verification
scheduler keyed by command, scope, and input fingerprint; E002 implements
single-flight, bounded lanes, and result reuse; E003 teaches the rule in the
authoring and execution artifacts.

Phase F closes the dependency-verification gap this spec's own graph rules
exposed. `check` rejects unknown targets, self-edges, forward-phase edges, and
cycles, but it accepts a non-review task that depends on its own phase's review
task — an explicit acyclic graph whose ready set can never start — and it
accepts a `complete` task whose dependency is still pending, a duplicated
`depends-on` id, and a `related-tasks` entry that resolves to nothing. F001
decides the rule and severity for each; F002 turns them into coded findings
backed by fixtures.

Phase G adds the conditional-variable capability the authoring prompt needs: a
variable can be declared as visible only when an earlier answer selects a
branch, and the verifier, renderer, interactive fill, CLI, and workspace editor
all share one visibility rule. Phase H uses it to replace B003's three-tier,
appraiser-chosen vocabulary with a five-level rigor ladder the user selects at
authoring time, and to add the isolated worktree/branch branch (origin,
worktree and branch name) to the `spec-create` prompt. B003 remains the
historical record; H001 supersedes its tier default without editing the frozen
task.

Phase I closes the read path. The standard ships prompts that create, execute,
and size a spec, but none that tells a human or agent where the spec stands.
`mf-specs status` prints a panel for a caller that already knows the name, and
nothing turns that panel into a report, a diagnosis of what blocks dispatch, or
a recommended next command. The `spec-status` prompt is the read-only
counterpart to `spec-execute`: it takes one spec from the same `source: specs`
picker (branch guess preselected, unfinished specs first), reads the derived
state, ready set, review budget, and verification findings from the existing
commands, and reports what is true, what blocks dispatch, and what to run next.
It writes nothing and never dispatches a worker. I001 fixes the report
contract, I002 ships the prompt through the doctor payload, and I003 exposes it
on the binary, slash, and host tool surfaces with the same no-guess name
resolution as `execute`.

## Requirements

- `Issue` carries a severity with warnings defaulting to non-fatal, a `--strict` promotion, and a `fix` field on par with the prompts package's richer issue shape.
- Profile and prompt verifiers resolve `skills:` names against the workspace skill store and report misses with the offending name; a missing reference never verifies clean again.
- The rigor ladder is a five-level enum with one source of truth in code, a per-level artifact matrix, a per-level user-interaction budget, and a test that fails when the instruction files or skill text drift from the constant. The user selects it at authoring time; B003's three-tier appraiser default is superseded, not edited.
- Prompt variables are a discriminated union with an optional visibility condition on an earlier discrete variable. A hidden variable resolves empty, never counts as missing, and its stale answer is cleared when the controller changes; every prompt that exists today verifies unchanged.
- The `spec-create` prompt asks for the rigor level, then whether the authoring runs in an isolated worktree/branch. When yes it asks the origin (`current`, `main`, or a freeform branch) and the worktree/branch name, and its rendered text carries one deterministic worktree recipe.
- The same authoring inputs reach `mf-specs author`, `/specs author`, `spec_author`, and the `/mf-prompts` fill flow; a hidden branch is never asked, required, or rendered.
- The isolated flow authors inside the new worktree with `workspace-type: worktree` and reports the origin, worktree path, and branch; no CLI mutates the repository, and the prompt is the only place the recipe lives.
- The five rigor files and the prompt text are drift-tested; no rigor file names a task size, model, effort, or review-cycle count, and no existing spec gains a finding when the ladder lands.
- The rigor ladder is the spec-level choice; main's per-task `size` stays the dispatch and review-budget knob. The two never restate each other.
- Above the largest rigor level the appraiser returns a split verdict naming the proposed cut, not a level.
- The v2 standard overrides main's flat layout: B001 keeps the landed task size, sizing config, prompts, doctor, and review-budget work, restores `<spec>/<PHASE>/<task>/`, deletes the hand-written lock list and the reserved `<PHASE>099` task, and migrates every spec before Phase B decides.
- A phase is a directory with its own `PHASE.md` (objective, status, review decision, gate kind), gate file, memory, and broadcast board; tasks live under it and numbering restarts per phase.
- Phase locks are derived from completed tasks, a recorded gate result, and a review round attributed to the phase; the hand-written lock list and the bookkeeping-contradiction state it existed to catch are gone.
- Review is a per-phase decision, `required` or `waived` with a reason, set by the appraiser and recorded in the phase; the reserved `<PHASE>099` task id and its structure check are deleted in B001, and a waiver's record is decided in B004.
- Every `mf-specs` command and the TUI specs picker read the phase tree and the derived state; a phase or task directory is never offered as a spec, and no surface reads `locked-phases`.
- A complete task may declare `size: none` instead of a real size. `none` is a record opt-out, never a dispatch target; an unfinished task that declares it is an error.
- An unchecked completion item or an all-unchecked gate on a `complete` task is an error; an unfinished task may carry unchecked completion and gate items.
- The retrofit proves every completed record before the checks harden, so the tightened errors never need a mass exemption.
- A gate stage declares `kind: mechanical` or `kind: subjective`; an unfinished v2 task's `GATES.md` carries at least one classified stage so `gate run` has a command to execute, while a complete or legacy record keeps its shape. Mechanical stages are executed by the CLI with the result recorded, subjective stages are consumed by a reviewer role.
- `SPEC.md` carries a spec-version read as 1 when absent, warning below the current standard, erroring above it, and accepting current and previous so a spec is never stranded mid-migration.
- `migrate` transforms a v1 tree into the v2 shape; relabeling the version field without transforming the structure is rejected.
- `BOARD.md` is the phase broadcast and `MAILBOX.md` the per-task targeted channel, both append-only with an entry grammar the verifier parses; delivery to a live task session goes through steering the bound session.
- Spec state is written by one orchestrator per spec; workers write only their own memory, never status or locks, and escalate questions instead of asking the user directly.
- Ids, timestamps, status transitions, locks, and the whole tree come from CLI verbs (`new-phase`, `new-task`, `stamp`, `init`, `claim`, `lock`, `state`, `next`, `gate run`, `mail`); the rule is that anything a verifier checks has a generator.
- `doctor` diagnoses and repairs a manifest of shipped payload kinds, `--check` reports without writing, and `mf:check` runs every package's doctor; report-only mode is what every `mf:check:*` script uses.
- The payload manifest replaces the hardcoded per-package name lists, the six embedded-payload generators are shared instead of duplicated, and packaged binaries keep a working `doctor`.
- The five spec-role profiles, the shipped pipeline prompts, and the tier instruction files ship as package payloads and are installed by `doctor`, not hand-copied into a workspace.
- The CI-mutation and compiled-binary defects found in Phase A are fixed, and every decision lands in the docs and the bookkeeper's artifact ledger so the stores stay accurate.
- The exploratory and planning tasks (A001, A002, B003–B005) modify no file outside `.agents/@montflow/specs/`; the execution tasks B001, B002, A003, A004, and C009 are expected to change `packages/specs`, `packages/profiles`, `packages/reviews`, and `packages/prompts`.
- The review cycle is severity-aware. A round whose only open findings are Minor/Nit closes after the fixes with an orchestrator-recorded `minor-deferred` disposition and no further review; any open Critical/Major follows `rework` while rounds remain. At the cap, guided mode halts and asks the user, autonomous mode may open at most one overflow round (`budget + 1`), and a `minor-deferred` round holding a Critical/Major is refused. `mf-specs review decide` computes `start | pass | fix-and-stop | rework | overflow | escalate | waived` from the review store, the phase budget, and the mode; neither the orchestrator nor a worker hand-counts rounds or severities.
- The authoring prompt and the `montflow-create-specs` skill discover reviewer profiles through the profiles CLI (`mf-profiles list`; `/mf-profiles list` in the host), not by assuming what `.agents/@montflow/profiles/` holds. `mf-profiles show <name>` supplies a candidate's instructions and checklist, and a profile is declared only when its focus matches the phase's work.
- The discovery step names the command in the package and workspace skill copies, the shipped `spec-create` prompt, and the README, and the doctor payload matches the package bytes; a rendered prompt carries the instruction.
- A phase is not required to carry a review task. A small phase whose tasks are fully gated may end at its gates; the waiver records the phase, the reason, and the gate evidence that stands in for the round, and B004 decides the file and field that carry it.
- The authoring flow maximizes the ready set: a phase is authored with independent tasks wherever the work allows, `depends-on` carries only a real data or ordering dependency, each task declares its write scope, and two tasks with overlapping scopes either carry a dependency or are split.
- Gate verification has two layers: a task gate names commands scoped to that task's write scope, and phase-shared or repo-wide checks are named once at the phase level, run by the orchestrator, and never copied into a task gate.
- A verification run is keyed by command, scope, and input fingerprint, not by task or agent. At most one run per key is in flight; a second requester waits and reuses the recorded pass while the fingerprint matches; any input change reruns; a failure is never reused as a pass.
- Heavy commands (test, typecheck, build, repo-wide checks) take a bounded lane, default one at a time, with a global in-flight cap; light checks do not take the lane, and a lease expires when its owner disappears.
- `BOARD.md` is broadcast and `MAILBOX.md` is targeted; live delivery steers the bound session, an absent target queues until it starts, and neither channel substitutes for a `depends-on` edge.
- The authoring prompt and skill, the execution prompt, the orchestrator and worker profiles, and the README teach the parallel phase shape, the channel protocol, and the scheduler, and a test fails when that guidance is removed.
- A non-review task may not depend on its own phase's `review` task, directly or through a chain of same-phase dependencies; the review waits on every non-review task, so that edge is a deadlock the verifier reports with its path. A dependency on an earlier phase's review task stays valid.
- A `complete` task whose `depends-on` target is not `complete` is an error; the record contradicts the order the ready set enforces. An unknown dependency keeps its existing finding and is not reported twice.
- A duplicated `depends-on` id is an error, never silently normalized, matching the duplicate `reviewer-profiles` rule.
- A `related-tasks` entry must resolve to a task in the spec and must not name the task itself.
- Every dependency finding carries a stable code, an actionable fix, and a fixture; no spec in the store gains a finding when the rules land.
- The read path ships as the `spec-status` prompt: one required `name` variable with the shared `source: specs` picker, so the branch guess is preselected and unfinished specs sort before complete ones, plus one optional `focus`.
- The status prompt reports only derived truth. It consumes `mf-specs status`, `state`, `next`, `check`, and the review series; it never recomputes readiness, locks, budgets, ids, or timestamps itself.
- The rendered report names the declared status, derived state, active phase, locked phases, ready set, phase review budget, verification result and blockers, and the exact next command. `inconsistent`, blocked, complete, and no-active-phase specs each get an explicit terminal line rather than a guessed action.
- The status prompt is read-only: it writes no `SPEC.md`, `TASK.md`, `MEMORY.md`, or review record, changes no status or lock, and dispatches no worker. When work remains it hands off to `spec-execute`.
- Execution is context-bounded: every v2 in-progress phase carries an `## Execution Brief`; a worker reads only the brief, its task, and scoped source, runs each gate once with repo-wide gates at phase boundaries, keeps its `MEMORY.md` under 80 lines with full logs in `/tmp`, and batches review rework into one fixer attempt and one re-review. `check` warns with `phase.execution-brief-missing` when a phase brief is absent.
- The prompt ships through `packages/specs/payload.json` and the doctor, passes `mf-prompts verify`, and the installed copy matches the packaged bytes. Every binary, slash, and host entry point renders the same text for the same inputs.
- With no explicit name, the status entry point resolves the spec through the shared `which` rule. A detached HEAD, missing candidate, or ambiguous match fails with the candidates and asks the user; it never picks one.

## Tasks

| ID   | Name                                | Type        | Status  | Gates |
| ---- | ----------------------------------- | ----------- | ------- | ----- |
| A001 | explore-verification-surface        | exploratory | complete | No    |
| A002 | explore-payload-doctor-surface      | exploratory | complete | No    |
| A003 | add-issue-severity-channel          | execution   | complete | Yes   |
| A004 | add-artifact-reference-resolution   | execution   | complete | Yes   |
| A099 | review-phase                        | review      | complete | No    |
| B001 | reconcile-main-and-phase-rail       | execution   | complete | Yes  |
| B002 | retrofit-completed-records          | execution   | complete | Yes  |
| B003 | decide-complexity-tiers             | planning    | complete | No   |
| B004 | decide-spec-standard-v2             | planning    | complete | No   |
| B005 | decide-tooling-contract             | planning    | complete | No   |
| B099 | review-phase                        | review      | complete | No   |
| C001 | implement-version-and-structure    | execution   | complete | Yes   |
| C002 | implement-gate-kinds-and-execution  | execution   | complete | Yes   |
| C003 | implement-board-and-mailboxes       | execution   | complete | Yes   |
| C004 | implement-doctor-payload-manifest   | execution   | complete | Yes   |
| C005 | implement-mechanical-state-verbs    | execution   | complete | Yes   |
| C006 | ship-spec-artifact-payloads         | execution   | complete | Yes   |
| C007 | align-docs-and-artifact-ledger      | execution   | complete | No    |
| C008 | align-cli-and-tui-surfaces          | execution   | complete | Yes   |
| C009 | implement-review-cycle-policy       | execution   | complete | Yes   |
| C099 | review-phase | review | complete | No |
| D001 | wire-profile-discovery | execution | complete | Yes |
| D002 | cli-first-verification | execution | complete | Yes |
| D003 | implement-lean-execution-contract | execution | complete | Yes |
| D004 | review-phase | review | complete | No |
| E001 | decide-parallel-execution-contract | planning | complete | No |
| E002 | implement-verification-scheduler | execution | complete | Yes |
| E003 | teach-parallel-phase-authoring | execution | complete | Yes |
| E099 | review-phase | review | complete | No |
| F001 | decide-dependency-contract          | planning    | pending | No    |
| F002 | enforce-dependency-contract         | execution   | pending | Yes   |
| G001 | decide-conditional-variable-contract | planning   | pending | No    |
| G002 | implement-conditional-variable-schema | execution | pending | Yes   |
| G003 | implement-conditional-fill-and-cli  | execution   | pending | Yes   |
| G004 | implement-editor-and-authoring-guidance | execution | pending | Yes |
| G099 | review-phase                        | review      | pending | No    |
| H001 | decide-rigor-ladder-and-authoring-questions | planning | pending | No |
| H002 | implement-five-level-rigor          | execution   | pending | Yes   |
| H003 | rewrite-spec-create-for-rigor-and-isolation | execution | pending | Yes |
| H004 | wire-author-entrypoints             | execution   | pending | Yes   |
| H099 | review-phase                        | review      | pending | No    |
| I001 | decide-status-prompt-contract       | planning    | pending | No    |
| I002 | implement-status-prompt             | execution   | pending | Yes   |
| I003 | wire-status-entrypoints             | execution   | pending | Yes   |
| I099 | review-phase                        | review      | pending | No    |
