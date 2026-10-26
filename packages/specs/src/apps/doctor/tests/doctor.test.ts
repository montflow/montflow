import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import {
  CREATE_SPEC_SKILL_NAME,
  FIND_SPECS_SKILL_NAME,
  SPEC_PROMPT_NAMES,
  promptProblem,
  runDoctor,
  runDoctorAt,
} from '../index.js';

const freshRoot = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-specs-doctor-'));

/** The prompt name used for per-file repair tests. */
const CREATE_PROMPT_NAME = SPEC_PROMPT_NAMES[0];

const installedSkillFile = (root: string, name: string): string =>
  NodePath.join(root, '.agents', 'skills', name, 'SKILL.md');

const installedPromptFile = (root: string, name: string): string =>
  NodePath.join(root, '.agents', '@montflow', 'prompts', `${name}.json`);

const PACKAGE_PROMPT_DIR = NodePath.resolve(import.meta.dirname, '..', '..', '..', '..', 'prompts');

const packagedPrompt = (name: string): string =>
  Fs.readFileSync(NodePath.join(PACKAGE_PROMPT_DIR, `${name}.json`), 'utf-8');

/**
 * Prompts doctor does not own, seeded so any read, rewrite, or delete is
 * visible. Deliberately not valid prompt JSON: doctor must not parse them.
 */
const UNRELATED_PROMPTS = {
  'commit.json': 'not JSON, not a prompt, never doctor business\n',
  'effect-review.json': '{ "name": "effect-review", "stale": true }\n',
} as const;

const seedUnrelatedPrompts = (root: string): void => {
  Fs.mkdirSync(NodePath.join(root, '.agents', '@montflow', 'prompts'), { recursive: true });
  for (const [file, body] of Object.entries(UNRELATED_PROMPTS)) {
    Fs.writeFileSync(NodePath.join(root, '.agents', '@montflow', 'prompts', file), body, 'utf-8');
  }
};

const expectUnrelatedPromptsUntouched = (root: string): void => {
  for (const [file, body] of Object.entries(UNRELATED_PROMPTS)) {
    Vitest.expect(
      Fs.readFileSync(NodePath.join(root, '.agents', '@montflow', 'prompts', file), 'utf-8'),
    ).toBe(body);
  }
};

