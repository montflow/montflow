import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';

/**
 * The CI contract: every verify cell is report-only, and every package that
 * ships a payload is covered by `mf:check` and by the one repair command.
 */

const REPO_ROOT = NodePath.resolve(import.meta.dirname, '..', '..', '..', '..', '..', '..');

const MANIFEST_PACKAGES = [
  'skills',
  'prompts',
  'specs',
  'profiles',
  'reviews',
  'references',
  'model-fallback',
] as const;

interface RootManifest {
  readonly scripts: Readonly<Record<string, string>>;
}

const scripts = (): Readonly<Record<string, string>> => {
  const text = Fs.readFileSync(NodePath.join(REPO_ROOT, 'package.json'), 'utf8');
  // SAFETY: the root package.json is this repository's own file; a malformed
  // one fails the first assertion instead of being trusted.
  return (JSON.parse(text) as RootManifest).scripts;
};

Vitest.describe('root scripts', () => {
  Vitest.it('every check cell that runs doctor is report-only', () => {
    const violations: Array<string> = [];
    for (const [name, command] of Object.entries(scripts())) {
      if (!name.endsWith(':check')) continue;
      for (const match of command.matchAll(/\bdoctor\b([^&|;]*)/g)) {
        const tail = match[1] ?? '';
        if (!tail.trimStart().startsWith('--check')) {
          violations.push(`${name}: ${command}`);
        }
      }
    }
    Vitest.expect(violations).toStrictEqual([]);
  });

  Vitest.it('every package with a manifest has a check cell that mf:check runs', () => {
    const all = scripts();
    const check = all['mf:check'] ?? '';
    for (const pkg of MANIFEST_PACKAGES) {
      const cell = `mf-${pkg}:check`;
      Vitest.expect(all[cell], `${cell} exists`).toBeDefined();
      Vitest.expect(check, `${cell} is in mf:check`).toContain(cell);
    }
  });

  Vitest.it('mf:doctor repairs every package with a manifest and never checks', () => {
    const command = scripts()['mf:doctor'];
    Vitest.expect(command).toBeDefined();
    for (const pkg of MANIFEST_PACKAGES) {
      Vitest.expect(command).toContain(`packages/${pkg}`);
    }
    Vitest.expect(command).not.toContain('--check');
  });
});
