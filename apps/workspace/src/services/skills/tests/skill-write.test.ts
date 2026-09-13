import * as Vitest from '@effect/vitest';
import * as Skills from '../index.js';

const row: Skills.SkillSummary = {
  id: 'code-reviewer',
  name: 'code-reviewer',
  description: 'Reviews code for bugs.',
  groups: ['testing'],
  dependencies: ['executing-skills'],
  body: 'Assume the code is broken.',
};

Vitest.describe('Skills.encodeSummary runtime', () => {
  Vitest.it('round-trips through decodeSummary', () => {
    Vitest.expect(Skills.decodeSummary(row.id, Skills.encodeSummary(row))).toStrictEqual(row);
  });

  Vitest.it('drops empty groups and dependencies keys', () => {
    const encoded = Skills.encodeSummary({ ...row, groups: [], dependencies: [], body: '' });
    Vitest.expect(encoded).toBe(
      '---\nname: code-reviewer\ndescription: Reviews code for bugs.\n---\n',
    );
    Vitest.expect(Skills.decodeSummary(row.id, encoded)).toStrictEqual({
      ...row,
      groups: [],
      dependencies: [],
      body: '',
    });
  });
});

Vitest.describe('Skills.parseModelsStore runtime', () => {
  Vitest.it('flattens provider models into refs', () => {
    Vitest.expect(
      Skills.parseModelsStore(
        JSON.stringify({
          google: { models: [{ id: 'gemini-3-flash' }, { id: '' }, 'nope'] },
          anthropic: { models: [{ id: 'claude-sonnet-4-5' }] },
          broken: { models: 'nope' },
        }),
      ),
    ).toStrictEqual([
      { provider: 'google', id: 'gemini-3-flash' },
      { provider: 'anthropic', id: 'claude-sonnet-4-5' },
    ]);
  });

  Vitest.it('reads malformed input as empty', () => {
    Vitest.expect(Skills.parseModelsStore('not json')).toStrictEqual([]);
    Vitest.expect(Skills.parseModelsStore('[]')).toStrictEqual([]);
  });
});

Vitest.describe('Skills.parseDefaultModel runtime', () => {
  Vitest.it('reads the provider/model pair', () => {
    Vitest.expect(
      Skills.parseDefaultModel(
        JSON.stringify({ defaultProvider: 'opencode-go', defaultModel: 'muse-spark' }),
      ),
    ).toStrictEqual({ provider: 'opencode-go', id: 'muse-spark' });
  });

  Vitest.it('reads missing pairs and malformed input as undefined', () => {
    Vitest.expect(Skills.parseDefaultModel('not json')).toBeUndefined();
    Vitest.expect(Skills.parseDefaultModel('{}')).toBeUndefined();
    Vitest.expect(Skills.parseDefaultModel(JSON.stringify({ defaultModel: 'x' }))).toBeUndefined();
    Vitest.expect(
      Skills.parseDefaultModel(JSON.stringify({ defaultProvider: 'p', defaultModel: '' })),
    ).toBeUndefined();
  });
});

Vitest.describe('Skills.headlessArgs runtime', () => {
  Vitest.it('pins the model and scopes tools ephemerally', () => {
    Vitest.expect(Skills.headlessArgs('do it', 'google/gemini-3-flash')).toStrictEqual([
      '-p',
      '--no-session',
      '--tools',
      'read,write,edit',
      '--model',
      'google/gemini-3-flash',
      'do it',
    ]);
  });

  Vitest.it('omits the model flag for the session default', () => {
    Vitest.expect(Skills.headlessArgs('do it', undefined)).toStrictEqual([
      '-p',
      '--no-session',
      '--tools',
      'read,write,edit',
      'do it',
    ]);
  });
});

Vitest.describe('Skills.buildHeadlessPrompt runtime', () => {
  Vitest.it('joins blank-separated parts and drops blanks', () => {
    Vitest.expect(Skills.buildHeadlessPrompt('pre', 'prompt', '')).toBe('pre\n\nprompt');
  });
});

Vitest.describe('Skills.installArgsFor runtime', () => {
  Vitest.it('installs named skills project-local and non-interactive', () => {
    Vitest.expect(Skills.installArgsFor(['authoring-skills'])).toStrictEqual([
      'skills',
      'add',
      'montflow/montflow',
      '-s',
      'authoring-skills',
      '-a',
      'pi',
      '-y',
    ]);
  });
});
