# Review: montflow-spec-standard / 015

## Metadata

- Target: spec montflow-spec-standard phase H
- Round: 015
- Phase: H
- Type: standalone
- Isolation: isolated
- Max Attempts: 3
- Status: open
- Created: 2026-11-04

## Findings

### F1 — `--review none` skips the required review at `standard`, `deep`, and `critical`, and `check` stays green

- Severity: Critical
- Location: `packages/specs/src/modules/init/init.module.ts:541`, `packages/specs/src/apps/cli/cli.newphase.module.ts:83`, `packages/specs/src/modules/phase/phase.module.ts:780`, `packages/specs/prompts/spec-create.json:4`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: `init` validates only `phase.review === 'waived'`; `--review <PHASE>:none` returns before the waiver policy, and `new-phase` accepts `--review none` without reading the rigor at all. `phaseEvidence` then pushes every `review: none` phase into `none` without a rigor check and `verifyLifecycle` accepts it. Reproduced: `init --name crit --rigor critical --phase … --phase … --task A:explore:exploratory --task B:build:execution:after=explore --review A:none --review B:none` followed by `check` prints `0 failed · 0 issues`; the tree has no review task and no waiver. `critical.md` states review is required and a critical phase never waives, and the prompt itself teaches `--review …:none` at step 5.
- Impact: the highest rigor levels can lock and complete with no review round and no waiver, so `critical.review = 'required'` and `waiver: 'forbidden'` are decorative; a security- or migration-level change can ship unreviewed while every gate the user asked for is bypassed by one flag.
- Suggestion: reject `review: none` whenever `RIGOR_CONTRACT[rigor].review === 'required'` (and whenever `waiver === 'forbidden'`) in `init` and `new-phase`, report an existing `none` phase at such a rigor as a `check` error, and add a fixture for `critical` + `--review none`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — Rejected `review: none` wherever the contract requires review: `validateInitPlan` emits `rigor.review-forbidden` (`packages/specs/src/modules/init/init.module.ts:609`), `newPhase` refuses before writing (`packages/specs/src/apps/cli/cli.newphase.module.ts:113`), and `phaseEvidence` reports an existing review-free phase at such a rigor (`packages/specs/src/modules/phase/phase.module.ts:786`). The prompt now permits `none` only where the loaded rigor allows it (step 5). Fixtures: `init.test.ts` (validate + check), `state.test.ts` (new-phase refusal). Verified: `bun run --cwd packages/specs test`, `lint:check`, `ts:check`, `format:check` all pass.

**[Reviewer]** — Resolved. `validateInitPlan` refuses `review: none` whenever the rigor requires review or forbids a waiver (`init.module.ts:606-620`), `new-phase` refuses before writing (`cli.newphase.module.ts:119-137`), and `phaseEvidence` reports an existing review-free phase at such a rigor (`phase.module.ts:776-798`). Pinned by `init/tests/init.test.ts:322-331` and `cli/tests/state.test.ts:342-359`. Re-ran the original repro: `init --rigor standard … --review A:none` exits 1 with `rigor.review-forbidden`, and a review-free `standard` tree fails `check`. The record-parsing gap that can disable this again is round 016 F15.

### F2 — The ladder's ceilings, exploration, and gate rules are enforced only by `init`; `new-phase` and `new-task` grow past any level and `check` stays green

