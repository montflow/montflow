import * as Vitest from '@effect/vitest';
import * as Memory from '../index.js';

const goodMemory = [
  '# Memory',
  '',
  '## Context',
  '',
  'x',
  '',
  '## Progress',
  '',
  'x',
  '',
  '## Open Questions',
  '',
  'x',
  '',
  '## Handoff',
  '',
  'x',
  '',
  '## Deviations',
  '',
  'x',
  '',
].join('\n');

Vitest.describe('Memory.verifyMemoryFile runtime', () => {
  Vitest.it('accepts the template sections', () => {
    Vitest.expect(Memory.verifyMemoryFile(goodMemory)).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('allows extra sections like the review loop counter', () => {
    const withCounter = `${goodMemory}\n## Review Loop Counter\n\n2\n`;
    Vitest.expect(Memory.verifyMemoryFile(withCounter).valid).toBe(true);
  });

  Vitest.it('flags an empty file', () => {
    Vitest.expect(Memory.verifyMemoryFile('')).toStrictEqual({
      valid: false,
      issues: [{ field: 'body', message: 'MEMORY.md is empty.' }],
    });
  });

  Vitest.it('flags a missing title and sections', () => {
    const result = Memory.verifyMemoryFile('## Progress\n\nx\n');
    Vitest.expect(result.issues.map((found) => found.field)).toStrictEqual([
      'title',
      'body',
      'body',
      'body',
      'body',
    ]);
  });
});
