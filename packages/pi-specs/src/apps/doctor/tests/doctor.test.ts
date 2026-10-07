import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { CREATE_SPEC_SKILL_NAME, FIND_SPECS_SKILL_NAME, runDoctor, runDoctorAt } from '../index.js';

const freshRoot = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'pi-specs-doctor-'));

const installedSkillFile = (root: string, name: string): string =>
  NodePath.join(root, '.agents', 'skills', name, 'SKILL.md');

Vitest.describe('runDoctor', () => {
  Vitest.it.effect('installs every shipped skill and is idempotent', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const first = yield* runDoctor(root);
      Vitest.expect(first.status).toBe('installed');
      Vitest.expect(first.skills.map((skill) => skill.name)).toStrictEqual([
        CREATE_SPEC_SKILL_NAME,
        FIND_SPECS_SKILL_NAME,
      ]);
      Vitest.expect(
        Fs.readFileSync(installedSkillFile(root, CREATE_SPEC_SKILL_NAME), 'utf-8'),
      ).toContain(`name: ${CREATE_SPEC_SKILL_NAME}`);
      Vitest.expect(
        Fs.readFileSync(installedSkillFile(root, FIND_SPECS_SKILL_NAME), 'utf-8'),
      ).toContain(`name: ${FIND_SPECS_SKILL_NAME}`);
      Vitest.expect(
        Fs.existsSync(
          NodePath.join(root, '.agents', 'skills', CREATE_SPEC_SKILL_NAME, 'CHANGELOG.md'),
        ),
      ).toBe(true);
      Vitest.expect(
        Fs.existsSync(
          NodePath.join(root, '.agents', 'skills', FIND_SPECS_SKILL_NAME, 'CHANGELOG.md'),
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
      Vitest.expect(Fs.existsSync(installedSkillFile(root, CREATE_SPEC_SKILL_NAME))).toBe(true);
      Vitest.expect(Fs.existsSync(installedSkillFile(root, FIND_SPECS_SKILL_NAME))).toBe(true);
    }),
  );
});
