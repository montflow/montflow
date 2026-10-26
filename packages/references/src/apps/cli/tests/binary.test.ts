import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import packageJson from '../../../../package.json';
import { Reference } from '../../../index.js';
import { Binary } from '../index.js';
import { makeWorkspace } from './fixtures.js';

/** Read one CLI source file, for the "never calls process.exit" assertion. */
const source = async (name: string): Promise<string> =>
  readFile(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');

/** Run the real binary through Bun and capture its bytes and exit code. */
const runCli = (
  args: ReadonlyArray<string>,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> =>
  new Promise((resolve) => {
    const main = fileURLToPath(new URL('../main.ts', import.meta.url));
    execFile('bun', ['run', main, ...args], { timeout: 60_000 }, (error, stdout, stderr) => {
      const code = error === null ? 0 : Number(error.code ?? 1);
      resolve({ code: Number.isFinite(code) ? code : 1, stdout, stderr });
    });
  });

const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-references-bin-'));

Vitest.describe('mf-references binary', () => {
  Vitest.it.effect('marks a refusal as a non-zero exit without leaving the process', () =>
    Effect.gen(function* () {
      const before = process.exitCode;
      yield* Binary.exitFailed;
      Vitest.expect(process.exitCode).toBe(1);
      process.exitCode = before;
    }),
  );

  Vitest.it('never calls process.exit in either front end', async () => {
    const [binaryText, slashText, mainText] = await Promise.all([
      source('binary.apps.module.ts'),
      source('slash.apps.module.ts'),
      source('main.ts'),
    ]);
    Vitest.expect(binaryText).not.toContain('process.exit(');
    Vitest.expect(slashText).not.toContain('process.exit(');
    Vitest.expect(mainText).not.toContain('process.exit(');
    Vitest.expect(binaryText).toContain('process.exitCode = 1');
  });

  Vitest.it('wires doctor --check to the one exit helper on drift', async () => {
    const binaryText = await source('binary.apps.module.ts');
    Vitest.expect(binaryText).toContain("'doctor'");
    Vitest.expect(binaryText).toContain('Engines.doctor(');
    Vitest.expect(binaryText).toContain('if (!result.healthy) yield* exitFailed;');
  });

  Vitest.it('reports the package version from package.json', () => {
    Vitest.expect(Binary.VERSION).toBe(packageJson.version);
  });
});

Vitest.describe('mf-references binary end to end', () => {
  Vitest.it('writes show output with no appended newline', async () => {
    const root = await freshRoot();
    const dir = join(root, Reference.STORE_DIR, 'alpha');
    const exact = Reference.encodeReferenceFile({
      reference: Reference.Reference.make({
        name: 'alpha',
        url: 'https://example.test/owner/alpha.git',
        purpose: 'Exact bytes fixture.',
        added: '2026-10-26',
      }),
      body: '\n# Notes',
    });
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, Reference.ENTRY_FILE), exact);

    const result = await runCli(['show', 'alpha', '--dir', root]);
    Vitest.expect(result.code).toBe(0);
    Vitest.expect(result.stdout).toBe(exact);
    Vitest.expect(result.stdout.length).toBe(Buffer.byteLength(exact));
    Vitest.expect(result.stdout.endsWith('\n')).toBe(false);

    await rm(root, { recursive: true, force: true });
  });

  Vitest.it('refuses a traversal name end to end and leaks nothing', async () => {
    const root = await freshRoot();
    const victim = join(root, 'victim');
    await mkdir(victim, { recursive: true });
    await writeFile(join(victim, Reference.ENTRY_FILE), 'outside\n');

    const result = await runCli(['remove', '../victim', '--dir', root]);
    Vitest.expect(result.code).toBe(1);
    Vitest.expect(result.stdout).toContain(
      "refused: invalid name '../victim': must match ^[a-z0-9]+(-[a-z0-9]+)*$",
    );
    Vitest.expect(await readFile(join(victim, Reference.ENTRY_FILE), 'utf8')).toBe('outside\n');

    await rm(root, { recursive: true, force: true });
  });

  Vitest.it('refuses an explicitly empty --purpose like the slash surface', async () => {
    const root = await makeWorkspace();
    const result = await runCli([
      'add',
      'https://example.test/owner/alpha.git',
      '--purpose',
      '',
      '--dir',
      root,
    ]);
    Vitest.expect(result.code).toBe(1);
    Vitest.expect(result.stdout).toContain('refused: invalid purpose');
    Vitest.expect(result.stdout).toContain('must not be empty');

    await rm(root, { recursive: true, force: true });
  });
});
