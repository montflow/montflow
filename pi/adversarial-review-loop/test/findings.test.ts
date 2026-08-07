import { test, expect } from 'vitest';
import {
  buildFixerSchedule,
  countStatuses,
  locationFile,
  mergeFindingBlock,
  parseFindingBlocks,
  splitFindingBlocks,
  updateSummarySection,
  type FindingBlock,
} from '../findings';

/** Minimal finding factory. */
const finding = (id: string, location: string, severity = 'Minor'): FindingBlock => ({
  id,
  title: `Issue ${id}`,
  severity,
  location,
  problem: `Problem ${id}`,
  impact: 'Impact',
  suggestion: 'Suggestion',
  status: 'Open',
  attempts: '0',
  firstSeen: '1',
  discussion: '',
  raw: `#### ${id} — Issue ${id}`,
  sourceReviewers: ['generic'],
});

test('buildFixerSchedule: unrelated findings share a wave (parallel)', () => {
  const schedule = buildFixerSchedule([finding('F1', 'src/a.ts'), finding('F2', 'src/b.ts')]);
  expect(schedule).toHaveLength(1);
  expect(schedule[0]?.map((f) => f.id).toSorted()).toEqual(['F1', 'F2']);
});

test('buildFixerSchedule: same-location findings are sequential, others parallel', () => {
  const schedule = buildFixerSchedule([
    finding('F1', 'src/a.ts', 'Critical'),
    finding('F2', 'src/a.ts', 'Minor'),
    finding('F3', 'src/b.ts', 'Major'),
  ]);
  expect(schedule).toHaveLength(2);
  // Wave 0: the most severe finding of loc a + the loc b finding (parallel).
  // Wave 1: the remaining same-location finding (sequential).
  expect(schedule[0]?.map((f) => f.id).toSorted()).toEqual(['F1', 'F3']);
  expect(schedule[1]?.map((f) => f.id)).toEqual(['F2']);
});

test('buildFixerSchedule: all same location → fully sequential', () => {
  const schedule = buildFixerSchedule([
    finding('F1', 'src/a.ts'),
    finding('F2', 'src/a.ts'),
    finding('F3', 'src/a.ts'),
  ]);
  expect(schedule).toHaveLength(3);
  expect(schedule.every((wave) => wave.length === 1)).toBe(true);
});

test('buildFixerSchedule: different lines of the same file serialize (no concurrent edits)', () => {
  const schedule = buildFixerSchedule([
    finding('F1', 'src/a.ts:10'),
    finding('F2', 'src/a.ts:200'),
    finding('F3', 'src/b.ts:5'),
  ]);
  expect(schedule).toHaveLength(2);
  // Wave 0: one of the src/a.ts findings + the src/b.ts finding (parallel).
  // Wave 1: the remaining src/a.ts finding (sequential).
  expect(schedule[0]?.map((f) => f.id).toSorted()).toEqual(['F1', 'F3']);
  expect(schedule[1]?.map((f) => f.id)).toEqual(['F2']);
});

test('buildFixerSchedule: line:col locations still group by file', () => {
  const schedule = buildFixerSchedule([
    finding('F1', 'src/a.ts:10:5'),
    finding('F2', 'src/a.ts:200'),
  ]);
  expect(schedule).toHaveLength(2);
  expect(schedule.every((wave) => wave.length === 1)).toBe(true);
});

test('locationFile: strips :line and :line:col suffixes, keeps Windows drive letter', () => {
  expect(locationFile('src/a.ts')).toBe('src/a.ts');
  expect(locationFile('src/a.ts:10')).toBe('src/a.ts');
  expect(locationFile('src/a.ts:10:20')).toBe('src/a.ts');
  expect(locationFile('C:\\src\\a.ts:10')).toBe('C:\\src\\a.ts');
});

test('mergeFindingBlock: replaces only the matching finding block', () => {
  const canonical = `# Review\n\n## Findings\n\n#### F1 — Old\n- **Status**: Open\n- **Attempts**: 0\n\n### Discussion\n\n#### F2 — Keep\n- **Status**: Open\n\n### Discussion\n\n## Summary\n- **Open**: 2\n`;
  const updated = `#### F1 — Fixed\n- **Status**: In Review\n- **Attempts**: 1\n\n### Discussion\n`;
  const merged = mergeFindingBlock(canonical, updated);
  expect(merged).toContain('#### F1 — Fixed');
  expect(merged).not.toContain('#### F1 — Old');
  expect(merged).toContain('#### F2 — Keep');
  expect(merged).toContain('## Summary\n- **Open**: 2');
});

test('mergeFindingBlock: unknown id leaves the document unchanged', () => {
  const canonical = '# Review\n\n#### F1 — Old\n- **Status**: Open\n';
  expect(mergeFindingBlock(canonical, '#### F9 — Ghost\n- **Status**: Open\n')).toBe(canonical);
});

