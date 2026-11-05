# Review: montflow-spec-standard / 016

## Metadata
- Target: spec montflow-spec-standard phase H
- Round: 016
- Phase: H
- Type: re-review
- Overflow: user-authorized second round for phase H after the round 015 fix batch
- Overflow-authorized: user
- Isolation: isolated
- Max Attempts: 3
- Status: open
- Created: 2026-11-04

## Verdicts on round 015

Re-derived from the code and tests, not from the `[Fixer]` claims. `Resolved`
means the defect is gone at the cited code and a named test pins it; `Open`
means the defect survives or the fix is incomplete. Statuses are also written
into round 015, which keeps the full per-finding thread.

| ID  | Severity | Verdict  | Evidence (code · pinning test)                                                                                                                                                                                                                                                                                                                       |
| --- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Critical | Resolved | `init.module.ts:606-620`, `cli.newphase.module.ts:119-137`, `phase.module.ts:776-798` · `init/tests/init.test.ts:322`, `cli/tests/state.test.ts:342`; live `init --rigor standard … --review A:none` refuses with `rigor.review-forbidden` and exit 1                                                                                                  |
| F2  | Major    | Open     | ceilings, the trivial gate rule, the waiver policy and the deep-in-A cap now run in `new-task`/`new-phase` (`state.test.ts:362,404`, `rigor/tests/behavior.test.ts:105`), but the deep/critical later-phase exploration rules are still `init`-only — see the finding                                                                                    |
| F3  | Major    | Resolved | `prompts/spec-create.json` step 4 (`current` → `git branch --show-current`, `main` → `git fetch origin` + `origin/main`, `other` → `git rev-parse --verify`), same text in `skills/montflow-create-specs/SKILL.md` and `profiles/spec-creation-orchestrator/PROFILE.md:47` · `cli/tests/author-execute.test.ts:389-419`                             |
| F4  | Major    | Resolved | prompt step 4: `isolated: no (requested yes, creation denied)`, "author nothing, and never fall back to the current checkout", success line conditional on creation · `cli/tests/author-execute.test.ts:413,417`                                                                                                                                      |
| F5  | Major    | Resolved | `rigors/trivial.md:62-67` stops and reports, only the user may raise, records `(raised-from trivial)`; prompt step 1 puts the escalation inside the budget (0 at `trivial`) · `cli/tests/author-execute.test.ts:421-435`                                                                                                                               |
| F6  | Major    | Resolved | `waiverAllowed` derives from `RIGOR_CONTRACT[rigor].waiver` (`rigor.module.ts:186`), `writesArtifact` (`:203`) drives `BOARD.md`/`MAILBOX.md` in `renderInitTree` (`init.module.ts:897-900`), the inert `grilling` field is gone from the contract and all five files (`drift.test.ts:37-50` asserts the exact frontmatter key set) · `rigor/tests/behavior.test.ts:175,186` |
| F7  | Minor    | Resolved | `composeAuthorRerun` (`cli.author.inputs.ts:61-85`) composes the accepted answers plus the missing flag · `cli/tests/author-execute.test.ts:496-620` (ten cases, each exact line), `cli/tests/run-slash.test.ts:627`                                                                                                                                   |
| F8  | Minor    | Resolved | prompt step 4 states Type `feat`, Push `false`, branch `feat/<name>`, path `.worktrees/feat/<name>`, no push unless asked · `cli/tests/author-execute.test.ts:403-416`                                                                                                                                                                                |
| F9  | Minor    | Resolved | `packages/specs/README.md:170,321-325`, `skills/montflow-create-specs/SKILL.md:44,556`, `apps/cli/CONTEXT.md:68,228`, server command description — every `author` line carries `--rigor`/`--isolated`                                                                                                                                                |
| F10 | Minor    | Resolved | `AGENTS.md:82,89,92,119` name the `rigor` verb, `spec_rigor`, the `rigor` payload kind, `.agents/@montflow/rigors`; `guides/installation.md:151` says rigor files; no `tier` token remains outside the frozen split field and CHANGELOG history                                                                                                        |
| F11 | Minor    | Resolved | `rigor/tests/behavior.test.ts` (ceilings at max and one above for all five, the `waiverAllowed` matrix, the deep two-exploration cap, the critical dedicated phase A, a light exploratory task in phase B) · `cli/tests/state.test.ts:404-438`                                                                                                        |
| F12 | Minor    | Resolved | `using-git-worktrees` is in the prompt's `skills` array, the README advisory table (`:288`), and the skill prerequisite paragraph · `prompt/tests/skill-gate.test.ts:78-88` (its side effect is F16)                                                                                                                                                  |
| F13 | Nit      | Resolved | `cli.state.module.ts:658` exports `rigorCommand`; `cli.slash.module.ts:70,129` import it; no `tierCommand` remains                                                                                                                                                                                                                                  |
| F14 | Nit      | Resolved | `rigors/critical.md:68` replaces the review-waiver topic with "which phases carry the discovery"; the file still keeps its 8-question budget (`drift.test.ts:250`)                                                                                                                                                                                   |

