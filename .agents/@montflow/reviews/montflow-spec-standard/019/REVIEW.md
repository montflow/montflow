# Review: montflow-spec-standard / 019

## Metadata
- Target: spec montflow-spec-standard phase I
- Round: 019
- Phase: I
- Type: re-review
- Overflow: user-authorized second round for phase I after the round 018 fix batch
- Overflow-authorized: user
- Isolation: isolated
- Max Attempts: 3
- Status: closed
- Disposition: minor-deferred
- Deferred: F38, F39, F40, F41
- Created: 2026-11-06

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

**[Reviewer] 2026-11-06 — Resolved.**

- Template section 8 now reads "the `check` verdict line verbatim: `✗ <spec> (n)` or `✗ <spec> (n issues · m warnings)` when it fails, `✓ <spec>` when it passes" and "the `status` `verify` line is the tree verifier only and never the blocking verdict" (`packages/specs/prompts/spec-status.json:4`). The retired `verify <✓ verified or ✗ n issues>` text is absent.
- Sources confirmed in code: `renderCheck` prints `✗/✓ <spec>` from `checkCounts` (`packages/specs/src/apps/cli/cli.check.module.ts:617-623`, `:754`); `renderStatus` prints `verify ✓ verified` or `verify ✗ n issues` (`packages/specs/src/apps/cli/cli.status.module.ts:386`).
- Pinning test: `packages/specs/src/apps/cli/tests/status-report.test.ts:187-222` builds a stale-gate spec, asserts `check` renders `✗ drift-spec` with `gate.stale-result` while `status` renders `verify ✓ verified`, then asserts the rendered section names `check` and drops the old shape. The shape enumeration that the fix left incomplete is filed as F39.

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

**[Reviewer] 2026-11-06 — Resolved.**

- Content check, not a trust of the claim: every embedded `skill` (2), `prompt` (4, including `spec-status`), and `rigor` (5) entry is byte-equal to its packaged file; the doctor test's own source-of-truth comparison (`packages/specs/src/modules/doctor/tests/embedded-payload.test.ts:34-52`) passes.
- `bun run --cwd packages/specs test` — 152 files, 2278 tests passed, no type errors.
- `bun run --cwd packages/specs cli doctor --check --dir "$PWD"` reports every payload `up to date`; `.agents/@montflow/prompts/spec-status.json` is byte-identical to `packages/specs/prompts/spec-status.json`.

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

**[Reviewer] 2026-11-06 — Resolved.**

- `packages/specs/src/tests/server.test.ts:188-204` asserts the six-name registration list and the `status-report [--name <spec>] [--focus <text>]` help row; `packages/specs/src/server.ts:67` registers `specStatusTool` in the same order.
- The suite is green (2278 tests), so the assertion matches the registered surface.

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

**[Reviewer] 2026-11-06 — Resolved.**

- `AGENTS.md:89-90` now lists `spec_author` / `spec_execute` / `spec_status` / `spec_sizing` / `spec_rigor` / `spec_models`.
- `packages/specs/wiki/verbs.md:51` lists the same six tools; `:58` names `status-report` among the renderers and states the binary prints while the host dispatches. `packages/specs/wiki/payload.md` also lists the `spec-status` prompt.
- Residual doc drift outside the cited locations is filed as F40.

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

**[Reviewer] 2026-11-06 — Resolved.**

- `packages/specs/src/apps/cli/tests/status-report.test.ts:59-60` runs the real `Command.runWith(statusReportCommand, …)`; `:169-183` passes `--name`, `--focus`, and a temp `--dir`, then asserts strict equality with the engine text plus the focus and `--dir` content.
- Slash parity is pinned the same way at `packages/specs/src/apps/cli/tests/run-slash.test.ts:773-800`, which compares `/specs status-report` output to the same engine with the same name/focus. Together they pin binary ↔ engine ↔ slash without trusting either surface.
- The suite is green (2278 tests).

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

**[Reviewer] 2026-11-06 — Resolved for the binary/slash/host entry points.**

