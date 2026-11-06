import * as Vitest from '@effect/vitest';

import {
  CHANNEL_CODES,
  appendChannelEntry,
  parseChannel,
  renderChannelEntry,
  verifyChannel,
} from '../channel.module.js';
import type { Issue } from '../../verify/index.js';

const ids = (...values: ReadonlyArray<string>): ReadonlySet<string> => new Set(values);

/** One valid entry heading, with the middle dot the grammar requires. */
const entry = (at: string, to: string, from = 'orchestrator', body = 'A fact.'): string =>
  `## ${at} \u00b7 from ${from} \u00b7 to ${to}\n\n${body}\n`;

const codesOf = (issues: ReadonlyArray<Issue>): ReadonlyArray<string | undefined> =>
  issues.map((found) => found.code);

const fieldOf = (issues: ReadonlyArray<Issue>, code: string): string | undefined =>
  issues.find((found) => found.code === code)?.field;

Vitest.describe('Channel.parseChannel runtime', () => {
  Vitest.it('parses timestamp, from, to, and body', () => {
    const parsed = parseChannel(
      'board',
      `# Board\n\n${entry('2026-11-02T21:15:00Z', 'all', 'B004', 'Line one.\n\nLine two.')}`,
    );
    Vitest.expect(parsed.issues).toStrictEqual([]);
    Vitest.expect(parsed.entries).toHaveLength(1);
    Vitest.expect(parsed.entries[0]).toMatchObject({
      at: '2026-11-02T21:15:00Z',
      from: 'B004',
      to: 'all',
      body: 'Line one.\n\nLine two.',
      line: 3,
    });
  });

  Vitest.it('reports a malformed entry with its line and field', () => {
    const parsed = parseChannel(
      'board',
      ['# Board', '', '## not an entry', '', 'Body.', ''].join('\n'),
    );
    Vitest.expect(codesOf(parsed.issues)).toContain(CHANNEL_CODES.boardMalformedEntry);
    const found = parsed.issues.find((issue) => issue.code === CHANNEL_CODES.boardMalformedEntry);
    Vitest.expect(found?.line).toBe(3);
    Vitest.expect(found?.field).toBe('BOARD.md:3');
    Vitest.expect(found?.message).toContain('line 3');
  });

  Vitest.it('reports a malformed title at the first non-blank line', () => {
    const parsed = parseChannel('mailbox', ['', '# Nope', ''].join('\n'));
    Vitest.expect(codesOf(parsed.issues)).toContain(CHANNEL_CODES.mailMalformedTitle);
    Vitest.expect(parsed.issues[0]?.field).toBe('MAILBOX.md:2');
  });

  Vitest.it('reports an empty body and stray content with lines', () => {
    const empty = parseChannel(
      'board',
      ['# Board', '', '## 2026-11-02T21:15:00Z \u00b7 from B004 \u00b7 to all', ''].join('\n'),
    );
    Vitest.expect(codesOf(empty.issues)).toContain(CHANNEL_CODES.boardEmptyEntry);

    const stray = parseChannel(
      'mailbox',
      ['# Mailbox', '', 'orphan prose', '', entry('2026-11-02T21:15:00Z', 'A001')].join('\n'),
    );
    Vitest.expect(codesOf(stray.issues)).toContain(CHANNEL_CODES.mailStrayContent);
    Vitest.expect(fieldOf(stray.issues, CHANNEL_CODES.mailStrayContent)).toBe('MAILBOX.md:3');
  });

  Vitest.it('reports an entry earlier than the previous one', () => {
    const parsed = parseChannel(
      'board',
      `# Board\n\n${entry('2026-11-02T21:15:00Z', 'all')}\n${entry('2026-11-02T21:14:00Z', 'all')}`,
    );
    Vitest.expect(codesOf(parsed.issues)).toContain(CHANNEL_CODES.boardOutOfOrder);
    Vitest.expect(parsed.issues[0]?.field).toBe('BOARD.md:7');
  });
});

