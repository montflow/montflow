import { test, expect } from 'vitest';
import { applyDeadlockDetection } from '../deadlock';
import { emptyLoopState, fingerprintFinding, hashText, type LoopState } from '../loop-state';

const reviewWith = (status: string, suggestion: string): string => `# Review

## Findings

#### F1 — Oscillating
- **Severity**: Major
- **Location**: \`a.ts:1\`
- **Problem**: should use A
- **Impact**: thrash
- **Suggestion**: ${suggestion}
- **Status**: ${status}
- **Attempts**: 1
- **First Seen**: 1

### Discussion

## Summary
- **Open**: ${status === 'Open' ? 1 : 0}
- **In Review**: ${status === 'In Review' ? 1 : 0}
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

test('applyDeadlockDetection: flipThreshold reopen escalates', () => {
  let state = emptyLoopState(['generic']);
  let markdown = reviewWith('Open', 'use A');

  let update = applyDeadlockDetection({
    state,
    markdown,
    cycle: 1,
    flipThreshold: 2,
  });
  state = update.state;
  markdown = reviewWith('In Review', 'use A');
  update = applyDeadlockDetection({
    state,
    markdown,
    cycle: 2,
    flipThreshold: 2,
  });
  state = update.state;
  markdown = reviewWith('Open', 'use B');
  update = applyDeadlockDetection({
    state,
    markdown,
    cycle: 3,
    flipThreshold: 2,
  });
  // One reopen so far (In Review → Open) → flipCount 1; need another
  state = update.state;
  markdown = reviewWith('In Review', 'use B');
  update = applyDeadlockDetection({
    state,
    markdown,
    cycle: 4,
    flipThreshold: 2,
  });
  state = update.state;
  markdown = reviewWith('Open', 'use A');
  update = applyDeadlockDetection({
    state,
    markdown,
    cycle: 5,
    flipThreshold: 2,
  });

  expect(update.newlyDeadlocked).toContain('F1');
  expect(update.markdown).toContain('**Status**: Escalated');
  expect(update.markdown).toContain('[Orchestrator] Deadlock detected');
});

const reviewWithQuotedCounts = (status: string, suggestion: string): string => `# Review

## Findings

#### F1 — Oscillating
- **Severity**: Major
- **Location**: \`a.ts:1\`
- **Problem**: should use A
- **Impact**: quoted summary lines, e.g. \`- **Open**: 3\` and \`- **Escalated**: 5\`
- **Suggestion**: ${suggestion}
- **Status**: ${status}
- **Attempts**: 1
- **First Seen**: 1

### Discussion

## Summary
- **Open**: ${status === 'Open' ? 1 : 0}
- **In Review**: ${status === 'In Review' ? 1 : 0}
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

test('applyDeadlockDetection: bumps only the ## Summary counts, not quoted count lines in finding text', () => {
  let state = emptyLoopState(['generic']);
  let markdown = reviewWithQuotedCounts('Open', 'use A');

  let update = applyDeadlockDetection({
    state,
    markdown,
    cycle: 1,
    flipThreshold: 2,
  });
  state = update.state;
  markdown = reviewWithQuotedCounts('In Review', 'use A');
  update = applyDeadlockDetection({
    state,
    markdown,
    cycle: 2,
    flipThreshold: 2,
  });
  state = update.state;
  markdown = reviewWithQuotedCounts('Open', 'use B');
  update = applyDeadlockDetection({
    state,
    markdown,
    cycle: 3,
    flipThreshold: 2,
  });
  state = update.state;
  markdown = reviewWithQuotedCounts('In Review', 'use B');
  update = applyDeadlockDetection({
    state,
    markdown,
    cycle: 4,
    flipThreshold: 2,
  });
  state = update.state;
  markdown = reviewWithQuotedCounts('Open', 'use A');
  update = applyDeadlockDetection({
    state,
    markdown,
    cycle: 5,
    flipThreshold: 2,
  });

  expect(update.newlyDeadlocked).toContain('F1');
  // The real ## Summary section reflects the escalation…
  const summarySection = update.markdown.match(/## Summary[\s\S]*$/)?.[0] ?? '';
  expect(summarySection).toContain('- **Open**: 0');
  expect(summarySection).toContain('- **Escalated**: 1');
  // …while quoted count lines inside finding text are left verbatim.
  expect(update.markdown).toContain('e.g. \`- **Open**: 3\` and \`- **Escalated**: 5\`');
});

test('applyDeadlockDetection: escalating a block missing its Status line does not corrupt the neighbor (F4)', () => {
  // F4's trigger: the deadlock escalation regex matches from the target
  // header to the FIRST `- **Status**:` line anywhere — when the target block
  // lacks its own Status line (parseFindingBlocks defaults it to Open), the
  // match spans into the neighbor's block, flipping the neighbor's status to
  // Escalated and appending the [Orchestrator] turn to the neighbor's
  // Discussion. This test pins the correct behavior: the escalation is
  // enforced inside the target's own block only.
  const markdown = `# Review

## Findings

#### F1 — Target (no Status line)
- **Severity**: Major
- **Location**: \`a.ts:1\`
- **Problem**: should use A
- **Impact**: thrash
- **Suggestion**: use A
- **Attempts**: 1
- **First Seen**: 1

### Discussion

#### F2 — Neighbor
- **Severity**: Minor
- **Location**: \`b.ts:1\`
- **Problem**: unrelated
- **Impact**: i
- **Suggestion**: s
- **Status**: Open
- **Attempts**: 1
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 2
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

  // F1 is already tracked as deadlocked (its block has no Status line, so
  // parseFindingBlocks reads it as Open → the enforcement re-applies).
  const prior: LoopState = {
    ...emptyLoopState(['generic']),
    cycle: 3,
    findings: {
      F1: {
        id: 'F1',
        fingerprint: fingerprintFinding('a.ts:1', 'should use A'),
        location: 'a.ts:1',
        transitions: [
          {
            cycle: 1,
            status: 'Open',
            sourceReviewers: ['generic'],
            patchHash: hashText('use A'),
          },
        ],
        flipCount: 0,
        lastPatchHash: hashText('use A'),
        deadlocked: true,
      },
    },
    deadlocks: ['F1'],
  };

  const update = applyDeadlockDetection({
    state: prior,
    markdown,
    cycle: 4,
    flipThreshold: 2,
  });

  // F1 stays tracked as deadlocked.
  expect(update.state.findings.F1?.deadlocked).toBe(true);

  // The escalation is confined to F1's own block…
  const f1Block = update.markdown.slice(0, update.markdown.indexOf('#### F2'));
  const f2Block = update.markdown.slice(update.markdown.indexOf('#### F2'));
  expect(f1Block).toMatch(/- \*\*Status\*\*: Escalated/);
  expect(f1Block).toContain('[Orchestrator] Deadlock detected');
  // …and the neighbor's block is untouched: real status intact, no turn.
  expect(f2Block).toContain('- **Status**: Open');
  expect(f2Block).not.toContain('[Orchestrator] Deadlock detected');
});
