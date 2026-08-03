import { test, expect } from 'vitest';
import { applyDeadlockDetection } from '../deadlock';
import { emptyLoopState } from '../loop-state';

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
