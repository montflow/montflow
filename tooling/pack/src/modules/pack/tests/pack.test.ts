import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packPlugin, publishedManifest } from '../index.js';
import type { Manifest, WorkspacePackage } from '../../workspace/index.js';

const roots: string[] = [];

const tempRoot = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'montflow-pack-'));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fixture = (root: string): WorkspacePackage => {
  const dir = 'packages/fixture';
  const manifest: Manifest = {
    name: '@scope/fixture',
    version: '0.0.1',
    exports: {
      './package.json': './package.json',
      '.': './src/index.ts',
      './server': './src/server.ts',
    },
    dependencies: { '@montflow/opencode': 'workspace:*', effect: '4.0.0-rc.112' },
  };
  mkdirSync(path.join(root, dir, 'src'), { recursive: true });
  writeFileSync(path.join(root, dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    path.join(root, dir, 'src', 'index.ts'),
    'import { Effect } from "effect";\nexport const value = Effect.succeed(1);\n',
  );
  writeFileSync(path.join(root, dir, 'src', 'server.ts'), 'export const server = true;\n');
  return { dir, manifest, manifestPath: path.join(root, dir, 'package.json') };
};

describe('publishedManifest', () => {
  it('maps exports to bundles and drops internal dependencies', () => {
    const manifest = publishedManifest(
      {
        name: '@scope/fixture',
        version: '0.0.1',
        exports: { '.': './src/index.ts', './server': './src/server.ts' },
        dependencies: { '@montflow/opencode': 'workspace:*', effect: '4.0.0-rc.112' },
      },
      new Map([
        ['.', 'index.js'],
        ['./server', 'server.js'],
      ]),
    );

    expect(manifest.exports).toStrictEqual({
      './package.json': './package.json',
      '.': './index.js',
      './server': './server.js',
    });
    expect(manifest.dependencies).toStrictEqual({ effect: '4.0.0-rc.112' });
  });

  it('declares imported host external packages as peers once', () => {
    const manifest = publishedManifest({ name: '@scope/fixture', version: '0.0.1' }, new Map(), [
      'effect',
      'effect/Effect',
      '@opencode/schema/agent',
    ]);

    expect(manifest.peerDependencies).toStrictEqual({
      effect: '*',
      '@opencode/schema': '*',
    });
  });
});

describe('packPlugin', () => {
  it('emits a self-contained artifact with a Git-installable manifest', async () => {
    const root = tempRoot();
    const entry = fixture(root);
    const artifact = await packPlugin({ root, packages: [entry] }, entry, path.join(root, 'dist'));

    expect(existsSync(path.join(artifact.dir, 'index.js'))).toBe(true);
    expect(existsSync(path.join(artifact.dir, 'server.js'))).toBe(true);

    const shipped: Manifest = JSON.parse(
      readFileSync(path.join(artifact.dir, 'package.json'), 'utf8'),
    );
    expect(shipped.dependencies).toStrictEqual({ effect: '4.0.0-rc.112' });
    expect(shipped.exports).toStrictEqual({
      './package.json': './package.json',
      '.': './index.js',
      './server': './server.js',
    });
  });
});
