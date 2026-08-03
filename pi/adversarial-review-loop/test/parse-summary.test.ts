/**
 * Regression test for finding F15 — `parseSummary` previously used a `\z`
 * regex anchor, which is a literal `z` in ECMAScript regex (not end-of-input
 * like in Ruby/Python). For the canonical review-file layout (Summary at
 * end-of-file with no `z` in the body), the old regex returned `null`, the
 * loop never detected "all terminal", and falsely ran to `maxLoops`.
 *
 * These tests pin the corrected end-of-section anchor
 * `(?=^##\s|$(?![\s\S]))` against the four layouts:
 *   1. Summary at EOF, no `z` in body (the canonical F15 case).
 *   2. Summary at EOF, body containing a `z` (must not truncate at the `z`).
 *   3. Summary followed by another `## ` heading (e.g. `## Reviewer Verdict`).
 *   4. No Summary block at all (returns none → loop keeps iterating).
 */

import { test, expect } from 'vitest';
import { Option } from 'effect';
import { parseSummaryText, isAllTerminal } from '../parse-summary';

const fixtureAllTerminalNoZ = `# Adversarial Review: x

## Review Metadata
- **Max Attempts**: 3

## Findings

### Critical

#### F1 — x
- **Status**: Resolved
- **Attempts**: 1

### Discussion
[Fixer] done

## Summary
- **Open**: 0
- **In Review**: 0
- **Resolved**: 1
- **Won't Fix**: 0
- **Escalated**: 0
`;

const fixtureAllTerminalWithZ = `# Adversarial Review: x

## Summary
- **Open**: 0
- **In Review**: 0
- **Resolved**: 2
- **Won't Fix**: 0
- **Escalated**: 0

Coverage areas: zombie paths, zero-state, zebra input.
`;

const fixtureSummaryThenVerdict = `# Adversarial Review: x

## Summary
- **Open**: 1
- **In Review**: 0
- **Resolved**: 13
- **Won't Fix**: 1
- **Escalated**: 0

## Reviewer Verdict
One new defect (F15) was introduced. Loop NOT closed; fixer owes a response.
`;

const fixtureNoSummary = `# Adversarial Review: x

## Findings

### Critical

#### F1 — x
- **Status**: Open
- **Attempts**: 0
`;

test('parseSummaryText: Summary at EOF with no z in body returns full counts (F15 canonical case)', () => {
  const summary = parseSummaryText(fixtureAllTerminalNoZ);
  expect(Option.isSome(summary)).toBe(true);
  if (Option.isNone(summary)) return;
  expect(summary.value.open).toBe(0);
  expect(summary.value.inReview).toBe(0);
  expect(summary.value.resolved).toBe(1);
  expect(summary.value.wontFix).toBe(0);
  expect(summary.value.escalated).toBe(0);
  expect(isAllTerminal(summary)).toBe(true);
});

test('parseSummaryText: body containing z is not truncated at the z (F15 secondary failure mode)', () => {
  const summary = parseSummaryText(fixtureAllTerminalWithZ);
  expect(Option.isSome(summary)).toBe(true);
  if (Option.isNone(summary)) return;
  expect(summary.value.open).toBe(0);
  expect(summary.value.inReview).toBe(0);
  expect(summary.value.resolved).toBe(2);
  expect(summary.value.wontFix).toBe(0);
  expect(summary.value.escalated).toBe(0);
  expect(isAllTerminal(summary)).toBe(true);
});

test('parseSummaryText: Summary followed by ## Reviewer Verdict stops at the next heading', () => {
  const summary = parseSummaryText(fixtureSummaryThenVerdict);
  expect(Option.isSome(summary)).toBe(true);
  if (Option.isNone(summary)) return;
  expect(summary.value.open).toBe(1);
  expect(summary.value.inReview).toBe(0);
  expect(summary.value.resolved).toBe(13);
  expect(summary.value.wontFix).toBe(1);
  expect(summary.value.escalated).toBe(0);
  expect(isAllTerminal(summary)).toBe(false);
});

test('parseSummaryText: missing Summary returns none → isAllTerminal false (defensive)', () => {
  const summary = parseSummaryText(fixtureNoSummary);
  expect(Option.isNone(summary)).toBe(true);
  expect(isAllTerminal(summary)).toBe(false);
});
