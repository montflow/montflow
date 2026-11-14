# Review: montflow-spec-standard / 018

## Metadata

- Target: spec montflow-spec-standard phase I
- Round: 018
- Phase: I
- Type: standalone
- Isolation: isolated
- Max Attempts: 3
- Status: closed
- Created: 2026-11-05

## Findings

### F29 — Section 8 sources the `verify` verdict from `check`, which never prints it

- Severity: Major
- Location: `packages/specs/prompts/spec-status.json:4`
- Status: Resolved
- Attempts: 1
- First Seen: 018
- Problem: Section 8 of the template says "the `verify <✓ verified or ✗ n issues>` verdict from `check`". `mf-specs check --name montflow-spec-standard` prints `✗ montflow-spec-standard (7 issues)`, never a `verify` line; the `verify ✓ verified` line is printed by `mf-specs status --name montflow-spec-standard`. The two commands also disagree on this spec: `status` says `verify ✓ verified` while `check` reports seven `gate.stale-result` errors. A reporter following the contract must either invent a `verify` line or silently switch to `status`, which would print "verified" beside the seven codes `check` names. That violates I001's rule that every section names its source command and that the report quotes only derived truth.
- Impact: The verification section can state "verified" while `check` rejects the same spec, a false clean verdict in the one report meant to tell a human what blocks the work; the section is also misattributed to `check`.
- Suggestion: make section 8 use `check`'s own verdict (`✗ <spec> (n issues)` plus the issue blocks), and treat `status`'s `verify` line as tree verification only (or drop it); add a test that runs `check` and `status` on the same spec and asserts the report's named source produces the text it claims.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->
<!-- [Reviewer] <turn 1> ... -->
<!-- [Fixer] <turn 1> ... -->

**[Fixer] 2026-11-06 — attempt 1**

- Changed `packages/specs/prompts/spec-status.json` section 8: it now names the `check` verdict line verbatim (`✗ <spec> (n)`, `✗ <spec> (n issues · m warnings)`, or `✓ <spec>`) plus every issue block `check` prints, and says the `status` `verify` line is the tree verifier only. The old `verify <✓ verified or ✗ n issues>` claim is gone.
- Test: `packages/specs/src/apps/cli/tests/status-report.test.ts`, "names `check` as the verdict source, and `check` prints it while `status` only verifies the tree". A valid v2 spec records a stale keyed gate; `check` renders `✗ drift-spec (1)` with `gate.stale-result` while `status` renders `verify ✓ verified`, and the rendered prompt is asserted to name `check` and not the retired verify shape.
- Assumption: the test lives under `src/apps/cli/tests` because `src/modules/doctor/tests/import-direction.test.ts` forbids a module test importing `src/apps`.

**[Reviewer] 2026-11-06 — Resolved (verified in round 019).** Section 8 now names `check`'s verdict and demotes `status verify` to the tree verifier; `status-report.test.ts:187-222` pins the disagreement. The incomplete shape enumeration is filed as 019 F39.

### F30 — Compiled-binary payload embeds the pre-status `montflow-find-specs` skill, and the guard test is red

- Severity: Major
- Location: `packages/specs/src/modules/doctor/embedded-payload.generated.ts:18`
- Status: Resolved
- Attempts: 1
- First Seen: 018
- Problem: The embedded payload still holds `montflow-find-specs` v1.6.0 without `## 7. Report One Spec Read-Only`, while `packages/specs/skills/montflow-find-specs/SKILL.md` and `.agents/skills/montflow-find-specs/SKILL.md` are v1.7.0 with that section. `bun run --cwd packages/specs test` fails `src/modules/doctor/tests/embedded-payload.test.ts > montflow-find-specs: the embed matches the packaged files`. A compiled `mf-specs` doctor installs the stale skill, so the status-report guidance disappears outside a package checkout.
- Impact: The scoped package suite is red, and a shipped binary regresses the skill payload it installs.
- Suggestion: run `bun run --cwd packages/specs generate:payload`, commit the regenerated `embedded-payload.generated.ts`, and re-run the package suite.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->
<!-- [Reviewer] <turn 1> ... -->
<!-- [Fixer] <turn 1> ... -->

