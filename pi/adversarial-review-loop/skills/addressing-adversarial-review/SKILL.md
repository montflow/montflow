---
name: addressing-adversarial-review
description: Resolves findings in an adversarial-review report file by applying fixes, incrementing a per-finding attempt counter, and appending to the shared Discussion thread — coordinating with the reviewer across fix→re-review loops. Use after adversarial-review has written a review file at `.agents/reviews/<name>/<code>.md` and the user wants to address its findings.
id: ad1f945c1a0624a3
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - executing-skills
  - adversarial-review
groups:
  - refactoring
  - conventions
  - workflow
---

# When To Use

Use after [adversarial-review](../adversarial-review/SKILL.md) has produced a review file at `.agents/reviews/<name>/<code>.md` and the user wants to address its findings — "fix the review", "address these findings", "resolve the review", "work through the adversarial report". This skill is the **fixer** half of the review loop; the review file is the shared artifact both roles communicate through.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# The Fixer↔Reviewer Contract

The review file (`.agents/reviews/<name>/<code>.md`) is the single source of truth. Both roles read and write it; neither relies on conversation memory across loops. Each finding carries:

- A stable **ID** (`F1`, `F2`, …) that never changes across iterations.
- A **Status** (`Open` → `In Review` → `Resolved` / `Won't Fix` / `Escalated`).
- An **Attempts** counter, written **only by the fixer**, never reset, never decremented.
- An append-only **### Discussion** thread tagged `[Reviewer]` / `[Fixer]` / `[Human]`.

**Role boundaries** (hard rules):

| Field | Reviewer | Fixer |
|---|---|---|
| `Attempts` | NEVER touch | increments by 1 per attempt |
| `Status` | sets `Open` (initial/reject) or `Resolved` (verify) | sets `In Review`, `Won't Fix`, `Escalated` |
| `### Discussion` `[Reviewer]` turns | appends only | NEVER edit or delete |
| `### Discussion` `[Fixer]` / `[Human]` turns | NEVER edit or delete | appends only |
| `Iteration` (Review Metadata) | increments on re-review | NEVER touch |
| Severity / Location / Problem / Impact / Suggestion | writes initially | NEVER edit (file a new finding conversation if the fixer thinks the description is wrong) |

The fixer NEVER rewrites reviewer-authored content. If the fixer disagrees with a finding's framing, it says so in a `[Fixer]` Discussion turn or sets `Won't Fix` with rationale — it does not edit the finding's Problem/Impact/Suggestion fields.

# Pipeline

## 1. Locate & Parse the Review File

1. Resolve the target. If the user named a review (`<name>` or a path), use it. If unspecified, ask. The expected location is `.agents/reviews/<name>/<code>.md`.
2. Read the file in full. Parse Review Metadata (`Max Attempts`, `Iteration`) and every finding (`ID`, `Severity`, `Location`, `Status`, `Attempts`, and the `### Discussion` thread).
3. Establish **Max Attempts**: read `Max Attempts` from Review Metadata; default to **3** if missing or unparseable, and add the field to Review Metadata so subsequent runs see it.
4. **Format validation gate**: every finding must have an `ID`, a `Status`, an `Attempts` integer, and a `### Discussion` heading. If a finding predates the v3 format (no ID/Attempts/Discussion), normalize it in place before proceeding: assign the next free `F<n>`, set `Attempts: 0`, `Status: Open` (unless clearly resolved), and add an empty `### Discussion` block. Log the normalization in a top `[Fixer]` turn under `## Review Metadata` (not per-finding) so the reviewer sees what was changed.

## 2. Triage Findings

Classify each finding and decide the action:

| Current Status | Action |
|---|---|
| `Open` | Eligible to fix, mark `Won't Fix`, or escalate (if already at ceiling) |
| `In Review` | Reviewer hasn't ruled yet — leave as-is unless the user explicitly wants another pass; do NOT re-fix a pending finding without a reviewer turn or user instruction (would waste an attempt) |
| `Resolved` | Skip entirely (terminal) |
| `Won't Fix` | Skip — terminal unless the reviewer appended a `[Reviewer]` turn reopening it (flipping Status back to `Open`); only then re-engage |
| `Escalated` | Skip — do NOT re-attempt. If the user has now resolved the escalation, append a `[Human]` turn describing the decision, set `Status: In Review`, and **do not** increment Attempts (the human action is not a fixer attempt) |

For every finding you will act on, choose one of three strategies:

