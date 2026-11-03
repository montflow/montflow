---
id: H001
name: decide-rigor-ladder-and-authoring-questions
type: planning
originator: user
size: medium
depends-on: B003
related-tasks: H002, H003, H004
status: pending
---

# Task H001: decide the rigor ladder and the authoring questions

## Type: planning

## Description

B003 fixed three complexity tiers (`micro`, `standard`, `full`) and made the
appraiser choose one; the user now wants five levels, chosen by the user at
authoring time, and a branch that authors the spec in an isolated
worktree/branch. Decide the five-level ladder and the authoring question flow
once, and state exactly how it supersedes B003 without editing the frozen
record. The conditional-variable contract G001 decides how the questions are
expressed; this task decides what is asked and what each answer buys.

## Requirements

- **The ladder.** Define five ordered levels with one source of truth in code.
  Start from `trivial`, `light`, `standard`, `deep`, `critical`; rename only
  with a stated reason. For each level fix: minimum and maximum phases, whether
  exploration is forbidden, optional, or required, the total and per-phase task
  ceilings, the gate expectation, the review default and waiver policy, the
  user-interaction budget in `ask_user` calls, and the required and conditional
  artifacts.
- **The user owns the choice.** The authoring prompt asks for rigor as a
  required select with no silent default. The appraiser may recommend a level
  and must flag a request that the chosen level cannot hold, but it never
  overrides the user. Decide what happens when the work exceeds the chosen
  level's ceiling (re-appraise, escalate, or split) and what the final line
  records.
- **No restatement with `size`.** Rigor decides phases, exploration, ceilings,
  gates, review defaults, artifacts, and questions. `size` keeps dispatch
  targets and review-cycle budgets. No rigor file names a size, model, effort,
  or review-cycle count.
- **Question flow.** Fix the exact order, labels, types, options, defaults,
  required flags, and conditional `when` values:
  1. `rigor` — select, five options, required.
  2. `isolated` — select `yes`/`no`, required.
  3. `origin` — select `current`/`main`/`other`, required, visible only when
     `isolated` is `yes`.
  4. `origin-branch` — text, required, visible only when `origin` is `other`.
  5. `worktree-name` — text, required, visible only when `isolated` is `yes`.
  The request and notes variables keep their current positions and behaviour.
- **Worktree recipe.** Delegate creation to the existing `using-git-worktrees`
  skill; never hand-roll `git worktree add` in the prompt. Decide how `current`
  resolves (the checked-out branch, or detached HEAD), how `main` resolves
  (`origin/main` after a fetch), how a freeform `origin-branch` resolves, the
  branch/prefix convention for `worktree-name`, the worktree path, whether the
  branch is pushed, and how the prompt hands the resulting path to
  `mf-specs create --workspace-type worktree`. The authoring run must not create
  a nested worktree when it already runs in one.
- **Persistence.** Decide whether `rigor` is stored in `SPEC.md`, only recorded
  in the run's final line, or recovered from the phase review decisions. B003
  deliberately stored no tier; state whether this decision changes and why.
  Execution must never need the ladder to read a phase's review decision.
- **Supersession.** Name the exact edits to B003's enum and matrix, to C006's
  three tier files and its prompt rewrite, and to the drift test. No completed
  record is edited; the new decision explicitly supersedes it. No existing spec
  gains a finding.
- **Split boundary.** Keep B003 F5's split verdict above the largest level,
  including its exact fields and the rule that volume alone never splits.
- Record the full matrix, the question flow, the worktree recipe, and the
  supersession list in `MEMORY.md`, sufficient for H002–H004 to implement
  without asking anything.

## Completion

- [ ] Five level names, their order, and the full per-level matrix are in `MEMORY.md`
- [ ] The question flow lists every variable with type, options, default, required, and `when`
- [ ] The worktree recipe delegates to `using-git-worktrees` and fixes origin resolution, branch/path convention, and push policy
- [ ] The persistence decision and its effect on execution are stated
- [ ] The supersession list names every B003/C006 edit, and the split boundary is unchanged
