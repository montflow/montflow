import * as Vitest from '@effect/vitest';
import * as AgentRun from '../index.js';

Vitest.describe('AgentRun.buildPrompt', () => {
  Vitest.it('joins preprompt, prompt, and postprompt with blank lines', () => {
    Vitest.expect(
      AgentRun.buildPrompt({ preprompt: 'Be brief.', prompt: 'Do it.', postprompt: 'Reply done.' }),
    ).toBe('Be brief.\n\nDo it.\n\nReply done.');
  });

  Vitest.it('drops blank parts', () => {
    Vitest.expect(AgentRun.buildPrompt({ preprompt: '', prompt: 'Do it.', postprompt: '  ' })).toBe(
      'Do it.',
    );
  });
});
