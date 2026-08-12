---
name: adversarial-review-feature-spec
description: Audits feature specifications (FEATURE.md, TASK.md, MEMORY.md, GATES.md) for completeness, correctness, and consistency and writes the report to a file under `.agents/@montflow/reviews/`. Use when reviewing a feature spec during or after authoring. Pair with addressing-adversarial-review to resolve findings across fix→re-review loops. For code/PR/diff reviews, see adversarial-review.
id: e675df1f0e8d82a2
author: Daniel Montilla
version: 2.1.0
license: MIT
dependencies:
  - adversarial-review
  - executing-skills
groups:
  - feature-spec
  - planning
  - conventions
---

# When To Use

Use when the target is a feature specification — a directory `.agents/features/<name>/` with `FEATURE.md`, `TASK.md`, `MEMORY.md`, and `GATES.md` (see [authoring-feature-spec](../authoring-feature-spec/SKILL.md) and [executing-feature-spec](../executing-feature-spec/SKILL.md)). Triggers include "audit this spec", "review the feature plan", "check the spec for gaps". This is an **authoring-time** skill — it is not invoked by `executing-feature-spec`'s end-of-phase review pipeline (which uses the base `adversarial-review` skill for code reviews).

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

This skill wraps the [adversarial-review](../adversarial-review/SKILL.md) skill. Load that skill as a base — its general review patterns (reporting format, finding structure, severity levels) apply here too. The pipeline below adds spec-specific audit steps and overrides certain base steps for the spec context.

### Isolation Requirement

The base skill's [Isolation Requirement](../adversarial-review/SKILL.md#isolation-requirement) and its **Enforcement: independent reviewer** subsection apply in full, including the subagent/structural-isolation rule. In addition, for the spec context:

- You may see: the spec files (`FEATURE.md`, `TASK.md`, `MEMORY.md`, `GATES.md`) and any supporting reference material the spec explicitly references.
- You must NOT see: the original author's implementation notes, design commentary, chat history, or any other artifact that reveals what the author *thought* they were doing when authoring the spec.

A reviewer that authored or reviewed the spec earlier in the same session cannot self-certify forgetting; spawn a fresh subagent for the audit, or mark the run non-isolated in Review Metadata.

> **File output restriction**: Reviews are ALWAYS written to `.agents/@montflow/reviews/<name>/SPEC_<code>.md` (see Step 0). The base skill's directory-isolation rule applies — listing directory entries is permitted, but you must NOT read the *contents* of any other review or spec-audit files in that directory. Re-reviews re-read only the single file currently being iterated.

### Discussion Channel vs. Evidence

Inherited from the base skill: per-finding `### Discussion` turns tagged `[Reviewer]` / `[Fixer]` / `[Human]` coordinate this skill with [addressing-adversarial-review](../addressing-adversarial-review/SKILL.md) across fix→re-review loops. `[Fixer]` turns are unverified assertions — verify fixes against the spec files themselves, not against the fixer's narrative.

# Pipeline

## 0. Output Mode: File Only

The spec audit is ALWAYS written to `.agents/@montflow/reviews/<name>/SPEC_<code>.md` (the `SPEC_` prefix distinguishes spec audits from code reviews). There is no in-place mode — the file is the shared artifact the reviewer and the fixer ([addressing-adversarial-review](../addressing-adversarial-review/SKILL.md)) coordinate through.

Determine the two path parameters:

1. **`<name>`**: Use the feature spec's directory name (the same `<name>` from `.agents/features/<name>/`). Reuse across iterations.
2. **`<code>`**: Check if `.agents/@montflow/reviews/<name>/` exists. If it does, this is a **re-audit** unless the user asks for a fresh one — list `*.md` filenames whose names start with `SPEC_` (directory entries only — reading file contents is forbidden), find the highest existing numeric portion, and reuse that same code to overwrite in place. If no `SPEC_<code>.md` exists yet, start at `SPEC_001` (or `SPEC_<highest+1>` if `SPEC_` files exist but the user wants a fresh audit). Code-review files (no `SPEC_` prefix) are skipped by this counter and must not be read.

Findings follow the per-finding structure from [adversarial-review Step 8](../adversarial-review/SKILL.md) (ID, Severity, Location, Problem, Impact, Suggestion, Status, Attempts, First Seen, `### Discussion`).

## 1. Map the Spec

Before auditing, understand the spec structure:

- Identify the phases, tasks, and their dependencies.
- Note the stated goals/requirements and how they map to tasks.
- Trace a requirement through to its tasks, gates, and completion criteria.

## 2. Adversarial Spec Audit

