import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { CREATE_SPEC_SKILL_NAME, SPEC_PROMPT_NAMES, runDoctor } from '../../doctor/index.js';
import { doctorExitCode, renderDoctor, runDoctorRun } from '../index.js';

/**
 * The CLI layer turns a `DoctorResult` into the report an agent reads and the
 * exit code `mf:check:specs` depends on. These tests pin both, including the
 * wording that distinguishes "doctor wrote it" from "it was already there".
 */

const freshRoot = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-specs-doctor-cli-'));

const CREATE_PROMPT_NAME = SPEC_PROMPT_NAMES[0];
const SIZING_PROMPT_NAME = SPEC_PROMPT_NAMES[2];

const installedPromptFile = (root: string, name: string): string =>
  NodePath.join(root, '.agents', '@montflow', 'prompts', `${name}.json`);

/** Payload lines only: the leading mark followed by `<name>: `. */
const payloadLines = (report: string): ReadonlyArray<string> =>
  report.split('\n').filter((line) => /^[✓+✗] \S+: /u.test(line));

Vitest.describe('Cli.doctor runtime', () => {
  Vitest.it.effect('check mode reports spec-sizing.json missing and stale without writing', () =>
    Effect.gen(function* () {
      const root = freshRoot();

      const missing = yield* runDoctorRun(root, { check: true });
      Vitest.expect(missing.exitCode).toBe(1);
      Vitest.expect(missing.report).toContain(`\u2717 ${SIZING_PROMPT_NAME}: not installed`);
      // A missing prompt is never written in check mode, not even its directory.
      Vitest.expect(Fs.existsSync(NodePath.join(root, '.agents'))).toBe(false);

      yield* runDoctor(root);
      const file = installedPromptFile(root, SIZING_PROMPT_NAME);
      Fs.appendFileSync(file, '\nstale\n', 'utf-8');
      const drifted = Fs.readFileSync(file, 'utf-8');

      const stale = yield* runDoctorRun(root, { check: true });
      Vitest.expect(stale.exitCode).toBe(1);
      Vitest.expect(stale.report).toContain(
        `\u2717 ${SIZING_PROMPT_NAME}: '${SIZING_PROMPT_NAME}.json' differs from the package`,
      );
      Vitest.expect(stale.report).toContain('mf-specs doctor');
      // The report names the drift; check mode leaves the bytes exactly as found.
      Vitest.expect(Fs.readFileSync(file, 'utf-8')).toBe(drifted);
    }),
  );

  Vitest.it.effect('a drifted tree reports every payload, the fix, and exit 1', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const result = yield* runDoctor(root, { check: true });

      Vitest.expect(doctorExitCode(result)).toBe(1);

      const report = renderDoctor(result);
      Vitest.expect(report).toContain('\u2717 spec skills and prompts are not current.');
      Vitest.expect(report).toContain('Run: mf-specs doctor');
      const lines = payloadLines(report);
      Vitest.expect(lines).toHaveLength(5);
      Vitest.expect(lines.every((line) => line.startsWith('\u2717'))).toBe(true);
      Vitest.expect(lines.some((line) => line.includes(`${CREATE_SPEC_SKILL_NAME}: `))).toBe(true);
      Vitest.expect(lines.some((line) => line.includes(`${CREATE_PROMPT_NAME}: `))).toBe(true);
      // `--check` never writes, not even the directory.
      Vitest.expect(Fs.existsSync(NodePath.join(root, '.agents'))).toBe(false);
    }),
  );

  Vitest.it.effect('a current tree reports up to date and exit 0', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);

      const result = yield* runDoctor(root, { check: true });
      Vitest.expect(doctorExitCode(result)).toBe(0);

      const report = renderDoctor(result);
      Vitest.expect(report).toContain(
        '\u2713 spec skills and prompts are installed and up to date.',
      );
      Vitest.expect(report).toContain(`${CREATE_SPEC_SKILL_NAME}: up to date`);
      Vitest.expect(report).not.toContain('Run: mf-specs doctor');
      Vitest.expect(payloadLines(report).every((line) => line.startsWith('\u2713'))).toBe(true);
    }),
  );

  Vitest.it.effect('repair mode reports what it wrote and exit 0', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const run = yield* runDoctorRun(root, {});

      Vitest.expect(run.exitCode).toBe(0);
      Vitest.expect(run.report).toContain('+ spec skills and prompts installed or repaired.');
      Vitest.expect(run.report).toContain(`${CREATE_SPEC_SKILL_NAME}: installed`);
      Vitest.expect(run.report).not.toContain('Run: mf-specs doctor');
    }),
  );

  Vitest.it.effect(
    'a repair names what it changed and calls an untouched skill "already installed"',
    () =>
      Effect.gen(function* () {
        const root = freshRoot();
        yield* runDoctor(root);
        Fs.writeFileSync(
          installedPromptFile(root, CREATE_PROMPT_NAME),
          '{"stale":true}\n',
          'utf-8',
        );

        const run = yield* runDoctorRun(root, {});
        Vitest.expect(run.exitCode).toBe(0);
        Vitest.expect(run.report).toContain(`${CREATE_SPEC_SKILL_NAME}: already installed`);
        Vitest.expect(run.report).toContain(`${CREATE_PROMPT_NAME}: repaired (`);
        Vitest.expect(run.report).toContain(`${SPEC_PROMPT_NAMES[1]}: already installed`);
        // A skill line must never read "installed" unless doctor wrote it.
        Vitest.expect(run.report).not.toContain(`${CREATE_SPEC_SKILL_NAME}: installed`);
      }),
  );

  Vitest.it.effect('a blocked payload gets a coded diagnostic and no misleading fix line', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      Fs.mkdirSync(NodePath.join(root, '.agents', '@montflow'), { recursive: true });
      Fs.writeFileSync(
        NodePath.join(root, '.agents', '@montflow', 'prompts'),
        'occupied\n',
        'utf-8',
      );

      const run = yield* runDoctorRun(root, {});
      Vitest.expect(run.exitCode).toBe(1);
      Vitest.expect(run.report).toContain('blocked [doctor.create]');
      Vitest.expect(run.report).toContain('code     doctor.create');
      Vitest.expect(run.report).toContain(NodePath.join(root, '.agents', '@montflow', 'prompts'));
      Vitest.expect(run.report).toContain('fix      ');
      // Nothing here is repairable by re-running doctor, so it is not offered.
      Vitest.expect(run.report).not.toContain('Run: mf-specs doctor');
    }),
  );

  Vitest.it.effect('check mode blocks an obstruction and offers no repair hint', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const prompts = NodePath.join(root, '.agents', '@montflow', 'prompts');
      Fs.rmSync(prompts, { recursive: true, force: true });
      Fs.writeFileSync(prompts, 'occupied\n', 'utf-8');

      const run = yield* runDoctorRun(root, { check: true });
      Vitest.expect(run.exitCode).toBe(1);
      Vitest.expect(run.report).toContain('blocked [doctor.create]');
      Vitest.expect(run.report).toContain('code     doctor.create');
      // Repair would fail on the same obstruction, so it is not advertised.
      Vitest.expect(run.report).not.toContain('Run: mf-specs doctor');
    }),
  );

  Vitest.it.effect('check mode reports a symlinked skill as blocked with its code and fix', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* runDoctor(root);
      const target = NodePath.join(root, '.agents', 'skills', CREATE_SPEC_SKILL_NAME);
      const outside = NodePath.join(root, 'outside-skill');
      Fs.mkdirSync(outside, { recursive: true });
      Fs.writeFileSync(NodePath.join(outside, 'SKILL.md'), 'outside\n', 'utf-8');
      Fs.rmSync(target, { recursive: true, force: true });
      Fs.symlinkSync(outside, target);

      const run = yield* runDoctorRun(root, { check: true });
      Vitest.expect(run.exitCode).toBe(1);
      Vitest.expect(run.report).toContain(
        `\u2717 ${CREATE_SPEC_SKILL_NAME}: blocked [doctor.symlink]`,
      );
      Vitest.expect(run.report).toContain('code     doctor.symlink');
      Vitest.expect(run.report).toContain('fix      Remove the symlink');
      Vitest.expect(run.report).not.toContain('Run: mf-specs doctor');
    }),
  );
});
