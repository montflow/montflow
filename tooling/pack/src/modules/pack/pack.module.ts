import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import type { Manifest, Workspace, WorkspacePackage } from '../workspace/index.js';
import { hasPluginFace } from '../workspace/index.js';

/** Node builtins are provided by the host runtime. */
const BUILTINS = new Set(builtinModules);

/** True for an import the bundler left external (not relative and not a builtin). */
export const isExternalImport = (specifier: string): boolean =>
  !specifier.startsWith('.') &&
  !specifier.startsWith('/') &&
  !specifier.startsWith('node:') &&
  !BUILTINS.has(specifier);

/** The package a bare specifier resolves to (`@opencode/schema/agent` → `@opencode/schema`). */
const packageOf = (specifier: string): string => {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
};

/** Top-level static imports/exports of one emitted bundle. */
export const importsOf = (source: string): readonly string[] =>
  [
    ...source.matchAll(/^(?:import|export)\b[^\n]*?\bfrom\s*"([^"]+)"/gmu),
    ...source.matchAll(/^import\s*"([^"]+)"/gmu),
  ].map((match) => match[1] ?? '');

/** The published-shape manifest a Git-URL install reads instead of the source one. */
export interface PublishedManifest {
  readonly name: string;
  readonly version: string;
  readonly private: boolean;
  readonly type: 'module';
  readonly exports: Readonly<Record<string, string>>;
  readonly files: readonly string[];
  readonly dependencies: Readonly<Record<string, string>>;
  /** Host singletons the artifact imports but does not bundle. */
  readonly peerDependencies: Readonly<Record<string, string>>;
}

/**
 * Build the artifact manifest: source exports mapped to their bundles, the
 * declared runtime dependencies, and the host externals the emitted bundles
 * actually import. A host external the artifact imports must be declared or a
 * Git install outside the host tree cannot resolve it.
 * @param manifest - source package manifest
 * @param bundles - subpath → emitted file
 * @param externals - external import specifiers found in the emitted bundles
 */
export const publishedManifest = (
  manifest: Manifest,
  bundles: ReadonlyMap<string, string>,
  externals: readonly string[] = [],
): PublishedManifest => {
  const exports = Object.fromEntries([
    ['./package.json', './package.json'],
    ...[...bundles].map(([subpath, file]) => [subpath, `./${file}`]),
  ]);
  const dependencies = Object.fromEntries(
    (['dependencies', 'peerDependencies'] as const)
      .flatMap((field) => Object.entries(manifest[field] ?? {}))
      .filter(([dependency]) => !dependency.startsWith('@montflow/')),
  );
  const peerDependencies = Object.fromEntries(
    [...new Set(externals.map((specifier) => packageOf(specifier)))]
      .filter((dependency) => !(dependency in dependencies))
      .map((dependency) => [dependency, '*']),
  );
  return {
    name: manifest.name,
    version: manifest.version ?? '0.0.0',
    private: true,
    type: 'module',
    exports,
    files: ['*.js', 'package.json'],
    dependencies,
    peerDependencies,
  };
};

/** A generated artifact and the manifest it ships. */
export interface Artifact {
  readonly package: WorkspacePackage;
  readonly dir: string;
  readonly manifest: PublishedManifest;
  readonly bundles: readonly { readonly specifier: string; readonly file: string }[];
}

const bundleName = (target: string): string => {
  const base = path.basename(target);
  const stem = base.replace(/\.(?:ts|tsx|js|mjs)$/u, '');
  return `${stem}.js`;
};

/** Run `bun build` for one plugin and reject with its stderr when it fails. */
const build = (label: string, args: readonly string[], cwd: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('bun', args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      reject(new Error(`packing ${label} failed: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `packing ${label} failed: ${stderr.trim() || `bun build exited with code ${code}`}`,
          ),
        );
    });
  });

/** Bundle one plugin's export entries into a published-shape artifact. */
export const packPlugin = async (
  workspace: Workspace,
  entry: WorkspacePackage,
  outRoot: string,
): Promise<Artifact> => {
  if (!hasPluginFace(entry.manifest)) {
    throw new Error(`${entry.manifest.name} exposes no plugin face`);
  }
  const dir = path.join(outRoot, entry.manifest.name.replace('/', '__'));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const bundles = Object.entries(entry.manifest.exports ?? {})
    .filter(([subpath]) => subpath !== './package.json')
    .map(([subpath, target]) => ({ subpath, file: bundleName(target), target }));
  await build(
    entry.manifest.name,
    [
      'build',
      ...bundles.map((bundle) => bundle.target),
      '--target=node',
      '--format=esm',
      '--external',
      '@opencode/*',
      '--external',
      'effect',
      '--external',
      'effect/*',
      '--external',
      '@opentui/*',
      '--external',
      'solid-js',
      '--external',
      'solid-js/*',
      '--outdir',
      dir,
    ],
    path.join(workspace.root, entry.dir),
  );
  const externals = bundles.flatMap((bundle) =>
    importsOf(readFileSync(path.join(dir, bundle.file), 'utf8')).filter(isExternalImport),
  );
  const manifest = publishedManifest(
    entry.manifest,
    new Map(bundles.map((bundle) => [bundle.subpath, bundle.file])),
    externals,
  );
  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    package: entry,
    dir,
    manifest,
    bundles: bundles.map((bundle) => ({ specifier: bundle.subpath, file: bundle.file })),
  };
};
