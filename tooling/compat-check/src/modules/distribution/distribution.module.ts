import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import type { Manifest, Workspace, WorkspacePackage } from '../workspace/index.js';
import { hasPluginFace, pluginPackages, privatePackages } from '../workspace/index.js';

/** One violated distribution rule. */
export interface Problem {
  readonly where: string;
  readonly problem: string;
}

/** Host singletons that must stay external in a distributed plugin. */
export const EXTERNAL_ALLOWLIST = ['@opencode/', '@opentui/', 'effect', 'solid-js'] as const;

/** Node builtins are provided by the host runtime, prefixed or bare. */
const BUILTINS = new Set(builtinModules);

/** Builtins plus the allowlist: every other import in an artifact is a defect. */
const isAllowedImport = (specifier: string): boolean => {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return true;
  }
  if (BUILTINS.has(specifier)) return true;
  return EXTERNAL_ALLOWLIST.some((allowed) =>
    allowed.endsWith('/')
      ? specifier.startsWith(allowed)
      : specifier === allowed || specifier.startsWith(`${allowed}/`),
  );
};

/** Assert the repo-side boundary: private, ignored, unpublishable plugin packages. */
export const checkBoundary = (workspace: Workspace): readonly Problem[] => {
  const problems: Problem[] = [];
  const ignored = new Set(workspace.changeset.ignore ?? []);
  const plugins = pluginPackages(workspace);

  for (const entry of plugins) {
    const { dir, manifest } = entry;
    if (manifest.private !== true) {
      problems.push({ where: dir, problem: `${manifest.name} is a plugin but not private: true` });
    }
    const directory = manifest.repository?.directory;
    if (directory !== dir) {
      problems.push({
        where: dir,
        problem: `repository.directory is ${directory ?? '(missing)'}, expected ${dir} (needed for the Git subpath install)`,
      });
    }
    const exports = manifest.exports ?? {};
    for (const subpath of ['.', './package.json', './server', './tui']) {
      const target = exports[subpath];
      if (target === undefined) {
        problems.push({ where: dir, problem: `exports is missing ${subpath}` });
      } else if (!existsSync(path.join(workspace.root, dir, target))) {
        problems.push({ where: dir, problem: `exports ${subpath} points at missing ${target}` });
      }
    }
    for (const [name, target] of Object.entries(manifest.bin ?? {})) {
      if (!existsSync(path.join(workspace.root, dir, target))) {
        problems.push({ where: dir, problem: `bin ${name} points at missing ${target}` });
      }
    }
  }

  for (const entry of privatePackages(workspace)) {
    if (!ignored.has(entry.manifest.name)) {
      problems.push({
        where: entry.dir,
        problem: `${entry.manifest.name} is private but not listed in .changeset/config.json ignore`,
      });
    }
  }

  const names = new Set(workspace.packages.map((entry) => entry.manifest.name));
  for (const name of ignored) {
    if (!names.has(name)) {
      problems.push({
        where: '.changeset/config.json',
        problem: `ignore lists ${name}, which is not a workspace package`,
      });
    }
  }

  if (workspace.changeset.privatePackages?.version !== false) {
    problems.push({
      where: '.changeset/config.json',
      problem: 'privatePackages.version must be false so private packages are never versioned',
    });
  }
  if (workspace.changeset.privatePackages?.tag !== false) {
    problems.push({
      where: '.changeset/config.json',
      problem: 'privatePackages.tag must be false so private packages are never tagged',
    });
  }

  const publish = workspace.rootManifest.scripts?.['changeset:publish'] ?? '';
  const filters = [...publish.matchAll(/--filter\s+(\S+)/gu)].map((match) => match[1] ?? '');
  const privateNames = new Set(privatePackages(workspace).map((entry) => entry.manifest.name));
  for (const filter of filters) {
    if (privateNames.has(filter)) {
      problems.push({
        where: 'package.json',
        problem: `changeset:publish builds private package ${filter}`,
      });
    }
  }

  for (const condition of ['manifest.private ||', 'ignored.has(manifest.name)']) {
    if (!workspace.releaseWorkflow.includes(condition)) {
      problems.push({
        where: '.github/workflows/release.yml',
        problem: `release selection no longer skips private packages (missing "${condition}")`,
      });
    }
  }

  return problems;
};

