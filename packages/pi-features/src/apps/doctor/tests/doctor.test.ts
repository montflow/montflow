import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { CREATE_FEATURE_SKILL_NAME, runDoctor, runDoctorAt } from '../index.js';

const freshRoot = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'pi-features-doctor-'));

const installedSkillFile = (root: string): string =>
  NodePath.join(root, '.agents', 'skills', CREATE_FEATURE_SKILL_NAME, 'SKILL.md');

Vitest.describe('runDoctor', () => {
  Vitest.it.effect('installs the creation skill and is idempotent', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const first = yield* runDoctor(root);
      Vitest.expect(first.status).toBe('installed');
      Vitest.expect(Fs.existsSync(installedSkillFile(root))).toBe(true);
      Vitest.expect(Fs.readFileSync(installedSkillFile(root), 'utf-8')).toContain(
        `name: ${CREATE_FEATURE_SKILL_NAME}`,
      );
      Vitest.expect(
        Fs.existsSync(
          NodePath.join(root, '.agents', 'skills', CREATE_FEATURE_SKILL_NAME, 'CHANGELOG.md'),
        ),
      ).toBe(true);

      const second = yield* runDoctor(root);
      Vitest.expect(second.status).toBe('present');
    }),
  );

  Vitest.it.effect('resolves the repo root from a nested directory', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      Fs.mkdirSync(NodePath.join(root, '.git'));
      const nested = NodePath.join(root, 'a', 'b');
      Fs.mkdirSync(nested, { recursive: true });

      const result = yield* runDoctorAt(nested);
      Vitest.expect(result.status).toBe('installed');
      Vitest.expect(Fs.existsSync(installedSkillFile(root))).toBe(true);
    }),
  );
});
