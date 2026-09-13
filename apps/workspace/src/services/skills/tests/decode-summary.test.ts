import * as Vitest from '@effect/vitest';
import * as Skills from '../index.js';

const file = (): string =>
  [
    '---',
    'name: Cooking Pasta',
    'description: al dente timing',
    'groups:',
    '  - cooking',
    'dependencies:',
    '  - boiling-water',
    '---',
    '',
    'Salt the water.',
  ].join('\n');

Vitest.describe('Skills.decodeSummary runtime', () => {
  Vitest.it('decodes frontmatter plus body', () => {
    Vitest.expect(Skills.decodeSummary('cooking-pasta', file())).toStrictEqual({
      id: 'cooking-pasta',
      name: 'Cooking Pasta',
      description: 'al dente timing',
      groups: ['cooking'],
      dependencies: ['boiling-water'],
      body: 'Salt the water.',
    });
  });

  Vitest.it('falls back to the directory name', () => {
    const summary = Skills.decodeSummary('plain', '---\n---\nbody');
    Vitest.expect(summary?.name).toStrictEqual('plain');
    Vitest.expect(summary?.description).toStrictEqual('');
  });

  Vitest.it('folds block scalar descriptions', () => {
    const summary = Skills.decodeSummary(
      'effect-testing',
      ['---', 'description: >-', '  Writes unit tests', '  for modules', '---', '', 'Body'].join(
        '\n',
      ),
    );
    Vitest.expect(summary?.description).toStrictEqual('Writes unit tests for modules');
  });

  Vitest.it('skips files without frontmatter', () => {
    Vitest.expect(Skills.decodeSummary('broken', 'no frontmatter')).toStrictEqual(undefined);
  });
});
