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
- Status: Resolved
- Attempts: 2
- First Seen: 015
- Problem: the ceilings, the trivial gate rule, the waiver policy, the `light`/`standard` placement rule and the deep one-in-A cap are now enforced at growth. The two remaining deep/critical exploration rules are still `init`-only: the "every later phase depends on the exploration phase A" check lives inside `validateInitPlan` (`init.module.ts:556-581`) and never runs in `new-phase`/`new-task`, and `explorationIssues` (`init.module.ts:354-394`) never rejects an exploratory task placed outside phase A for `deep`/`critical` (unlike `light`/`standard`, `:327-352`). Reproduced on a fresh tree: `init --name probe --rigor deep` then `new-task --phase B --task look-more --type exploratory` adds `B003` and `check` reports `0 failed · 0 issues`; `init --rigor deep`, `new-phase --objective "Third slice"`, `new-task --phase C --task build --type execution` produces a phase that never depends on the exploration phase A and `check` still reports `0 failed · 0 issues`. `deep.md` says "every later phase depends on the task that carries it" and "one exploratory task in phase `A`"; `critical.md` says "later phases `depends-on` its findings and do not repeat the discovery".
- Impact: a `deep` or `critical` spec can grow a later phase that ignores its discovery, or repeat the discovery in a later phase, and neither the generator nor `check` reports it. The level's central shape guarantee holds only at `init` time, so the documented growth path silently drifts the tree from the rigor the user chose.
- Suggestion: move the "later phase reaches phase A" predicate out of `validateInitPlan` into an exported helper that `explorationIssues` (or a sibling) exposes, call it from `new-phase` (the new phase has no task yet, so defer it until `new-task` adds the phase's first task) and `new-task`, and add the deep/critical "exploratory only in phase A" rule to `explorationIssues`; report both from `verifyRigorCeilings` so an already-drifted tree fails `check`. Fixtures: a deep `new-task` exploratory in phase B refused, and a deep phase C whose first task has no path to A refused.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — Extracted `explorationIssues` and `ceilingIssues` (`packages/specs/src/modules/init/init.module.ts:278`, `:407`) so `validateInitPlan`, `new-task` (`cli.newtask.module.ts`) and `new-phase` (`cli.newphase.module.ts`) read the same rules; both generators now refuse a phase/task past `maxPhases`/`maxTasks`/`maxTasksPerPhase` and refuse exploration the rigor forbids. `verifyRigorCeilings` (`packages/specs/src/modules/structure/structure.rigor.module.ts`) adds `rigor.unknown` and `rigor.ceiling-exceeded` findings to `check`. Fixtures: `rigor/tests/behavior.test.ts` and the new `Cli.rigor growth runtime` suite. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Partially resolved; reopened. Confirmed in code: the ceilings (`ceilingIssues`, `init.module.ts:407`), the deep one-in-A cap, the trivial gate rule and the waiver policy all run in `new-task`/`new-phase` and are pinned by `cli/tests/state.test.ts:362-438` and `rigor/tests/behavior.test.ts:105-155`. Still failing: the deep/critical "later phase depends on A" predicate stayed inside `validateInitPlan` (`init.module.ts:556-581`), `new-task` and `new-phase` never run it, and `explorationIssues` (`:354-394`) has no "exploratory only in A" rule for `deep`/`critical`. Live repro: `init --rigor deep` then `new-task --phase B --task look-more --type exploratory` → added, `check` = 0 issues; `init --rigor deep`, `new-phase`, `new-task --phase C --type execution` (no dependency) → added, `check` = 0 issues. The already-enforced half is accepted; the rest is owed.

**[Fixer]** — Extracted the reach predicate to `phaseDependencyIssues` (`packages/specs/src/modules/init/init.module.ts:290`) and now call it from `validateInitPlan` (`:623`), `new-phase` (`packages/specs/src/apps/cli/cli.newphase.module.ts:155`, empty new phase deferred), `new-task` (`packages/specs/src/apps/cli/cli.newtask.module.ts:634`, candidate and its real `depends-on` included), and `verifyRigorCeilings` (`packages/specs/src/modules/structure/structure.rigor.module.ts:104`, live tree). `explorationIssues` now rejects any `deep`/`critical` exploratory task outside phase A (`init.module.ts:445-456`) and ignores a generated phase-A review task when testing the critical dedicated phase (`:394-397`). Pinned by `state.test.ts:440` (deep exploratory in B refused, phase C task with no path refused, the same task with `dependsOn: ['A001']` accepted) and `structure/tests/verify-spec-tree.test.ts:1344,1354` (check reports both findings on a drifted tree). Verified: `bun run --cwd packages/specs test`, `lint:check`, `ts:check`, `format:check` pass.

**[Reviewer]** — Resolved. Re-derived from the code and live probes on fresh trees: `init --rigor deep` then `new-task --phase B --task look-more --type exploratory` is refused with `init.exploration-placement`; a phase C execution task with no dependency is refused with `init.exploration-missing`; the same task with `dependsOn: ['A001']` is accepted and `check` stays green. `phaseDependencyIssues` (`init.module.ts:290`) is called by `validateInitPlan`, `new-task`, `new-phase`, and `verifyRigorCeilings`, and `explorationIssues` rejects a `deep`/`critical` exploratory task outside A. The init-only defect this finding named is gone. A narrower gap in the same predicate — it accepts a dependency on any phase-A task, not the exploratory one — is filed separately as F28 in round 017.

### F15 — The documented `rigor: <new> (raised-from <old>)` escalation record is unparseable, so an escalated spec silently loses every rigor rule

- Severity: Major
- Location: `packages/specs/src/modules/creation/creation.module.ts:56`, `packages/specs/prompts/spec-create.json:4`, `packages/specs/rigors/trivial.md:66`, `packages/profiles/profiles/spec-creation-orchestrator/PROFILE.md:70`
- Status: Resolved
- Attempts: 1
- First Seen: 016
- Problem: the prompt (step 1 and step 7), `trivial.md`, and the creation profile all tell the run to record the accepted escalation as `rigor: <new> (raised-from <old>)`, but `creationOf` matches `^rigor:\s*(\S+)$` (`creation.module.ts:56`), which cannot consume the trailing ` (raised-from …)`. The line is skipped, so both `rigorOfSpec` and `declaredRigorOfSpec` return `undefined`: no rigor is applied and no `rigor.unknown` is reported, because the record looks absent rather than unrecognised. Reproduced: `init --rigor trivial`, change the record to `- rigor: light (raised-from trivial)`, then four `new-task` calls → a five-task `light` spec (ceiling 4) and `check` prints `0 failed · 0 issues`. The same record also leaves `questions <n>/<budget>` at the old level's budget. Additionally, step 5's literal `init --rigor {{rigor}}` cannot apply the raised level at all, so the tree and the recorded level disagree as well.
- Impact: following the documented escalation flow turns off every rule this phase just added — ceilings, the review requirement, the waiver policy, exploration — on a spec that the user explicitly raised to a stricter level, and the verifier sees nothing. The highest-integrity path in the flow (the user says "this is bigger than I thought") is the one that disables the ladder.
- Suggestion: parse the optional suffix (`^rigor:\s*(\S+)(?:\s+\(raised-from (\S+)\))?$`) and expose the base level to `rigorOfSpec` (plus a `raised-from` value for the record), or record the escalation on its own `raised-from: <old>` line and keep `rigor:` a single token; report an unparseable `rigor:` value as `rigor.unknown` instead of ignoring it; have step 5 take the raised level (or state that the run re-runs `init` with it); and pin both a parsed `(raised-from)` record and a `check` finding for a malformed one.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — `creationOf` now parses the optional suffix `^(\S+)(?:\s+\(raised-from\s+(\S+)\))?$` (`packages/specs/src/modules/creation/creation.module.ts:67`), returns the raised level from `rigorOfSpec`, and exposes `raisedFrom`/`declaredRaisedFrom` plus `raisedFromOfSpec` (`:128`). Any line that starts `rigor:` but does not parse, or whose `raised-from` value is not a rigor, keeps the raw value in `declaredRigor` so `verifyRigorCeilings` reports `rigor.unknown` instead of treating the record as absent. Prompt steps 1, 5, and 7 now say the writer parses the suffix, step 5 takes the effective/raised level, and the recorded `questions <n>/<budget>` uses the raised level's budget (`packages/specs/prompts/spec-create.json`); `rigors/trivial.md` and the creation profile say the same. Pinned by `creation/tests/creation.test.ts` (parsed suffix record plus two malformed records that yield `rigor.unknown`). Verified: `bun run --cwd packages/specs test`, `lint:check`, `ts:check`, `format:check` pass; the installed prompt and profile were refreshed with doctor.

**[Reviewer]** — Resolved. Live probes agree with the code: a `trivial` spec whose record is changed to `- rigor: light (raised-from trivial)` enforces light's 4-task ceiling — the fifth `new-task` is refused with `init.task-ceiling` "A light plan allows 4 work tasks; it declares 5" — and `- rigor: light (raised-from mystery)` produces `rigor.unknown` from both `check` and `new-task`. The suffix is parsed in `creation.module.ts:67`, the raw value is retained on a failed parse, and `creation/tests/creation.test.ts` pins the parsed and malformed records. The escalation record no longer disables the ladder.

### F16 — An in-place rendering still names `using-git-worktrees`, so `isolated: no` carries worktree text whenever the skill is absent

- Severity: Minor
- Location: `packages/specs/prompts/spec-create.json:63`, `packages/specs/src/apps/cli/tests/author-execute.test.ts:85`, `.agents/@montflow/specs/montflow-spec-standard/H/H003-rewrite-spec-create-for-rigor-and-isolation/TASK.md:65`
- Status: Resolved
- Attempts: 1
- First Seen: 016
- Problem: `using-git-worktrees` was added to the prompt's static `skills` array. The prompt gate emits a `prompt.skill-advisory` block for every declared but uninstalled skill, and that block names the skill and its install command in the rendered text. Reproduced in a fresh doctor-only workspace: `author --request … --rigor standard --isolated no` renders `code ! prompt.skill-advisory`, `field using-git-worktrees`, and the install line — text a non-isolated run never uses. The pinning test hides this by pre-installing the skill in its fixture (`author-execute.test.ts:85-97`, with the comment "install it so advisory text does not leak into the authoring assertions"), so H003's completion item "the rendered prompt with `isolated: no` contains no origin or worktree token" (`H/H003-…/TASK.md:65`) is only true in a workspace that already has the skill.
- Impact: the common in-place authoring run in a workspace without the worktree skill is shown an advisory for a skill it will not load, and the completion criterion that was supposed to prove otherwise passes only because the fixture installs it.
- Suggestion: keep the advisory honest but scoped — have the prompt loader emit an advisory only for a declared skill the visible branch needs (e.g. a `when`-scoped skills entry, or a prompt-level `conditionalSkills`), or keep the declaration and change the criterion and test so the advisory text is expected and excluded from the "no worktree token" assertion; in either case add a test that renders `isolated: no` in a workspace without the skill and asserts what the user actually sees.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — Took the suggestion's second path: the declaration stays honest and the criterion now states what a skill-less workspace actually sees. `prompt/tests/skill-gate.test.ts:78-94` installs only the packaged payloads, renders `spec-create` with `isolated: no`, asserts `using-git-worktrees` appears only in the appended `prompt.skill-advisory` block, and asserts the template body before that block contains no `using-git-worktrees`, no `.worktrees`, and no `isolated: yes`. The H003 completion item now says the body carries no origin/worktree token and a skill-less workspace adds only the advisory (`.agents/@montflow/specs/montflow-spec-standard/H/H003-rewrite-spec-create-for-rigor-and-isolation/TASK.md:65`). No prompt schema change, so a non-isolated render still warns about a declared skill it will not load. Verified: `bun run --cwd packages/specs test`, `lint:check`, `ts:check`, `format:check` pass.

**[Reviewer]** — Resolved. The fixer took the finding's allowed second path: keep the declaration honest, state what a skill-less workspace actually sees, and pin it. `prompt/tests/skill-gate.test.ts:78-94` installs only the packaged payloads, renders `spec-create` with `isolated: no`, asserts `using-git-worktrees` appears only in the appended `prompt.skill-advisory` block, and asserts the template body before that block has no `using-git-worktrees`, no `.worktrees`, and no `isolated: yes`. The amended H003 completion item matches. The advisory text a non-isolated run sees is now the documented, tested behavior rather than an accidental leak.

### F17 — The conditional artifact arm never fires outside `init`, so a `light` phase grown past one task gets no `BOARD.md`/`MAILBOX.md`

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.newphase.module.ts:248`, `packages/specs/src/apps/cli/cli.newtask.module.ts:604`, `packages/specs/src/modules/rigor/rigor.module.ts:203`
- Status: Resolved
- Attempts: 1
- First Seen: 016
- Problem: `writesArtifact` is called in `renderInitTree` (`init.module.ts:897-900`) and once in `new-phase`, but `new-phase` passes `tasksIn(snapshot, id).length` for the phase it is about to create — structurally always `0`, so the conditional arm can never be true there. `new-task` never calls it. Reproduced: `init --rigor light` (one task) then `new-task --phase A --task second --type execution` yields a two-task phase with no `A/BOARD.md` and no `A/A00*/MAILBOX.md`, while `init --rigor light --task A:one:execution --task A:two:execution` writes `A/BOARD.md`. `light.md` says "A `BOARD.md` and a `MAILBOX.md` appear when the phase holds more than one concurrent task", and `check` reports nothing either way.
- Impact: two trees of the same level and the same shape carry different artifacts depending on whether they were built or grown, so the per-level artifact matrix — the one source of truth F6 established — is not what the generated tree follows.
- Suggestion: in `new-task`, after the task is written, add the phase `BOARD.md` and the task `MAILBOX.md` when the phase's new work-task count makes `writesArtifact` true (and add them to the remaining task dirs for `MAILBOX.md`), or drop the conditional arm and state in each rigor file that the channels are created on first `mail`. Pass the real future count in `new-phase` (0 is correct there; the artifact should be created by the first `new-task`) and pin both paths in one test.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — `new-task` now applies `writesArtifact` after the task is allocated, using the real post-create work-task count (`packages/specs/src/apps/cli/cli.newtask.module.ts:697-708`). If the contract makes `BOARD.md` true it adds the phase board when absent, and if `MAILBOX.md` is true it adds a mailbox to the new task directory and every existing task directory in the phase that lacks one. `new-phase` now states the deferral explicitly and passes `0` (`packages/specs/src/apps/cli/cli.newphase.module.ts:258-263`), so a conditional artifact is created by the first `new-task`. Pinned by `state.test.ts:490` in one test: light `init` with one task writes no `A/BOARD.md`; the second task adds `A/BOARD.md`, `A/A001-implement/MAILBOX.md`, and `A/A002-second/MAILBOX.md`; a seeded light `init` with two tasks writes `A/BOARD.md` and both mailboxes. The existing `behavior.test.ts` init-path assertions remain. Verified: `bun run --cwd packages/specs test`, `lint:check`, `ts:check`, `format:check` pass.

**[Reviewer]** — Resolved. Live probe on a `light` spec built with one task then grown: the second `new-task` writes `A/BOARD.md`, `A/A001-implement/MAILBOX.md`, and `A/A002-second/MAILBOX.md`; the seeded two-task `init` path writes the same set. `new-task` now evaluates `writesArtifact` on the real post-create work-task count (`cli.newtask.module.ts:697-708`), and `new-phase` documents the deferral. `state.test.ts:490` pins the grown path and the init path in one test.

### F18 — The "accepts every level at its ceiling" test only filters two codes, so a plan that violates exploration still counts as accepted

- Severity: Nit
- Location: `packages/specs/src/modules/rigor/tests/behavior.test.ts:107-119`
- Status: Resolved
- Attempts: 1
- First Seen: 016
- Problem: the accepting half asserts only that the codes equal to `init.phase-count`/`init.task-ceiling` are absent; any other finding at the ceiling — `init.exploration-placement`, `init.exploration-count`, `init.review-reason` — passes the assertion unchanged. The test name claims the plan is accepted at the ceiling, but it never asserts zero issues, so a regression that adds an exploration finding to a legal plan is invisible.
- Impact: the one test that pins "at the ceiling is legal" does not pin legality, so the boundaries F11 exists to protect can drift while the suite stays green.
- Suggestion: assert `validateInitPlan(...)` equals `[]` for every `atMax` row (the fixtures already produce zero issues), keeping the filtered assertion only for the over-ceiling rows.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — The accepting half now asserts `validateInitPlan(...)` is `[]` for every `atMax` row (`packages/specs/src/modules/rigor/tests/behavior.test.ts:114`). The `phasesAt` fixture was corrected so only `deep`/`critical` later phases name the `explore` task; the old fixture gave `standard` phase B a dependency on a task the plan never declared, which is why the filtered assertion was hiding a real `init.depends-unknown`. The filtered assertion remains only for the over-ceiling rows. Verified: `bun run --cwd packages/specs test`, `lint:check`, `ts:check`, `format:check` pass.

**[Reviewer]** — Resolved. `rigor/tests/behavior.test.ts:114` now asserts `validateInitPlan(...)` is `[]` for every `atMax` row, and the `phasesAt` fixture was corrected so only `deep`/`critical` later phases name the `explore` task. The test now pins legality, not just the absence of two codes. `bun run --cwd packages/specs test` passes with the corrected fixture.

### F19 — The payload changelog still describes four payload kinds

- Severity: Nit
- Location: `packages/payload/CHANGELOG.md:7`, `packages/payload/src/modules/manifest/manifest.module.ts:14`
- Status: Resolved
- Attempts: 1
- First Seen: 016
- Problem: `PAYLOAD_KINDS` now lists `skill`, `profile`, `prompt`, `tier`, `rigor`, but the package's `## Unreleased` entry still says "the four kinds `skill`, `profile`, `prompt`, and `tier`". The `rigor` kind, its `INSTALL_ROOT`, and the new `PayloadDoctorResult.rigors` field land with no changelog line.
- Impact: the package's own release note contradicts the exported contract, and a compiled-binary consumer reading it will not know the `rigor` kind exists.
- Suggestion: add the `rigor` kind (and the `rigors` result field) to the Unreleased entry and state whether `tier` is kept only for reading older manifests.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — `packages/payload/CHANGELOG.md:7` now names all five kinds (`skill`, `profile`, `prompt`, `tier`, `rigor`), says `tier` is kept only so an older manifest still decodes and reads, and no package ships a tier payload. `:8` adds `PayloadDoctorResult.rigors` beside the existing `skills`/`profiles`/`prompts`/legacy `tiers` fields. Verified: `bun run --cwd packages/payload test`, `lint:check`, `ts:check`, `format:check` pass.

**[Reviewer]** — Resolved. `packages/payload/CHANGELOG.md:7-8` now names all five kinds (`skill`, `profile`, `prompt`, `tier`, `rigor`), says `tier` is kept only to read an older manifest, and adds `PayloadDoctorResult.rigors` beside the other result fields. That matches `PAYLOAD_KINDS` in `manifest.module.ts:14`. `bun run --cwd packages/payload test` passes.

### F20 — The rename to `.agents/@montflow/rigors` leaves every previously installed `tiers/` store behind with no cleanup or migration note

- Severity: Nit
- Location: `packages/payload/src/modules/install/install.module.ts:110`, `guides/installation.md:151`, `AGENTS.md:119`
- Status: Resolved
- Attempts: 1
- First Seen: 016
- Problem: doctor never deletes an unlisted file, and the store it verifies moved from `.agents/@montflow/tiers` to `.agents/@montflow/rigors`. A workspace that installed C006's three tier files keeps them: nothing reports them, `mf-specs rigor` never reads them, and no doc tells the user to remove them. This repository only lost them because the rename was staged by hand.
- Impact: an upgraded workspace keeps a stale three-level rigor store that looks authoritative (same shape, old names) and is invisible to `mf:check`, `doctor --check`, and the new read path.
- Suggestion: name the old store once in `guides/installation.md` (remove `.agents/@montflow/tiers/` after upgrading) or have `doctor` report a directory it once owned but no longer ships as a one-line advisory, and add the same line to the specs README migration note.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — `guides/installation.md:157-164` now names the move from `.agents/@montflow/tiers/` to `.agents/@montflow/rigors/` and gives the one-time `rm -rf .agents/@montflow/tiers` upgrade step; `packages/specs/README.md:601-607` carries the same note in the migration section, states that doctor never deletes an unlisted directory, and that nothing reads the old store. Chose the documentation path over a doctor advisory so repair stays non-destructive. Verified: `bun run --cwd packages/specs test` passes; no runtime code changed.

**[Reviewer]** — Resolved. `guides/installation.md:157-164` names the move from `.agents/@montflow/tiers/` to `.agents/@montflow/rigors/` and gives the one-time `rm -rf .agents/@montflow/tiers` upgrade step; `packages/specs/README.md:601-607` repeats it in the migration section and states doctor never deletes an unlisted directory and nothing reads the old store. The chosen documentation path is the finding's first suggestion; no runtime change is required, so the stale-store risk is now a documented upgrade step rather than an invisible one.

## Summary

- Critical: 0
- Major: 2
- Minor: 2
- Nit: 3
- Open: 0
- In Review: 0
- Resolved: 7
- Won't Fix: 0
- Escalated: 0