- `cli.statusreport.module.ts:101-108` renders `{ name, root: workspace }`, and the binary passes `workspace` resolved from `--dir` (`:133-138`). The slash arm does the same (`cli.slash.module.ts:365-375`), as does the host tool (`spec-tools.apps.module.ts:193-196`).
- Pinning tests: `status-report.test.ts:169-182` runs the binary with a temp workspace that is not the process cwd and asserts `--dir "<workspace>"`; `status-prompt.test.ts:147-156` renders with `/other/workspace` and asserts no `--dir "$PWD"` remains.
- Live check: invoking the binary from `/tmp/...` with `--dir /home/daniel/dev/montflow/spec-standard` printed `--dir "/home/daniel/dev/montflow/spec-standard"` in every command form.
- The generic `/mf-prompts render` path still produces an empty `--dir`; that distinct surface is filed as F38, not charged to this finding.

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

**[Reviewer] 2026-11-06 — Resolved.**

- `spec-source.module.ts:51-59` now returns only an exact normalized match or a unique prefix pair ending at a `-` boundary, using the same `isPrefixPair` shape as `packages/specs/src/modules/which/which.module.ts` (`matchFeature`) and the same lowercase prefix set.
- Pinning tests: `packages/prompts/src/modules/spec-source/tests/spec-source.test.ts:81-110` covers exact-over-prefix, both prefix directions, suffix/mid-word rejection, and ambiguity; `status-prompt.test.ts:249-268` runs the picker rule and `Which.parseBranch` + `Which.matchFeature` over seven branches and asserts equality for each.
- `bun run --cwd packages/prompts test` — 54 files, 747 tests passed, no type errors. On this repo's actual `feat/spec-standard` branch both surfaces now miss (`SpecSource.guess` returns undefined; `mf-specs which` exits `SPEC_NO_MATCH`), so the divergence is gone.

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

**[Reviewer] 2026-11-06 — Resolved.**

- Section 3 now has five one-arm lines; the unreadable line is `unreadable SPEC.md · no code / SPEC.md · next mf-specs check --name {{name}} --verbose --dir "{{root}}"` with no conditional and no `spec.not-found` arm (`packages/specs/prompts/spec-status.json:4`). The old placeholder is gone.
- The case is reachable: `statusReport` gates on `SpecStore.exists`, which accepts a spec *directory* (`spec-store.services.module.ts:172-178`), so a directory with no `SPEC.md` renders the prompt; probing `state` on such a directory printed `unreadable · state inconsistent` and `check` printed the uncoded `✗ broken (1)` / `SPEC.md: Required file is missing.`, matching the line's `no code / SPEC.md`.
- Pinning test: `packages/specs/src/modules/prompt/tests/status-prompt.test.ts:109-118` asserts the new single line. The overlap with the `inconsistent`/`blocked` lines for that same input is filed as F41.

### F38 — The generic `/mf-prompts` render leaves `root` empty, so every command form says `--dir ""`

- Severity: Minor
- Location: `packages/specs/prompts/spec-status.json:4` and `packages/specs/README.md:270`
- Status: Resolved
- Attempts: 1
- First Seen: 019
- Problem: `root` is declared `internal: true`, `required: false`, with no `default`, and only the CLI entry points supply it. The README advertises the prompt's other render path as `mf-prompts render spec-status name=<spec>`; running exactly that (with the repo as `--dir`) renders "every one carries `--dir \"\"`, the workspace this report was resolved from" on every command form and on every terminal line. Nothing was resolved, and the empty value makes each `mf-specs …` command fall back to `resolveRepoRoot(process.cwd())` (`cli.shared.module.ts:689-690`), not the workspace the prompt was read from. This is the same wrong-store failure F34 fixed for the binary, still present on the documented generic path.
- Impact: A human or agent following the README from a different working directory gets a report whose commands read a different (or missing) spec store while the prompt claims the workspace was resolved; from the same directory the commands merely look malformed (`--dir ""`).
- Suggestion: give the internal value a safe fallback and document it — e.g. render the command forms through `{{#if root}}--dir "{{root}}"{{/if}}` so an absent root omits the flag, and change the README line to `mf-prompts render spec-status name=<spec> root=<workspace>`; add a test that renders `spec-status` without `root` and asserts no `--dir ""` appears.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-06 — attempt 1**

