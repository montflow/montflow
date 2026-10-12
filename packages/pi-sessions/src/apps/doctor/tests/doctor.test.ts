import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { SessionRunner, type SessionRunnerImpl } from '../../../services/index.js';
import { execute } from '../../commands/index.js';
import { doctor, SESSION_SKILL_NAME } from '../index.js';

const freshRoot = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'pi-sessions-doctor-'));

const installedSkillFile = (root: string): string =>
  NodePath.join(root, '.agents', 'skills', SESSION_SKILL_NAME, 'SKILL.md');

const fakeSessionRunner = (): Layer.Layer<SessionRunner> =>
  Layer.succeed(SessionRunner, {
    start: () => Effect.fail('unused'),
    resume: () => Effect.fail('unused'),
    steer: () => Effect.void,
    answer: () => Effect.void,
    interrupt: () => Effect.void,
    detail: () => Effect.fail('unused'),
    verify: () => Effect.fail('unused'),
    verifyStore: () => Effect.succeed({ ignored: true, issues: [] }),
    progress: () => Effect.void,
    list: () => Effect.succeed([]),
    liveSessionIds: () => Effect.succeed(new Set()),
  } satisfies SessionRunnerImpl);

Vitest.describe('doctor runtime', () => {
  Vitest.it.effect('installs the dispatch skill and is idempotent', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const first = yield* doctor(root);
      Vitest.expect(first.status).toBe('installed');
      Vitest.expect(Fs.existsSync(installedSkillFile(root))).toBe(true);
      Vitest.expect(Fs.readFileSync(installedSkillFile(root), 'utf-8')).toContain(
        `name: ${SESSION_SKILL_NAME}`,
      );
      Vitest.expect(
        Fs.existsSync(NodePath.join(root, '.agents', 'skills', SESSION_SKILL_NAME, 'CHANGELOG.md')),
      ).toBe(true);

      const second = yield* doctor(root);
      Vitest.expect(second.status).toBe('present');
    }),
  );

  Vitest.it.effect('reports installed for a repo that already has the skill', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* doctor(root);
      const text = yield* execute({ kind: 'Doctor', check: false }, root).pipe(
        Effect.provide(fakeSessionRunner()),
      );
      Vitest.expect(text).toBe(
        `Session skill '${SESSION_SKILL_NAME}' is installed at ${NodePath.join(root, '.agents', 'skills', SESSION_SKILL_NAME)}.`,
      );
    }),
  );
});