Assume the spec is incomplete or wrong and prove it. Audit the spec artifacts for:

- **Requirements/goal gaps**: requirements or goals that are vague, unmeasurable, or missing; success criteria that cannot be verified. Flag requirements with no corresponding task.
- **Task coverage**: tasks whose work is not traceable to a requirement/goal (scope creep); requirements not covered by any task.
- **GATES.md presence**: a `GATES.md` is optional per authoring-feature-spec, but a code-modifying `execution` task with no `GATES.md` *and* no other validation path (test harness, CI gate, manual checklist) is a Minor finding. Other tasks may legitimately omit `GATES.md`. The two bullets below reference this rule.
- **Missing gates on execution**: any `execution` task that declares a `GATES.md` but omits the project's standard format/lint/typecheck/test gates *where applicable* — e.g. `format:check`, `lint:check`, `ts:check`, `test` in TS monorepos; `ruff`, `mypy`, `pytest` in Python; `gofmt`, `golangci-lint`, `go test` in Go; `cargo fmt --check`, `cargo clippy`, `cargo test` in Rust. If the project has no established standard gates, note applicability explicitly rather than flagging silently.
- **Untested tasks**: `execution` tasks with no test plan or test gate — a risk; apply the GATES.md-presence rule above (missing `GATES.md` + no other validation path → Minor). Otherwise it is a risk finding, not a defect.
- **Dependency integrity**: `depends-on` / `related-tasks` referencing non-existent task IDs, cycles, or ordering that makes a phase unexecutable; tasks that depend on work in a later phase.
- **Type misuse**: `interruptor` tasks that don't actually require a hard user decision (false gates) — operational test: flag the interruptor if, assuming its default branch is taken, no later task fails and no requirement is violated (i.e. skipping the gate has no teardown consequence); `defect` tasks missing `originator: defect:<parent-task-id>`; `exploratory`/`planning` tasks that should have fact-verifying gates but don't.
- **Phase correctness**: phases that cannot be independently verified (no gates at end), or tasks within a phase that must run sequentially but are assumed parallel.
- **Completion criteria**: tasks whose completion checklist is empty or missing, so "done" is undefined.
- **Deviations/risk blind spots**: `MEMORY.md` missing an Open Questions or Deviations section where risks exist; undocumented assumptions that could break execution.
- **Cross-artifact contradictions**: requirements or goals stated in `FEATURE.md` that conflict with `TASK.md` completion criteria, `MEMORY.md` deviations, or `GATES.md` checks.
- **Scope/phasing**: missing phases (e.g., no migration, rollback, or observability phase) for a feature that needs them.

Emit these as findings in the per-finding structure from [adversarial-review Step 8](../adversarial-review/SKILL.md) — ID, Severity, Location, Problem, Impact, Suggestion, `Status: Open`, `Attempts: 0`, `First Seen`, and an empty `### Discussion` — with `Location` `file_path:line` pointing at the relevant `FEATURE.md`/`TASK.md`/`GATES.md` entries.

## 3. Report

Write the audit to `.agents/@montflow/reviews/<name>/SPEC_<code>.md` using the standard file structure from [adversarial-review Step 8](../adversarial-review/SKILL.md) (**Review Metadata** with `Review Type: Standalone | Re-review`, `Iteration`, `Isolation`, `Max Attempts: 3`; per-severity **Findings** with stable IDs and per-finding `### Discussion`; **Summary** counts). The global **Fixer Notes** section is gone — coordination lives per-finding. Include any spec-audit adaptations in Review Metadata (e.g. note `Target: feature spec`).

### Re-Audit (when iterating an existing `SPEC_<code>.md`)

A re-audit runs when the file already exists and the user (or an orchestrator) asks for another pass. Inherit the base skill's [Step 9 Re-Review](../adversarial-review/SKILL.md) mechanics verbatim, with one substitution: "code" becomes "spec files" — verify `In Review` findings against the spec artifacts (`FEATURE.md`/`TASK.md`/`MEMORY.md`/`GATES.md`), not against the `[Fixer]` Discussion turn. Never bump the file to a new `SPEC_<code>`; overwrite in place and increment `Iteration`.

# Reference

- **Spec audit checklist**: Step 2 above (MUST READ for each spec review).
- **Base skill**: [adversarial-review](../adversarial-review/SKILL.md) — reporting format, finding structure, severity levels
- **Spec authoring**: [authoring-feature-spec](../authoring-feature-spec/SKILL.md) — spec conventions and templates
- **Spec execution**: [executing-feature-spec](../executing-feature-spec/SKILL.md) — how review tasks are orchestrated
