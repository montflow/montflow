---
name: spec-optimizations
status: in-progress
workspace-type: worktree
author: Daniel Montilla
created: 2026-10-26
locked-phases:
  - A
  - B
  - C
---

# Spec optimizations

## Description

A task today carries no size, so every dispatch uses the same model and effort.
Add a four-value task size (`tiny`, `small`, `medium`, `large`), a layered
`sizing.json` config that maps each size to a model id and optional effort, a
mechanical verifier for both, a merged resolver, and CLI surfacing so `status`,
`next`, a machine-only `resolve` verb, and a new `sizing` inspection command
expose the effective target and its provenance. A size with no config entry
inherits the current model. Every sizing failure is a typed Effect error or a
coded `Issue` that renders as an agent-first diagnostic: code, path, field,
expected, actual, fix, and preserved cause.

The config lives at the specs root (repo-wide) and at a spec root, with phase
overrides nested in the spec file. The repo file is exactly
`.agents/@montflow/specs/sizing.json`; it is a config file, never a spec
directory. Layers merge by size: repo -> spec -> phase, and the most specific
layer that defines a size wins that size entry. Tasks declare their size in
`TASK.md`; the authoring process chooses it.

Phase B retires the remaining `pi` naming from live artifacts. The prompt store
moves to `.agents/@montflow/prompts/`, the eight skills drop the `-pi-` infix,
the profiles module loses its `pi-profiles` name, and every live reference in
code, tests, docs, profiles, prompts, and installed skills follows. Historical
changelog entries and completed spec records are left untouched.

Phase C replaces inline prompt assembly with shipped templates. `packages/specs/prompts/`
becomes the only source for the authoring and execution prompts; both load by
name through `@montflow/prompts`, render from spec state, and gate on doctor.
`mf-specs author` and `mf-specs execute` expose them, and `execute` runs in
guided or autonomous mode. When no spec is named, `execute` infers it from the
branch and asks the user only when the match is absent or ambiguous.

Phase D generates sizing configs instead of leaving them to hand-typed guesses.
The harness model catalogue — model ids plus the effort variants each model
accepts — becomes a first-class read (`mf-specs models`), the same catalogue
cross-checks a config (`models --verify`), and a third shipped prompt,
`spec-sizing`, drives a guided wizard: show the existing config, ask whether the
target is repo-wide, one spec, or one phase, inventory the catalogue, propose all
four sizes with reasoning including effort, ask the user to confirm, then write
exactly one layer and prove it with `check` and `sizing --human`. Generation never
invents a model id or an effort token, never edits a task size, and never drops an
unrelated config entry.

## Requirements

