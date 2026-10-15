---
id: A001
name: explore-review-pipeline
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A001: Map how a spec review task becomes a round

## Type: exploratory

## Description

Map the full path from a spec phase's `review` task to a written review round,
so the change points for multi-reviewer support are known exactly. Record every
place the one-reviewer / one-series assumption is encoded.

## Requirements

- Trace the review link: how `review-link.module.ts` derives the series name from the spec name and the round from the phase rank, and where `verifySpecTree` invokes it.
- Trace the execution flow: how the `review` task in `executing-spec.ts` becomes a spawned reviewer session, and what data crosses into that session.
- Trace the pi-reviews side: `startReview` inputs, `ensureSeries`, the series ledger shape (`SERIES_META_FIELDS`), and the round/finding id space.
- Identify every place the single-series / single-profile assumption would break under two reviewers: round file path, `F<n>` uniqueness, ledger `Profile:`, and the verifier's `reviewPhases` de-dupe.
- Record, for each change point, the file path and the exact function or field.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] End-to-end review path and every one-reviewer assumption captured in MEMORY.md
- [ ] Change-point list with file paths and symbols recorded