Vitest.describe('Channel.verifyChannel runtime', () => {
  Vitest.it('rejects a board target that is not all, naming the line', () => {
    const result = verifyChannel('board', `# Board\n\n${entry('2026-11-02T21:15:00Z', 'A001')}`, {
      taskIds: ids('A001'),
    });
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(codesOf(result.issues)).toContain(CHANNEL_CODES.boardTargetInvalid);
    Vitest.expect(result.issues[0]?.field).toBe('BOARD.md:3');
  });

  Vitest.it('rejects an unknown board author by name', () => {
    const result = verifyChannel(
      'board',
      `# Board\n\n${entry('2026-11-02T21:15:00Z', 'all', 'Z999')}`,
      { taskIds: ids('A001') },
    );
    Vitest.expect(codesOf(result.issues)).toContain(CHANNEL_CODES.boardUnknownAuthor);
    Vitest.expect(result.issues[0]?.message).toContain("'Z999'");
    Vitest.expect(result.issues[0]?.field).toBe('BOARD.md:3');
  });

  Vitest.it('rejects an unknown mailbox recipient by name', () => {
    const result = verifyChannel(
      'mailbox',
      `# Mailbox\n\n${entry('2026-11-02T21:15:00Z', 'Z999')}`,
      { taskIds: ids('A001'), owner: 'A001' },
    );
    Vitest.expect(codesOf(result.issues)).toContain(CHANNEL_CODES.mailUnknownRecipient);
    Vitest.expect(result.issues[0]?.message).toContain("'Z999'");
    Vitest.expect(result.issues[0]?.field).toBe('MAILBOX.md:3');
  });

  Vitest.it('rejects a foreign addressee, an unknown sender, and a self-addressed entry', () => {
    const foreign = verifyChannel(
      'mailbox',
      `# Mailbox\n\n${entry('2026-11-02T21:15:00Z', 'A002')}`,
      { taskIds: ids('A001', 'A002', 'B001'), owner: 'A001' },
    );
    Vitest.expect(codesOf(foreign.issues)).toContain(CHANNEL_CODES.mailRecipientMismatch);

    const sender = verifyChannel(
      'mailbox',
      `# Mailbox\n\n${entry('2026-11-02T21:15:00Z', 'A001', 'Z999')}`,
      { taskIds: ids('A001'), owner: 'A001' },
    );
    Vitest.expect(codesOf(sender.issues)).toContain(CHANNEL_CODES.mailUnknownSender);

    const self = verifyChannel(
      'mailbox',
      `# Mailbox\n\n${entry('2026-11-02T21:15:00Z', 'A001', 'A001')}`,
      { taskIds: ids('A001'), owner: 'A001' },
    );
    Vitest.expect(codesOf(self.issues)).toContain(CHANNEL_CODES.mailSelfAddressed);
  });

  Vitest.it('accepts the orchestrator as a sender and a known task as an addressee', () => {
    const result = verifyChannel(
      'mailbox',
      `# Mailbox\n\n${entry('2026-11-02T21:15:00Z', 'A001')}`,
      { taskIds: ids('A001'), owner: 'A001' },
    );
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.valid).toBe(true);
  });
});

Vitest.describe('Channel writer runtime', () => {
  Vitest.it('renders the heading, a blank line, the body, and a blank line', () => {
    Vitest.expect(
      renderChannelEntry({
        at: '2026-11-02T21:15:00Z',
        from: 'orchestrator',
        to: 'A001',
        text: 'Question.',
      }),
    ).toBe('## 2026-11-02T21:15:00Z \u00b7 from orchestrator \u00b7 to A001\n\nQuestion.\n');
  });

  Vitest.it('creates the title and keeps the previous contents as a prefix', () => {
    const first = appendChannelEntry('board', undefined, {
      at: '2026-11-02T21:15:00Z',
      from: 'orchestrator',
      to: 'all',
      text: 'First.',
    });
    Vitest.expect(first.startsWith('# Board\n\n')).toBe(true);
    const second = appendChannelEntry('board', first, {
      at: '2026-11-02T21:16:00Z',
      from: 'orchestrator',
      to: 'all',
      text: 'Second.',
    });
    Vitest.expect(second.startsWith(first)).toBe(true);
    Vitest.expect(parseChannel('board', second).issues).toStrictEqual([]);
    Vitest.expect(parseChannel('board', second).entries).toHaveLength(2);
  });
});