/** The published-shape manifest a Git-URL install reads instead of the source one. */
export interface PublishedManifest {
  readonly name: string;
  readonly version: string;
  readonly private: boolean;
  readonly type: 'module';
  readonly exports: Readonly<Record<string, string>>;
  readonly files: readonly string[];
  readonly dependencies: Readonly<Record<string, string>>;
}

/** Build the artifact manifest: source exports mapped to their bundles. */
export const publishedManifest = (
  manifest: Manifest,
  bundles: ReadonlyMap<string, string>,
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
  return {
    name: manifest.name,
    version: manifest.version ?? '0.0.0',
    private: true,
    type: 'module',
    exports,
    files: ['*.js', 'package.json'],
    dependencies,
  };
};

/** Audit one emitted artifact: self-contained, host-external, resolvable. */
export const auditArtifact = (
  artifactRoot: string,
  where: string,
  artifact: PublishedManifest,
  bundles: readonly { readonly specifier: string; readonly file: string }[],
): readonly Problem[] => {
  const problems: Problem[] = [];
  for (const [dependency, version] of Object.entries(artifact.dependencies)) {
    if (version.includes('workspace:')) {
      problems.push({ where, problem: `${dependency} keeps a workspace: specifier` });
    }
    if (dependency.startsWith('@montflow/')) {
      problems.push({ where, problem: `${dependency} leaks an internal package dependency` });
    }
  }
  for (const [subpath, target] of Object.entries(artifact.exports)) {
    if (!existsSync(path.join(artifactRoot, target))) {
      problems.push({ where, problem: `artifact ${subpath} points at missing ${target}` });
    }
  }
  for (const { specifier, file } of bundles) {
    const source = readFileSync(path.join(artifactRoot, file), 'utf8');
    // Only top-level static imports/exports count: bundled string literals can
    // contain `from "..."` and would otherwise be read as imports.
    const imports = [
      ...source.matchAll(/^(?:import|export)\b[^\n]*?\bfrom\s*"([^"]+)"/gmu),
      ...source.matchAll(/^import\s*"([^"]+)"/gmu),
    ];
    for (const match of imports) {
      const imported = match[1] ?? '';
      if (!isAllowedImport(imported)) {
        problems.push({
          where: `${where}/${file}`,
          problem: `${specifier} imports ${imported}, which a Git install cannot resolve`,
        });
      }
    }
  }
  return [
    ...new Map(
      problems.map((problem) => [`${problem.where}\n${problem.problem}`, problem]),
    ).values(),
  ];
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
  const build = Bun.spawn(
    [
      'bun',
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
    { cwd: path.join(workspace.root, entry.dir), stdout: 'pipe', stderr: 'pipe' },
  );
  const code = await build.exited;
  if (code !== 0) {
    const error = await new Response(build.stderr).text();
    throw new Error(`packing ${entry.manifest.name} failed:\n${error}`);
  }
  const manifest = publishedManifest(
    entry.manifest,
    new Map(bundles.map((bundle) => [bundle.subpath, bundle.file])),
  );
  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    package: entry,
    dir,
    manifest,
    bundles: bundles.map((bundle) => ({ specifier: bundle.subpath, file: bundle.file })),
  };
};

/** Pack every plugin and audit the artifacts a Git install would read. */
export const checkArtifacts = async (
  workspace: Workspace,
  outRoot: string,
): Promise<readonly Problem[]> => {
  const results = await Promise.all(
    pluginPackages(workspace).map(async (entry) => {
      try {
        const artifact = await packPlugin(workspace, entry, outRoot);
        return auditArtifact(
          artifact.dir,
          artifact.package.dir,
          artifact.manifest,
          artifact.bundles,
        );
      } catch (error) {
        return [
          {
            where: entry.dir,
            problem: error instanceof Error ? error.message : String(error),
          },
        ];
      }
    }),
  );
  return results.flat();
};