test('updateSummarySection: recomputes counts from findings', () => {
  const canonical = `# Review\n\n## Findings\n\n#### F1 — a\n- **Status**: Open\n\n#### F2 — b\n- **Status**: In Review\n\n## Summary\n- **Open**: 1\n- **In Review**: 1\n- **Escalated**: 0\n- **Resolved**: 0\n- **Won't Fix**: 0\n`;
  const merged = updateSummarySection(canonical, [
    { ...finding('F1', 'x'), status: 'Resolved' },
    { ...finding('F2', 'y'), status: 'In Review' },
  ]);
  expect(merged).toContain('- **Open**: 0');
  expect(merged).toContain('- **Resolved**: 1');
  expect(merged).toContain('- **In Review**: 1');
});

test('updateSummarySection: appends the section when missing', () => {
  const merged = updateSummarySection('# Review\n\n## Findings\n', [finding('F1', 'x')]);
  expect(merged).toContain('## Summary');
  expect(merged).toContain('- **Open**: 1');
});

const FENCE = '```';

// An unclosed fence before a finding is the trigger named in finding F2: a
// merged `[Fixer]` Discussion turn that quotes a code snippet without a
// closing fence. It must not make every subsequent finding invisible.

const unclosedFenceDoc = `# Review

## Findings

#### F1 — a
- **Severity**: Minor
- **Location**: \`src/a.ts\`
- **Problem**: p
- **Impact**: i
- **Suggestion**: s
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion
<!-- Fixer turn with an unclosed fence: -->

${FENCE}ts
const x = 1;

#### F2 — b
- **Severity**: Minor
- **Location**: \`src/b.ts\`
- **Problem**: p
- **Impact**: i
- **Suggestion**: s
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 2
`;

test('splitFindingBlocks: an unclosed fence before a finding does not swallow it', () => {
  const blocks = splitFindingBlocks(unclosedFenceDoc);
  expect(blocks.some((b) => b.startsWith('#### F1 '))).toBe(true);
  expect(blocks.some((b) => b.startsWith('#### F2 '))).toBe(true);
});

test('parseFindingBlocks: an unclosed fence before F2 does not hide it', () => {
  const findings = parseFindingBlocks(unclosedFenceDoc);
  expect(findings.map((f) => f.id).toSorted()).toEqual(['F1', 'F2']);
  const f2 = findings.find((f) => f.id === 'F2');
  expect(f2?.status).toBe('Open');
  expect(f2?.location).toBe('src/b.ts');
});

test('splitFindingBlocks: header inside a balanced fence stays invisible', () => {
  const content = `# Review

## Findings

#### F1 — a
- **Status**: Open

### Discussion

${FENCE}markdown
#### F9 — phantom
- **Status**: Open
${FENCE}
`;
  const blocks = splitFindingBlocks(content);
  expect(blocks.some((b) => b.startsWith('#### F1 '))).toBe(true);
  expect(blocks.some((b) => b.startsWith('#### F9 '))).toBe(false);
});

// F17 regression: the F2 unclosed-fence recovery (a blank-preceded header is
// a boundary even while a fence is open) must only fire when the fence is
// provably UNclosed. A *balanced* fence that quotes an example finding with
// blank lines between its fields must neither reify that phantom nor reset
// inFence mid-fence (which would re-hide the real findings that follow).
const balancedFenceQuotingFinding = `# Review

## Findings

#### F1 — a
- **Status**: Open

### Discussion

${FENCE}markdown

#### F9 — phantom example
- **Severity**: Minor

- **Status**: Open
${FENCE}

#### F2 — b
- **Status**: Open

### Discussion
`;

test('splitFindingBlocks: blank-preceded header inside a balanced fence is not a boundary and does not corrupt fence state', () => {
  const blocks = splitFindingBlocks(balancedFenceQuotingFinding);
  // The quoted F9 is preceded by a blank line but the fence is balanced, so
  // it must stay invisible (no phantom reification).
  expect(blocks.some((b) => b.startsWith('#### F9 '))).toBe(false);
  // Real findings on both sides of the fence are still detected — the
  // phantom must not reset inFence mid-fence and hide what follows.
  expect(blocks.some((b) => b.startsWith('#### F1 '))).toBe(true);
  expect(blocks.some((b) => b.startsWith('#### F2 '))).toBe(true);
});

test('parseFindingBlocks: a quoted finding inside a balanced fence is not reified and the next finding still parses', () => {
  const findings = parseFindingBlocks(balancedFenceQuotingFinding);
  expect(findings.map((f) => f.id).toSorted()).toEqual(['F1', 'F2']);
  // countStatuses sees only the two real findings — the phantom is not
  // counted as Open.
  expect(countStatuses(findings).open).toBe(2);
});

