import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Manifest, Workspace, WorkspacePackage } from '../../workspace/index.js';
import {
  auditArtifact,
  checkBoundary,
  publishedManifest,
  type PublishedManifest,
} from '../index.js';

const roots: string[] = [];

const tempRoot = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'compat-dist-'));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const plugin = (): WorkspacePackage => ({
  dir: 'packages/specs',
  manifestPath: '/repo/packages/specs/package.json',
  manifest: {
    name: '@montflow/specs',
    version: '0.0.1',
    private: true,
    repository: {
      type: 'git',
      url: 'git+https://github.com/montflow/montflow.git',
      directory: 'packages/specs',
    },
    exports: {
      './package.json': './package.json',
      '.': './src/index.ts',
      './server': './src/server.ts',
      './tui': './src/tui.ts',
    },
    bin: { 'mf-specs': './src/apps/cli/main.ts' },
    dependencies: { '@montflow/opencode': 'workspace:*', effect: '4.0.0-rc.112' },
  } satisfies Manifest,
});

const workspace = (root: string, packages: readonly WorkspacePackage[]): Workspace => ({
  root,
  rootManifest: {
    name: '@montflow/root',
    private: true,
    scripts: {
      'changeset:publish':
        'bun run --filter @montflow/core --filter @montflow/format build && changeset publish',
    },
  },
  packages,
  changeset: {
    ignore: ['@montflow/specs'],
    privatePackages: { version: false, tag: false },
  },
  releaseWorkflow:
    'if (manifest.private || !manifest.version || ignored.has(manifest.name)) continue;',
  lockfile: '',
});

/** Materialize the export and bin targets the boundary check stats. */
const materialize = (root: string, entry: WorkspacePackage): void => {
  for (const target of Object.values(entry.manifest.exports ?? {})) {
    const file = path.join(root, entry.dir, target);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '');
  }
  for (const target of Object.values(entry.manifest.bin ?? {})) {
    const file = path.join(root, entry.dir, target);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '');
  }
};

describe('distribution boundary', () => {
  it('accepts a private, ignored, unpublishable plugin', () => {
    const root = tempRoot();
    const entry = plugin();
    materialize(root, entry);
    expect(checkBoundary(workspace(root, [entry]))).toStrictEqual([]);
  });

  it('fails a plugin that is not private', () => {
    const root = tempRoot();
    const base = plugin();
    const entry: WorkspacePackage = { ...base, manifest: { ...base.manifest, private: false } };
    materialize(root, entry);
    expect(checkBoundary(workspace(root, [entry]))).toContainEqual({
      where: 'packages/specs',
      problem: '@montflow/specs is a plugin but not private: true',
    });
  });

  it('fails a private package missing from the changeset ignore list', () => {
    const root = tempRoot();
    const entry = plugin();
    materialize(root, entry);
    const state = workspace(root, [entry]);
    expect(
      checkBoundary({ ...state, changeset: { ...state.changeset, ignore: [] } }),
    ).toContainEqual({
      where: 'packages/specs',
      problem: '@montflow/specs is private but not listed in .changeset/config.json ignore',
    });
  });

  it('fails an ignore entry that names no workspace package', () => {
    const root = tempRoot();
    const entry = plugin();
    materialize(root, entry);
    const state = workspace(root, [entry]);
    expect(
      checkBoundary({
        ...state,
        changeset: { ...state.changeset, ignore: ['@montflow/specs', '@montflow/pi-gone'] },
      }),
    ).toStrictEqual([
      {
        where: '.changeset/config.json',
        problem: 'ignore lists @montflow/pi-gone, which is not a workspace package',
      },
    ]);
  });

  it('fails an export that points at a missing file', () => {
    const root = tempRoot();
    const entry = plugin();
    materialize(root, entry);
    const state = workspace(root, [entry]);
    expect(
      checkBoundary({
        ...state,
        packages: [
          {
            ...entry,
            manifest: {
              ...entry.manifest,
              exports: { ...entry.manifest.exports, './server': './src/missing.ts' },
            },
          },
        ],
      }),
    ).toContainEqual({
      where: 'packages/specs',
      problem: 'exports ./server points at missing ./src/missing.ts',
    });
  });

  it('fails when changeset:publish builds a private package', () => {
    const root = tempRoot();
    const entry = plugin();
    materialize(root, entry);
    const state = workspace(root, [entry]);
    expect(
      checkBoundary({
        ...state,
        rootManifest: {
          ...state.rootManifest,
          scripts: {
            'changeset:publish': 'bun run --filter @montflow/specs build && changeset publish',
          },
        },
      }),
    ).toContainEqual({
      where: 'package.json',
      problem: 'changeset:publish builds private package @montflow/specs',
    });
  });

  it('fails when the release workflow stops skipping private packages', () => {
    const root = tempRoot();
    const entry = plugin();
    materialize(root, entry);
    expect(checkBoundary({ ...workspace(root, [entry]), releaseWorkflow: '' })).toContainEqual({
      where: '.github/workflows/release.yml',
      problem: 'release selection no longer skips private packages (missing "manifest.private ||")',
    });
  });
});

describe('published artifact', () => {
  it('drops internal and workspace dependencies from the install manifest', () => {
    const manifest = publishedManifest(plugin().manifest, new Map([['.', 'index.js']]));
    expect(manifest.dependencies).toStrictEqual({ effect: '4.0.0-rc.112' });
    expect(manifest.exports).toStrictEqual({
      './package.json': './package.json',
      '.': './index.js',
    });
  });

  it('accepts an artifact that only imports host singletons', () => {
    const root = tempRoot();
    writeFileSync(
      path.join(root, 'index.js'),
      'import { Effect } from "effect";\nimport "./x.js";\n',
    );
    writeFileSync(path.join(root, 'package.json'), '{}');
    const artifact: PublishedManifest = {
      name: '@montflow/specs',
      version: '0.0.1',
      private: true,
      type: 'module',
      exports: { './package.json': './package.json', '.': './index.js' },
      files: ['*.js'],
      dependencies: { effect: '4.0.0-rc.112' },
    };
    expect(
      auditArtifact(root, 'packages/specs', artifact, [{ specifier: '.', file: 'index.js' }]),
    ).toStrictEqual([]);
  });

  it('fails an artifact that imports an internal package a Git install cannot resolve', () => {
    const root = tempRoot();
    writeFileSync(
      path.join(root, 'server.js'),
      'import { entry } from "@montflow/opencode";\nimport { Host } from "@opencode/plugin/host";\n',
    );
    writeFileSync(path.join(root, 'package.json'), '{}');
    const artifact: PublishedManifest = {
      name: '@montflow/specs',
      version: '0.0.1',
      private: true,
      type: 'module',
      exports: { './package.json': './package.json', './server': './server.js' },
      files: ['*.js'],
      dependencies: { effect: '4.0.0-rc.112' },
    };
    expect(
      auditArtifact(root, 'packages/specs', artifact, [
        { specifier: './server', file: 'server.js' },
      ]),
    ).toStrictEqual([
      {
        where: 'packages/specs/server.js',
        problem: './server imports @montflow/opencode, which a Git install cannot resolve',
      },
    ]);
  });
});