Vitest.describe('runDoctor', () => {
  Vitest.it.effect('installs every shipped skill and prompt, and is idempotent', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const first = yield* runDoctor(root);
      Vitest.expect(first.status).toBe('installed');
      Vitest.expect(first.skills.map((skill) => skill.name)).toStrictEqual([
        CREATE_SPEC_SKILL_NAME,
        FIND_SPECS_SKILL_NAME,
      ]);
      Vitest.expect(first.prompts.map((prompt) => prompt.name)).toStrictEqual([
        ...SPEC_PROMPT_NAMES,
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
      for (const name of SPEC_PROMPT_NAMES) {
        Vitest.expect(Fs.readFileSync(installedPromptFile(root, name), 'utf-8')).toBe(
          packagedPrompt(name),
        );
      }

      const second = yield* runDoctor(root);
      Vitest.expect(second.status).toBe('present');
      Vitest.expect(second.skills.map((skill) => skill.status)).toStrictEqual([
        'present',
        'present',
      ]);
      Vitest.expect(second.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'present',
        'present',
        'present',
      ]);
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
      for (const name of SPEC_PROMPT_NAMES) {
        Vitest.expect(Fs.existsSync(installedPromptFile(root, name))).toBe(true);
      }
    }),
  );

  Vitest.it.effect('check mode reports drift and never writes', () =>
    Effect.gen(function* () {
      const root = freshRoot();

      const missing = yield* runDoctor(root, { check: true });
      Vitest.expect(missing.status).toBe('drifted');
      Vitest.expect(missing.healthy).toBe(false);
      Vitest.expect(missing.skills.map((skill) => skill.status)).toStrictEqual([
        'missing',
        'missing',
      ]);
      Vitest.expect(missing.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'missing',
        'missing',
        'missing',
      ]);
      Vitest.expect(Fs.existsSync(installedSkillFile(root, CREATE_SPEC_SKILL_NAME))).toBe(false);
      Vitest.expect(Fs.existsSync(NodePath.join(root, '.agents'))).toBe(false);

      yield* runDoctor(root);
      const current = yield* runDoctor(root, { check: true });
      Vitest.expect(current.status).toBe('ok');
      Vitest.expect(current.healthy).toBe(true);
      Vitest.expect(current.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'ok',
        'ok',
        'ok',
      ]);

      Fs.appendFileSync(installedSkillFile(root, CREATE_SPEC_SKILL_NAME), '\nstale\n');
      Fs.appendFileSync(installedPromptFile(root, CREATE_PROMPT_NAME), '\nstale\n');
      const stale = yield* runDoctor(root, { check: true });
      Vitest.expect(stale.status).toBe('drifted');
      Vitest.expect(stale.skills.map((skill) => skill.status)).toStrictEqual(['stale', 'ok']);
      Vitest.expect(stale.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'stale',
        'ok',
        'ok',
      ]);
      Vitest.expect(
        Fs.readFileSync(installedSkillFile(root, CREATE_SPEC_SKILL_NAME), 'utf-8'),
      ).toContain('stale');
      Vitest.expect(
        Fs.readFileSync(installedPromptFile(root, CREATE_PROMPT_NAME), 'utf-8'),
      ).toContain('stale');
    }),
  );

  Vitest.it.effect('installs a missing prompt and leaves unrelated prompts byte-identical', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      seedUnrelatedPrompts(root);

      const result = yield* runDoctor(root);
      Vitest.expect(result.status).toBe('installed');
      Vitest.expect(result.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'installed',
        'installed',
        'installed',
      ]);
      for (const name of SPEC_PROMPT_NAMES) {
        Vitest.expect(Fs.readFileSync(installedPromptFile(root, name), 'utf-8')).toBe(
          packagedPrompt(name),
        );
      }
      expectUnrelatedPromptsUntouched(root);
    }),
  );

  Vitest.it.effect('repairs a stale prompt with the package bytes and keeps the rest', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      seedUnrelatedPrompts(root);

      const name = CREATE_PROMPT_NAME;
      Fs.writeFileSync(installedPromptFile(root, name), '{"name":"spec-create","stale":true}\n');

      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.status).toBe('drifted');
      Vitest.expect(checked.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'stale',
        'ok',
        'ok',
      ]);
      const stale = checked.prompts[0];
      Vitest.expect(stale?.source).toBe(NodePath.join(PACKAGE_PROMPT_DIR, `${name}.json`));
      Vitest.expect(stale?.target).toBe(installedPromptFile(root, name));
      Vitest.expect(Fs.readFileSync(installedPromptFile(root, name), 'utf-8')).toContain('stale');
      expectUnrelatedPromptsUntouched(root);

      const repaired = yield* runDoctor(root);
      Vitest.expect(repaired.status).toBe('installed');
      Vitest.expect(repaired.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'repaired',
        'present',
        'present',
      ]);
      Vitest.expect(Fs.readFileSync(installedPromptFile(root, name), 'utf-8')).toBe(
        packagedPrompt(name),
      );
      expectUnrelatedPromptsUntouched(root);

      const again = yield* runDoctor(root);
      Vitest.expect(again.status).toBe('present');
      Vitest.expect(again.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'present',
        'present',
        'present',
      ]);
    }),
  );

  Vitest.it.effect('reports a current prompt as ok without writing it', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);

      const file = installedPromptFile(root, CREATE_PROMPT_NAME);
      const before = Fs.statSync(file);

      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'ok',
        'ok',
        'ok',
      ]);

      const repaired = yield* runDoctor(root);
      Vitest.expect(repaired.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'present',
        'present',
        'present',
      ]);

      const after = Fs.statSync(file);
      Vitest.expect(after.mtimeMs).toBe(before.mtimeMs);
      Vitest.expect(after.ctimeMs).toBe(before.ctimeMs);
      Vitest.expect(Fs.readFileSync(file, 'utf-8')).toBe(packagedPrompt(CREATE_PROMPT_NAME));
    }),
  );

  Vitest.it.effect('reports an unreadable prompt per file, keeps going, and repairs it', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const target = installedPromptFile(root, CREATE_PROMPT_NAME);
      Fs.chmodSync(target, 0o000);

      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.status).toBe('drifted');
      Vitest.expect(checked.healthy).toBe(false);
      // The other prompt is still reported — the failure never aborts the run.
      Vitest.expect(checked.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'stale',
        'ok',
        'ok',
      ]);
      const stale = checked.prompts[0];
      Vitest.expect(stale?.failure?.code).toBe('doctor.read');
      Vitest.expect(stale?.failure?.path).toBe(target);
      Vitest.expect(stale?.detail).toContain('cannot read');

      const repaired = yield* runDoctor(root);
      Vitest.expect(repaired.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'repaired',
        'present',
        'present',
      ]);
      Vitest.expect(Fs.readFileSync(target, 'utf-8')).toBe(packagedPrompt(CREATE_PROMPT_NAME));
      const again = yield* runDoctor(root, { check: true });
      Vitest.expect(again.status).toBe('ok');
    }),
  );

  Vitest.it.effect('replaces a symlinked prompt without touching its target', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const outside = NodePath.join(root, 'outside.json');
      Fs.writeFileSync(outside, 'do not touch\n', 'utf-8');
      const target = installedPromptFile(root, CREATE_PROMPT_NAME);
      Fs.rmSync(target);
      Fs.symlinkSync(outside, target);

      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.prompts[0]?.status).toBe('stale');
      Vitest.expect(checked.prompts[0]?.detail).toContain('symbolic link');

      const repaired = yield* runDoctor(root);
      Vitest.expect(repaired.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'repaired',
        'present',
        'present',
      ]);
      // The link is replaced, not followed: the file it pointed at is intact.
      Vitest.expect(Fs.readFileSync(outside, 'utf-8')).toBe('do not touch\n');
      Vitest.expect(Fs.lstatSync(target).isSymbolicLink()).toBe(false);
      Vitest.expect(Fs.readFileSync(target, 'utf-8')).toBe(packagedPrompt(CREATE_PROMPT_NAME));
    }),
  );

  Vitest.it.effect('repairs a hand-edited skill and converges on a second check', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const skillFile = installedSkillFile(root, CREATE_SPEC_SKILL_NAME);
      Fs.appendFileSync(skillFile, '\nstale\n');

      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.skills.map((skill) => skill.status)).toStrictEqual(['stale', 'ok']);
      Vitest.expect(checked.skills[0]?.detail).toBe(`'SKILL.md' differs from the package`);

      const repaired = yield* runDoctor(root);
      Vitest.expect(repaired.skills.map((skill) => skill.status)).toStrictEqual([
        'repaired',
        'present',
      ]);
      Vitest.expect(repaired.skills[0]?.detail).toContain('differs from the package');

      const again = yield* runDoctor(root, { check: true });
      Vitest.expect(again.status).toBe('ok');
      Vitest.expect(Fs.readFileSync(skillFile, 'utf-8')).not.toContain('stale');
    }),
  );

  Vitest.it.effect('repairs a partially installed skill and restores the missing file', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const changelog = NodePath.join(
        root,
        '.agents',
        'skills',
        CREATE_SPEC_SKILL_NAME,
        'CHANGELOG.md',
      );
      Fs.rmSync(changelog);

      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.skills[0]?.status).toBe('stale');
      Vitest.expect(checked.skills[0]?.detail).toBe('installed copy is missing: CHANGELOG.md');

      const repaired = yield* runDoctor(root);
      Vitest.expect(repaired.skills[0]?.status).toBe('repaired');
      Vitest.expect(Fs.existsSync(changelog)).toBe(true);
      Vitest.expect((yield* runDoctor(root, { check: true })).status).toBe('ok');
    }),
  );

  Vitest.it.effect('does not write through a symlinked skill directory', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const outside = NodePath.join(root, 'outside-skill');
      Fs.mkdirSync(outside, { recursive: true });
      Fs.writeFileSync(NodePath.join(outside, 'SKILL.md'), 'outside\n', 'utf-8');
      const target = NodePath.join(root, '.agents', 'skills', CREATE_SPEC_SKILL_NAME);
      Fs.mkdirSync(NodePath.dirname(target), { recursive: true });
      Fs.symlinkSync(outside, target);

      // Check mode classifies a condition repair refuses as `blocked`, with the
      // same code and fix, so the report never advertises `mf-specs doctor`.
      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.skills[0]?.status).toBe('blocked');
      Vitest.expect(checked.skills[0]?.failure?.code).toBe('doctor.symlink');
      Vitest.expect(checked.skills[0]?.failure?.fix).toContain('Remove the symlink');
      Vitest.expect(checked.healthy).toBe(false);

      const repaired = yield* runDoctor(root);
      Vitest.expect(repaired.skills[0]?.status).toBe('blocked');
      Vitest.expect(repaired.skills[0]?.failure?.code).toBe('doctor.symlink');
      Vitest.expect(repaired.healthy).toBe(false);
      Vitest.expect(Fs.readFileSync(NodePath.join(outside, 'SKILL.md'), 'utf-8')).toBe('outside\n');
    }),
  );

  Vitest.it.effect('rewrites only the files the package ships and keeps extra files', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const skillDir = NodePath.join(root, '.agents', 'skills', CREATE_SPEC_SKILL_NAME);
      const skillFile = installedSkillFile(root, CREATE_SPEC_SKILL_NAME);
      const notes = NodePath.join(skillDir, 'LOCAL-NOTES.md');
      Fs.writeFileSync(notes, 'hand notes\n', 'utf-8');
      Fs.appendFileSync(skillFile, '\nlocal edit\n');

      const checked = yield* runDoctor(root, { check: true });
      Vitest.expect(checked.skills[0]?.status).toBe('stale');
      Vitest.expect(checked.skills[0]?.detail).toContain('LOCAL-NOTES.md');
      Vitest.expect(Fs.readFileSync(notes, 'utf-8')).toBe('hand notes\n');

      const repaired = yield* runDoctor(root);
      Vitest.expect(repaired.skills[0]?.status).toBe('repaired');
      Vitest.expect(repaired.skills[0]?.detail).toContain('rewrote ');
      Vitest.expect(repaired.skills[0]?.detail).toContain('SKILL.md');
      // The file doctor did not install is still there, byte-identical.
      Vitest.expect(Fs.readFileSync(notes, 'utf-8')).toBe('hand notes\n');
      Vitest.expect(Fs.readFileSync(skillFile, 'utf-8')).not.toContain('local edit');

      const again = yield* runDoctor(root, { check: true });
      Vitest.expect(again.status).toBe('ok');
      Vitest.expect(again.skills[0]?.status).toBe('ok');
      Vitest.expect(Fs.existsSync(notes)).toBe(true);
    }),
  );

  Vitest.it.effect('reports a blocked write with its code and the files already written', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const skillDir = NodePath.join(root, '.agents', 'skills', CREATE_SPEC_SKILL_NAME);
      // A directory where the payload ships a file makes the rename fail after
      // doctor has already written the rest of the skill.
      Fs.rmSync(NodePath.join(skillDir, 'SKILL.md'));
      Fs.mkdirSync(NodePath.join(skillDir, 'SKILL.md'));

      const repaired = yield* runDoctor(root);
      const blocked = repaired.skills[0];
      Vitest.expect(blocked?.status).toBe('blocked');
      Vitest.expect(blocked?.failure?.code).toBe('doctor.write');
      Vitest.expect(blocked?.detail).toContain('already wrote:');
      // The other payloads were still attempted.
      Vitest.expect(repaired.prompts.map((prompt) => prompt.status)).toStrictEqual([
        'present',
        'present',
        'present',
      ]);
    }),
  );

  Vitest.it.effect(
    'reports a file where the prompts directory belongs with the directory path',
    () =>
      Effect.gen(function* () {
        const root = freshRoot();
        Fs.mkdirSync(NodePath.join(root, '.agents', '@montflow'), { recursive: true });
        Fs.writeFileSync(
          NodePath.join(root, '.agents', '@montflow', 'prompts'),
          'occupied\n',
          'utf-8',
        );

        const checked = yield* runDoctor(root, { check: true });
        Vitest.expect(checked.prompts.map((prompt) => prompt.status)).toStrictEqual([
          'blocked',
          'blocked',
          'blocked',
        ]);
        Vitest.expect(checked.prompts[0]?.failure?.code).toBe('doctor.create');

        const repaired = yield* runDoctor(root);
        Vitest.expect(repaired.prompts.map((prompt) => prompt.status)).toStrictEqual([
          'blocked',
          'blocked',
          'blocked',
        ]);
        const failure = repaired.prompts[0]?.failure;
        Vitest.expect(failure?.code).toBe('doctor.create');
        Vitest.expect(failure?.path).toBe(NodePath.join(root, '.agents', '@montflow', 'prompts'));
        Vitest.expect(failure?.problem).toContain("cannot create '");
      }),
  );
});

Vitest.describe('promptProblem', () => {
  Vitest.it.effect('accepts every canonical prompt', () =>
    Effect.gen(function* () {
      for (const name of SPEC_PROMPT_NAMES) {
        Vitest.expect(yield* promptProblem(name, packagedPrompt(name))).toBeUndefined();
      }
    }),
  );

  Vitest.it.effect('rejects an empty file', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* promptProblem(CREATE_PROMPT_NAME, '')).toContain(
        'not valid prompt JSON',
      );
    }),
  );

  Vitest.it.effect('rejects an empty template and a mismatched name', () =>
    Effect.gen(function* () {
      const emptyTemplate = JSON.stringify({
        name: CREATE_PROMPT_NAME,
        description: 'd',
        template: '   ',
        variables: [],
        skills: [],
        model: '',
      });
      Vitest.expect(yield* promptProblem(CREATE_PROMPT_NAME, emptyTemplate)).toBe(
        'has an empty "template"',
      );
      const wrongName = emptyTemplate.replace(`"${CREATE_PROMPT_NAME}"`, '"other"');
      Vitest.expect(yield* promptProblem(CREATE_PROMPT_NAME, wrongName)).toContain(
        "declares name 'other'",
      );
    }),
  );
});
