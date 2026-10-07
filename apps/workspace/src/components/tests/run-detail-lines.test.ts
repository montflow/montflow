import * as Vitest from '@effect/vitest';
import type { Runs } from '../../services/index.js';
import {
  RUN_META_COLUMNS,
  RUN_META_NONE,
  clipRunMetaValue,
  clipRunPrompt,
  liveNote,
  parkedQuestion,
  runMetaRows,
  detailBodyRows,
  promptPaneColumns,
  promptPaneRows,
  promptPaneTextRows,
  promptWindow,
  runPromptRows,
  showsPromptPane,
  runRoleMarker,
  runTranscriptMarkdown,
  shortRunTimestamp,
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
    thinking: '',
    tools: [],
    spec: '',
    progress: '',
    prompt: 'do it',
    created: '2026-01-01T00:00:00.000Z',
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

Vitest.describe('runTranscriptMarkdown', () => {
  Vitest.it('prefixes each event with its role glyph in seq order', () => {
    const lines = runTranscriptMarkdown(
      detail('running', [
        { seq: 1, role: 'user', text: 'do it' },
        { seq: 2, role: 'assistant', text: 'on it' },
        { seq: 3, role: 'toolResult', text: 'ran tool' },
      ]),
    );
    Vitest.expect(lines).toStrictEqual(['› do it', '', '◈ on it', '', '· ran tool']);
  });

  Vitest.it('returns no lines for an empty transcript', () => {
    Vitest.expect(runTranscriptMarkdown(detail('running', []))).toStrictEqual([]);
  });

  Vitest.it('moves the glyph onto its own line when the event opens a markdown block', () => {
    const lines = runTranscriptMarkdown(
      detail('running', [
        { seq: 1, role: 'assistant', text: '## Plan\n- one\n- two' },
        { seq: 2, role: 'assistant', text: '```ts\nconst a = 1;\n```' },
      ]),
    );
    Vitest.expect(lines).toStrictEqual([
      '◈',
      '## Plan',
      '- one',
      '- two',
      '',
      '◈',
      '```ts',
      'const a = 1;',
      '```',
    ]);
  });

  Vitest.it('keeps the rest of a multi-line event unprefixed', () => {
    Vitest.expect(
      runTranscriptMarkdown(
        detail('running', [{ seq: 1, role: 'user', text: 'line one\nline two' }]),
      ),
    ).toStrictEqual(['› line one', 'line two']);
  });

  Vitest.it('bounds a long tool result to its head, an elision note, and its tail', () => {
    const dump = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join('\n');
    const lines = runTranscriptMarkdown(
      detail('running', [{ seq: 1, role: 'toolResult', text: dump }]),
    );
    Vitest.expect(lines[0]).toBe('· line 1');
    Vitest.expect(lines).toContain(
      '_… 34 lines of tool output hidden · open the session file for the rest …_',
    );
    Vitest.expect(lines.at(-2)).toBe('line 39');
    Vitest.expect(lines.at(-1)).toBe('line 40');
    // The dump no longer dwarfs the transcript.
    Vitest.expect(lines.length).toBeLessThan(20);
  });

  Vitest.it('leaves a short tool result whole', () => {
    Vitest.expect(
      runTranscriptMarkdown(detail('running', [{ seq: 1, role: 'toolResult', text: 'a\nb\nc' }])),
    ).toStrictEqual(['· a', 'b', 'c']);
  });

  Vitest.it('never clips assistant or user prose', () => {
    const prose = Array.from({ length: 40 }, (_, index) => `prose ${index + 1}`).join('\n');
    Vitest.expect(
      runTranscriptMarkdown(detail('running', [{ seq: 1, role: 'assistant', text: prose }])),
    ).toHaveLength(40);
  });

  Vitest.it('renders a glyph alone for an empty event', () => {
    Vitest.expect(
      runTranscriptMarkdown(
        detail('running', [
          { seq: 1, role: 'assistant', text: 'on it' },
          { seq: 2, role: 'toolResult', text: '' },
        ]),
      ),
    ).toStrictEqual(['◈ on it', '', '·']);
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

Vitest.describe('clipRunPrompt', () => {
  Vitest.it('leaves a prompt that fits the pane alone', () => {
    Vitest.expect(clipRunPrompt('short prompt', 40)).toBe('short prompt');
  });

  Vitest.it('clips a specification-sized prompt at a line break with an ellipsis row', () => {
    const prompt = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join('\n');
    Vitest.expect(clipRunPrompt(prompt, 20, 6)).toBe(
      'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\n…',
    );
  });

  Vitest.it('counts wrapped rows, so a long line cannot overflow the pane', () => {
    // One 100-char line at 20 columns wraps to five rows, so a six-row
    // pane fits one line and an ellipsis — not three.
    const prompt = `${'x'.repeat(100)}\n${'y'.repeat(100)}\n${'z'.repeat(100)}`;
    Vitest.expect(clipRunPrompt(prompt, 20, 6).split('\n')).toStrictEqual(['x'.repeat(100), '…']);
  });

  Vitest.it('always leaves an ellipsis when nothing fits', () => {
    Vitest.expect(clipRunPrompt('a long first line', 10, 0)).toBe('…');
  });
});

Vitest.describe('runPromptRows', () => {
  Vitest.it('counts one row per source line when lines fit the pane', () => {
    Vitest.expect(runPromptRows('one\ntwo\nthree', 40, 10)).toBe(3);
  });

  Vitest.it('counts the wrapped rows a long line really takes', () => {
    Vitest.expect(runPromptRows('x'.repeat(100), 20, 10)).toBe(5);
  });

  Vitest.it('never exceeds the cap', () => {
    Vitest.expect(runPromptRows('x'.repeat(400), 20, 4)).toBe(4);
  });

  Vitest.it('agrees with the clip: the clipped text needs no more rows than the budget', () => {
    const prompt = Array.from({ length: 30 }, () => 'y'.repeat(30)).join('\n');
    const budget = 6;
    const clipped = clipRunPrompt(prompt, 20, budget);
    const rows = runPromptRows(clipped, 20, budget);
    Vitest.expect(rows).toBeLessThanOrEqual(budget);
    Vitest.expect(clipped.endsWith('…')).toBe(true);
  });
});

Vitest.describe('promptWindow', () => {
  const prompt = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n');

  Vitest.it('shows the head of the prompt with nothing hidden above', () => {
    const view = promptWindow(prompt, 20, 4, 0);
    Vitest.expect(view.lines).toStrictEqual(['line 1', 'line 2', 'line 3', 'line 4']);
    Vitest.expect(view.above).toBe(0);
    Vitest.expect(view.below).toBe(16);
    Vitest.expect(view.total).toBe(20);
  });

  Vitest.it('never renders more rows than the pane has — the overflow guard', () => {
    // Twenty 200-char lines at 20 columns would wrap to 200 rows.
    const wide = Array.from({ length: 20 }, () => 'w'.repeat(200)).join('\n');
    const view = promptWindow(wide, 20, 3, 0);
    const rows = view.lines.reduce((sum, line) => sum + Math.ceil(line.length / 20), 0);
    Vitest.expect(rows).toBeLessThanOrEqual(3);
    Vitest.expect(view.below).toBe(view.total - view.above - rows);
  });

  Vitest.it('scrolls by rows and reports the rows hidden above', () => {
    const view = promptWindow(prompt, 20, 3, 5);
    Vitest.expect(view.above).toBe(5);
    Vitest.expect(view.lines[0]).toBe('line 6');
  });

  Vitest.it('starts at a whole line even when the offset lands mid-wrap', () => {
    const wrapped = 'x'.repeat(45);
    const view = promptWindow(wrapped, 20, 3, 1);
    Vitest.expect(view.lines).toStrictEqual([wrapped]);
    Vitest.expect(view.above).toBe(0);
  });

  Vitest.it('clamps a scroll past the end to the last window', () => {
    const view = promptWindow(prompt, 20, 3, 999);
    Vitest.expect(view.above).toBe(17);
    Vitest.expect(view.lines).toStrictEqual(['line 18', 'line 19', 'line 20']);
    Vitest.expect(view.below).toBe(0);
  });
});

Vitest.describe('prompt pane sizing', () => {
  Vitest.it('drops the pane below 20 rows and keeps it above', () => {
    Vitest.expect(showsPromptPane(19)).toBe(false);
    Vitest.expect(showsPromptPane(26)).toBe(true);
  });

  Vitest.it('sizes the pane to a short prompt, borders included', () => {
    // One row of text, the panel's two borders, and its hint footer.
    Vitest.expect(promptPaneRows(26, 120, 'fix the race')).toBe(4);
  });

  Vitest.it('caps a specification-sized prompt and grows with the terminal', () => {
    const prompt = Array.from({ length: 60 }, () => 'y'.repeat(120)).join('\n');
    Vitest.expect(promptPaneRows(40, 160, prompt)).toBe(promptPaneTextRows(40) + 3);
    Vitest.expect(promptPaneTextRows(40)).toBe(14);
  });

  Vitest.it('gives the transcript the rows the prompt pane did not take', () => {
    const prompt = 'fix the race';
    // Short terminal: no prompt pane, so the transcript keeps height - 8.
    Vitest.expect(detailBodyRows(19, 120, prompt)).toBe(11);
    // Tall terminal: the 4-row prompt pane comes straight off the budget.
    Vitest.expect(detailBodyRows(26, 120, prompt)).toBe(14);
  });

  Vitest.it('never lets the transcript budget fall below five rows', () => {
    Vitest.expect(detailBodyRows(20, 120, 'y'.repeat(4000))).toBeGreaterThanOrEqual(5);
  });

  Vitest.it('leaves the prompt pane at least the column floor on a narrow terminal', () => {
    Vitest.expect(promptPaneColumns(60)).toBe(24);
  });
});

Vitest.describe('clipRunMetaValue', () => {
  Vitest.it('leaves short values alone and ellipsizes long ones', () => {
    Vitest.expect(clipRunMetaValue('short', 10)).toBe('short');
    const clipped = clipRunMetaValue('x'.repeat(20), 10);
    Vitest.expect(clipped).toHaveLength(10);
    Vitest.expect(clipped.endsWith('…')).toBe(true);
  });
});

Vitest.describe('shortRunTimestamp', () => {
  Vitest.it('drops the seconds and keeps the date readable', () => {
    Vitest.expect(shortRunTimestamp('2026-01-01T10:04:12.000Z')).toBe('2026-01-01 10:04');
  });

  Vitest.it('returns anything unparseable as-is', () => {
    Vitest.expect(shortRunTimestamp('yesterday')).toBe('yesterday');
  });
});

Vitest.describe('runMetaRows', () => {
  Vitest.it('lists the sidebar metadata in display order', () => {
    Vitest.expect(runMetaRows(detail('running', []).summary).map((row) => row.label)).toStrictEqual(
      ['model', 'spec', 'thinking', 'tools', 'created', 'updated', 'id'],
    );
  });

  Vitest.it('keeps unset rows with a placeholder so labels never reflow', () => {
    const rows = runMetaRows(detail('running', []).summary);
    Vitest.expect(rows.find((row) => row.label === 'spec')?.value).toBe(RUN_META_NONE);
    Vitest.expect(rows.find((row) => row.label === 'thinking')?.value).toBe(RUN_META_NONE);
    Vitest.expect(rows.find((row) => row.label === 'tools')?.value).toBe(RUN_META_NONE);
    Vitest.expect(rows.find((row) => row.label === 'model')?.value).toBe('anthropic/claude');
    Vitest.expect(rows.find((row) => row.label === 'id')?.value).toBe('run-1');
  });

  Vitest.it('joins the tool allowlist and shows the pins the run carries', () => {
    const summary = { ...detail('running', []).summary, thinking: 'high', tools: ['read', 'edit'] };
    const rows = runMetaRows(summary);
    Vitest.expect(rows.find((row) => row.label === 'thinking')?.value).toBe('high');
    Vitest.expect(rows.find((row) => row.label === 'tools')?.value).toBe('read, edit');
  });

  Vitest.it('keeps every row on one line inside the sidebar column', () => {
    const summary = {
      ...detail('running', []).summary,
      model: 'anthropic/claude-sonnet-4-with-a-very-long-provider-prefix',
    };
    for (const row of runMetaRows(summary))
      Vitest.expect(`${row.label} ${row.value}`.length).toBeLessThanOrEqual(RUN_META_COLUMNS);
  });
});