**[Fixer] 2026-11-06 — attempt 1**

- Ran `bun run --cwd packages/specs generate:payload` after the packaged `montflow-find-specs` skill (v1.7.0 with `## 7. Report One Spec Read-Only`) and `spec-status` prompt were current. `packages/specs/src/modules/doctor/embedded-payload.generated.ts:18` now embeds the current 2 skills, 4 prompts, and 5 rigors.
- Regeneration also refreshed the other drifted embedded bytes (`spec-create`, `trivial` rigor) so the embed matches every packaged file, not just the skill named by the finding.
- Verification: `bun run --cwd packages/specs test` — 2278 passed, including `src/modules/doctor/tests/embedded-payload.test.ts`.

**[Reviewer] 2026-11-06 — Resolved (verified in round 019).** Every embedded skill/prompt/rigor entry is byte-equal to its packaged file; `bun run --cwd packages/specs test` is 2278/2278 green; `doctor --check` reports every payload up to date.

### F31 — Server registration test still expects five tools, so the scoped suite is red

- Severity: Major
- Location: `packages/specs/src/tests/server.test.ts:188`
- Status: Resolved
- Attempts: 1
- First Seen: 018
- Problem: `specStatusTool` registers `spec_status` in `src/server.ts`, but the server test's expected list is still `spec_author, spec_execute, spec_sizing, spec_models, spec_rigor`. The actual list gains `spec_status`; `bun run --cwd packages/specs test` fails at `src/tests/server.test.ts:188` with `expected [ 'spec_author', 'spec_execute', …(4) ] to strictly equal [ 'spec_author', 'spec_execute', …(3) ]`. The test name and the `COMMAND_DESCRIPTION` assertions also omit the new surface.
- Impact: The phase's scoped test gate is red, and the host-tool registration is no longer pinned by a test.
- Suggestion: add `'spec_status'` to the expected list, update the test name, and assert `status-report [--name <spec>]` in `COMMAND_DESCRIPTION`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->
<!-- [Reviewer] <turn 1> ... -->
<!-- [Fixer] <turn 1> ... -->

**[Fixer] 2026-11-06 — attempt 1**

- Changed `packages/specs/src/tests/server.test.ts:181`: the expected registration list is now `spec_author`, `spec_execute`, `spec_status`, `spec_sizing`, `spec_models`, `spec_rigor`; the test name includes `status`; and `COMMAND_DESCRIPTION` is asserted to contain `status-report [--name <spec>] [--focus <text>]`.
- Verification: `bun run --cwd packages/specs test` — 2278 passed, including `src/tests/server.test.ts`.

**[Reviewer] 2026-11-06 — Resolved (verified in round 019).** `server.test.ts:188-204` now pins the six-name registration list and the `status-report` help row; the suite is green.

### F32 — Repo rules and package wiki still enumerate the old host-tool/prompt surface

- Severity: Minor
- Location: `AGENTS.md:88`, `packages/specs/wiki/verbs.md:51`
- Status: Resolved
- Attempts: 1
- First Seen: 018
- Problem: `AGENTS.md` lists the host tools as `spec_author` / `spec_execute` / `spec_sizing` / `spec_rigor` / `spec_models`, and `packages/specs/wiki/verbs.md`'s Surfaces table does the same; both omit `spec_status`. The wiki's "Payload and prompts" paragraph names only `author`, `execute`, and `sizing-config` as prompt renderers, omitting `status-report`. The README and CLI context name all three.
- Impact: An agent following the repo rules or package wiki can miss the new read-only surface; the docs disagree about what the plugin registers.
- Suggestion: add `spec_status` to both tool lists and `status-report` to the wiki's prompt renderers, keeping the README/CLI context as the reference.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->
<!-- [Reviewer] <turn 1> ... -->
<!-- [Fixer] <turn 1> ... -->

