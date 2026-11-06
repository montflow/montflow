# Review: montflow-spec-standard / 017

## Metadata
- Target: spec montflow-spec-standard phase H
- Round: 017
- Phase: H
- Type: re-review
- Overflow: user-authorized third round for phase H after the round 016 fix batch
- Overflow-authorized: user
- Isolation: isolated
- Max Attempts: 3
- Status: closed
- Disposition: minor-deferred
- Deferred: F28
- Created: 2026-11-05

## Verdicts on round 016

Re-derived from the code and executed probes, not from the `[Fixer]` claims. `Resolved` means the defect is gone at the cited code and a named test or live probe pins it. All seven round 016 findings are terminal, so none is carried into this round.

| ID  | Severity | Verdict  | Evidence (code · pinning test / probe)                                                                                                                                                                                                                                  |
| --- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2  | Major    | Resolved | `phaseDependencyIssues` (`init.module.ts:290`) runs from `validateInitPlan`, `new-task`, `new-phase`, and `verifyRigorCeilings`; `explorationIssues` rejects a deep/critical exploratory task outside A · live: deep exploratory in B refused (`init.exploration-placement`), phase C with no dependency refused (`init.exploration-missing`), the same task with `dependsOn: ['A001']` accepted; `state.test.ts:440` |
| F15 | Major    | Resolved | suffix parsed at `creation.module.ts:67`; unparseable values stay in `declaredRigor` · `creation/tests/creation.test.ts`; live: `rigor: light (raised-from trivial)` enforces light's 4-task ceiling (5th refused, `init.task-ceiling`), `rigor: light (raised-from mystery)` yields `rigor.unknown` from `check` and `new-task` |
| F16 | Minor    | Resolved | `skill-gate.test.ts:78-94` renders `isolated: no` in a skill-less workspace and asserts the body before `## Skill advisories` has no `using-git-worktrees`, no `.worktrees`, no `isolated: yes`; H003 completion item amended to match                                                                                                  |
| F17 | Minor    | Resolved | `new-task` applies `writesArtifact` on the real post-create count (`cli.newtask.module.ts:697-708`) · `state.test.ts:490`; live: second light task writes `A/BOARD.md`, `A/A001-implement/MAILBOX.md`, `A/A002-second/MAILBOX.md`, matching the init path                                                                                   |
| F18 | Nit      | Resolved | `rigor/tests/behavior.test.ts:114` asserts `validateInitPlan(...)` is `[]` for every `atMax` row; `phasesAt` fixture corrected                                                                                                                                           |
| F19 | Nit      | Resolved | `packages/payload/CHANGELOG.md:7-8` names all five kinds, marks `tier` legacy, and adds `PayloadDoctorResult.rigors`; matches `manifest.module.ts:14`                                                                                                                     |
| F20 | Nit      | Resolved | `guides/installation.md:157-164` and `packages/specs/README.md:601-607` name the tiers→rigors move and the one-time `rm -rf .agents/@montflow/tiers` step                                                                                                                 |

## Findings

### F28 — The deep/critical reach rule accepts a dependency on any phase-A task, so a later phase can build on a non-exploratory task and never on the discovery

- Severity: Minor
- Location: `packages/specs/src/modules/init/init.module.ts:266`, `packages/specs/src/modules/init/init.module.ts:290`
- Status: Resolved
- Attempts: 1
- First Seen: 017
- Problem: `reachesPhaseA` (`:266-280`) returns true for the first dependency whose `phaseIndex === 0`, and `phaseDependencyIssues` (`:290-314`) accepts a later phase when any of its tasks reaches phase A by that test. The predicate never looks at the task type, so in a phase A that also holds work tasks it accepts a dependency on a non-exploratory task. Reproduced on a fresh tree: `init --name probe --rigor deep` (phase A seeds `A001` exploratory), `new-task --phase A --task setup --type execution` (adds `A003`, which depends on nothing), `new-phase --objective "Third slice"` (adds C), `new-task --phase C --task build --type execution --depends-on A003` → `✓ added C001`, and `check` reports `0 failed · 0 issues`. Deep's rule is that every later phase depends on "the task that carries it" — the exploration — and C001 does not. The same path also satisfies the critical rule.
- Impact: a deep or critical spec can grow a later phase that grounds itself in a phase-A work task and never sees the exploration, so the level's shape guarantee (later work builds on the discovery) is satisfied syntactically but not semantically. The narrowing is easy to hit because deep and critical both permit work tasks in phase A, and `new-task` offers `A003` as a valid dependency target.
- Suggestion: make `reachesPhaseA` type-aware — return true only when the reached phase-A task is the exploratory one (or when the reached task transitively depends on it), and have `phaseDependencyIssues` report the same `init.exploration-missing` finding when a later phase reaches only non-exploratory A tasks. Pin a fixture where a deep phase C that depends only on an A work task is refused and one that depends on `A001` is accepted.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

[Fixer] Attempt 1 — narrowed the reach predicate to the exploration task.

- Changed `packages/specs/src/modules/init/init.module.ts:266` — `reachesPhaseA` became `reachesExploration`, which returns true only for a dependency path that reaches a phase-A `exploratory` task id (directly or transitively through phase-A work); an A work task no longer counts by itself.
- Changed `packages/specs/src/modules/init/init.module.ts:291` — `phaseDependencyIssues` builds the phase-A exploration id set and reports `init.exploration-missing` when every later-phase task fails that path; expected/actual/fix text now names the exploration task. Existing legal trees (default deep/critical plans, phase-A work that depends on the exploration, later phases depending on that work) still reach it transitively.
- Pinning tests: `packages/specs/src/apps/cli/tests/state.test.ts:490` (`keeps a grown deep phase grounded in the phase A exploration task`) reproduces the round's exact sequence — `init --rigor deep`, `new-task --phase A setup`, `new-phase`, `new-task --phase C --depends-on A003` refused with `init.exploration-missing` — then accepts a C task on `A001`, rewrites it to `A003`, and asserts `check` fails with `init.exploration-missing` on the drifted tree. `packages/specs/src/modules/init/tests/init.test.ts:167` pins plan validation (A work dependency refused, exploration dependency accepted). `packages/specs/src/modules/structure/tests/verify-spec-tree.test.ts:1364` and `:1376` pin the check-layer refusal and the transitive acceptance.
- Verification: `bun run --cwd packages/specs test` → 148 files / 2219 tests passed, no type errors; `bun run --cwd packages/specs lint:check` → pass; `bun run --cwd packages/specs ts:check` → pass; `bun run --cwd packages/specs format:check` → pass.
- Assumption: a later phase may reach the exploration through any phase-A work task that itself depends on the exploration task; the round's suggestion allows that transitive form. No packaged payload file changed, so no doctor/embedded-payload refresh was needed.

## Summary

- Critical: 0
- Major: 0
- Minor: 1
- Nit: 0
- Open: 0
- In Review: 0
- Resolved: 1
- Won't Fix: 0
- Escalated: 0
