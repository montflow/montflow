import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import {
  INSTALL_ROOT,
  PAYLOAD_KINDS,
  expectedTarget,
  loadManifest,
  nameAt,
  namesOf,
} from '../index.js';

/** Repo root, six levels up from src/modules/manifest/tests. */
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

/** Read a package's `payload.json`, or undefined when it has none. */
const manifestText = (pkg: string): string | undefined => {
  const file = NodePath.join(REPO_ROOT, 'packages', pkg, 'payload.json');
  return Fs.existsSync(file) ? Fs.readFileSync(file, 'utf8') : undefined;
};

/** True when the package ships a doctor in either supported layout. */
const hasDoctor = (pkg: string): boolean =>
  Fs.existsSync(NodePath.join(REPO_ROOT, 'packages', pkg, 'src', 'apps', 'doctor')) ||
  Fs.existsSync(NodePath.join(REPO_ROOT, 'packages', pkg, 'src', 'modules', 'doctor'));

/** Parse a raw manifest fixture. */
const raw = (payloads: ReadonlyArray<Record<string, string>>) => ({
  schema: 1,
  package: '@fixture/payload',
  payloads,
});

Vitest.describe('loadManifest', () => {
  Vitest.it('accepts every package manifest and every kind has an install root', () => {
    for (const pkg of PACKAGES) {
      const text = manifestText(pkg);
      Vitest.expect(text, `${pkg} has payload.json`).toBeDefined();
      const parsed: unknown = JSON.parse(text ?? '');
      // SAFETY: the fixture is a package.json this repository owns; a malformed
      // one fails the assertion above instead of being trusted.
      const manifest = loadManifest(parsed, `@montflow/${pkg}`);
      Vitest.expect(manifest.ok, `${pkg} manifest validates`).toBe(true);
      const count = manifest.ok ? manifest.manifest.payloads.length : 0;
      Vitest.expect(count).toBeGreaterThan(0);
    }
    for (const kind of PAYLOAD_KINDS) {
      Vitest.expect(INSTALL_ROOT[kind]).toBeTruthy();
      Vitest.expect(expectedTarget(kind, 'demo')).toContain('demo');
    }
  });

  Vitest.it('every package with a manifest has a doctor, and the reverse', () => {
    for (const pkg of PACKAGES) {
      Vitest.expect(manifestText(pkg) !== undefined, `${pkg} manifest`).toBe(hasDoctor(pkg));
    }
  });

  Vitest.it('names every source and verifies the package bytes exist', () => {
    for (const pkg of PACKAGES) {
      const text = manifestText(pkg);
      const parsed: unknown = JSON.parse(text ?? '');
      const loaded = loadManifest(parsed, `@montflow/${pkg}`);
      Vitest.expect(loaded.ok).toBe(true);
      if (!loaded.ok) continue;
      for (const entry of loaded.manifest.payloads) {
        const source = NodePath.join(REPO_ROOT, 'packages', pkg, entry.source);
        Vitest.expect(Fs.existsSync(source), `${pkg}/${entry.source} exists`).toBe(true);
        Vitest.expect(entry.target).toBe(expectedTarget(entry.kind, entry.name));
      }
    }
  });

  Vitest.it('namesOf and nameAt read the manifest in order', () => {
    const loaded = loadManifest(
      raw([
        {
          kind: 'profile',
          name: 'demo',
          source: 'profiles/demo',
          target: '.agents/@montflow/profiles/demo',
        },
        {
          kind: 'tier',
          name: 'micro',
          source: 'tiers/micro.md',
          target: '.agents/@montflow/tiers/micro.md',
        },
      ]),
      '@fixture/payload',
    );
    Vitest.expect(namesOf(loaded, 'profile')).toStrictEqual(['demo']);
    Vitest.expect(namesOf(loaded, 'tier')).toStrictEqual(['micro']);
    Vitest.expect(nameAt(loaded, 'tier', 0)).toBe('micro');
    Vitest.expect(() => nameAt(loaded, 'tier', 1)).toThrow();
  });

  Vitest.it('rejects an empty manifest so a broken package is never healthy', () => {
    const loaded = loadManifest(raw([]), '@fixture/payload');
    Vitest.expect(loaded.ok).toBe(false);
    Vitest.expect(loaded.ok ? '' : loaded.problem).toContain('at least one payload');
  });

  Vitest.it('rejects a duplicate kind and name', () => {
    const loaded = loadManifest(
      raw([
        {
          kind: 'skill',
          name: 'demo',
          source: 'skills/demo',
          target: '.agents/skills/demo',
        },
        {
          kind: 'skill',
          name: 'demo',
          source: 'skills/demo',
          target: '.agents/skills/demo',
        },
      ]),
      '@fixture/payload',
    );
    Vitest.expect(loaded.ok).toBe(false);
    Vitest.expect(loaded.ok ? '' : loaded.problem).toContain('twice');
  });

  Vitest.it('rejects a path escape, an absolute path, and a wrong target root', () => {
    for (const source of ['../outside', '/absolute', 'skills/../escape']) {
      const loaded = loadManifest(
        raw([
          {
            kind: 'skill',
            name: 'demo',
            source,
            target: '.agents/skills/demo',
          },
        ]),
        '@fixture/payload',
      );
      Vitest.expect(loaded.ok, source).toBe(false);
    }
    const wrongRoot = loadManifest(
      raw([
        {
          kind: 'skill',
          name: 'demo',
          source: 'skills/demo',
          target: '.agents/prompts/demo',
        },
      ]),
      '@fixture/payload',
    );
    Vitest.expect(wrongRoot.ok).toBe(false);
  });

  Vitest.it('rejects a file source whose name does not match its stem', () => {
    const loaded = loadManifest(
      raw([
        {
          kind: 'tier',
          name: 'micro',
          source: 'tiers/standard.md',
          target: '.agents/@montflow/tiers/micro.md',
        },
      ]),
      '@fixture/payload',
    );
    Vitest.expect(loaded.ok).toBe(false);
  });
});

Vitest.describe('tier kinds in a manifest', () => {
  Vitest.it('accepts a tier entry and finds its installed root', () => {
    const loaded = loadManifest(
      raw([
        {
          kind: 'tier',
          name: 'micro',
          source: 'tiers/micro.md',
          target: '.agents/@montflow/tiers/micro.md',
        },
      ]),
      '@fixture/payload',
    );
    Vitest.expect(loaded.ok).toBe(true);
    Vitest.expect(expectedTarget('tier', 'micro')).toBe('.agents/@montflow/tiers/micro.md');
    Vitest.expect(namesOf(loaded, 'tier')).toStrictEqual(['micro']);
  });
});