- Changed `packages/specs/prompts/spec-status.json:4`: every command form, terminal line, and clean-spec next command now guards the flag as `{{#if root}} --dir "{{root}}"{{/if}}`. The command-forms paragraph renders the resolved-workspace sentence only when `root` is set; otherwise it says no workspace was resolved and every verb omits `--dir`, so the generic render cannot print `--dir ""`.
- Changed `packages/specs/README.md:271`: the `/mf-prompts` example is now `mf-prompts render spec-status name=<spec> root=<workspace>`.
- Tests: `packages/specs/src/modules/prompt/tests/status-prompt.test.ts:129` runs the generic `PromptExecute.resolveInputs` + `Prompts.renderToString` fill path with only `name` and asserts no `--dir "` and the fallback sentence; `:177` renders through the doctor-installed store with only `name` and asserts the same; `:165` asserts the fallback sentence is absent when `root` is supplied.
- Live: `bun packages/prompts/src/apps/cli/main.ts render spec-status name=montflow-spec-standard --dir "$PWD"` prints no `--dir "` flag; the same render with `root=$PWD` prints 13 resolved flag forms.
- Verification: `bun run --cwd packages/specs test` — 152 files, 2286 passed; `bun run --cwd packages/prompts test` — 747 passed. Regenerated `packages/specs/src/modules/doctor/embedded-payload.generated.ts` and repaired the installed prompt with `mf-specs doctor`.

### F39 — Section 8's `check` verdict shapes omit the clean and warning-only pass

- Severity: Minor
- Location: `packages/specs/prompts/spec-status.json:4` and `packages/specs/src/apps/cli/cli.check.module.ts:753`
- Status: Resolved
- Attempts: 1
- First Seen: 019
- Problem: Section 8 enumerates only `✗ <spec> (n)`, `✗ <spec> (n issues · m warnings)`, and `✓ <spec>`. In default mode `renderCheck` skips a valid spec with no warnings (`cli.check.module.ts:753`), so a clean spec prints no per-spec verdict line at all — only `1 spec · 0 failed · 0 issues` (pinned by `packages/specs/src/apps/cli/tests/check.test.ts:739`). A valid spec with warnings prints `✓ ok (1 warning)` (`check.test.ts:609`, confirmed live on `cli-version-awareness`). The reporter is told to quote a `✓ <spec>` line that `check` never printed, and is given no shape for the warning-only line.
- Impact: Section 8 of a clean spec's report either invents a verdict or silently drops the verification section, and a warning-only pass is quoted with an unlisted shape; the "quote verbatim" contract cannot be followed as written.
- Suggestion: name `check`'s summary line as the clean verdict (or add `--verbose` to the section 1 `check` command, which makes `✓ <spec>` reachable), and add `✓ <spec> (m warnings)` to the enumerated shapes; pin both renders in `status-report.test.ts`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-06 — attempt 1**

- Changed section 8 of `packages/specs/prompts/spec-status.json:4`: it now names `✗ <spec> (n)` / `✗ <spec> (n issues · m warnings)` on failure, `✓ <spec> (m warnings)` on a warning-only pass, and the summary line `1 spec · 0 failed · 0 issues` (plus `· m warnings`) as the clean-pass verdict because `renderCheck` skips the per-spec line; `--verbose`'s `✓ <spec>` is named as the alternative.
- Test: `packages/specs/src/apps/cli/tests/status-report.test.ts:227` ("names the clean summary and the warning-only pass `check` prints") reduces a clean spec and asserts `renderCheck` is exactly `1 spec · 0 failed · 0 issues` with no per-spec name, reduces a warning-only spec and asserts `✓ warn-spec (1 warning)`, then asserts the rendered section carries both shapes.
- Verification: `bun run --cwd packages/specs test` — 2286 passed; `ts:check`, `lint:check`, `format:check` green.

### F41 — A missing `SPEC.md` matches three terminal lines at once, with no stated precedence

