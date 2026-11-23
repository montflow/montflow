import * as Vitest from '@effect/vitest';
import * as Dispatch from '../index.js';

Vitest.describe('plan', () => {
  Vitest.it('claude-code: print mode, prompt on stdin', () => {
    const plan = Dispatch.plan(
      { harness: 'claude-code', model: 'opus', effort: 'xhigh' },
      'P',
      'write',
    );
    Vitest.expect([plan.binary, ...plan.args]).toEqual([
      'claude',
      '-p',
      '--model',
      'opus',
      '--effort',
      'xhigh',
      '--permission-mode',
      'auto',
    ]);
    Vitest.expect(plan.stdin).toBe('P');
    Vitest.expect(plan.env).toEqual({ MF_MODE_HARNESS: 'claude-code' });
    Vitest.expect(
      Dispatch.plan({ harness: 'claude-code', model: 'opus' }, 'P', 'read-only').args.at(-1),
    ).toBe('plan');
  });

  Vitest.it('codex: exec with a sandbox, prompt on stdin', () => {
    const plan = Dispatch.plan(
      { harness: 'codex', model: 'gpt-5.5', effort: 'high' },
      'P',
      'read-only',
    );
    Vitest.expect([plan.binary, ...plan.args]).toEqual([
      'codex',
      'exec',
      '--model',
      'gpt-5.5',
      '--config',
      'model_reasoning_effort="high"',
      '--sandbox',
      'read-only',
      '-',
    ]);
    Vitest.expect(plan.stdin).toBe('P');
  });

  Vitest.it('opencode: the effort is the model variant, prompt as the message', () => {
    const plan = Dispatch.plan(
      { harness: 'opencode', model: 'openai/gpt-5.5', effort: 'high' },
      'P',
      'write',
    );
    Vitest.expect([plan.binary, ...plan.args]).toEqual([
      'opencode',
      'run',
      '--model',
      'openai/gpt-5.5#high',
      '--auto',
      'P',
    ]);
    Vitest.expect(plan.stdin).toBeUndefined();
    Vitest.expect(
      Dispatch.plan({ harness: 'opencode', model: 'openai/gpt-5.5' }, 'P', 'read-only').args,
    ).toContain('plan');
  });

  Vitest.it('pi: print mode with thinking, read-only tools when asked', () => {
    const plan = Dispatch.plan(
      { harness: 'pi', model: 'openai/gpt-5.5', effort: 'high' },
      'P',
      'read-only',
    );
    Vitest.expect([plan.binary, ...plan.args]).toEqual([
      'pi',
      '-p',
      '--model',
      'openai/gpt-5.5',
      '--thinking',
      'high',
      '--tools',
      'read,grep,find,ls',
      'P',
    ]);
  });
});

Vitest.describe('describe and prompt', () => {
  Vitest.it('replaces the prompt with a placeholder and quotes odd args', () => {
    const text = 'a long brief';
    const codex = Dispatch.plan(
      { harness: 'codex', model: 'gpt-5.5', effort: 'low' },
      text,
      'write',
    );
    Vitest.expect(Dispatch.describe(codex, text)).toBe(
      `codex exec --model gpt-5.5 --config 'model_reasoning_effort="low"' --sandbox workspace-write - < <brief>`,
    );
    const opencode = Dispatch.plan({ harness: 'opencode', model: 'openai/gpt-5.5' }, text, 'write');
    Vitest.expect(Dispatch.describe(opencode, text)).toBe(
      'opencode run --model openai/gpt-5.5 --auto <brief>',
    );
  });

  Vitest.it('strips frontmatter and puts the profile before the task', () => {
    Vitest.expect(Dispatch.body('---\nname: x\n---\n# X\n\nBody\n')).toBe('# X\n\nBody');
    Vitest.expect(Dispatch.prompt('# X', ' do it \n')).toBe('# X\n\n---\n\n# Task\n\ndo it\n');
    Vitest.expect(Dispatch.prompt(undefined, ' do it \n')).toBe('do it');
  });
});