- **Fix** — apply a minimal code change addressing the defect (use the `Suggestion` as a starting point; the `Problem`/`Impact` are the source of truth for correctness).
- **Won't Fix** — the defect is invalid, intended behavior, out of scope, or an accepted trade-off. Set `Won't Fix` and append a `[Fixer]` rationale turn. `Won't Fix` does NOT consume an attempt.
- **Escalate** — see Step 4.

## 3. Apply Fixes

For each finding the fixer will **Fix**, in severity order (Critical → Nit):

1. **Ceiling check**: if `Attempts >= Max Attempts`, do NOT attempt. Go to Step 4 (Escalate) for this finding and continue with the next.
2. **Implement the minimal fix** at the cited `Location` (or wherever the root cause actually is). Follow repo conventions; reuse existing helpers; do not over-engineer.
3. **Increment `Attempts` by 1** — this is the only write to the counter, regardless of whether local verification passes. A failed attempt still consumes budget (this is what converges to escalation, not infinite loops).
4. **Verify locally** using the repo's real checks — typecheck, lint, and the relevant test suite (run the actual commands; do not assume). Then:
   - **Verification passes**: set `Status: In Review` (awaiting reviewer confirmation).
   - **Verification fails**: leave `Status: Open` (still broken) so the reviewer is not asked to verify something you couldn't even make compile/pass.
5. **Append a `[Fixer]` turn** to the finding's `### Discussion`. The turn MUST include:
   - What changed: `file_path:line` of the edit(s).
   - Why it addresses the `Problem` (cite the trigger the original finding named).
   - Verification result: which command(s) ran and their pass/fail state.
   - Any assumption or deliberate deviation from the `Suggestion`.

   Keep it concise and verifiable — the reviewer will re-derive correctness from the code, not from this turn (see adversarial-review's "Discussion Channel vs. Evidence"). Do not editorialize or argue the finding; just document the change.

## 4. Escalate at the Ceiling

When `Attempts >= Max Attempts` for a finding that is still `Open` (i.e. the fixer has already burned its budget and the defect remains):

1. Set `Status: Escalated`.
2. Append a `[Fixer]` turn explaining the impasse: what was tried across the prior turns, where the fix keeps failing, and what specifically needs human judgment (a design decision, an ambiguous requirement, a missing test oracle, a polyfill tradeoff, etc.).
3. **Do NOT increment `Attempts` further** — it is already at the ceiling.
4. Surface the escalation to the user immediately (do not silently continue past it). The user may resolve it (Step 2 `[Human]` turn → `In Review`) or grant `Won't Fix`.

## 5. Write the Review File

Overwrite `.agents/reviews/<name>/<code>.md` in place:

- Preserve every prior turn in every `### Discussion` thread verbatim — append-only.
- Update only: `Attempts` (per attempt), `Status` (per transition you own), the `### Discussion` threads (append `[Fixer]` / `[Human]` turns), and `## Summary` counts.
- Do NOT modify `Iteration`, `Severity`, `Location`, `Problem`, `Impact`, `Suggestion`, any `[Reviewer]` turn, or any other review-authored field. Do NOT bump `Iteration` — that is the reviewer's marker for a re-review pass; fixer runs are not re-reviews.
- If you normalized legacy findings in Step 1, ensure the top-level `[Fixer]` normalization note under `## Review Metadata` is preserved.

Update `## Summary` to reflect current counts of `Open` / `In Review` / `Resolved` / `Won't Fix` / `Escalated`.

## 6. Report to the User

Give a short summary, then stop:

- **Fixed** (`In Review`): list IDs.
- **Won't Fix**: list IDs with the one-line reason.
- **Escalated**: list IDs with the impasse summary.
- **Still Open** (not acted on this run — e.g. budget left but no decision yet, or pending reviewer): list IDs.
- **Verification failures**: call out any finding where local checks failed so the user can decide.

End with the single recommended next step: **re-run `adversarial-review` against the same `<name>` so the reviewer verifies the `In Review` findings and either `Resolves` them or reopens with a `[Reviewer]` turn.** Do not automatically invoke the reviewer; the user initiates that loop.

# Reference

- **Reviewer side**: [adversarial-review](../adversarial-review/SKILL.md) — the producer/re-reviewer of the file format this skill consumes.
- **Skill execution**: [executing-skills](../executing-skills/SKILL.md) (MUST READ before running this pipeline).

# Gates

See [GATES.md](GATES.md).