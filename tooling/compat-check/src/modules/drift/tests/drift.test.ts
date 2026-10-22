import { describe, expect, it } from 'vitest';
import type { Manifest, Workspace, WorkspacePackage } from '../../workspace/index.js';
import { checkDrift, readResolvedVersions, satisfiesFloor, type HostCatalog } from '../index.js';

const HOST: HostCatalog = {
  plugin: '2.0.18',
  effect: '4.0.0-rc.112',
  peers: {
    '@opentui/core': '>=0.5.12',
    '@opentui/solid': '>=0.5.12',
    'solid-js': '>=1.9.0',
  },
};

const manifest = (name: string, extra: Partial<Manifest> = {}): Manifest => ({
  name,
  ...extra,
});

const pkg = (dir: string, name: string, extra: Partial<Manifest> = {}): WorkspacePackage => ({
  dir,
  manifestPath: `/repo/${dir}/package.json`,
  manifest: manifest(name, extra),
});

const workspace = (packages: readonly WorkspacePackage[], root?: Manifest): Workspace => ({
  root: '/repo',
  rootManifest:
    root ??
    manifest('@montflow/root', {
      private: true,
      overrides: { effect: HOST.effect, '@effect/platform-node-shared': HOST.effect },
    }),
  packages,
  changeset: {},
  releaseWorkflow: '',
  lockfile: '',
});

const resolved = (entries: Readonly<Record<string, string>>) =>
  Object.entries(entries).map(([dependency, version]) => ({ dependency, version }));

const aligned = (): Workspace =>
  workspace([
    pkg('packages/specs', '@montflow/specs', {
      private: true,
      dependencies: { '@montflow/opencode': 'workspace:*', effect: HOST.effect },
      devDependencies: { '@effect/vitest': HOST.effect },
      peerDependencies: { effect: HOST.effect },
    }),
    pkg('apps/workspace', '@montflow/workspace', {
      private: true,
      dependencies: { effect: HOST.effect },
      devDependencies: {
        '@opentui/core': '0.5.12',
        '@opentui/solid': '0.5.12',
        'solid-js': '1.9.15',
      },
      peerDependencies: {
        '@opentui/core': '>=0.5.12',
        '@opentui/solid': '>=0.5.12',
        'solid-js': '>=1.9.0',
      },
    }),
  ]);

const alignedResolved = resolved({
  effect: HOST.effect,
  '@effect/platform-node': HOST.effect,
  '@effect/platform-node-shared': HOST.effect,
  '@effect/vitest': HOST.effect,
  '@opentui/core': '0.5.12',
  '@opentui/solid': '0.5.12',
  'solid-js': '1.9.15',
});

describe('dependency drift', () => {
  it('accepts a workspace on the host line', () => {
    expect(checkDrift(aligned(), HOST, alignedResolved)).toStrictEqual([]);
  });

  it('fails when a package declares effect off the host line', () => {
    const drifted = workspace([
      pkg('packages/specs', '@montflow/specs', { dependencies: { effect: '4.0.3' } }),
    ]);
    expect(checkDrift(drifted, HOST, alignedResolved)).toStrictEqual([
      {
        where: 'packages/specs',
        dependency: 'effect',
        expected: HOST.effect,
        actual: '4.0.3',
      },
    ]);
  });

  it('fails when the platform-node-shared override is missing', () => {
    const drifted = workspace(
      [],
      manifest('@montflow/root', { private: true, overrides: { effect: HOST.effect } }),
    );
    expect(checkDrift(drifted, HOST, alignedResolved)).toStrictEqual([
      {
        where: '.',
        dependency: '@effect/platform-node-shared',
        expected: HOST.effect,
        actual: '(missing)',
      },
    ]);
  });

  it('fails when the lockfile resolved platform-node-shared off the host line', () => {
    const drifted = resolved({
      ...Object.fromEntries(alignedResolved.map((entry) => [entry.dependency, entry.version])),
      '@effect/platform-node-shared': '4.0.3',
    });
    expect(checkDrift(aligned(), HOST, drifted)).toStrictEqual([
      {
        where: 'bun.lock',
        dependency: '@effect/platform-node-shared',
        expected: HOST.effect,
        actual: '4.0.3',
      },
    ]);
  });

  it('fails when OpenTUI is below the host floor', () => {
    const drifted = workspace([
      pkg('apps/workspace', '@montflow/workspace', {
        devDependencies: { '@opentui/core': '0.5.11' },
        peerDependencies: { '@opentui/core': '>=0.5.11' },
      }),
    ]);
    expect(checkDrift(drifted, HOST, resolved({ '@opentui/core': '0.5.11' }))).toStrictEqual([
      {
        where: 'apps/workspace',
        dependency: '@opentui/core',
        expected: '>=0.5.12',
        actual: '0.5.11',
      },
      {
        where: 'apps/workspace',
        dependency: '@opentui/core',
        expected: '>=0.5.12',
        actual: '>=0.5.11',
      },
      {
        where: 'bun.lock',
        dependency: '@opentui/core',
        expected: '>=0.5.12',
        actual: '0.5.11',
      },
    ]);
  });

  it('fails when the workspace pins two renderer copies', () => {
    const drifted = workspace([
      pkg('apps/workspace', '@montflow/workspace', { devDependencies: { 'solid-js': '1.9.15' } }),
      pkg('packages/opencode', '@montflow/opencode', {
        devDependencies: { 'solid-js': '1.9.12' },
      }),
    ]);
    expect(checkDrift(drifted, HOST, resolved({ 'solid-js': '1.9.15' }))).toStrictEqual([
      {
        where: 'workspace',
        dependency: 'solid-js',
        expected: 'a single solid-js pin',
        actual: '1.9.15, 1.9.12',
      },
    ]);
  });

  it('fails when the host package is not the pinned release', () => {
    const drifted = workspace([
      pkg('packages/opencode', '@montflow/opencode', {
        dependencies: { '@opencode/plugin': '2.0.17' },
      }),
    ]);
    expect(checkDrift(drifted, HOST, resolved({}))).toStrictEqual([
      {
        where: 'packages/opencode',
        dependency: '@opencode/plugin',
        expected: HOST.plugin,
        actual: '2.0.17',
      },
    ]);
  });
});

describe('resolved versions', () => {
  it('reads top-level entries and skips nested variant resolutions', () => {
    const lock = [
      '  "packages": {',
      '    "effect": ["effect@4.0.0-rc.112", "", {}, "sha512-x"],',
      '    "solid-js": ["solid-js@1.9.15", "", {}, "sha512-y"],',
      '    "@opentui/solid/solid-js": ["solid-js@1.9.12", "", {}, "sha512-z"],',
      '  },',
    ].join('\n');
    expect(readResolvedVersions(lock)).toStrictEqual([
      { dependency: 'effect', version: '4.0.0-rc.112' },
      { dependency: 'solid-js', version: '1.9.15' },
    ]);
  });

  it('compares a prerelease as below its release', () => {
    expect(satisfiesFloor('4.0.0-rc.112', '>=4.0.0')).toBe(false);
    expect(satisfiesFloor('4.0.0', '>=4.0.0-rc.112')).toBe(true);
    expect(satisfiesFloor('4.0.3', '>=4.0.0-rc.112')).toBe(true);
    expect(satisfiesFloor('0.5.11', '>=0.5.12')).toBe(false);
    expect(satisfiesFloor('0.5.12', '>=0.5.12')).toBe(true);
    expect(satisfiesFloor('1.9.15', '>=1.9.0')).toBe(true);
    expect(satisfiesFloor('not-a-version', '>=1.0.0')).toBe(false);
  });
});
