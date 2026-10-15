---
name: montflow-adversarial-review
description: Performs a hostile, bug-hunting code review that assumes the author made mistakes. Surfaces possible bugs, edge cases, security holes, missed refactors, missing tests, and documentation gaps, and writes each round to a review series under `.agents/@montflow/reviews/<name>/<NNN>/REVIEW.md`. Use when reviewing code, PRs, or diffs before merge. Pair with montflow-addressing-adversarial-review to resolve findings across fix→re-review loops.
id: 714e99f0430c9637
author: Daniel Montilla
version: 5.1.0
license: MIT
dependencies:
  - executing-skills
groups:
  - refactoring
  - testing
  - conventions
---

# When To Use

Use when reviewing code, a pull request, or a diff and the user wants more than a polite pass — they want a skeptical, adversarial review that _assumes something is wrong_ and tries to prove it. Triggers include "review this PR", "check my code for bugs", "audit this diff", "what could go wrong here", or "be brutal about this change".

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Mindset

Adopt the stance of a hostile reviewer whose job is to find the defect the author missed. Do not assume the code is correct; assume it is subtly broken and prove otherwise. For every claim "this works", ask "when does it not?" Prefer concrete evidence (a code path, an input, a state) over vague concerns.

### Isolation Requirement

You MUST review in a **brand new context** — you may only know about the feature, the changes, and the goals. You must NEVER know about the thoughts, rationale, or context of the agent that originally implemented the code. Specifically:

- You may see: the diff/changed code, the feature specification, requirements/goals, relevant tests, and any public documentation.
- You must NOT see: the original author's implementation notes, design commentary, commit messages explaining intent, internal discussion threads, or any other artifact that reveals what the author _thought_ they were doing.

This prevents anchoring bias and ensures the review judges only what the code _actually does_ against what it _should do_, not against what the author intended.

#### Enforcement: independent reviewer

Isolation is a _structural_ property of the orchestration, not a self-attested checkbox. The review MUST be performed by a reviewer that did not author, edit, or execute the code under review:

- **Inside an orchestration pipeline** (any orchestrator that runs an end-of-phase review): the orchestrator MUST spawn an independent subagent for the review, distinct from any agent that authored or executed the phase. The principle applies to any orchestrator.
- **Direct invocation by the user**: if the hosting environment supports subagents/sessions, run the review in a fresh subagent or session that has not seen the implementer's context. If the host has no such capability, the reviewer MUST discard the implementer's context from working memory before starting (state this explicitly before the review), and the user MUST be warned that structural isolation is unavailable for that session.

A reviewer that already saw the author's intent (e.g. from an earlier conversation turn) cannot self-certify forgetting it; treat such a session as non-isolated and mark it so in the report's Review Metadata.

> **File output restriction**: Every round is ALWAYS written to `.agents/@montflow/reviews/<name>/<NNN>/REVIEW.md` (see Step 0). When picking the next round number you may list directory entries (`ls`, `glob`), but you must NOT read the _contents_ of any round other than the one being iterated on (see Step 9). The series ledger `.agents/@montflow/reviews/<name>/REVIEW.md` is the one file you read and rewrite to index the rounds — never to gather findings.

### Discussion Channel vs. Evidence

Each finding carries a `### Discussion` thread that the reviewer (this skill) and the fixer ([montflow-addressing-adversarial-review](../montflow-addressing-adversarial-review/SKILL.md)) use to coordinate across fix→re-review loops. This breaks strict isolation in a controlled way: the reviewer _sees_ the fixer's `[Fixer]` claims in the thread, but must **never treat them as evidence**. The reviewer judges only what the code _does_, verified by reading the code, not by trusting the fixer's narrative.

- `[Fixer]` entries are **unverified assertions**. Ignore their framing of "why the fix works" — re-derive correctness from the code.
- `[Reviewer]` entries are the reviewer's own prior verdicts and may be trusted as context.
- A finding is `Resolved` only after the reviewer confirms the fix in the code, not after the fixer sets `Status: In Review`.