- Severity: Major
- Location: `packages/specs/src/apps/cli/cli.newtask.module.ts:327`, `packages/specs/src/apps/cli/cli.newphase.module.ts:83`, `packages/specs/src/modules/structure/structure.module.ts:848`
- Status: Open
- Attempts: 1
- First Seen: 015
- Problem: `validateInitPlan` is the only reader of `minPhases`/`maxPhases`/`maxTasks`/`maxTasksPerPhase` and of the exploration rules; `new-task` imports only `waiverAllowed` and `new-phase` imports no rigor module. Reproduced: `init --rigor trivial` (max 1 phase, 2 work tasks, exploration forbidden), then two `new-task --type execution`, one `new-task --type exploratory`, `new-phase B` and one more task produce a 2-phase, 4-task tree with an exploratory task; `check` prints `0 failed · 0 issues`. `structure` reads `rigor` only to require `GATES.md` on execution/defect/interruptor tasks; nothing compares the phase or task counts to the contract, and `rigorOfSpec` returns `undefined` for a typo'd value with no finding, so a `rigor: Standrad` record silently disables even that check.
- Impact: the rigor is a one-time suggestion. A `trivial` or `light` spec can grow without bound, the recorded level and the tree disagree, and neither the verifier nor the review ever sees the mismatch; the prompt's own growth step (`new-phase`/`new-task`) is the bypass.
- Suggestion: read `rigorOfSpec` in `new-task`/`new-phase`, refuse the task or phase that would exceed `maxTasks`/`maxTasksPerPhase`/`maxPhases`, and reuse the exploration/gate checks from `validateInitPlan`; add a `check` finding such as `rigor.ceiling-exceeded` for an already-oversized tree and a `rigor.unknown` finding for an unrecognised record.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — Extracted `explorationIssues` and `ceilingIssues` (`packages/specs/src/modules/init/init.module.ts:278`, `:407`) so `validateInitPlan`, `new-task` (`cli.newtask.module.ts`) and `new-phase` (`cli.newphase.module.ts`) read the same rules; both generators now refuse a phase/task past `maxPhases`/`maxTasks`/`maxTasksPerPhase` and refuse exploration the rigor forbids. `verifyRigorCeilings` (`packages/specs/src/modules/structure/structure.rigor.module.ts`) adds `rigor.unknown` and `rigor.ceiling-exceeded` findings to `check`. Fixtures: `rigor/tests/behavior.test.ts` and the new `Cli.rigor growth runtime` suite. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Partially resolved; reopened. Confirmed: the ceilings (`ceilingIssues`, `init.module.ts:407`), the deep one-in-A cap, the trivial gate rule, the waiver policy and the `light`/`standard` placement rule all run in `new-task`/`new-phase`, pinned by `cli/tests/state.test.ts:362-438` and `rigor/tests/behavior.test.ts:105-155`. Still failing: the deep/critical "every later phase depends on phase A" predicate stayed inside `validateInitPlan` (`init.module.ts:556-581`) and never runs at growth, and `explorationIssues` (`:354-394`) has no "exploratory only in phase A" rule for `deep`/`critical`. Live repro: `init --rigor deep` then `new-task --phase B --task look-more --type exploratory` is added and `check` reports 0 issues; `init --rigor deep`, `new-phase`, `new-task --phase C --type execution` with no dependency on A is added and `check` still reports 0 issues.

### F3 — The isolated flow never resolves `current`/`main`/`other` to a git ref, so the delegated skill starts from an invalid or stale base

