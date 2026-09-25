import * as Vitest from '@effect/vitest';
import type { Runs } from '../../services/index.js';
import {
  liveNote,
  parkedQuestion,
  runRoleMarker,
  runTranscriptLines,
} from '../run-detail-lines.js';

/** Build a run detail with the fields the line helpers read. */
const detail = (
  status: string,
  events: ReadonlyArray<{ readonly seq: number; readonly role: string; readonly text: string }>,
): Runs.RunDetail => ({
  summary: {
    id: 'run-1',
    name: 'Run One',
    description: 'do it',
    status,
    model: 'anthropic/claude',
    progress: '',
    prompt: 'do it',
    updated: '2026-01-01T00:00:00.000Z',
  },
  events,
  receipt: undefined,
});

Vitest.describe('runRoleMarker', () => {
  Vitest.it('maps user, assistant, and everything else to glyphs', () => {
    Vitest.expect(runRoleMarker('user')).toBe('›');
    Vitest.expect(runRoleMarker('assistant')).toBe('◈');
    Vitest.expect(runRoleMarker('system')).toBe('·');
    Vitest.expect(runRoleMarker('toolResult')).toBe('·');
    Vitest.expect(runRoleMarker('weird')).toBe('·');
  });
});

Vitest.describe('runTranscriptLines', () => {
  Vitest.it('prefixes each event with its role glyph in seq order', () => {
    const lines = runTranscriptLines(
      detail('running', [
        { seq: 1, role: 'user', text: 'do it' },
        { seq: 2, role: 'assistant', text: 'on it' },
        { seq: 3, role: 'toolResult', text: 'ran tool' },
      ]),
    );
    Vitest.expect(lines).toStrictEqual(['› do it', '◈ on it', '· ran tool']);
  });

  Vitest.it('returns no lines for an empty transcript', () => {
    Vitest.expect(runTranscriptLines(detail('running', []))).toStrictEqual([]);
  });
});

Vitest.describe('parkedQuestion', () => {
  Vitest.it('returns the last system line while parked', () => {
    const question = parkedQuestion(
      detail('awaiting-input', [
        { seq: 1, role: 'assistant', text: 'which branch?' },
        { seq: 2, role: 'system', text: 'Which branch should I use?' },
      ]),
    );
    Vitest.expect(question).toBe('Which branch should I use?');
  });

  Vitest.it('returns undefined when the run is not parked', () => {
    Vitest.expect(
      parkedQuestion(detail('running', [{ seq: 1, role: 'system', text: 'Which branch?' }])),
    ).toBeUndefined();
  });

  Vitest.it('returns undefined when a parked run has no system line', () => {
    Vitest.expect(
      parkedQuestion(detail('awaiting-input', [{ seq: 1, role: 'assistant', text: 'hmm' }])),
    ).toBeUndefined();
  });
});

Vitest.describe('liveNote', () => {
  Vitest.it('names live, parked, and settled states', () => {
    Vitest.expect(liveNote('running')).toBe('live');
    Vitest.expect(liveNote('awaiting-input')).toBe('waiting for your answer');
    Vitest.expect(liveNote('done')).toBeUndefined();
    Vitest.expect(liveNote(undefined)).toBeUndefined();
  });
});
