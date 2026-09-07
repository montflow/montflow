import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Skill from '../index.js';

const skillInput = (
  id: string,
  dependencies: ReadonlyArray<string> = [],
  name?: string,
): Record<string, unknown> => ({
  id,
  name: name ?? id,
  description: `${id} description.`,
  groups: [],
  dependencies: [...dependencies],
  body: `${id} body.`,
});

const installedEffect = Effect.all([
  Skill.decodeUnknown(skillInput('authoring-skills', ['executing-skills'])),
  Skill.decodeUnknown(skillInput('executing-skills')),
  Skill.decodeUnknown(skillInput('unrelated')),
]);

Vitest.describe('Skill.checkRequirements', () => {
  Vitest.it.effect('marks installed and missing names', () =>
    Effect.gen(function* () {
      const installed = yield* installedEffect;
      Vitest.expect(
        Skill.checkRequirements(installed, ['authoring-skills', 'modifying-skills']),
      ).toStrictEqual([
        { name: 'authoring-skills', present: true },
        { name: 'modifying-skills', present: false },
      ]);
    }),
  );

  Vitest.it.effect('matches frontmatter names as well as directory ids', () =>
    Effect.gen(function* () {
      const installed = yield* installedEffect;
      const renamed = yield* Skill.decodeUnknown(skillInput('some-dir', [], 'Custom Name'));
      Vitest.expect(
        Skill.checkRequirements([...installed, renamed], ['Custom Name']),
      ).toStrictEqual([{ name: 'Custom Name', present: true }]);
    }),
  );
});

Vitest.describe('Skill.missingRequirements', () => {
  Vitest.it.effect('returns only missing names in order', () =>
    Effect.gen(function* () {
      const installed = yield* installedEffect;
      const statuses = Skill.checkRequirements(installed, [
        'authoring-skills',
        'modifying-skills',
        'grilling',
      ]);
      Vitest.expect(Skill.missingRequirements(statuses)).toStrictEqual([
        'modifying-skills',
        'grilling',
      ]);
    }),
  );
});

Vitest.describe('Skill.resolveInjection', () => {
  Vitest.it.effect('orders dependencies first and dedupes', () =>
    Effect.gen(function* () {
      const installed = yield* installedEffect;
      const resolved = Skill.resolveInjection(installed, ['authoring-skills', 'executing-skills']);
      Vitest.expect(resolved.map((skill) => skill.id)).toStrictEqual([
        'executing-skills',
        'authoring-skills',
      ]);
    }),
  );

  Vitest.it.effect('skips missing names', () =>
    Effect.gen(function* () {
      const installed = yield* installedEffect;
      const resolved = Skill.resolveInjection(installed, ['modifying-skills', 'unrelated']);
      Vitest.expect(resolved.map((skill) => skill.id)).toStrictEqual(['unrelated']);
    }),
  );
});

Vitest.describe('Skill.formatInjectedSkills', () => {
  Vitest.it.effect('renders names, descriptions, and bodies', () =>
    Effect.gen(function* () {
      const authoring = yield* Skill.decodeUnknown(skillInput('authoring-skills'));
      const section = Skill.formatInjectedSkills([authoring]);
      Vitest.expect(section).toContain('### authoring-skills — authoring-skills description.');
      Vitest.expect(section).toContain('authoring-skills body.');
    }),
  );

  Vitest.it('renders empty when none', () => {
    Vitest.expect(Skill.formatInjectedSkills([])).toBe('');
  });
});