# Pipeline

## 0. Output Mode: File Only

A review lives in a **series** at `.agents/@montflow/reviews/<name>/`:

- `REVIEW.md` — the series ledger: target, status, round count, and two tables (per-round counts, and a one-row-per-finding index).
- `001/REVIEW.md`, `002/REVIEW.md`, … — one directory per review pass, each holding that pass's findings.

There is no in-place review mode — the round file is the shared artifact that lets the reviewer and the fixer ([montflow-addressing-adversarial-review](../montflow-addressing-adversarial-review/SKILL.md)) coordinate via the per-finding `#### Discussion` thread.

Start the series through the CLI: `mf-reviews create <name>` for a fresh review, or `mf-reviews resume <name>` to continue an existing one.

When an orchestrator dispatches this review (e.g. closing a spec phase), its context names the series and, when the review is bound to a spec phase, also the round, the phase, and the reviewer profile (`- Series:`, `- Round:`, `- Phase:`, `- Profile:`). A spec phase may be backed by **more than one series**, one per declared reviewer profile — the spec's own series (the general reviewer) plus one `<spec>-<profile>` series per profile. Each is a separate reviewer session writing its own series; this skill's job is identical in every one.

- **An explicit round is authoritative.** When the dispatch names `- Round: <NNN>`, write that exact round in that series — do not compute "highest existing + 1". If the series already holds an _empty_ scaffold at that round, populate it in place; never create a higher round instead, and never overwrite a round that already holds findings.
- **With no explicit round**, compute it as described below.
- **When the dispatch names `- Phase: <phase>`** (a spec-phase review), record it as `- Phase:` in the round's `## Metadata`.

