---
name: adversarial-review
description: Performs a hostile, bug-hunting code review that assumes the author made mistakes. Surfaces possible bugs, edge cases, security holes, missed refactors, missing tests, and documentation gaps, and writes the report to a file under `.agents/@montflow/reviews/`. Use when reviewing code, PRs, or diffs before merge. Pair with addressing-adversarial-review to resolve findings across fix→re-review loops.
id: 714e99f0430c9637
author: Daniel Montilla
version: 3.1.0
license: MIT
dependencies:
  - executing-skills
groups:
  - refactoring
  - testing
  - conventions
---

# When To Use

Use when reviewing code, a pull request, or a diff and the user wants more than a polite pass — they want a skeptical, adversarial review that *assumes something is wrong* and tries to prove it. Triggers include "review this PR", "check my code for bugs", "audit this diff", "what could go wrong here", or "be brutal about this change".

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Mindset

Adopt the stance of a hostile reviewer whose job is to find the defect the author missed. Do not assume the code is correct; assume it is subtly broken and prove otherwise. For every claim "this works", ask "when does it not?" Prefer concrete evidence (a code path, an input, a state) over vague concerns.

### Isolation Requirement

You MUST review in a **brand new context** — you may only know about the feature, the changes, and the goals. You must NEVER know about the thoughts, rationale, or context of the agent that originally implemented the code. Specifically:

- You may see: the diff/changed code, the requirements/goals, relevant tests, and any public documentation.
- You must NOT see: the original author's implementation notes, design commentary, commit messages explaining intent, internal discussion threads, or any other artifact that reveals what the author *thought* they were doing.

This prevents anchoring bias and ensures the review judges only what the code *actually does* against what it *should do*, not against what the author intended.

#### Enforcement: independent reviewer

Isolation is a *structural* property of the orchestration, not a self-attested checkbox. The review MUST be performed by a reviewer that did not author, edit, or execute the code under review:

- **Inside an orchestration pipeline** (any orchestrator that runs an end-of-phase review): the orchestrator MUST spawn an independent subagent for the review, distinct from any agent that authored or executed the phase.
- **Direct invocation by the user**: if the hosting environment supports subagents/sessions, run the review in a fresh subagent or session that has not seen the implementer's context. If the host has no such capability, the reviewer MUST discard the implementer's context from working memory before starting (state this explicitly before the review), and the user MUST be warned that structural isolation is unavailable for that run.

A reviewer that already saw the author's intent (e.g. from an earlier conversation turn) cannot self-certify forgetting it; treat such a run as non-isolated and mark it so in the report's Review Metadata.

> **File output restriction**: Reviews are ALWAYS written to `.agents/@montflow/reviews/<name>/<code>.md` (see Step 0). When picking the next numeric code you may list directory entries (`ls`, `glob`), but you must NOT read the *contents* of any other review files in that directory — only filenames. In a re-review (Step 9), the reviewer reads the *single* review file currently being iterated on, nothing else in the directory.

### Discussion Channel vs. Evidence

Each finding carries a `### Discussion` thread that the reviewer (this skill) and the fixer ([addressing-adversarial-review](../addressing-adversarial-review/SKILL.md)) use to coordinate across fix→re-review loops. This breaks strict isolation in a controlled way: the reviewer *sees* the fixer's `[Fixer]` claims in the thread, but must **never treat them as evidence**. The reviewer judges only what the code *does*, verified by reading the code, not by trusting the fixer's narrative.

- `[Fixer]` entries are **unverified assertions**. Ignore their framing of "why the fix works" — re-derive correctness from the code.
- `[Reviewer]` entries are the reviewer's own prior verdicts and may be trusted as context.
- A finding is `Resolved` only after the reviewer confirms the fix in the code, not after the fixer sets `Status: In Review`.

# Pipeline

## 0. Output Mode: File Only

The review is ALWAYS written to a file at `.agents/@montflow/reviews/<name>/<code>.md`. There is no in-place mode — the file is the shared artifact that lets the reviewer and the fixer ([addressing-adversarial-review](../addressing-adversarial-review/SKILL.md)) coordinate across fix→re-review loops via the per-finding `### Discussion` thread.

Before reviewing, determine the two path parameters:

1. **`<name>`**: A short identifier for the feature, project, or thing being reviewed (infer from the user's request or the target context). Reuse the same `<name>` across iterations of the same review so the file is overwritten/extended rather than scattered.
2. **`<code>`**: Check if `.agents/@montflow/reviews/<name>/` exists. If it does, this is a **re-review** of the most recent review file in that directory (see Step 9) — list `*.md` filenames (directory entries only — reading *other* review files' contents is forbidden by the isolation requirement), find the highest existing numeric portion of any filename ignoring non-numeric prefixes (e.g. ignores `SPEC_001.md`, sees `003.md` → numeric portion `003`), and reuse that same `<code>` to overwrite the file in place. If the directory does not exist or the user explicitly asks for a fresh review, start at the next unused code (`001` if the directory is new, else highest+1).

Create `.agents/@montflow/reviews/<name>/` if missing. Proceed through the pipeline; the file is written in Step 8.

## 1. Map the Change

Before judging, derive what changed and *why per the allowed inputs* (spec, requirements, public docs) — never from author intent:

- Identify the entry points, public surface, and callers affected.
- Note the intended behavior as stated in the spec/goals vs. what the code actually does.
- Trace the primary happy path end to end.

## 2. Hunt for Bugs (Correctness)

Look for defects that produce wrong results or crashes. Check:

- **Off-by-one / boundary** errors: empty collections, `n=0`, first/last element, `length-1`, exclusive vs inclusive ranges.
- **Null / undefined / nil** handling: optional fields, uninitialized vars, missing guards, `null` propagation through chains.
- **State mutation**: shared mutable state across calls, mutation of inputs, stale closures, race conditions in async/concurrent code.
- **Control flow**: unreachable branches, inverted conditions, missing `else`, fall-through in `switch`, early returns that skip cleanup.
- **Numeric**: integer overflow/underflow (signed underflow → UB distinct from unsigned wraparound), float precision, **float equality without epsilon**, division by zero, sign errors, mixing units.
- **Resource leaks**: unclosed handles, connections, streams, listeners, timers, un-cancelled subscriptions.
- **Concurrency**: races, deadlocks, lost updates, non-atomic read-modify-write, unguarded shared state, **memory ordering / visibility across threads** (missing fences, relaxed atomics, cross-thread publication without happens-before).
- **Error handling**: swallowed exceptions, bare `catch`, error masking, wrong error type rethrown, silent failures, missing rollback.
- **Time / timezone / locale**: DST, leap years, UTC vs local, date math, formatting assumptions.
- **Recursion / iteration**: stack overflow on deep input, missing termination, exponential blowup.

## 3. Hunt for Security Holes

- Injection (SQL, command, template, XSS, LDAP, path traversal).
- Missing authz/authentication checks; IDOR on object ownership.
- Untrusted input used in `eval`, deserialization, redirects, `innerHTML`, `dangerouslySetInnerHTML`.
- Secrets logged, hardcoded, or committed; insufficient redaction.
- **Log injection / log forging**: untrusted input written verbatim into log lines (CRLF injection, ANSI escape sequences, fake stack-trace lines).
- Missing rate limiting, brute-force exposure, weak validation.
- Unsafe dependencies; unpinned versions; known CVEs.
- TOCTOU (time-of-check-time-of-use) between validation and use.

## 4. Hunt for Edge Cases & Robustness

Assume adversarial inputs and hostile environments:

- Empty, null, huge, negative, NaN, `Infinity`, malformed, duplicate, or out-of-order inputs.
- Encoding/Unicode: surrogate pairs, combining chars, emoji, RTL, length vs code-point count, case folding, **normalization forms (NFC/NFD/NFKC/NFKD) and BOM handling**, grapheme-cluster vs code-unit counts.
- Network: timeouts, retries, partial responses, reordered packets, duplicate delivery.
- Disk full, permission denied, file locked, missing file.
- Backwards/forwards compatibility of schema, API, or data format changes.
- Behavior at scale: N+1 queries, O(n²) on large inputs, unbounded growth of caches/maps/arrays.

## 5. Judge the Design & Missed Opportunities

Find where better code was possible:

- **Duplication**: repeated logic that should be a shared helper (consider [detecting-duplication](../detecting-duplication/SKILL.md)).
- **Over-engineering**: premature abstraction, unneeded generics, layers that add no value, speculative config.
- **Under-engineering**: missing validation, weak typing, magic numbers/strings, implicit assumptions.
- **SOLID violations**: see [applying-solid](../applying-solid/SKILL.md) for the checklist.
- **Naming & clarity**: misleading names, comments that lie, dead code, commented-out blocks.
- **API ergonomics**: surprising signatures, inconsistent conventions, footguns in the public surface.
- **Performance**: wasteful recomputation, redundant I/O, missing memoization, unnecessary copying.

## 6. Assess Test Coverage

- Which branches, error paths, and edge cases have **no** test?
- Do tests assert real behavior or just restate the implementation (see [unit-testing](../unit-testing/SKILL.md))?
- Are boundary values (empty, max, null) exercised?
- Are failure modes (timeout, thrown error, bad input) covered?
- Is there flakiness: dependence on time, order, randomness, global state?
- Missing property-based, fuzz, or integration tests where they would catch real bugs.

## 7. Assess Documentation & Operability

- Misleading, missing, or stale docstrings/README/comments (see [writting-jsdoc](../writting-jsdoc/SKILL.md)).
- Public API undocumented or documented incorrectly.
- No changelog entry, migration note, or deprecation warning for breaking changes.
- Missing observability: no logging, metrics, or tracing on failure paths.
- No runbook/alert for production impact; unclear rollback path.

## 8. Report

Produce a prioritized, evidence-backed review. Each finding has a **stable ID** (`F1`, `F2`, … assigned in severity-bucket order, never reused across iterations) plus the standard fields below, and lives under its severity bucket (`### Critical` / `### Major` / `### Minor` / `### Nit`):

- **Severity**: Critical / Major / Minor / Nit.
- **Location**: `file_path:line` for each finding.
- **Problem**: concrete, with the trigger (input/state/path) that breaks it.
- **Impact**: what goes wrong for the user or system.
- **Suggestion**: a specific, minimal fix.
- **Status**: `Open` (initial) — see the status table below for the full lifecycle.
- **Attempts**: `0` (incremented only by the fixer; the reviewer never touches it).
- **First Seen**: the iteration number this finding was first reported in.
- **### Discussion**: an initially-empty threaded log of `[Reviewer]` / `[Fixer]` turns (see §"Discussion Channel vs. Evidence").

**Status lifecycle** (transitions written by the role noted in brackets):

| Status | Meaning | Set by |
|---|---|---|
| `Open` | Newly filed or rejected by reviewer; fixer owes a response | reviewer (initial or on reject) |
| `In Review` | Fixer submitted a fix; awaiting reviewer verification | fixer |
| `Resolved` | Reviewer confirmed the fix in the code | reviewer |
| `Won't Fix` | Dismissed (with rationale in Discussion); terminal unless reopened | fixer or user |
| `Escalated` | Hit the attempt ceiling (`Max Attempts`); needs a human | fixer |

Lead with the highest-severity, highest-likelihood bugs. Distinguish confirmed defects (show the failing path) from risks ("untested, could break if…"). Keep nitpicks short and grouped at the end. Do not pad with praise; be direct.

**No findings**: If the review finds nothing actionable, do not pad the report. Explicitly state `No defects found.` and list the coverage areas re-checked (e.g. "Re-verified: off-by-one in `parseRange`, null guards on `fetchUser`, race on `cache.set`, encoding edge cases on filename input"). The coverage list evidences that the search was performed — an empty list otherwise reads as a shallow review, which is itself a defect of the review.

### Standard File Structure

```markdown
# Adversarial Review: <target>

## Review Metadata
- **Target**: <what was reviewed — file, module, PR, feature>
- **Review Type**: Standalone | Re-review
- **Review File**: .agents/@montflow/reviews/<name>/<code>.md
- **Iteration**: <N>                 # 1 = initial; increments on each re-review overwrite
- **Isolation**: Isolated | Non-isolated (<reason>)
- **Max Attempts**: 3                # ceiling; fixer escalates when Attempts >= Max Attempts

## Findings

### Critical

#### F1 — <short title>
- **Severity**: Critical
- **Location**: `file_path:line`
- **Problem**: <concrete trigger + what breaks>
- **Impact**: <user/system consequence>
- **Suggestion**: <minimal fix>
- **Status**: Open
- **Attempts**: 0
- **First Seen**: <iteration N>

### Discussion
<!-- Threaded log. Each turn prefixed with the role tag. -->
<!-- [Reviewer] <turn 1> ... -->
<!-- [Fixer] <turn 1> ... -->

### Major
...

### Minor
...

### Nit
...

## Summary
- **Open**: <count>
- **In Review**: <count>
- **Resolved**: <count>
- **Won't Fix**: <count>
- **Escalated**: <count>
```

### Write the File

1. Write the review to `.agents/@montflow/reviews/<name>/<code>.md` using the structure above. Overwrite the same file on re-review (Step 9) — do not create a new code unless the user asks for a fresh review.
2. The per-finding `### Discussion` block starts empty on a standalone review. It is appended to — never rewritten — across iterations.
3. Isolation: do NOT read the *contents* of other review files in `.agents/@montflow/reviews/<name>/`. Only the file currently being iterated on may be read, and only during a re-review (Step 9).

## 9. Re-Review (when iterating an existing review file)

A re-review runs when `.agents/@montflow/reviews/<name>/<code>.md` already exists and the user (or the orchestrator) asks for another pass. The reviewer **does not start over** — it iterates the existing file in place.

1. **Read only the current review file.** Do not read sibling review files. This is the one controlled exception to the file-output isolation restriction.
2. **Scope the re-review to non-terminal findings.** Terminal statuses are `Resolved` and `Won't Fix` (unless the user explicitly asks to reopen). Re-evaluate findings in `Open`, `In Review`, and `Escalated`:
   - For each `In Review` finding: read the actual code at the cited `Location` and verify the fix **from the code, not from the `[Fixer]` Discussion entry**. If the defect is gone, set `Status: Resolved` and append a short `[Reviewer]` turn confirming it. If the defect persists or a new defect was introduced, set `Status: Open` and append a `[Reviewer]` turn showing the still-failing path.
   - For each `Open` finding: re-confirm the defect still exists in the current code. If the fixer claims it is fixed but didn't set `In Review`, treat it as `In Review` and verify. If the code was never touched, leave `Open` and append a `[Reviewer]` turn noting "still present" (no need to repeat full detail).
   - For each `Escalated` finding: do NOT re-review unless the user/human has resolved the escalation (a `[Human]` turn in the Discussion or explicit user instruction). Re-reviewing an escalated finding without human input is forbidden — the ceiling was hit for a reason.
3. **Hunt for NEW issues.** Run Steps 2–7 against the latest code (the fixer's changes may have introduced regressions). Any new finding is appended with the next free `F<n>` ID, `Status: Open`, `Attempts: 0`, `First Seen: <current iteration>`, under the appropriate severity bucket.
4. **Bump iteration.** Increment `Iteration` in Review Metadata. Update the `## Summary` counts.
5. **Overwrite the file in place.** Preserve all `### Discussion` turns verbatim; only append new `[Reviewer]` turns. Never edit or delete prior `[Fixer]` or `[Reviewer]` turns — the thread is append-only.
6. **Never touch `Attempts`.** The reviewer does not increment, reset, or otherwise modify the counter; that is the fixer's responsibility ([addressing-adversarial-review](../addressing-adversarial-review/SKILL.md)).

> A re-review that finds nothing new and confirms all `In Review` findings as `Resolved` should append a final `[Reviewer]` turn at the file level (in `## Review Metadata` or a new `## Reviewer Verdict` line) stating "All findings resolved; review closed." and leave the file as the terminal record.

# Reference

- **Bug-hunting checklist**: Steps 2–7 above (MUST READ for each review).
- **Duplication**: [detecting-duplication](../detecting-duplication/SKILL.md) — for repeated logic findings
- **SOLID**: [applying-solid](../applying-solid/SKILL.md) — for design-violation findings
- **Testing quality**: [unit-testing](../unit-testing/SKILL.md) — for test-coverage findings
- **Docs**: [writting-jsdoc](../writting-jsdoc/SKILL.md) — for documentation findings