- Severity: Major
- Location: `packages/specs/prompts/spec-create.json:4`, `packages/specs/skills/montflow-create-specs/SKILL.md:171`, `packages/profiles/profiles/spec-creation-orchestrator/PROFILE.md:47`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: the form's `origin` is the enum `current|main|other`, and the prompt, skill, and profile all say to "pass the origin, branch, and worktree name" to `using-git-worktrees`. That skill's Step 1 requires `BASE` to be an existing ref (`git rev-parse --verify "$BASE"`) and fetches only after the value is already a remote branch. Nothing maps `current` to the checked-out branch or defines the detached-HEAD case, nothing maps `main` to `origin/main` after a fetch, and `other` is passed as `origin_branch` with no ref check. Passing `current` literally fails the skill's validation; passing `main` spawns from a stale local branch without fetching.
- Impact: isolated authoring either fails at creation or starts from the wrong commit, and the spec's recorded origin is not the one the user chose; H001's origin-resolution decision is left for the agent to invent at dispatch time.
- Suggestion: state the resolutions in the prompt and skill — `current` → `git branch --show-current`, fail on detached HEAD (or a stated branch choice); `main` → `git fetch origin` then `origin/main`; `other` → `origin_branch` after `git rev-parse --verify` — and pass the resolved ref to the skill, not the enum.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — The prompt resolves the enum to a real ref before delegating: `current` → `git branch --show-current` (detached HEAD is a stop), `main` → `git fetch origin` then `origin/main`, `other` → `origin_branch` after `git rev-parse --verify` (`packages/specs/prompts/spec-create.json` step 4). The same resolution is stated in `packages/specs/skills/montflow-create-specs/SKILL.md` (Isolated Authoring) and `packages/profiles/profiles/spec-creation-orchestrator/PROFILE.md:47`. `author-execute.test.ts` asserts every resolution token. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Resolved. Prompt step 4 maps `current` to `git branch --show-current` (detached HEAD is a stop), `main` to `git fetch origin` then `origin/main`, and `other` to the freeform branch only after `git rev-parse --verify`, and passes the resolved ref as `BASE`; the same text is in `skills/montflow-create-specs/SKILL.md` (Isolated Authoring) and `profiles/spec-creation-orchestrator/PROFILE.md`. Pinned by `cli/tests/author-execute.test.ts:389-419`.

### F4 — An isolated run that cannot create its worktree authors in place but still reports `isolated: yes` with a worktree path

- Severity: Major
- Location: `packages/specs/prompts/spec-create.json:4`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: step 4 says "If creation is denied, work in place and report it in the final line", but the closing reply is inside `{{#if origin}}` and always says `isolated: yes · origin: {{origin}}` and asks for "the worktree path and branch". A denied run therefore writes the spec into the user's current checkout (and passes `--workspace-type in-place`) while the reply claims isolation and names a path and branch that do not exist.
- Impact: the user chose isolation to protect the checkout; on denial the change lands in exactly the checkout they protected, and the report makes it impossible to tell which workspace holds the spec.
- Suggestion: on denial, stop with a coded refusal, or report `isolated: no (requested yes, creation denied)` and drop the worktree fields; never fall back to in-place authoring without an explicit user decision.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — A denied worktree now stops: step 4 reports `isolated: no (requested yes, creation denied)`, says never to fall back to the current checkout, and the success reply line is explicitly conditional on the worktree being created (`packages/specs/prompts/spec-create.json`; same rule in the skill and profile). Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Resolved. Step 4 now stops on denial with `isolated: no (requested yes, creation denied)`, says "author nothing, and never fall back to the current checkout", and the success line runs only when the worktree was created; the same rule is in the skill and profile. Pinned by `cli/tests/author-execute.test.ts:403-417`, which asserts both the denial line and the no-fallback sentence.

### F5 — `trivial.md` orders the run to choose `light`, and the prompt's escalation question exceeds the `trivial`/`light` budgets

- Severity: Major
- Location: `packages/specs/rigors/trivial.md:64`, `packages/specs/prompts/spec-create.json:4`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: `trivial.md` says "If the request cannot be authored without a user decision, it is not `trivial`: choose `light`, or stop and report the question instead of asking." That instructs the run to change the user's rigor; the prompt says "never choose, upgrade, downgrade, or default it" and "Ask the one escalation question". At `trivial` the budget is 0 and the rigor file says "stop instead of asking"; at `light` the single budgeted question may be consumed by the escalation, leaving none for scope or naming. The two artifacts cannot both be obeyed.
- Impact: a `trivial` request that needs one decision is either silently re-graded to `light` (the user's choice overridden, contrary to the phase's central rule) or deadlocks against its own budget, depending on which file the agent weights.
- Suggestion: make both artifacts say the same thing — a request that does not fit stops and reports; only the user may change `rigor`, and `(raised-from …)` is recorded when the user accepts. Define the escalation question inside or outside every level's budget in both files, and add a test that renders the `trivial` prompt and asserts it asks no question.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — `trivial.md` no longer tells the run to choose `light`; it stops and reports, and only the user may raise the rigor (`(raised-from trivial)` recorded on accept). The prompt now places the escalation question inside the rigor's question budget: at `trivial` the budget is 0, so it is not asked (`packages/specs/prompts/spec-create.json` step 1). `author-execute.test.ts` renders `trivial` and asserts no escalation question and no `choose `light``. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Resolved. `rigors/trivial.md:62-67` now stops and reports, states that only the user may raise the level, and records `rigor: <new> (raised-from trivial)`; the prompt's step 1 places the escalation question inside the rigor's budget, so at `trivial` (budget 0) it is not asked. Pinned by `cli/tests/author-execute.test.ts:421-435` (no "Ask the one escalation question", no `choose `light``). The record shape this flow writes is broken — see round 016 F15.

