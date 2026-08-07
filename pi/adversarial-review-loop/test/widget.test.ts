import { test, expect, vi } from 'vitest';
import { Option } from 'effect';
import {
  clearLoopWidget,
  fixerStatusLabel,
  formatElapsed,
  phaseLabel,
  renderLoopWidget,
  reviewerStatusLabel,
  setLoopWidget,
  supervisorStatusLabel,
  type LoopWidgetState,
} from '../widget';

/** Sample state used across render tests. */
const sampleState = (): LoopWidgetState => ({
  loop: 1,
  maxLoops: 3,
  cycle: 1,
  maxCycles: 5,
  supervisor: 'waiting-specialists',
  reviewers: [
    { id: 'generic', label: 'Generic', status: 'running' },
    { id: 'security-auditor', label: 'Security Auditor', status: 'done', findingCount: 4 },
    { id: 'pattern', label: 'Pattern Aligner Reviewer', status: 'pending' },
  ],
  fixer: 'waiting',
  summary: Option.some({ open: 3, inReview: 1, escalated: 0, resolved: 5, wontFix: 0 }),
  deadlocks: 1,
  phase: 'reviewer:security-auditor',
});

test('renderLoopWidget: shows loop/cycle, phase, and role rows', () => {
  const lines = renderLoopWidget(sampleState());

  expect(lines[0]).toContain('loop 2/3');
  expect(lines[0]).toContain('cycle 2/5');
  expect(lines[0]).toContain('reviewer security-auditor'); // phase humanized

  // Summary (scoreboard) comes first and carries the counts.
  const summaryLine = lines[1];
  expect(summaryLine).toContain('open 3');
  expect(summaryLine).toContain('resolved 5');
  expect(summaryLine).toContain('⚠ deadlocks 1');

  // Supervisor row uses the human label for the dispatch phase.
  expect(lines.some((line) => line.includes('waiting on reviewers'))).toBe(true);

  // Reviewer rows: running label, findings count, queued label.
  const joined = lines.join('\n');
  expect(joined).toContain('Generic');
  expect(joined).toContain('reviewing');
  expect(joined).toContain('Security Auditor');
  expect(joined).toContain('4 findings');
  expect(joined).toContain('Pattern Aligner Reviewer');
  expect(joined).toContain('queued');

  // Fixer row.
  expect(joined).toContain('fixer');
  expect(joined).toContain('waiting');
});

test('renderLoopWidget: summary-first so it survives widget line limits', () => {
  const lines = renderLoopWidget(sampleState());
  expect(lines[1]).toContain('summary');
  expect(lines[1]).toContain('open');
});

test('renderLoopWidget: pending summary when no counts yet', () => {
  const lines = renderLoopWidget({
    loop: 0,
    maxLoops: 3,
    cycle: 0,
    maxCycles: 5,
    supervisor: 'briefing',
    reviewers: [{ id: 'generic', label: 'Generic', status: 'pending' }],
    fixer: 'waiting',
    summary: Option.none(),
    deadlocks: 0,
    phase: 'supervisor:brief',
  });
  expect(lines[1]).toContain('pending');
  expect(lines[0]).toContain('supervisor brief');
  expect(lines[0]).toContain('loop 1/3');
  expect(lines[0]).toContain('cycle 1/5');
});

test('renderLoopWidget: applies theme colors when a theme is provided', () => {
  const fg = vi.fn((_color: string, text: string) => text);
  const theme = { fg, bold: (text: string) => text } as never;
  renderLoopWidget(sampleState(), theme);

  // Active supervisor phase and running reviewer are highlighted (warning).
  expect(fg).toHaveBeenCalledWith('warning', expect.anything());
  // Done reviewer + finding counts use success.
  expect(fg).toHaveBeenCalledWith('success', expect.anything());
  // Deadlock warning uses warning.
  expect(fg).toHaveBeenCalledWith('warning', '⚠ deadlocks 1');
});

test('setLoopWidget: pushes a component factory that renders the state', () => {
  const setWidget = vi.fn();
  const theme = { fg: (_c: string, t: string) => t, bold: (t: string) => t } as never;
  setLoopWidget({ setWidget, theme }, { ...sampleState(), phaseStartedAt: Date.now() });

  expect(setWidget).toHaveBeenCalledWith('adversarial-review-loop', expect.any(Function));
  const factory = setWidget.mock.calls[0]?.[1] as (
    tui: unknown,
    theme: unknown,
  ) => { render(): string[]; dispose?(): void };
  const component = factory({ requestRender: () => {} }, theme);
  expect(component.render().join('\n')).toContain('cycle 2/5');
  component.dispose?.();

  clearLoopWidget({ setWidget });
  expect(setWidget).toHaveBeenCalledWith('adversarial-review-loop', undefined);
});

