import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Engines from '../engines.apps.module.js';
import * as Renderers from '../renderers.apps.module.js';

/** A throwaway workspace root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-skills-eng-'));

const cleanup = (root: string): Effect.Effect<void> =>
  Effect.promise(() => rm(root, { recursive: true, force: true }));

/** A body carrying the three sections the verifier requires. */
const BODY = '# When To Use\n\ndemo.\n\n# Pipeline\n\n1. do it.\n\n# Reference\n\n- none.\n';

Vitest.describe('Engines.create', () => {
  Vitest.it.effect('writes a SKILL.md that verifies clean, filling id/author/version', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const skill = yield* Engines.create(
        { cwd: root },
        {
          name: 'demo-skill',
          description: 'A demo skill used in tests.',
          body: BODY,
          author: undefined,
          version: undefined,
          license: undefined,
          groups: ['testing'],
          dependencies: [],
        },
      );
      Vitest.expect(skill.id).toBe('demo-skill');
      Vitest.expect(skill.skillId).toMatch(/^[0-9a-f]{16}$/);
      Vitest.expect(skill.author).toBe('montflow');
      Vitest.expect(skill.version).toBe('1.0.0');
      Vitest.expect(skill.license).toBe('MIT');

      const raw = yield* Effect.promise(() =>
        readFile(join(root, '.agents', 'skills', 'demo-skill', 'SKILL.md'), 'utf8'),
      );
      Vitest.expect(raw).toContain('id: ');
      Vitest.expect(raw).toContain('author: montflow');
      Vitest.expect(raw).toContain('version: 1.0.0');

      const report = yield* Engines.verify({ cwd: root }, 'demo-skill');
      Vitest.expect(report.valid).toBe(true);
      Vitest.expect(report.issueCount).toBe(0);
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('rejects a non-slug name', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const error = yield* Engines.create(
        { cwd: root },
        {
          name: 'Not A Slug',
          description: 'x',
          body: BODY,
          author: undefined,
          version: undefined,
          license: undefined,
          groups: [],
          dependencies: [],
        },
      ).pipe(Effect.flip);
      Vitest.expect(error).toContain('Invalid skill name');
      yield* cleanup(root);
    }),
  );
});

Vitest.describe('Engines.list / load / modify / remove', () => {
  Vitest.it.effect('lists, shows, updates, and deletes a skill', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Engines.create(
        { cwd: root },
        {
          name: 'alpha',
          description: 'first',
          body: BODY,
          author: undefined,
          version: undefined,
          license: undefined,
          groups: [],
          dependencies: [],
        },
      );

      const listed = yield* Engines.list({ cwd: root });
      Vitest.expect(listed.map((skill) => skill.id)).toStrictEqual(['alpha']);
      Vitest.expect(Renderers.list(listed)).toContain('alpha');

      const raw = yield* Engines.load({ cwd: root }, 'alpha');
      Vitest.expect(raw).toBe(Renderers.show(raw));

      const updated = yield* Engines.modify(
        { cwd: root },
        {
          name: 'alpha',
          description: 'changed',
          body: undefined,
          author: undefined,
          version: '1.1.0',
          license: undefined,
          groups: undefined,
          dependencies: undefined,
        },
      );
      Vitest.expect(updated.description).toBe('changed');
      Vitest.expect(updated.version).toBe('1.1.0');
      Vitest.expect(updated.id).toBe('alpha');

      const modified = yield* Engines.list({ cwd: root });
      Vitest.expect(modified[0]?.description).toBe('changed');

      yield* Engines.remove({ cwd: root }, 'alpha');
      Vitest.expect(yield* Engines.list({ cwd: root })).toStrictEqual([]);
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('fails on an unknown skill', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      Vitest.expect(yield* Engines.load({ cwd: root }, 'missing').pipe(Effect.flip)).toBe(
        "Unknown skill 'missing'.",
      );
      Vitest.expect(yield* Engines.remove({ cwd: root }, 'missing').pipe(Effect.flip)).toBe(
        "Unknown skill 'missing'.",
      );
      yield* cleanup(root);
    }),
  );
});

Vitest.describe('Engines.verify', () => {
  Vitest.it.effect('reports malformed files as invalid when verifying every skill', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const dir = join(root, '.agents', 'skills', 'broken');
      yield* Effect.promise(() => mkdir(dir, { recursive: true }));
      yield* Effect.promise(() => writeFile(join(dir, 'SKILL.md'), '# no frontmatter\n', 'utf8'));

      const report = yield* Engines.verify({ cwd: root }, undefined);
      Vitest.expect(report.valid).toBe(false);
      Vitest.expect(report.entries.map((entry) => entry.name)).toStrictEqual(['broken']);
      Vitest.expect(report.issueCount).toBeGreaterThan(0);
      Vitest.expect(Renderers.verify(report)).toContain('frontmatter');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('an explicit unknown name fails', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      Vitest.expect(yield* Engines.verify({ cwd: root }, 'nope').pipe(Effect.flip)).toBe(
        "Unknown skill 'nope'.",
      );
      yield* cleanup(root);
    }),
  );
});