Before reviewing, determine the two path parameters (directory entries only — reading _another_ round's contents is forbidden by the isolation requirement):

1. **`<name>`**: A short identifier for the feature, project, or thing being reviewed (infer from the user's request or the target context). Reuse the same `<name>` across passes so the series stays together.
2. **`<NNN>`**: The round number. When the dispatch names an explicit round it is authoritative (above). Otherwise: if `.agents/@montflow/reviews/<name>/` does not exist, this is a **fresh review** and the round is `001`; if it exists, this is a **re-review**: list the existing round directory names (`001`, `002`, …), and the new round is the highest existing number + 1.

The reviewer always writes a **new round** and never edits an existing one, _except_ to populate an explicitly named empty scaffold in place; the fixer edits the latest round in place. Create `.agents/@montflow/reviews/<name>/` if missing. Proceed through the pipeline; the round file and the ledger are written in Step 8.

## 1. Map the Change

Before judging, derive what changed and _why per the allowed inputs_ (spec, requirements, public docs) — never from author intent:

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
- Do tests assert real behavior or just restate the implementation (see [montflow-typescript-testing](../montflow-typescript-testing/SKILL.md))?
- Are boundary values (empty, max, null) exercised?
- Are failure modes (timeout, thrown error, bad input) covered?
- Is there flakiness: dependence on time, order, randomness, global state?
- Missing property-based, fuzz, or integration tests where they would catch real bugs.

## 7. Assess Documentation & Operability

- Misleading, missing, or stale docstrings/README/comments (see [writing-jsdoc](../writing-jsdoc/SKILL.md)).
- Public API undocumented or documented incorrectly.
- No changelog entry, migration note, or deprecation warning for breaking changes.
- Missing observability: no logging, metrics, or tracing on failure paths.
- No runbook/alert for production impact; unclear rollback path.

## 8. Report

Produce a prioritized, evidence-backed review. Each finding has a **stable ID** (`F<n>`, never reused across rounds) and the standard fields below, and is headed `### F<n> — <short title>`. Order the findings by severity (Critical → Nit) so the report leads with what matters.

- **Severity**: Critical / Major / Minor / Nit.
- **Location**: `file_path:line` for each finding.
- **Problem**: concrete, with the trigger (input/state/path) that breaks it.
- **Impact**: what goes wrong for the user or system.
- **Suggestion**: a specific, minimal fix.
- **Status**: `Open` (initial) — see the status table below for the full lifecycle.
- **Attempts**: `0` (incremented only by the fixer; the reviewer never touches it).
- **First Seen**: the round number this finding was first reported in.
- **`#### Discussion`**: an initially-empty threaded log of `[Reviewer]` / `[Fixer]` / `[Human]` turns (see §"Discussion Channel vs. Evidence").

**Status lifecycle** (transitions written by the role noted in brackets):

| Status      | Meaning                                                            | Set by                          |
| ----------- | ------------------------------------------------------------------ | ------------------------------- |
| `Open`      | Newly filed or rejected by reviewer; fixer owes a response         | reviewer (initial or on reject) |
| `In Review` | Fixer submitted a fix; awaiting reviewer verification              | fixer                           |
| `Resolved`  | Reviewer confirmed the fix in the code                             | reviewer                        |
| `Won't Fix` | Dismissed (with rationale in Discussion); terminal unless reopened | fixer or user                   |
| `Escalated` | Hit the attempt ceiling (`Max Attempts`); needs a human            | fixer                           |

Lead with the highest-severity, highest-likelihood bugs. Distinguish confirmed defects (show the failing path) from risks ("untested, could break if…"). Keep nitpicks short and at the end. Do not pad with praise; be direct.

**No findings**: If the review finds nothing actionable, do not pad the report. Put a single line in the `## Findings` section — `No defects found.` plus the coverage areas re-checked (e.g. "Re-verified: off-by-one in `parseRange`, null guards on `fetchUser`, race on `cache.set`, encoding edge cases on filename input"). The coverage list evidences that the search was performed; the section must not be left empty, because an empty section reads as a shallow review — itself a defect of the review.

### Standard File Structure

Round file (`<name>/<NNN>/REVIEW.md`):

```markdown
# Review: <name> / <NNN>

## Metadata

- Target: <what was reviewed — file, module, PR, feature>
- Round: <NNN>
- Phase: <phase id> # optional; the spec phase this round reviews
- Type: standalone | re-review
- Isolation: isolated | non-isolated (<reason>)
- Max Attempts: 3
- Status: open | closed
- Created: <YYYY-MM-DD>

## Findings

### F1 — <short title>

- Severity: Critical
- Location: `file_path:line`
- Status: Open
- Attempts: 0
- First Seen: <round NNN>
- Problem: <concrete trigger + what breaks>
- Impact: <user/system consequence>
- Suggestion: <minimal fix>

#### Discussion

<!-- Append-only. Each turn prefixed with its role tag. -->
<!-- [Reviewer] <turn 1> ... -->
<!-- [Fixer] <turn 1> ... -->

## Summary

- Critical: 1
- Major: 0
- Minor: 0
- Nit: 0
- Open: 1
- In Review: 0
- Resolved: 0
- Won't Fix: 0
- Escalated: 0
```

Series ledger (`<name>/REVIEW.md`) — regenerate its tables from every round on each pass:

```markdown
# Review Series: <name>

## Metadata

- Target: <what is under review>
- Status: open | closed
- Rounds: <count>
- Profile: <profile name> # optional; verified against the pi-profiles extension when set
- Created: <YYYY-MM-DD>

## Rounds

| Round | Status | Open | In Review | Resolved | Won't Fix | Escalated |
| ----- | ------ | ---- | --------- | -------- | --------- | --------- |
| 001   | open   | 1    | 0         | 0        | 0         | 0         |

## Findings

| Round | ID  | Severity | Status | Title         |
| ----- | --- | -------- | ------ | ------------- |
| 001   | F1  | Critical | Open   | <short title> |
```

### Write the Files

1. Write the round to `.agents/@montflow/reviews/<name>/<NNN>/REVIEW.md` using the structure above — a **new** round directory on every pass; never overwrite a prior round. When the dispatch named an explicit round, write that round, populating an existing empty scaffold in place. Record `- Phase: <phase id>` in `## Metadata` when the round reviews a spec phase.
2. Write or update the series ledger `.agents/@montflow/reviews/<name>/REVIEW.md`: its `Rounds` table and `Findings` index must reflect every round, and `Metadata.Rounds` must equal the number of round directories.
3. The per-finding `#### Discussion` block starts empty on a standalone review. It is appended to — never rewritten — across passes.
4. Isolation: do NOT read the _contents_ of any round other than the one being iterated (Step 9). Never read a sibling round's findings.

## 9. Re-Review (when the series already has rounds)

A re-review runs when `.agents/@montflow/reviews/<name>/` already has one or more round directories and the user (or the orchestrator) asks for another pass. The reviewer **does not start over and never edits a prior round** — it reads the latest round and writes the next one.

1. **Read the latest round only.** Read `.agents/@montflow/reviews/<name>/<latest>/REVIEW.md` plus the series ledger `<name>/REVIEW.md`. Do not read any older round's contents; the latest round already carries every non-terminal finding forward.
2. **Carry forward non-terminal findings.** Copy each finding whose `Status` is not terminal into the new round, preserving its `ID`, `Severity`, `Location`, `Problem`, `Impact`, `Suggestion`, `First Seen`, `Attempts`, and every `#### Discussion` turn verbatim. Terminal statuses are `Resolved` and `Won't Fix` (unless the user explicitly asks to reopen) — drop those; they remain recorded in the prior round.
3. **Re-evaluate the carried findings.**
   - For each `In Review` finding: read the actual code at the cited `Location` and verify the fix **from the code, not from the `[Fixer]` Discussion entry**. If the defect is gone, set `Status: Resolved` and append a short `[Reviewer]` turn confirming it. If it persists or a new defect was introduced, set `Status: Open` and append a `[Reviewer]` turn showing the still-failing path.
   - For each `Open` finding: re-confirm the defect still exists. If the fixer claims a fix but left `Open`, treat it as `In Review` and verify. If the code was never touched, leave `Open` and append a `[Reviewer]` turn noting "still present".
   - For each `Escalated` finding: do NOT re-review unless a `[Human]` turn or explicit user instruction resolved the escalation.
4. **Hunt for NEW issues.** Run Steps 2–7 against the latest code (the fixer's changes may have introduced regressions). Any new finding gets the next free `F<n>` (globally, across all rounds), `Status: Open`, `Attempts: 0`, and `First Seen: <new round NNN>`.
5. **Write the new round** with `Type: re-review` and a `## Summary` that tallies the new round's findings.
6. **Update the series ledger.** Rebuild the `Rounds` table (one row per round, counts from that round's file) and the `Findings` index (one row per finding across every round), and set `Metadata.Rounds`.
7. **Never touch `Attempts`.** The reviewer does not increment, reset, or otherwise modify the counter; that is the fixer's responsibility ([montflow-addressing-adversarial-review](../montflow-addressing-adversarial-review/SKILL.md)).

> A re-review that confirms every `In Review` finding as `Resolved` and adds nothing new may set the round's `Status: closed` and the ledger's `Status: closed`, stating "All findings resolved; review closed." in the round's `## Findings` section.

# Reference

- **Bug-hunting checklist**: Steps 2–7 above (MUST READ for each review).
- **Duplication**: [detecting-duplication](../detecting-duplication/SKILL.md) — for repeated logic findings
- **SOLID**: [applying-solid](../applying-solid/SKILL.md) — for design-violation findings
- **Testing quality**: [montflow-typescript-testing](../montflow-typescript-testing/SKILL.md) — for test-coverage findings
- **Docs**: [writing-jsdoc](../writing-jsdoc/SKILL.md) — for documentation findings