test('mergeFindingBlock: an unclosed fence before the target does not drop the merge', () => {
  const canonical = `# Review

## Findings

#### F1 — a
- **Status**: Open

### Discussion
<!-- unclosed fence: -->

${FENCE}ts
const x = 1;

#### F2 — b
- **Status**: Open
- **Attempts**: 0

### Discussion

## Summary
- **Open**: 2
`;
  const updated = `#### F2 — b (fixed)
- **Status**: In Review
- **Attempts**: 1

### Discussion
`;
  const merged = mergeFindingBlock(canonical, updated);
  expect(merged).toContain('#### F2 — b (fixed)');
  expect(merged).toContain('#### F1 — a');
  expect(merged).not.toContain('#### F2 — b\n- **Status**: Open');
});

// F19 regression: the F17 fix gated the blank-line recovery on `i >
// lastFenceIndex` (past the document's FINAL fence marker), so a real finding
// between an unclosed opener mid-document and a later balanced pair was
// absorbed into the previous block even though the total count is odd
// (1 + 2 = 3). The recovery must fire for any open region in an odd-count
// document, not only the tail region.
const unclosedOpenerWithLaterPairDoc = `# Review

## Findings

#### F1 — a
- **Severity**: Minor
- **Location**: \`src/a.ts\`
- **Problem**: p
- **Impact**: i
- **Suggestion**: s
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion
<!-- Fixer turn quotes code without a closing fence: -->

${FENCE}ts
const x = 1;

#### F2 — b
- **Severity**: Minor
- **Location**: \`src/b.ts\`
- **Problem**: p
- **Impact**: i
- **Suggestion**: s
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion
<!-- Later turn quotes code correctly as a balanced pair: -->

${FENCE}md
some code
${FENCE}

#### F3 — c
- **Severity**: Minor
- **Location**: \`src/c.ts\`
- **Problem**: p
- **Impact**: i
- **Suggestion**: s
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 3
`;

test('splitFindingBlocks: a finding between an unclosed opener and a later balanced pair is still a boundary (F19)', () => {
  const blocks = splitFindingBlocks(unclosedOpenerWithLaterPairDoc);
  expect(blocks.some((b) => b.startsWith('#### F1 '))).toBe(true);
  expect(blocks.some((b) => b.startsWith('#### F2 '))).toBe(true);
  expect(blocks.some((b) => b.startsWith('#### F3 '))).toBe(true);
});

test('parseFindingBlocks: F2 between an unclosed opener and a later balanced pair still parses (F19)', () => {
  const findings = parseFindingBlocks(unclosedOpenerWithLaterPairDoc);
  expect(findings.map((f) => f.id).toSorted()).toEqual(['F1', 'F2', 'F3']);
  const f2 = findings.find((f) => f.id === 'F2');
  expect(f2?.status).toBe('Open');
  expect(f2?.location).toBe('src/b.ts');
  expect(countStatuses(findings).open).toBe(3);
});

test('mergeFindingBlock: merging F2 between an unclosed opener and a later balanced pair still lands (F19)', () => {
  const updated = `#### F2 — b (fixed)
- **Status**: In Review
- **Attempts**: 1

### Discussion
`;
  const merged = mergeFindingBlock(unclosedOpenerWithLaterPairDoc, updated);
  expect(merged).toContain('#### F2 — b (fixed)');
  expect(merged).toContain('#### F1 — a');
  expect(merged).toContain('#### F3 — c');
});

// ─── F14: parsing-core coverage (missing-status default + F16 status parse) ──

test('parseFindingBlocks: a block missing its Status line defaults to Open', () => {
  // F4's trigger: an LLM-drifted block with no `- **Status**:` field. The
  // parser must not blow up and must treat the finding as actionable Open.
  const content = `# Review

## Findings

#### F1 — No status line
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: p
- **Impact**: i
- **Suggestion**: s
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 1
`;
  const [f1] = parseFindingBlocks(content);
  expect(f1?.id).toBe('F1');
  expect(f1?.status).toBe('Open');
});

test('parseFindingBlocks: quoted - **Status**: text in Problem/Suggestion does not corrupt the parsed status', () => {
  // F16's trigger, live in 001.md: a finding whose Problem/Suggestion quotes
  // `- **Status**:` lines. The real Status field comes after Suggestion, so
  // the parsed status must be the real one — not the quoted text.
  const content = `# Review

## Findings

#### F1 — Quoted status
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: The block quotes \`- **Status**: Wontfix\` in its Suggestion.
- **Impact**: i
- **Suggestion**: Change \`- **Status**: Escalated\` to \`- **Status**: Open\`.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 1
`;
  const [f1] = parseFindingBlocks(content);
  expect(f1?.id).toBe('F1');
  expect(f1?.status).toBe('Open');
});
