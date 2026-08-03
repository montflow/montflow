---
name: adversarial-review-reconcile
description: Merges conflicting multi-reviewer scratch reports into one canonical adversarial-review file. Use only when the orchestrator detects overlaps/contradictions after programmatic merge.
author: Daniel Montilla
version: 1.0.0
license: MIT
groups:
  - refactoring
  - conventions
---

# When To Use

Invoked by the adversarial-review-loop orchestrator when hybrid reconcile mode finds conflicts after a programmatic merge of specialist reviewer scratch reports. Do not use for ordinary single-reviewer loops.

# Mindset

You are a **reconciliator**, not a new reviewer. Prefer the existing findings; dedupe and rank; preserve provenance. Do not expand scope with unrelated hunts unless a conflict leaves a hole that must be clarified in one sentence.

# Pipeline

## 1. Read Inputs

The task names:

1. The **canonical review file** path (overwrite this).
2. Optionally, scratch paths and a conflict summary.

Read the provisional canonical file first. It already contains a programmatic merge — your job is to resolve the conflicted findings cleanly.

## 2. Resolve Conflicts

For each conflict cluster:

- Keep one finding when problems are the same; union `Source` ids.
- Prefer higher severity when merging duplicates.
- When suggestions contradict, keep the safer/correctness-preserving suggestion and note the discarded alternative in `### Discussion` as an `[Orchestrator]` turn.
- Remap ids to contiguous `F1…Fn` in severity order.
- Preserve `Resolved` / `Won't Fix` / `Escalated` findings unless the conflict is about them.

## 3. Write Canonical File

Overwrite the canonical path using the adversarial-review **Standard File Structure**:

- Review Metadata (bump Iteration if already present)
- Findings grouped by severity
- Per-finding Status / Attempts / First Seen / Discussion
- `## Summary` counts that match the findings

Do **not** emit a global `STATUS:` line. Do **not** decide whether the loop continues.