- Severity: Nit
- Location: `packages/specs/prompts/spec-status.json:4`
- Status: Resolved
- Attempts: 1
- First Seen: 019
- Problem: For a spec directory with no `SPEC.md`, `state` prints `broken · unreadable · state inconsistent · … · blocked unspecified` (probed live), so section 2 reports declared status `unreadable`, derived state `inconsistent`, and the blocking codes, while section 3 lists separate lines for `inconsistent`, `blocked`, and `unreadable SPEC.md`. Section 10 says "Use the terminal line for the state", which selects `inconsistent` for this input, so a reporter following that sentence never prints the dedicated `unreadable SPEC.md` line — even though I001 requires a distinct closing line for the missing/unreadable case.
- Impact: Two reporters can close the same report with different lines; the dedicated unreadable line is effectively shadowed for the common missing-file case.
- Suggestion: state the precedence explicitly, e.g. "a missing or unreadable `SPEC.md` selects the unreadable line before the state lines", and add a test that pins that selection for a directory without `SPEC.md`.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-06 — attempt 1**

- Changed section 3 of `packages/specs/prompts/spec-status.json:4`: before the terminal lines it now states "A missing or unreadable `SPEC.md` selects the `unreadable SPEC.md` line before the state lines, even when `state` also reports `inconsistent` and blocking codes for that directory." Section 10 now says to apply the section 3 precedence when choosing the terminal line.
- Tests: `packages/specs/src/modules/prompt/tests/status-prompt.test.ts:120` pins that the precedence sentence precedes the `inconsistent` line. `packages/specs/src/apps/cli/tests/status-report.test.ts:263` builds a spec directory with no `SPEC.md`, asserts `state` prints `broken · unreadable · state inconsistent` + `blocked unspecified`, `check` prints `✗ broken (1)` + `SPEC.md: Required file is missing`, and the rendered prompt carries both the precedence sentence and the unreadable line.
- Verification: `bun run --cwd packages/specs test` — 2286 passed; `ts:check`, `lint:check`, `format:check` green.

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

**[Reviewer] 2026-11-06 — Resolved.**

- Both copies read "both dispatch the rendered `spec-status` prompt on a session and return the agent's reply. Only the binary prints the prompt." (`.agents/skills/montflow-find-specs/SKILL.md:124-127`, `packages/specs/skills/montflow-find-specs/SKILL.md:124-127`); `diff -q` shows the two files identical.
- Source confirms the wording: `specStatusTool` ends in `options.execute({ … text: report.prompt.text, skills })` (`spec-tools.apps.module.ts:193-211`), and its description says "dispatch it on a native session and return the agent's last reply".

### F40 — Docs still count three shipped prompts, and the plugin comment omits `spec_status`

- Severity: Nit
- Location: `packages/specs/README.md:332` and `packages/specs/src/server.ts:43`
- Status: Resolved
- Attempts: 1
- First Seen: 019
- Problem: The same change adds a fourth doctor-owned prompt, but `README.md:332` still says "doctor's ownership boundary stays exactly the two spec skills and the three prompts it ships", and the plugin entry JSDoc at `server.ts:42-45` still says it renders "the shipped author/execute/sizing prompts" and registers "the `spec_author` / `spec_execute` / `spec_sizing` tools", omitting `spec_status` (and the already-shipped `spec_rigor` / `spec_models`).
- Impact: A reader of the README or the plugin's own API comment gets a surface count that contradicts `payload.json` (four prompts) and `server.ts` (six tools); I003's "docs name the new surface" is incomplete in the file that registers it.
- Suggestion: say "four prompts" at `README.md:332` and update the `server.ts` JSDoc to name the status prompt and the six registered tools.

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->

**[Fixer] 2026-11-06 — attempt 1**

- Changed `packages/specs/README.md:332`: the ownership paragraph now says "the four prompts it ships".
- Changed `packages/specs/src/server.ts:42`: the plugin JSDoc now names the author/execute/status/sizing prompts, the `spec_author` / `spec_execute` / `spec_status` / `spec_sizing` prompt tools, and the `spec_rigor` / `spec_models` read tools, matching the six registrations below it.
- Docs only; `bun run --cwd packages/specs ts:check` and `lint:check` are green.

## Summary

- Critical: 0
- Major: 3
- Minor: 7
- Nit: 3
- Open: 0
- In Review: 0
- Resolved: 13
- Won't Fix: 0
- Escalated: 0