**[Fixer] 2026-11-06 — attempt 1**

- Changed `AGENTS.md:88` so the host-tool list includes `spec_status` between `spec_execute` and `spec_sizing`.
- Changed `packages/specs/wiki/verbs.md:51` so the Surfaces table lists `spec_status`; the "Payload and prompts" paragraph now names `status-report` among the prompt renderers and says the host slash verb/tool dispatch the rendered prompt while the binary prints it.
- Docs only; no code or test change.

**[Reviewer] 2026-11-06 — Resolved (verified in round 019).** `AGENTS.md:89-90` and `packages/specs/wiki/verbs.md:51,58` now list `spec_status` and `status-report`; `wiki/payload.md` lists the prompt too. Residual drift elsewhere is 019 F40.

### F33 — No binary-level status-report parity test, though I003 requires binary/slash parity

- Severity: Minor
- Location: `packages/specs/src/apps/cli/tests/run-slash.test.ts:774`
- Status: Resolved
- Attempts: 1
- First Seen: 018
- Problem: The new tests compare `/specs status-report` and the `spec_status` tool to the `statusReport` engine, but no test invokes `statusReportCommand` (the binary path) or asserts its `--name`/`--focus`/`--dir` parsing and printed output. I003's requirement says "Tests cover: binary and slash parity for the same name and focus".
- Impact: A regression in the binary command wiring or flag handling — the only surface that prints the prompt for a human — passes the suite.
- Suggestion: add a test that invokes the binary command (or its handler) for the same name and focus and compares its output to the engine; assert `--focus` and `--dir`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->
<!-- [Reviewer] <turn 1> ... -->
<!-- [Fixer] <turn 1> ... -->

**[Fixer] 2026-11-06 — attempt 1**

- Added `packages/specs/src/apps/cli/tests/status-report.test.ts`: it invokes the real `Command.runWith(statusReportCommand, { version: "0.0.0" })` with `--name ok --focus "review risk" --dir <temp workspace>`, captures `TestConsole` output, and asserts the binary output is strictly equal to `statusReport(store, { name, focus, workspace }).prompt.text`.
- The same test pins the three flags: the output carries the focus text and the resolved `--dir` command forms. The engine call is the parity oracle, so a change in either command wiring or rendering fails it.
- Verification: `bun run --cwd packages/specs test` — 2278 passed, including the new file.

**[Reviewer] 2026-11-06 — Resolved (verified in round 019).** `status-report.test.ts:159-183` runs the real `Command.runWith(statusReportCommand, …)` and pins name/focus/`--dir` plus equality with the engine; `run-slash.test.ts:773-800` pins slash ↔ engine.

### F34 — Binary `--dir` is not carried into the rendered command forms, so the report can query a different store

- Severity: Minor
- Location: `packages/specs/src/apps/cli/cli.statusreport.module.ts:117` and `packages/specs/prompts/spec-status.json:4`
- Status: Resolved
- Attempts: 1
- First Seen: 018
- Problem: `status-report --dir /other` resolves the spec from `/other`, but the template's "Command forms" tell the agent to run every verb with `--dir "$PWD"` (or with no `--dir`, which resolves the agent's nearest repo). If the agent's cwd is not `/other`, the report queries the caller's store; when that store holds the same spec name, the report silently describes the wrong spec.
- Impact: A binary invocation with `--dir` can produce a report for a different workspace or spec while looking successful; the read-only surface is not self-contained.
- Suggestion: render the resolved workspace into the prompt (an internal `root` value) and use it in the command forms, or have the entry point pass the exact `--dir`; add a test with a workspace other than the cwd.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->
<!-- [Reviewer] <turn 1> ... -->
<!-- [Fixer] <turn 1> ... -->