- Exactly four sizes exist in one source of truth: `tiny`, `small`, `medium`, `large`. Every other module, verifier, scaffold, skill, and status renderer reads that enum instead of restating it.
- A task declares `size` in `TASK.md` frontmatter. An unknown size is an error. A missing size is an error for `pending`, `in-progress`, and `blocked` tasks, and a warning for `complete` tasks, so historical completed work needs no backfill.
- The `SPEC.md` task table keeps its current columns. Size is a task-level field, not a table column.
- Repo-wide config is exactly `.agents/@montflow/specs/sizing.json` under the default root (`<specs-root>/sizing.json` for a custom `--dir`). It is a root config file, never a spec directory, and `list`/`check` never treat it as a spec. Spec config is `<spec>/sizing.json`; phase overrides are nested under its `phases` map. The repo file has no `phases` key. Both files are optional, and the repo file works on its own with no spec file.
- Config shape: top-level `sizes` is a map keyed by the four size names; a size entry has `model` (`provider/model`) and optional `effort` (a model variant such as `low`, `medium`, `high`, `xhigh`, `max`). A spec's nested `phases.<PHASE>.sizes` has the same size-entry shape.
- A size entry requires `model`; `effort` without a model is invalid. An absent size entry, or no config files at all, resolves to `inherit`: the dispatcher omits the `model` argument and the current model is used.
- Merge precedence is repo -> spec -> phase. For a given size, the most specific layer that defines the entry replaces the whole entry; fields are never partially inherited. Resolution also reports which layer supplied the entry (`repo`, `spec`, or `phase`).
- `mf-specs check` verifies both config files and every task size. Invalid JSON, unknown keys, unknown sizes, malformed model ids, malformed effort tokens, non-object entries, and unknown phase keys are errors; a spec config phase with no task is a warning. Config diagnostics name the file and field. A repo-only config is valid and verified even when no spec config exists.
- The spec tree verifier allows exactly one new root file, `sizing.json`, inside a spec directory; every other stray root file stays an error.
- `mf-specs status --name <spec>` shows the config files it found, the effective size -> model#effort mapping per phase, and, on every task line, the task's size plus its resolved target and source or `inherit`.
- `mf-specs next --name <spec>` shows the same size, resolved target, and source for every ready task, so an orchestrator can dispatch without re-reading config.
- A machine-only `mf-specs resolve --name <spec> --task <id>` prints exactly the dispatch string (`provider/model#effort`) or `inherit`, and exits non-zero for an unknown spec, task, or invalid config. Inside the host the same verb is `/specs resolve`.
- A new `mf-specs sizing --name <spec> --task <id> [--verbose|--human]` checks one task's sizing. By default it prints one compact line: task id, declared size, effective target or `inherit`, and the winning source layer. `--verbose` and `--human` are aliases for the same detailed mode.
- Detailed `sizing` output is a provenance report, not a sentence: the task's declared size, the selected target and its layer, then a size-by-layer matrix for all four sizes showing which layer defined each option, what value it had, and which entry won. Absent layers and absent sizes are marked, not omitted.
- Sizing failures use Effect error handling end to end. Config read/parse failures are `Data.TaggedError` values that preserve the original `cause`; schema decoding uses `Effect`'s Schema decode effect, never a synchronous throw-and-catch. Pure tree findings carry the same information as coded `Issue`s. The CLI catches `Cause`, extracts expected failures, and reports unexpected defects separately without dumping a raw stack by default.
- Every sizing diagnostic is agent-first and greppable: stable `code`, `path` (file or spec/task), `field`, `problem`, `expected`, `actual` when applicable, `fix` with a concrete edit or command, `cause` when one exists, and `next` naming the command to re-run. No prose padding and no "something went wrong".
- `check` aggregates every sizing error across the repo config, spec config, and task sizes in one pass and renders them all; it never stops at the first failure. `--verbose` adds the cause chain and layer trace.
- The `Issue` vocabulary gains an optional stable `code`; sizing findings set it, and existing findings keep working without one.
- CLI exit codes stay deterministic: `0` when every check passes, `1` for validation failures, and a distinct non-zero code for internal defects surfaced from `Cause`.
- `mf-specs create` emits `size` on every task it scaffolds. Its task syntax accepts an optional fourth token, `name[:type[:gates[:size]]]`; an omitted size defaults to `medium`, which the author replaces with the chosen size.
- The authoring skill and the simplified authoring prompt tell the agent to choose a size for every task, explain the four values, and document the config layering. The package copy and the workspace copy of the skill stay byte-identical.
- `packages/specs/prompts/` is the canonical home for the spec prompts, `spec-create.json`, `spec-execute.json`, and phase D's `spec-sizing.json`. The copies under `.agents/@montflow/prompts/` are installed artifacts, never hand-edited: change the package file, then sync.
- `mf-specs doctor` owns exactly the shipped spec prompt files — `spec-create.json`, `spec-execute.json`, and phase D's `spec-sizing.json`. Repair mode installs a missing prompt and rewrites a stale one to the package bytes; `--check` writes nothing and reports `missing` / `stale` per file. It never touches any prompt file it does not own, and `mf:check:specs` therefore fails on prompt drift.
- The execution prompt and orchestrator profile read the resolved target from `next` and pass it as the `model` argument to `subagent` only when it is not `inherit`; `inherit` means the argument is omitted.
- Every pending task in every existing spec gets an explicit size. Completed tasks may keep no size and produce only the completion warning. No repo-wide `sizing.json` is added with invented model ids; tests use fixture configs.
- Unit tests cover config parsing and verification, precedence and whole-entry replacement, inherit fallback, task-size enforcement (pending vs complete), scaffold emission, CLI status/next/resolve/sizing output, detailed provenance, and exact agent-facing error rendering including a preserved cause. Tests assert the stable error codes and the `fix` line, not just that an error occurred.
- The prompt store path is exactly `.agents/@montflow/prompts/` in code, tests, docs, profiles, prompts, and installed skills. No live artifact names `pi-prompts`.
- Eight skill names drop the `-pi-` infix: `montflow-create-skills`, `montflow-modify-skills`, `montflow-create-prompts`, `montflow-execute-prompts`, `montflow-create-specs`, `montflow-find-specs`, `montflow-create-profiles`, `montflow-modify-profiles`. Package directories, frontmatter `name`, cross-references, doctor constants, and embedded payloads follow.
- Installed mirrors under `.agents/skills/` move with their package directories, and the old `-pi-` directories are removed. `mf:check:skills`, `mf:check:prompts`, and `mf:check:specs` pass with no stale copy left behind.
- The `packages/profiles` module directory `pi-profiles` becomes `profiles` and its namespace becomes `Profiles`; every import, test name, and export follows.
- Live docs, profiles, prompt `skills` arrays, and workspace services lose the legacy names. Historical CHANGELOG entries and records of completed specs are not rewritten.
- `packages/specs/prompts/` is the only source of spec prompt text. `src/skills/*` and the string builders in `modules/prompt` are deleted; no prompt or skill body is duplicated in TypeScript.
- Each shipped prompt declares the skills it needs (`montflow-create-specs` for authoring; `montflow-find-specs` plus the review skills for execution), and the executor loads them. Skills are never inlined into a template.
- `mf-specs author --request <text>` and `mf-specs execute [--name <spec>] [--phase <id>] [--focus <text>] [--mode guided|autonomous]` load and render the named prompt. The binary prints the rendered prompt; the host tools `spec_author` / `spec_execute` and the `/specs author|execute` slash forms dispatch it on a session.
- `execute` resolves its spec mechanically: an explicit `--name` always wins; otherwise it asks `mf-specs which` for the branch match and uses the result.
- `mf-specs which [--branch <name>] [--dir <path>]` is the mechanical resolver. It prints exactly one spec name and nothing else, or exits non-zero with a candidate list. Inside the host the same verb is `/specs which`.
- Branch shape is `<prefix>/<feature-name>`, where `<prefix>` is a lowercase conventional token such as `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `release`, or `hotfix`. The feature name is everything after the first `/`, lowercased with `/` and `_` normalized to `-`.
- Matching is exact first, then a unique prefix match between the feature name and a spec name. No fuzzy, edit-distance, or keyword matching. Two or more prefix candidates, no candidate, a detached HEAD, a branch without a prefix, or unreadable git metadata all resolve to "no match".
- A failed match exits non-zero and lists every candidate spec, the branch it read, and the exact `--name` to pass. The agent must then ask the user which spec to run; it must never pick one.
- Detection works in this repo's bare-repo worktree layout, reading the resolved git directory rather than assuming `.git` is a directory. A `--branch` value overrides detection for tests and CI.
- `execute` covers both cases: it begins a spec with no started task and resumes one in progress, deriving state from `state` and `next` rather than trusting the caller.
- `guided` is the default mode: the human is present, feedback is welcome, and the coordinator may ask whenever a decision benefits from it.
- `autonomous` asks only for destructive or irreversible actions, very dangerous tool calls, or a decision the coordinator genuinely cannot make from the spec. Everything else is decided and recorded in `MEMORY.md`.
- The public mode names are exactly `guided` and `autonomous`. Internally the policy stays `supervised` / `unsupervised`, and the template variable stays `unsupervised` because the prompt grammar has no string comparison. The CLI rejects any other value.
- Mode changes interaction only. Dispatch order, `depends-on`, gates, phase review, locking, and verification are identical in both modes.
- Author and execute gate on `mf-specs doctor`: a missing or stale prompt fails before dispatch with the code, path, fix, and the doctor command to run.
- Workspace prompt copies under `.agents/@montflow/prompts/` are synced from the package and never hand-edited.
- Task size sets a review-cycle budget: `tiny` 1, `small` 2, `medium` 3, `large` 3. The hard cap is 3 for every size.
- A phase's review budget is the largest budget among its non-review tasks, capped at 3. A phase made only of tiny tasks therefore gets exactly 1 review cycle, and the phase's own review task does not raise its budget.
- `status` and `next` show each phase's review budget, and `sizing --task` shows the task's budget, so an orchestrator never guesses it.
- The execute prompt enforces the budget: before opening a review round it compares the series' round count to the phase budget, and at the cap it escalates leftover findings instead of opening another round. No phase ever gets a fourth cycle.
- A review cycle counts a reviewer round, not a per-finding attempt. `Max Attempts` stays per finding and is unchanged.
- Tests cover the size-to-cycle mapping, the phase maximum, the tiny-only phase case, and the cap.
- Tests cover prompt loading and rendering, the doctor gate, both mode branches, begin vs resume context, branch detection and ambiguity, and the host tool and slash wiring.
- A task's declared size stays an authoring decision. Sizing configs are generated from the live harness catalogue, never from remembered model names, and no flow invents a `provider/model` or an effort token.
- The model seam carries each catalogue entry's effort variants (`variants?: readonly string[]`). The catalogue distinguishes "variants known but empty" from "variants unknown"; an unknown variant list never produces a finding and never authorizes an effort.
- A pure catalogue module normalizes, dedupes, and orders the host catalogue by provider then model, carries the host's default model, and is the only source the `models` command and the sizing flow consume.
- `mf-specs models [--provider <id>] [--json] [--catalog <path>]` prints the models this harness can dispatch with their variants and the default marker. Inside the host the same read is the agent-callable `spec_models` tool (`list` and `verify` actions), with `/specs models` for a human; outside it reads `--catalog <path>` and otherwise exits non-zero with code `models.unavailable` and that fix. The tool, the binary, and the verifier call one catalogue module. Output is stable and date-free.
- `mf-specs models --json` is valid `--catalog` input, so the round-trip works. A variant list is `null` when the host does not know it and `[]` when the host knows there are none.
- `mf-specs models --verify [--name <spec>]` cross-checks every config entry against the catalogue: an absent model is `models.unknown-model` and an effort absent from a known variant list is `models.unknown-effort`. Both are warnings, because a host catalogue can be partial, and they render through the same diagnostic shape, aggregated in one pass. Omitting `--name` verifies the repo config. `spec_models` exposes the same check.
- Add `packages/specs/prompts/spec-sizing.json` as the third shipped prompt. Variables are `scope` (optional; `repo`, `spec`, or `phase`, with empty meaning "ask"), `name` (optional spec slug), `phase` (optional phase id), `unsupervised` (the internal flag for the public `autonomous` mode), and `focus` (optional), in first-appearance order. Skills are `executing-skills`, `montflow-find-specs`, `montflow-create-specs`, `grilling`, and `i-have-adhd`.
- The prompt is a guided wizard, not a one-shot generator. In order it must: read and show the existing repo config and the spec list, then the chosen spec's config and status once the scope is known; ask the user whether the target is repo-wide, one spec, or one phase, with that existing config as context, unless `scope` was supplied; inventory the catalogue; propose all four sizes with reasoning, effort choices, and the exact path plus JSON; ask the user to confirm or adjust; write only after that confirmation; then verify and report. No write happens before the scope and the proposal are resolved.
- The sizing proposal decides all four sizes explicitly — an explicit `provider/model#effort` target or an explicit `inherit` — each with a one-line reason grounded in the catalogue and the existing config. It must not fill a size merely to fill the file, and a run that would change nothing writes nothing.
- The prompt may use only a model id present in the catalogue, and an effort only when that model's variants are known and include the token. It reads the catalogue through `spec_models` in the host or `mf-specs models --catalog` outside it, never from memory. Unknown variants mean no effort. It asks at exactly three points — scope, proposal confirmation, and permission before overwriting a non-empty entry with a different value — and surfaces cost/quality tradeoffs inside the proposal; `autonomous` decides those, records the call, and continues.
- The prompt writes exactly one layer per run: repo `<specs-root>/sizing.json`, spec `<spec>/sizing.json`, or `phases.<ID>.sizes` inside the spec file. It names the path it will write, preserves unrelated keys and entries, keeps `sizes` then `phases`, and never writes a `phases` key to the repo file. A second layer takes a second run, and the report says so.
- The prompt never edits a task size, a `TASK.md`, or spec state, and it proves its work: the catalogue verify action (or `models --verify` for the touched scope), `check` for the touched scope, then `sizing --task <id> --human` for one task per explicit size. A failing check blocks the report, and the report carries the mapping, the path, and the evidence.
- `mf-specs sizing-config [--scope repo|spec|phase] [--name <spec>] [--phase <id>] [--mode guided|autonomous] [--focus <text>]` renders the prompt and writes no file. With no scope flag the scope is open and the prompt asks. `--name` alone implies spec, `--name` plus `--phase` implies phase, and `--scope` overrides the implication. `--phase` without `--name`, `--scope spec|phase` without `--name`, an empty `--name`, or a `--scope` that contradicts the supplied flags exits non-zero with a usage diagnostic.
- `sizing-config` accepts exactly `guided` and `autonomous`, defaults to `guided`, rejects any other value, and reuses C002's mode handling. The host tool `spec_sizing` and `/specs sizing-config` dispatch the same executor as `author` and `execute`; no copied loader or child-run path.
- `mf-specs doctor` grows to own all three shipped spec prompts, and `--check` reports `missing` / `stale` per file. A missing or stale `spec-sizing.json` fails before dispatch and makes `mf:check:specs` fail, exactly like the other two.
- The `spec-sizing-orchestrator` profile ships with the prompt and defines the role it behaves as. The creation and execution profiles hand off to it when a spec or phase has no tuned config and the user wants one, instead of letting a worker guess a model.
- README and the authoring skill document the wizard checkpoints, catalogue-driven generation, the effort-from-variants rule, open versus fixed scope, `inherit`, merge, and the verification loop. The package and workspace skill copies stay byte-identical.
- Tests use fixture catalogues only — variants known, known-empty, and unknown, duplicate and unsorted entries, a missing host context, and a malformed `--catalog` file. They cover `--verify` aggregation, the open scope plus every fixed scope and each conflict, the doctor gate, the slash and tool wiring, and a rendered prompt for open, repo, spec, and phase scope. No test writes a real `sizing.json` into the workspace.
- Generating the repo config is allowed only from the live catalogue and only when the run's scope is repo; the phase itself commits no repo config and no model id as test data.

## Tasks

| ID | Name | Type | Status | Gates |
| --- | --- | --- | --- | --- |
| A001 | contract | execution | complete | Yes |
| A002 | surfacing | execution | complete | Yes |
| A003 | wire-authoring | execution | complete | Yes |
| A004 | backfill | execution | complete | Yes |
| A099 | review-phase | review | complete | No |
| B001 | prompt-store-rename | execution | complete | Yes |
| B002 | prompt-sync | execution | complete | Yes |
| B003 | skills-rename | execution | complete | Yes |
| B004 | live-refs | execution | complete | Yes |
| B099 | review-phase | review | complete | No |
| C001 | prompt-templates | execution | complete | Yes |
| C002 | execute-modes | execution | complete | Yes |
| C003 | author-execute-commands | execution | complete | Yes |
| C004 | spec-detection | execution | complete | Yes |
| C005 | docs-and-profiles | execution | complete | Yes |
| C099 | review-phase | review | complete | No |
| D001 | model-catalogue | execution | complete | Yes |
| D002 | sizing-prompt | execution | complete | Yes |
| D003 | config-command | execution | complete | Yes |
| D004 | docs-and-handoffs | execution | complete | Yes |
| D099 | review-phase | review | pending | No |
