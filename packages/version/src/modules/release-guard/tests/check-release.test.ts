import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as Vitest from '@effect/vitest';
import { CLIS } from '../index.js';

/**
 * The release guard must fail on the drift it exists to catch, not merely pass
 * on today's tree. Each fixture is a copy of the real config/manifests with one
 * fact broken, and the real script is spawned against it.
 */

const PACKAGE_ROOT = resolve(import.meta.dirname, '../../../..');
const SCRIPT = join(PACKAGE_ROOT, 'scripts/check-release.ts');

const cliDir = (name: string): string => `packages/${name.replace('@montflow/', '')}`;

/** Copy the guarded files into a throwaway root. */
const fixture = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'mf-release-guard-'));
  const sources = CLIS.flatMap((name) => [
    {
      from: join(PACKAGE_ROOT, '../../', cliDir(name), 'package.json'),
      to: join(root, cliDir(name), 'package.json'),
    },
    {
      from: join(PACKAGE_ROOT, '../../', cliDir(name), 'CHANGELOG.md'),
      to: join(root, cliDir(name), 'CHANGELOG.md'),
    },
  ]);
  await Promise.all([
    cp(join(PACKAGE_ROOT, '../../.changeset/config.json'), join(root, '.changeset/config.json'), {
      recursive: true,
    }),
    ...sources.map(({ from, to }) => cp(from, to, { recursive: true })),
  ]);
  return root;
};

const runGuard = (root: string) =>
  spawnSync('bun', ['run', SCRIPT, '--root', root], { encoding: 'utf8' });

interface MutableManifest {
  version?: string;
  private?: boolean;
}

const editManifest = async (root: string, name: string, edit: (value: MutableManifest) => void) => {
  const file = join(root, cliDir(name), 'package.json');
  const manifest: MutableManifest = JSON.parse(await readFile(file, 'utf8'));
  edit(manifest);
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
};

Vitest.describe('release guard runtime', () => {
  Vitest.it('passes on the repository tree', async () => {
    const result = runGuard(resolve(PACKAGE_ROOT, '../..'));
    Vitest.expect(result.status, result.stderr).toBe(0);
  });

  Vitest.it('fails when the five versions disagree', async () => {
    const root = await fixture();
    try {
      await editManifest(root, '@montflow/specs', (manifest) => {
        manifest.version = '9.9.9';
      });
      const result = runGuard(root);
      Vitest.expect(result.status).toBe(1);
      Vitest.expect(result.stderr).toContain('versions disagree');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  Vitest.it('fails when a CLI stops being private', async () => {
    const root = await fixture();
    try {
      await editManifest(root, '@montflow/skills', (manifest) => {
        manifest.private = false;
      });
      const result = runGuard(root);
      Vitest.expect(result.status).toBe(1);
      Vitest.expect(result.stderr).toContain('never publish to npm');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  Vitest.it('fails when a CHANGELOG loses the release model', async () => {
    const root = await fixture();
    try {
      await writeFile(join(root, cliDir('@montflow/prompts'), 'CHANGELOG.md'), '# Changelog\n');
      const result = runGuard(root);
      Vitest.expect(result.status).toBe(1);
      Vitest.expect(result.stderr).toContain('release-versus-checkout');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
