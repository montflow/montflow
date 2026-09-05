import * as Vitest from '@effect/vitest';
import * as AgentRun from '../index.js';

Vitest.describe('AgentRun.finalText', () => {
  Vitest.it('returns the last non-blank assistant text', () => {
    Vitest.expect(
      AgentRun.finalText([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: [{ type: 'text', text: 'First.' }] },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', text: 'hmm' },
            { type: 'text', text: 'Last.' },
          ],
        },
      ]),
    ).toBe('Last.');
  });

  Vitest.it('returns undefined when the agent never answers', () => {
    Vitest.expect(AgentRun.finalText([{ role: 'user', content: 'hi' }])).toBeUndefined();
    Vitest.expect(
      AgentRun.finalText([{ role: 'assistant', content: [{ type: 'text', text: '  ' }] }]),
    ).toBeUndefined();
  });
});
