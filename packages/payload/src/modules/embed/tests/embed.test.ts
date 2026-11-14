import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { type PayloadManifest, generateEmbeddedPayload, loadManifest } from '../../index.js';

/** Repo root, six levels up from src/modules/embed/tests. */
const REPO_ROOT = NodePath.resolve(import.meta.dirname, '..', '..', '..', '..', '..', '..');

const PACKAGES = [
  'skills',
  'prompts',
  'specs',
  'profiles',
  'reviews',
  'references',
  'model-fallback',
] as const;

/** Where a package's generated module lives, accepting both doctor layouts. */
const generatedPath = (pkg: string): string => {
  const modules = NodePath.join(REPO_ROOT, 'packages', pkg, 'src', 'modules', 'doctor');
  return Fs.existsSync(modules)
    ? NodePath.join(modules, 'embedded-payload.generated.ts')
    : NodePath.join(
        REPO_ROOT,
        'packages',
        pkg,
        'src',
        'apps',
        'doctor',
        'embedded-payload.generated.ts',
      );
};

Vitest.describe('generateEmbeddedPayload', () => {
  Vitest.it('one generator produces every package embedded payload', async () => {
    for (const pkg of PACKAGES) {
      const packageRoot = NodePath.join(REPO_ROOT, 'packages', pkg);
      const raw: unknown = JSON.parse(
        Fs.readFileSync(NodePath.join(packageRoot, 'payload.json'), 'utf8'),
      );
      const loaded = loadManifest(raw, `@montflow/${pkg}`);
      Vitest.expect(loaded.ok, `${pkg} manifest`).toBe(true);
      if (!loaded.ok) continue;
      const root = Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-payload-embed-'));
      const output = NodePath.join(root, 'embedded-payload.generated.ts');
      // oxlint-disable-next-line eslint/no-await-in-loop -- each package writes its own isolated temp file; sequential keeps the failure attributable.
      await generateEmbeddedPayload({
        packageRoot,
        manifest: loaded.manifest,
        output,
      });
      Vitest.expect(Fs.readFileSync(output, 'utf8'), `${pkg} embed is current`).toBe(
        Fs.readFileSync(generatedPath(pkg), 'utf8'),
      );
      Fs.rmSync(root, { recursive: true, force: true });
    }
  });

  Vitest.it('embeds the tier kind', async () => {
    const root = Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-payload-tier-'));
    Fs.mkdirSync(NodePath.join(root, 'tiers'));
    Fs.writeFileSync(NodePath.join(root, 'tiers', 'micro.md'), '# micro\n');
    const manifest: PayloadManifest = {
      schema: 1,
      package: '@fixture/payload',
      payloads: [
        {
          kind: 'tier',
          name: 'micro',
          source: 'tiers/micro.md',
          target: '.agents/@montflow/tiers/micro.md',
        },
      ],
    };
    const output = NodePath.join(root, 'generated.ts');
    await generateEmbeddedPayload({ packageRoot: root, manifest, output });
    const text = Fs.readFileSync(output, 'utf8');
    Vitest.expect(text).toContain('"tier"');
    Vitest.expect(text).toContain('"micro"');
    Vitest.expect(text).toContain('# micro');
    Fs.rmSync(root, { recursive: true, force: true });
  });
});