## Findings

### F2 — The ladder's ceilings, exploration, and gate rules are enforced only by `init`; `new-phase` and `new-task` grow past any level and `check` stays green

- Severity: Major
- Location: `packages/specs/src/modules/init/init.module.ts:556`, `packages/specs/src/modules/init/init.module.ts:278`, `packages/specs/src/apps/cli/cli.newtask.module.ts:366`, `packages/specs/src/apps/cli/cli.newphase.module.ts:138`
- Status: Open
- Attempts: 1
- First Seen: 015
- Problem: the ceilings, the trivial gate rule, the waiver policy, the `light`/`standard` placement rule and the deep one-in-A cap are now enforced at growth. The two remaining deep/critical exploration rules are still `init`-only: the "every later phase depends on the exploration phase A" check lives inside `validateInitPlan` (`init.module.ts:556-581`) and never runs in `new-phase`/`new-task`, and `explorationIssues` (`init.module.ts:354-394`) never rejects an exploratory task placed outside phase A for `deep`/`critical` (unlike `light`/`standard`, `:327-352`). Reproduced on a fresh tree: `init --name probe --rigor deep` then `new-task --phase B --task look-more --type exploratory` adds `B003` and `check` reports `0 failed · 0 issues`; `init --rigor deep`, `new-phase --objective "Third slice"`, `new-task --phase C --task build --type execution` produces a phase that never depends on the exploration phase A and `check` still reports `0 failed · 0 issues`. `deep.md` says "every later phase depends on the task that carries it" and "one exploratory task in phase `A`"; `critical.md` says "later phases `depends-on` its findings and do not repeat the discovery".
- Impact: a `deep` or `critical` spec can grow a later phase that ignores its discovery, or repeat the discovery in a later phase, and neither the generator nor `check` reports it. The level's central shape guarantee holds only at `init` time, so the documented growth path silently drifts the tree from the rigor the user chose.
- Suggestion: move the "later phase reaches phase A" predicate out of `validateInitPlan` into an exported helper that `explorationIssues` (or a sibling) exposes, call it from `new-phase` (the new phase has no task yet, so defer it until `new-task` adds the phase's first task) and `new-task`, and add the deep/critical "exploratory only in phase A" rule to `explorationIssues`; report both from `verifyRigorCeilings` so an already-drifted tree fails `check`. Fixtures: a deep `new-task` exploratory in phase B refused, and a deep phase C whose first task has no path to A refused.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — Extracted `explorationIssues` and `ceilingIssues` (`packages/specs/src/modules/init/init.module.ts:278`, `:407`) so `validateInitPlan`, `new-task` (`cli.newtask.module.ts`) and `new-phase` (`cli.newphase.module.ts`) read the same rules; both generators now refuse a phase/task past `maxPhases`/`maxTasks`/`maxTasksPerPhase` and refuse exploration the rigor forbids. `verifyRigorCeilings` (`packages/specs/src/modules/structure/structure.rigor.module.ts`) adds `rigor.unknown` and `rigor.ceiling-exceeded` findings to `check`. Fixtures: `rigor/tests/behavior.test.ts` and the new `Cli.rigor growth runtime` suite. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Partially resolved; reopened. Confirmed in code: the ceilings (`ceilingIssues`, `init.module.ts:407`), the deep one-in-A cap, the trivial gate rule and the waiver policy all run in `new-task`/`new-phase` and are pinned by `cli/tests/state.test.ts:362-438` and `rigor/tests/behavior.test.ts:105-155`. Still failing: the deep/critical "later phase depends on A" predicate stayed inside `validateInitPlan` (`init.module.ts:556-581`), `new-task` and `new-phase` never run it, and `explorationIssues` (`:354-394`) has no "exploratory only in A" rule for `deep`/`critical`. Live repro: `init --rigor deep` then `new-task --phase B --task look-more --type exploratory` → added, `check` = 0 issues; `init --rigor deep`, `new-phase`, `new-task --phase C --type execution` (no dependency) → added, `check` = 0 issues. The already-enforced half is accepted; the rest is owed.

### F15 — The documented `rigor: <new> (raised-from <old>)` escalation record is unparseable, so an escalated spec silently loses every rigor rule

- Severity: Major
- Location: `packages/specs/src/modules/creation/creation.module.ts:56`, `packages/specs/prompts/spec-create.json:4`, `packages/specs/rigors/trivial.md:66`, `packages/profiles/profiles/spec-creation-orchestrator/PROFILE.md:70`
- Status: Open
- Attempts: 0
- First Seen: 016
- Problem: the prompt (step 1 and step 7), `trivial.md`, and the creation profile all tell the run to record the accepted escalation as `rigor: <new> (raised-from <old>)`, but `creationOf` matches `^rigor:\s*(\S+)$` (`creation.module.ts:56`), which cannot consume the trailing ` (raised-from …)`. The line is skipped, so both `rigorOfSpec` and `declaredRigorOfSpec` return `undefined`: no rigor is applied and no `rigor.unknown` is reported, because the record looks absent rather than unrecognised. Reproduced: `init --rigor trivial`, change the record to `- rigor: light (raised-from trivial)`, then four `new-task` calls → a five-task `light` spec (ceiling 4) and `check` prints `0 failed · 0 issues`. The same record also leaves `questions <n>/<budget>` at the old level's budget. Additionally, step 5's literal `init --rigor {{rigor}}` cannot apply the raised level at all, so the tree and the recorded level disagree as well.
- Impact: following the documented escalation flow turns off every rule this phase just added — ceilings, the review requirement, the waiver policy, exploration — on a spec that the user explicitly raised to a stricter level, and the verifier sees nothing. The highest-integrity path in the flow (the user says "this is bigger than I thought") is the one that disables the ladder.
- Suggestion: parse the optional suffix (`^rigor:\s*(\S+)(?:\s+\(raised-from (\S+)\))?$`) and expose the base level to `rigorOfSpec` (plus a `raised-from` value for the record), or record the escalation on its own `raised-from: <old>` line and keep `rigor:` a single token; report an unparseable `rigor:` value as `rigor.unknown` instead of ignoring it; have step 5 take the raised level (or state that the run re-runs `init` with it); and pin both a parsed `(raised-from)` record and a `check` finding for a malformed one.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F16 — An in-place rendering still names `using-git-worktrees`, so `isolated: no` carries worktree text whenever the skill is absent

- Severity: Minor
- Location: `packages/specs/prompts/spec-create.json:63`, `packages/specs/src/apps/cli/tests/author-execute.test.ts:85`, `.agents/@montflow/specs/montflow-spec-standard/H/H003-rewrite-spec-create-for-rigor-and-isolation/TASK.md:65`
- Status: Open
- Attempts: 0
- First Seen: 016
- Problem: `using-git-worktrees` was added to the prompt's static `skills` array. The prompt gate emits a `prompt.skill-advisory` block for every declared but uninstalled skill, and that block names the skill and its install command in the rendered text. Reproduced in a fresh doctor-only workspace: `author --request … --rigor standard --isolated no` renders `code ! prompt.skill-advisory`, `field using-git-worktrees`, and the install line — text a non-isolated run never uses. The pinning test hides this by pre-installing the skill in its fixture (`author-execute.test.ts:85-97`, with the comment "install it so advisory text does not leak into the authoring assertions"), so H003's completion item "the rendered prompt with `isolated: no` contains no origin or worktree token" (`H/H003-…/TASK.md:65`) is only true in a workspace that already has the skill.
- Impact: the common in-place authoring run in a workspace without the worktree skill is shown an advisory for a skill it will not load, and the completion criterion that was supposed to prove otherwise passes only because the fixture installs it.
- Suggestion: keep the advisory honest but scoped — have the prompt loader emit an advisory only for a declared skill the visible branch needs (e.g. a `when`-scoped skills entry, or a prompt-level `conditionalSkills`), or keep the declaration and change the criterion and test so the advisory text is expected and excluded from the "no worktree token" assertion; in either case add a test that renders `isolated: no` in a workspace without the skill and asserts what the user actually sees.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F17 — The conditional artifact arm never fires outside `init`, so a `light` phase grown past one task gets no `BOARD.md`/`MAILBOX.md`

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.newphase.module.ts:248`, `packages/specs/src/apps/cli/cli.newtask.module.ts:604`, `packages/specs/src/modules/rigor/rigor.module.ts:203`
- Status: Open
- Attempts: 0
- First Seen: 016
- Problem: `writesArtifact` is called in `renderInitTree` (`init.module.ts:897-900`) and once in `new-phase`, but `new-phase` passes `tasksIn(snapshot, id).length` for the phase it is about to create — structurally always `0`, so the conditional arm can never be true there. `new-task` never calls it. Reproduced: `init --rigor light` (one task) then `new-task --phase A --task second --type execution` yields a two-task phase with no `A/BOARD.md` and no `A/A00*/MAILBOX.md`, while `init --rigor light --task A:one:execution --task A:two:execution` writes `A/BOARD.md`. `light.md` says "A `BOARD.md` and a `MAILBOX.md` appear when the phase holds more than one concurrent task", and `check` reports nothing either way.
- Impact: two trees of the same level and the same shape carry different artifacts depending on whether they were built or grown, so the per-level artifact matrix — the one source of truth F6 established — is not what the generated tree follows.
- Suggestion: in `new-task`, after the task is written, add the phase `BOARD.md` and the task `MAILBOX.md` when the phase's new work-task count makes `writesArtifact` true (and add them to the remaining task dirs for `MAILBOX.md`), or drop the conditional arm and state in each rigor file that the channels are created on first `mail`. Pass the real future count in `new-phase` (0 is correct there; the artifact should be created by the first `new-task`) and pin both paths in one test.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F18 — The "accepts every level at its ceiling" test only filters two codes, so a plan that violates exploration still counts as accepted

- Severity: Nit
- Location: `packages/specs/src/modules/rigor/tests/behavior.test.ts:107-119`
- Status: Open
- Attempts: 0
- First Seen: 016
- Problem: the accepting half asserts only that the codes equal to `init.phase-count`/`init.task-ceiling` are absent; any other finding at the ceiling — `init.exploration-placement`, `init.exploration-count`, `init.review-reason` — passes the assertion unchanged. The test name claims the plan is accepted at the ceiling, but it never asserts zero issues, so a regression that adds an exploration finding to a legal plan is invisible.
- Impact: the one test that pins "at the ceiling is legal" does not pin legality, so the boundaries F11 exists to protect can drift while the suite stays green.
- Suggestion: assert `validateInitPlan(...)` equals `[]` for every `atMax` row (the fixtures already produce zero issues), keeping the filtered assertion only for the over-ceiling rows.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F19 — The payload changelog still describes four payload kinds

- Severity: Nit
- Location: `packages/payload/CHANGELOG.md:7`, `packages/payload/src/modules/manifest/manifest.module.ts:14`
- Status: Open
- Attempts: 0
- First Seen: 016
- Problem: `PAYLOAD_KINDS` now lists `skill`, `profile`, `prompt`, `tier`, `rigor`, but the package's `## Unreleased` entry still says "the four kinds `skill`, `profile`, `prompt`, and `tier`". The `rigor` kind, its `INSTALL_ROOT`, and the new `PayloadDoctorResult.rigors` field land with no changelog line.
- Impact: the package's own release note contradicts the exported contract, and a compiled-binary consumer reading it will not know the `rigor` kind exists.
- Suggestion: add the `rigor` kind (and the `rigors` result field) to the Unreleased entry and state whether `tier` is kept only for reading older manifests.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

### F20 — The rename to `.agents/@montflow/rigors` leaves every previously installed `tiers/` store behind with no cleanup or migration note

- Severity: Nit
- Location: `packages/payload/src/modules/install/install.module.ts:110`, `guides/installation.md:151`, `AGENTS.md:119`
- Status: Open
- Attempts: 0
- First Seen: 016
- Problem: doctor never deletes an unlisted file, and the store it verifies moved from `.agents/@montflow/tiers` to `.agents/@montflow/rigors`. A workspace that installed C006's three tier files keeps them: nothing reports them, `mf-specs rigor` never reads them, and no doc tells the user to remove them. This repository only lost them because the rename was staged by hand.
- Impact: an upgraded workspace keeps a stale three-level rigor store that looks authoritative (same shape, old names) and is invisible to `mf:check`, `doctor --check`, and the new read path.
- Suggestion: name the old store once in `guides/installation.md` (remove `.agents/@montflow/tiers/` after upgrading) or have `doctor` report a directory it once owned but no longer ships as a one-line advisory, and add the same line to the specs README migration note.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

## Summary

- Critical: 0
- Major: 2
- Minor: 2
- Nit: 3
- Open: 7
- In Review: 0
- Resolved: 0
- Won't Fix: 0
- Escalated: 0