test('renderLoopWidget: shows the phase elapsed timer', () => {
  const line = (now: number): string =>
    renderLoopWidget({ ...sampleState(), phaseStartedAt: 100_000_000 }, undefined, now)[0] ?? '';
  expect(line(100_042_000)).toContain('· 42s');
  expect(line(100_125_000)).toContain('· 2m 5s');
});

test('formatElapsed: formats durations', () => {
  expect(formatElapsed(100_000_000, 100_000_000)).toBe('0s');
  expect(formatElapsed(100_042_000, 100_000_000)).toBe('42s');
  expect(formatElapsed(100_125_000, 100_000_000)).toBe('2m 5s');
  expect(formatElapsed(100_120_000, 100_000_000)).toBe('2m');
  expect(formatElapsed(3_700_000, 0)).toBe('1h 1m');
});

test('renderLoopWidget: shows the live tool line when an agent is working', () => {
  const lines = renderLoopWidget({
    ...sampleState(),
    tool: 'reviewer generic — read',
  });
  expect(lines.some((line) => line.includes('reviewer generic — read'))).toBe(true);

  // Without an active tool the line is omitted.
  const plain = renderLoopWidget(sampleState());
  expect(plain.some((line) => line.includes('now'))).toBe(false);
});

test('renderLoopWidget: shows fixer concurrency and wave progress', () => {
  const lines = renderLoopWidget({
    ...sampleState(),
    fixer: 'running',
    fixerConcurrency: 3,
    fixerDetail: 'wave 1/2 · fixed 0/5',
    phase: 'fixer:wave 1',
  });
  const joined = lines.join('\n');
  expect(joined).toContain('3 concurrent');
  expect(joined).toContain('wave 1/2');
  expect(joined).toContain('fixed 0/5');
  expect(lines[0]).toContain('fixer wave 1');

  // No concurrency/detail → omitted.
  const plain = renderLoopWidget(sampleState());
  expect(plain.join('\n')).not.toContain('concurrent');
});

test('renderLoopWidget: shows reviewer concurrency on the first row', () => {
  const lines = renderLoopWidget({
    ...sampleState(),
    reviewers: [
      { id: 'generic', label: 'Generic', status: 'running' },
      { id: 'security', label: 'Security', status: 'running' },
    ],
    reviewerConcurrency: 2,
  });
  const joined = lines.join('\n');
  expect(joined).toContain('2 concurrent');
  expect(joined).toContain('Generic');
  expect(joined).toContain('Security');
});

// ─── Status labels ──────────────────────────────────────────────────

test('status labels: human-readable enums', () => {
  expect(reviewerStatusLabel('running')).toBe('reviewing');
  expect(reviewerStatusLabel('pending')).toBe('queued');
  expect(reviewerStatusLabel('done')).toBe('done');
  expect(reviewerStatusLabel('error')).toBe('error');
  expect(supervisorStatusLabel('waiting-specialists')).toBe('waiting on reviewers');
  expect(supervisorStatusLabel('briefing')).toBe('briefing');
  expect(supervisorStatusLabel('aggregating')).toBe('aggregating');
  expect(fixerStatusLabel('running')).toBe('fixing');
  expect(fixerStatusLabel('waiting')).toBe('waiting');
});

test('phaseLabel: humanizes graph phase strings', () => {
  expect(phaseLabel('supervisor:brief')).toBe('supervisor brief');
  expect(phaseLabel('supervisor:aggregate')).toBe('supervisor aggregate');
  expect(phaseLabel('reviewer:security-auditor')).toBe('reviewer security-auditor');
  expect(phaseLabel('fixer')).toBe('fixer');
  expect(phaseLabel('merge')).toBe('merge');
  expect(phaseLabel('consensus')).toBe('loop consensus');
  expect(phaseLabel('decision')).toBe('cycle-max decision');
  expect(phaseLabel('loop:advance')).toBe('next loop');
  expect(phaseLabel('whatever')).toBe('whatever');
});

test('renderLoopWidget: consensus banner when a loop ends', () => {
  const lines = renderLoopWidget({
    ...sampleState(),
    loopStatus: 'consensus',
    phase: 'consensus',
  });
  const joined = lines.join('\n');
  expect(joined).toContain('loop 2 consensus');
  expect(joined).toContain('fresh reviewers');
  expect(lines[0]).toContain('loop consensus');
});

test('renderLoopWidget: decision banner when waiting on the user', () => {
  const lines = renderLoopWidget({
    ...sampleState(),
    loopStatus: 'decision',
    decision: 'cycle 5/5 reached — waiting on you',
    phase: 'decision',
  });
  const joined = lines.join('\n');
  expect(joined).toContain('waiting on you');
  expect(lines[0]).toContain('cycle-max decision');
});
