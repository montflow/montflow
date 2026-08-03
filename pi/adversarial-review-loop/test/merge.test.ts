import { test, expect } from 'vitest';
import { mergeScratchReports, passthroughMerge } from '../merge';

const finding = (
  id: string,
  location: string,
  problem: string,
  suggestion: string,
  source: string,
): string => `#### ${id} — Title ${id}
- **Severity**: Major
- **Location**: \`${location}\`
- **Source**: ${source}
- **Problem**: ${problem}
- **Impact**: bad
- **Suggestion**: ${suggestion}
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion
`;

test('passthroughMerge: parses single report', () => {
  const content = `# Review\n\n## Findings\n\n${finding('F1', 'a.ts:1', 'bug', 'fix it', 'generic')}\n\n## Summary\n- **Open**: 1\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 0\n- **Won't Fix**: 0\n`;
  const result = passthroughMerge(content);
  expect(result.hadConflicts).toBe(false);
  expect(result.findings).toHaveLength(1);
});

test('mergeScratchReports: dedupes identical fingerprints', () => {
  const result = mergeScratchReports({
    reports: [
      {
        reviewerId: 'technical',
        content: finding('F1', 'a.ts:10', 'null deref', 'add guard', 'technical'),
      },
      {
        reviewerId: 'style',
        content: finding('F1', 'a.ts:10', 'null deref', 'add guard', 'style'),
      },
    ],
    target: '/tmp',
    reviewFile: '/tmp/REVIEW.md',
    iteration: 1,
  });
  expect(result.hadConflicts).toBe(false);
  expect(result.findings).toHaveLength(1);
  const sources = [...(result.findings[0]?.sourceReviewers ?? [])];
  sources.sort();
  expect(sources).toEqual(['style', 'technical']);
});

test('mergeScratchReports: contradictory suggestions → conflict', () => {
  const result = mergeScratchReports({
    reports: [
      {
        reviewerId: 'technical',
        content: finding('F1', 'a.ts:10', 'use X pattern', 'use pattern X', 'technical'),
      },
      {
        reviewerId: 'style',
        content: finding('F1', 'a.ts:10', 'use X pattern', 'never use pattern X', 'style'),
      },
    ],
    target: '/tmp',
    reviewFile: '/tmp/REVIEW.md',
    iteration: 1,
  });
  expect(result.hadConflicts).toBe(true);
  expect(result.conflicts.length).toBeGreaterThan(0);
  expect(result.canonicalMarkdown).toContain('## Summary');
});
