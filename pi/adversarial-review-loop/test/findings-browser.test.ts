import { test, expect } from 'vitest';
import { buildFindingDetail, buildFindingsRows, wrapLines } from '../findings-browser';
import type { FindingBlock } from '../findings';

/** A minimal finding block fixture. */
const finding = (overrides: Partial<FindingBlock> & { id: string; title: string }): FindingBlock => ({
  id: overrides.id,
  title: overrides.title,
  severity: overrides.severity ?? 'Major',
  location: overrides.location ?? 'src/a.ts',
  problem: overrides.problem ?? 'Problem text.',
  impact: overrides.impact ?? 'Impact text.',
  suggestion: overrides.suggestion ?? 'Suggestion text.',
  status: overrides.status ?? 'Open',
  attempts: overrides.attempts ?? '0',
  firstSeen: overrides.firstSeen ?? '1',
  discussion: overrides.discussion ?? '',
  raw: `#### ${overrides.id} — ${overrides.title}\n- **Status**: ${overrides.status ?? 'Open'}\n- **Attempts**: ${overrides.attempts ?? '0'}\n\n### Discussion\n`,
  sourceReviewers: overrides.sourceReviewers ?? ['generic'],
});

// ─── wrapLines ───────────────────────────────────────────────────────

test('wrapLines: wraps long lines at word boundaries and hard-cuts long tokens', () => {
  const lines = wrapLines('one two three four five', 10);
  expect(lines).toEqual(['one two', 'three four', 'five']);
  expect(wrapLines('supercalifragilistic', 8)).toEqual(['supercal', 'ifragili', 'stic']);
});

test('wrapLines: preserves explicit line breaks and blank lines', () => {
  const lines = wrapLines('first\n\nsecond line here', 20);
  expect(lines).toEqual(['first', '', 'second line here']);
});

// ─── buildFindingsRows ───────────────────────────────────────────────

test('buildFindingsRows: running fixers first, then severity, then id', () => {
  const findings = [
    finding({ id: 'F3', title: 'Minor one', severity: 'Minor' }),
    finding({ id: 'F1', title: 'Critical one', severity: 'Critical' }),
    finding({ id: 'F2', title: 'Running one', severity: 'Major' }),
  ];
  const rows = buildFindingsRows(
    findings,
    [
      { id: 'F2', status: 'running' },
      { id: 'F1', status: 'done' },
    ],
    undefined,
  );
  // F2 (fixer running) first, then F1 (Critical) before F3 (Minor).
  expect(rows.map((row) => row.value)).toEqual(['F2', 'F1', 'F3']);
});

test('buildFindingsRows: label and description carry title/status/attempts/fixer/location', () => {
  const rows = buildFindingsRows(
    [finding({ id: 'F5', title: 'Abort path swallows errors', status: 'In Review', attempts: '1' })],
    [{ id: 'F5', status: 'running' }],
    { getTool: () => 'edit' } as never,
  );
  expect(rows[0]?.label).toBe('F5 · Major · Abort path swallows errors');
  expect(rows[0]?.description).toContain('In Review');
  expect(rows[0]?.description).toContain('attempts 1');
  expect(rows[0]?.description).toContain('fixer running · edit');
  expect(rows[0]?.description).toContain('src/a.ts');
});

test('buildFindingsRows: no fixer rows yet → fixer —', () => {
  const rows = buildFindingsRows(
    [finding({ id: 'F1', title: 'Fresh' })],
    undefined,
    undefined,
  );
  expect(rows[0]?.description).toContain('fixer —');
});

// ─── buildFindingDetail ──────────────────────────────────────────────

test('buildFindingDetail: header carries status, attempts, fixer, location, source', () => {
  const detail = buildFindingDetail(
    finding({
      id: 'F2',
      title: 'Race condition',
      status: 'Open',
      attempts: '2',
      location: 'src/crypto.ts:10',
      sourceReviewers: ['security'],
    }),
    { id: 'F2', status: 'running' },
    'bash',
    'fixer-a → fixer-b',
  );
  expect(detail).toContain('F2 — Race condition');
  expect(detail).toContain('Status: Open · Attempts: 2');
  expect(detail).toContain('Fixer: running · bash (fixer-a → fixer-b)');
  expect(detail).toContain('Location: src/crypto.ts:10');
  expect(detail).toContain('Source: security');
});

test('buildFindingDetail: includes problem, impact, suggestion, and discussion tail', () => {
  const detail = buildFindingDetail(
    finding({
      id: 'F1',
      title: 'Bug',
      problem: 'The thing is wrong in a long way that needs wrapping because it is very verbose.',
      impact: 'Breaks everything.',
      suggestion: 'Fix it properly.',
      discussion: '[Fixer] Changed the thing.\n[Reviewer] Still broken here.\n[Fixer] Fixed for real now.',
    }),
    undefined,
    undefined,
    undefined,
  );
  expect(detail).toContain('Problem:');
  expect(detail).toContain('The thing is wrong in a long way that needs wrapping because it is');
  expect(detail).toContain('Impact:\nBreaks everything.');
  expect(detail).toContain('Suggestion:\nFix it properly.');
  expect(detail).toContain('Discussion:');
  expect(detail).toContain('[Fixer] Fixed for real now.');
});
