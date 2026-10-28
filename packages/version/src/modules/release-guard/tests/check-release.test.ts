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
    cp(join(PACKAGE_ROOT, '../../guides/updating.md'), join(root, 'guides/updating.md'), {
      recursive: true,
    }),
    ...sources.map(({ from, to }) => cp(from, to, { recursive: true })),
  ]);
  return root;
};

const runGuard = (root: string) =>
  spawnSync('bun', ['run', SCRIPT, '--root', root], { encoding: 'utf8' });

interface MutableManifest {
  name?: string;
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

interface MutableConfig {
  fixed?: unknown;
  ignore?: string[];
  privatePackages?: { version?: boolean; tag?: boolean };
}

const editConfig = async (root: string, edit: (value: MutableConfig) => void) => {
  const file = join(root, '.changeset', 'config.json');
  const config: MutableConfig = JSON.parse(await readFile(file, 'utf8'));
  edit(config);
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
};

Vitest.describe('release guard drift branches runtime', () => {
  Vitest.it('fails when the fixed group loses a CLI', async () => {
    const root = await fixture();
    try {
      await editConfig(root, (config) => {
        config.fixed = [['@montflow/skills', '@montflow/specs']];
      });
      Vitest.expect(runGuard(root).status).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  Vitest.it('fails when @montflow/core joins the fixed group', async () => {
    const root = await fixture();
    try {
      await editConfig(root, (config) => {
        config.fixed = [
          [
            '@montflow/skills',
            '@montflow/specs',
            '@montflow/prompts',
            '@montflow/profiles',
            '@montflow/reviews',
            '@montflow/core',
          ],
        ];
      });
      const result = runGuard(root);
      Vitest.expect(result.status).toBe(1);
      Vitest.expect(result.stderr).toContain('@montflow/core');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  Vitest.it('fails when a CLI is ignored or loses private tagging', async () => {
    const ignored = await fixture();
    const untagged = await fixture();
    try {
      await editConfig(ignored, (config) => {
        config.ignore = ['@montflow/skills'];
      });
      await editConfig(untagged, (config) => {
        config.privatePackages = { version: true, tag: false };
      });
      Vitest.expect(runGuard(ignored).status).toBe(1);
      Vitest.expect(runGuard(untagged).status).toBe(1);
    } finally {
      await rm(ignored, { recursive: true, force: true });
      await rm(untagged, { recursive: true, force: true });
    }
  });

  Vitest.it('fails when a manifest loses its version or name', async () => {
    const missingVersion = await fixture();
    const renamed = await fixture();
    try {
      await editManifest(missingVersion, '@montflow/skills', (manifest) => {
        delete manifest.version;
      });
      await editManifest(renamed, '@montflow/skills', (manifest) => {
        manifest.name = '@montflow/phantom';
      });
      Vitest.expect(runGuard(missingVersion).status).toBe(1);
      Vitest.expect(runGuard(renamed).status).toBe(1);
    } finally {
      await rm(missingVersion, { recursive: true, force: true });
      await rm(renamed, { recursive: true, force: true });
    }
  });

  Vitest.it('fails when a CHANGELOG is absent', async () => {
    const root = await fixture();
    try {
      await rm(join(root, cliDir('@montflow/reviews'), 'CHANGELOG.md'));
      const result = runGuard(root);
      Vitest.expect(result.status).toBe(1);
      Vitest.expect(result.stderr).toContain('CHANGELOG.md is missing');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  Vitest.it('accepts the --root=/path form', async () => {
    const root = await fixture();
    try {
      const result = spawnSync('bun', ['run', SCRIPT, `--root=${root}`], { encoding: 'utf8' });
      Vitest.expect(result.status).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

Vitest.describe('release guard guide anchors runtime', () => {
  Vitest.it('fails when a notice anchor has no matching heading', async () => {
    const root = await fixture();
    try {
      const guide = join(root, 'guides/updating.md');
      const text = await readFile(guide, 'utf8');
      await writeFile(guide, text.replace('## mf-skills', '## skills-cli'));
      const result = runGuard(root);
      Vitest.expect(result.status).toBe(1);
      Vitest.expect(result.stderr).toContain("no '## mf-skills' heading");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

Vitest.describe('release guard fixed-group shape runtime', () => {
  Vitest.it('fails when the five CLIs are split across five groups', async () => {
    const root = await fixture();
    try {
      await editConfig(root, (config) => {
        config.fixed = CLIS.map((name) => [name]);
      });
      const result = runGuard(root);
      Vitest.expect(result.status).toBe(1);
      Vitest.expect(result.stderr).toContain('exactly one fixed group');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  Vitest.it('fails on a bare or empty --root instead of checking cwd', () => {
    const bare = spawnSync('bun', ['run', SCRIPT, '--root'], { encoding: 'utf8' });
    const empty = spawnSync('bun', ['run', SCRIPT, '--root='], { encoding: 'utf8' });
    Vitest.expect(bare.status).toBe(1);
    Vitest.expect(bare.stderr).toContain('--root needs a directory');
    Vitest.expect(empty.status).toBe(1);
    Vitest.expect(empty.stderr).toContain('--root= needs a directory');
  });
});