### F6 — The rigor contract's `waiver`, `grilling`, and artifact fields are inert, so the table is documentation rather than the one source of truth

- Severity: Major
- Location: `packages/specs/src/modules/rigor/rigor.module.ts:45`, `packages/specs/src/modules/rigor/rigor.module.ts:48`, `packages/specs/src/modules/rigor/rigor.module.ts:190`, `packages/specs/src/modules/init/init.module.ts:808`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: `waiver` is never read: `waiverAllowed` hardcodes the four-level predicate. `grilling` is read by nothing. `artifacts`/`conditionalArtifacts` are read by nothing: `renderInitTree` decides `BOARD.md`/`MAILBOX.md` with `rigor === 'standard' || rigor === 'deep' || rigor === 'critical' || …` and `new-task` repeats `light || standard` and `standard || deep`. The drift test compares the five `.md` files to the code table, so changing `RIGOR_CONTRACT.deep.waiver` to `'forbidden'` and `deep.md` to match leaves the suite green while the `waiver` verb still permits a deep records-only waiver and `init` still writes the old artifacts.
- Impact: the per-level matrix can be edited without changing behaviour, and the drift test cannot detect the divergence; the requirement that the ladder have one source of truth in code is not met for three of its fields.
- Suggestion: derive `waiverAllowed` from `contract.waiver`, derive the artifact writer from `artifacts`/`conditionalArtifacts`, and consume `grilling` or delete it. Add a behaviour test that flips one field and asserts the generator or verb changes.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — `waiverAllowed` now derives from `RIGOR_CONTRACT[rigor].waiver` (`packages/specs/src/modules/rigor/rigor.module.ts:190`); `writesArtifact` derives BOARD/MAILBOX from `artifacts`/`conditionalArtifacts` and is used by `renderInitTree` and `newPhase`; the inert `grilling` field was deleted from the contract and all five rigor files, with the drift test updated. `rigor/tests/behavior.test.ts` flips `deep.waiver` and the artifact lists at runtime and asserts the verb/generator change. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Resolved for the init surface. `waiverAllowed` derives from `RIGOR_CONTRACT[rigor].waiver` (`rigor.module.ts:186-191`), `writesArtifact` (`:203-209`) drives `BOARD.md`/`MAILBOX.md` in `renderInitTree` (`init.module.ts:897-900`), and the inert `grilling` field is gone from the contract and all five files, with the drift test asserting the exact frontmatter key set (`drift.test.ts:37-50`). Pinned by `rigor/tests/behavior.test.ts:175-229`. The artifact arm is still dead on the growth path — round 016 F17.