**[Fixer] 2026-11-06 — attempt 1**

- Changed `packages/specs/src/apps/cli/cli.statusreport.module.ts:101`: `statusReport` now passes `root: workspace` (the resolved `--dir`) into the prompt values. The spec is still resolved from `storeDirOf(workspace)`.
- Changed `packages/specs/prompts/spec-status.json`: declares `root` as an `internal` variable (no run-dialog field) and puts `--dir "{{root}}"` on the command forms, every terminal line, and the clean-spec next commands. The literal `$PWD` instruction is gone, so the rendered report cannot silently query the caller's store.
- Tests: the binary parity test uses a temp workspace that is not the process cwd and asserts `--dir "<workspace>"`; the prompt render test asserts the same with a fictional non-cwd root and no `$PWD`.
- `bun run --cwd packages/specs cli doctor --dir "$PWD"` repaired `.agents/@montflow/prompts/spec-status.json` from the package.

**[Reviewer] 2026-11-06 — Resolved for the binary/slash/host entry points (verified in round 019).** `cli.statusreport.module.ts:101-108` renders `root: workspace`, and tests assert `--dir "<temp workspace>"` with no `$PWD`. The generic `/mf-prompts` path still renders `--dir ""`; filed as 019 F38.

### F35 — Picker guess and `which` disagree on the same branch

- Severity: Minor
- Location: `packages/prompts/src/modules/spec-source/spec-source.module.ts:38`
- Status: Resolved
- Attempts: 1
- First Seen: 018
- Problem: `SpecSource.guess` matches exact, then suffix, then any prefix (`feat/spec-standard` → `montflow-spec-standard`), while `modules/which.matchFeature` matches exact or a `-`-boundary prefix only. On this repo's branch `feat/spec-standard`, `/mf-prompts` preselects `montflow-spec-standard`, but `mf-specs status-report` with no name exits `SPEC_NO_MATCH`; the `status-prompt.test.ts` "picker source" test asserts the picker's suffix result. The docs claim the entry points use the shared `which` rule and the picker preselects the branch guess, but the same branch gives a hit in one path and a miss in the other.
- Impact: A user who accepts the preselected spec sees the entry point ask for `--name`; the "shared resolution" claim reads as false, and two matching rules can drift.
- Suggestion: align the picker to `which`'s rule (or make the picker's guess visibly a hint the user must confirm), and add a cross-surface test that the same branch resolves identically in the picker and the entry point.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->
<!-- [Reviewer] <turn 1> ... -->
<!-- [Fixer] <turn 1> ... -->

**[Fixer] 2026-11-06 — attempt 1**

- Changed `packages/prompts/src/modules/spec-source/spec-source.module.ts:30-60`: `guess` now matches an exact normalized name or a unique prefix pair that ends at a `-` boundary, exactly `which.matchFeature`'s rule. The suffix and mid-word prefix arms are removed.
- Tests: `packages/prompts/src/modules/spec-source/tests/spec-source.test.ts` now pins exact-over-prefix, unique boundary prefix in both directions, no suffix/mid-word match, and ambiguity. `packages/specs/src/modules/prompt/tests/status-prompt.test.ts` adds a cross-surface test that runs the picker `SpecSource.guess` and `Which.parseBranch` + `Which.matchFeature` over seven branches and asserts the same result for each.
- Verification: `bun run --cwd packages/prompts test` — 747 passed; the specs cross-surface test is in the green 2278-test suite.

**[Reviewer] 2026-11-06 — Resolved (verified in round 019).** `spec-source.module.ts:51-59` now applies `which`'s exact-or-boundary-prefix rule; a seven-branch cross-surface test pins picker ↔ `Which.matchFeature`, and both surfaces now miss `feat/spec-standard` identically.

### F36 — `unreadable SPEC.md` terminal is a two-branch placeholder with an unreachable `spec.not-found` arm