### F7 — Every authoring refusal reuses one fixed rerun line, so the `origin`/`origin-branch`/`worktree-name` refusals do not give the exact command

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.author.inputs.ts:27`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: all refusals set `rerun: AUTHOR_RERUN`, the constant `mf-specs author --request <text> --rigor <level> --isolated <yes|no>`. For a missing `--origin`, `--origin-branch`, or `--worktree-name` the `next` line omits the flag that failed, so following it reproduces the same refusal; for `--origin-branch` it also omits `--origin other`. The refusal test asserts the same generic line for all ten cases.
- Impact: the required "exact rerun" is not delivered; a user loops on the same coded error and never learns which extra flag the isolated branch needs.
- Suggestion: compose the rerun from the accepted answers plus the missing flag, e.g. `mf-specs author --request … --rigor … --isolated yes --origin other --origin-branch <branch>`, and assert each composed line in the test.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — `composeAuthorRerun` (`packages/specs/src/apps/cli/cli.author.inputs.ts:61`) composes each refusal from the accepted answers plus the flag still missing, so `--origin`, `--worktree-name`, and `--origin-branch` appear with their placeholders. `author-execute.test.ts` asserts the exact composed line for all ten cases, and `run-slash.test.ts` asserts the `other`-origin branch rerun. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Resolved. `composeAuthorRerun` (`cli.author.inputs.ts:61-85`) builds each refusal's line from the accepted answers plus the flag still missing, using placeholders for anything not accepted. Pinned by `cli/tests/author-execute.test.ts:496-620` (ten cases, each asserting the exact `next` line) and `cli/tests/run-slash.test.ts:627`.

### F8 — The isolated branch leaves the skill's Type and Push parameters and its branch/path convention unstated

- Severity: Minor
- Location: `packages/specs/prompts/spec-create.json:4`, `packages/specs/skills/montflow-create-specs/SKILL.md:171`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: the prompt supplies the skill's origin, name, and (for `other`) branch, but not its two other Step 1 parameters. `using-git-worktrees` says "Ask if unclear" for Type (suggest `feat`) and "Ask" for Push, and derives `BRANCH="$PREFIX/$NAME"` and `path="$LOCATION/$BRANCH"`. So an isolated run asks two questions the seven-question table does not declare, may push a branch the user never asked about, and produces `.worktrees/feat/<name>` rather than the `<name>` path the report implies.
- Impact: the fixed question flow is not the only set of questions, the no-push policy H001 required is not stated, and the branch/path convention is left to the delegated skill to guess.
- Suggestion: state the convention in the prompt (type `feat`, branch `feat/<worktree_name>`, path `.worktrees/feat/<worktree_name>`), set push to false unless the user asked, and add type/push to the form with `when` guards if they are meant to be answers.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — The prompt states the fixed skill parameters: Type `feat`, Push `false`, branch `feat/{{worktree_name}}`, path `.worktrees/feat/{{worktree_name}}`, and no push unless the user asked (`packages/specs/prompts/spec-create.json` step 4; skill Isolated Authoring). No type/push questions were added, so the seven-question table is unchanged. `author-execute.test.ts` asserts the convention tokens. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Resolved. Prompt step 4 states Type `feat`, Push `false`, branch `feat/<name>`, path `.worktrees/feat/<name>`, and "never ask about type or push"; the skill and profile say the same. Pinned by `cli/tests/author-execute.test.ts:403-416`. The declared path also functions as the skill's Step 2b directory preference.

### F9 — The packaged skill and README still document `author --request` without the now-required `--rigor`/`--isolated`

- Severity: Minor
- Location: `packages/specs/README.md:170`, `packages/specs/README.md:314`, `packages/specs/skills/montflow-create-specs/SKILL.md:43`, `packages/specs/skills/montflow-create-specs/SKILL.md:538`, `packages/specs/src/apps/cli/CONTEXT.md:68`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: H made `--rigor` and `--isolated` mandatory, but these docs still show `author --request <text> [--notes <text>]` and the copyable `bun run --cwd packages/specs cli author --request "Ship login"`. Both now fail with `cli.invalid-argument` for a missing `--rigor`. The skill is a doctor-installed payload, so the stale "Dispatching a session" instruction ships with the package.
- Impact: the primary documented authoring command, the shipped skill's dispatch line, and the README example cannot succeed; a user following the docs hits a refusal before any prompt renders.
- Suggestion: update every `author` invocation to carry `--rigor <level> --isolated <yes|no>`, add the isolation flags to the isolated example, and describe the question flow in the README's author section.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — Every documented `author` invocation now carries `--rigor`/`--isolated`: `packages/specs/README.md` (verb bullet and both examples), `packages/specs/skills/montflow-create-specs/SKILL.md:43,538`, `packages/specs/src/apps/cli/CONTEXT.md:68,226`, the server command description, and the prompt advisory rerun. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Resolved. `packages/specs/README.md:170,321-325`, `skills/montflow-create-specs/SKILL.md:44,556`, `apps/cli/CONTEXT.md:68,228`, and the server command description all carry `--rigor <level> --isolated <yes|no>`, and the isolated example adds `--origin`/`--worktree-name`; the installed skill and prompt match the packaged bytes (`doctor --check` clean).

### F10 — The repo's agent rules and installation guide still describe the removed `tier` verb, tool, and payload kind

- Severity: Minor
- Location: `AGENTS.md:82`, `AGENTS.md:89`, `AGENTS.md:92`, `AGENTS.md:119`, `guides/installation.md:151`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: `AGENTS.md` still lists `tier` among the generator verbs, `spec_tier` among the host tools, `tier` as a payload kind, and `.agents/@montflow/tiers` among the verified stores; `guides/installation.md` says doctor installs "tier files". Every one of those names is gone from the implementation: the verb is `rigor`, the tool is `spec_rigor`, the kind is `rigor`, and the store is `.agents/@montflow/rigors`.
- Impact: the workspace's own agent contract teaches a surface H removed, so an agent that follows it runs a failing command or calls a tool that does not exist.
- Suggestion: replace the five references with `rigor`/`spec_rigor`/`.agents/@montflow/rigors` and update the guide's sentence.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — `AGENTS.md` now names the `rigor` verb, the `spec_rigor` tool, the `rigor` payload kind, and `.agents/@montflow/rigors`; `guides/installation.md` says doctor installs rigor files. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Resolved. `AGENTS.md:82,89,92,119` name the `rigor` verb, the `spec_rigor` tool, the `rigor` payload kind, and `.agents/@montflow/rigors`; `guides/installation.md:151` says rigor files. A grep over the changed docs and `packages/specs/src` finds no `tier` token outside the frozen split field, CHANGELOG history, and the retained legacy payload kind.

### F11 — No test exercises the per-level ceilings, the new deep/critical exploration branches, or `waiverAllowed`

- Severity: Minor
- Location: `packages/specs/src/modules/init/tests/init.test.ts:180`, `packages/specs/src/modules/rigor/tests/drift.test.ts`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: no test imports `waiverAllowed`, and no test contains `taskCeiling`, `phaseCount`, `phase-count`, or `task-ceiling` (grep over `packages/specs/src/**/*.test.ts` is empty). The `deep` one-exploration cap (`init.module.ts:445`) and the `critical` dedicated-phase-A check (`init.module.ts:455`) have no fixture, and `light`'s exploration rule and the light/deep waiver policies are untested. Deleting any of those branches leaves the sweep green.
- Impact: the five levels are only drift-tested as text; the behavioural distinctions this phase exists to add — the ceilings and the per-level exploration rules — can regress silently.
- Suggestion: add table-driven tests for each level at its ceiling and one above (phases, total tasks, tasks per phase), the `waiverAllowed` matrix over every level and task type, both new deep/critical exploration branches, and a `light` exploratory task placed in phase B.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — Added `packages/specs/src/modules/rigor/tests/behavior.test.ts`: table-driven ceilings at each level and one above (phases, total tasks, per phase), the full `waiverAllowed` matrix, the deep two-exploration cap, the critical dedicated phase A, and a light exploratory task in phase B. `state.test.ts` adds runtime refusals for phase/task ceilings, trivial exploration, and a second deep exploration. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Resolved. `rigor/tests/behavior.test.ts` is table-driven over all five levels (ceiling and one above for phases, total tasks, and tasks per phase), the full `waiverAllowed` matrix, the deep two-exploration cap, the critical dedicated phase A, and a light exploratory task in phase B; `cli/tests/state.test.ts:362-438` pins the runtime refusals. Its "accepts at its ceiling" half is weakly asserted — round 016 F18.

### F12 — The isolated branch depends on `using-git-worktrees`, which the prompt neither declares nor marks as a prerequisite

- Severity: Minor
- Location: `packages/specs/prompts/spec-create.json:63`, `packages/specs/README.md:281`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: the prompt now instructs "Load the `using-git-worktrees` skill", but its `skills` array still lists only `montflow-create-specs`, and the create-specs skill's `dependencies` do not name it. The prompt gate emits `prompt.skill-advisory` only for declared non-owned skills, so a workspace without `using-git-worktrees` renders the isolated branch with no advisory and no fail-fast; the README still states that `spec-create` "declares no advisory skill".
- Impact: the isolated flow's only recipe can be absent with no warning, and the run is told to load a skill the rendered prompt never flagged; the user discovers the gap only when authoring starts.
- Suggestion: add `using-git-worktrees` to the prompt's `skills` list (advisory) and update the README's advisory table, or make a missing worktree skill a coded refusal for `isolated: yes`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — `using-git-worktrees` is now declared as an advisory skill in `packages/specs/prompts/spec-create.json`, the README advisory table lists it, and the create-specs skill's prerequisite paragraph names it. `prompt/tests/skill-gate.test.ts` asserts the fresh doctor-only workspace renders the advisory. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Resolved. `using-git-worktrees` is in the prompt's `skills` array, the README advisory table (`:288`), and the skill's prerequisite paragraph; the prompt stops with `isolated: no (requested yes, skill missing)` when it is absent. Pinned by `prompt/tests/skill-gate.test.ts:78-88`. Its side effect on in-place renders is round 016 F16.

### F13 — The exported `rigor` command is still named `tierCommand`

- Severity: Nit
- Location: `packages/specs/src/apps/cli/cli.state.module.ts:658`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: the command is `Command.make('rigor', …)` but the binding remains `tierCommand`, and `cli.slash.module.ts:70,129` imports it under that name.
- Impact: a stale identifier survives the vocabulary change; every reader must check that `tierCommand` is not the removed verb.
- Suggestion: rename it to `rigorCommand` and update the two imports.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — Renamed `tierCommand` to `rigorCommand` in `packages/specs/src/apps/cli/cli.state.module.ts:658` and updated both imports in `cli.slash.module.ts`. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Resolved. `cli.state.module.ts:658` exports `rigorCommand`; `cli.slash.module.ts:70,129` import that name; a grep finds no `tierCommand`.

### F14 — `critical` spends a grilling question on a review-waiver decision it forbids

- Severity: Nit
- Location: `packages/specs/rigors/critical.md:68`
- Status: Resolved
- Attempts: 1
- First Seen: 015
- Problem: the required grilling topics include "which phases may waive review", while the same file sets `waiver: forbidden` and says a critical phase never waives. The question has no valid answer at this level.
- Impact: the run spends one of its eight questions on a decision the level has already made, and the answer can only restate the prohibition.
- Suggestion: drop that topic from `critical`, or replace it with the phase split or non-goals.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer]** — Replaced the impossible "which phases may waive review" topic with "which phases carry the discovery" in `packages/specs/rigors/critical.md:68`. Verified: specs test/lint/ts/format pass.

**[Reviewer]** — Resolved. `critical.md` now lists "which phases carry the discovery" instead of the waived-review topic, which the level forbids, and the file keeps its "at most 8 questions" sentence that `drift.test.ts:250-262` checks.

## Summary

- Critical: 1
- Major: 5
- Minor: 6
- Nit: 2
- Open: 1
- In Review: 0
- Resolved: 13
- Won't Fix: 0
- Escalated: 0