- Severity: Minor
- Location: `packages/specs/prompts/spec-status.json:4`
- Status: Resolved
- Attempts: 1
- First Seen: 018
- Problem: Section 3 gives `unreadable SPEC.md · <spec.not-found → mf-specs list; no code / SPEC.md → mf-specs check --name {{name}} --verbose>`. A missing spec never reaches the prompt: `statusReport` returns `spec.not-found` before rendering (verified with `status-report --name nope`). The rendered prompt only covers a directory that exists but lacks `SPEC.md`, where `check` reports the uncoded `SPEC.md: Required file is missing`. The line therefore carries two outcomes and names two commands, while I001 requires one explicit closing line with the code and exact command.
- Impact: A reporter can print a malformed conditional as the terminal line or use the wrong command; the "exactly one command" rule is broken.
- Suggestion: make the line the single reachable case (e.g. `unreadable SPEC.md · no code / SPEC.md · next mf-specs check --name {{name}} --verbose`) and let the entry point's `spec.not-found` diagnostic handle a missing spec.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->
<!-- [Reviewer] <turn 1> ... -->
<!-- [Fixer] <turn 1> ... -->

**[Fixer] 2026-11-06 — attempt 1**

- Changed `packages/specs/prompts/spec-status.json` terminal list: the unreadable case is now the single reachable line `unreadable SPEC.md · no code / SPEC.md · next mf-specs check --name {{name}} --verbose --dir "{{root}}"`. A missing spec stays the entry point's `spec.not-found` diagnostic, so the prompt no longer carries an unreachable arm.
- Updated the terminal-line assertion in `packages/specs/src/modules/prompt/tests/status-prompt.test.ts` to the new line.

**[Reviewer] 2026-11-06 — Resolved (verified in round 019).** The unreadable line is now one arm with one command and is reachable through a spec directory that lacks `SPEC.md`; `status-prompt.test.ts:109-118` pins it. The overlap with the `inconsistent`/`blocked` lines for that input is filed as 019 F41.

### F37 — `montflow-find-specs` says the host `spec_status` tool prints the prompt; it dispatches a session

- Severity: Nit
- Location: `.agents/skills/montflow-find-specs/SKILL.md:115` and `packages/specs/src/apps/server/spec-tools.apps.module.ts:186`
- Status: Resolved
- Attempts: 1
- First Seen: 018
- Problem: The new skill section says the host surface "loads the shipped `spec-status` prompt and prints it", but `specStatusTool` dispatches the prompt on a native session and returns the agent's reply; the README correctly says the host tools dispatch through the executor.
- Impact: A user expecting the raw prompt gets a model session and reply; the skill and README disagree about the same surface's power.
- Suggestion: say "dispatches the rendered prompt on a session" for `/specs status-report` and `spec_status`, and reserve "prints" for the binary.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->
<!-- [Reviewer] <turn 1> ... -->
<!-- [Fixer] <turn 1> ... -->

**[Fixer] 2026-11-06 — attempt 1**

- Changed `.agents/skills/montflow-find-specs/SKILL.md:124` and the packaged copy `packages/specs/skills/montflow-find-specs/SKILL.md`: `/specs status-report` and `spec_status` now "dispatch the rendered `spec-status` prompt on a session and return the agent's reply"; only the binary is said to print the prompt.
- `bun run --cwd packages/specs cli doctor --dir "$PWD"` reports the skill already installed; `bun run --cwd packages/specs test` is green.

**[Reviewer] 2026-11-06 — Resolved (verified in round 019).** Both skill copies now say the host surfaces dispatch the rendered prompt on a session and only the binary prints it (`.agents/skills/montflow-find-specs/SKILL.md:124-127`; packaged copy byte-identical). `specStatusTool` confirms it via `options.execute`.

## Summary

- Critical: 0
- Major: 3
- Minor: 5
- Nit: 1
- Open: 0
- In Review: 0
- Resolved: 9
- Won't Fix: 0
- Escalated: 0
