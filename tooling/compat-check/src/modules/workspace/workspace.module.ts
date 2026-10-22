import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** A workspace manifest, as these checks consume it. */
export interface Manifest {
  readonly name: string;
  readonly version?: string | undefined;
  readonly private?: boolean | undefined;
  readonly exports?: Readonly<Record<string, string>> | undefined;
  readonly bin?: Readonly<Record<string, string>> | undefined;
  readonly repository?:
    | {
        readonly type?: string | undefined;
        readonly url?: string | undefined;
        readonly directory?: string | undefined;
      }
    | undefined;
  readonly dependencies?: Readonly<Record<string, string>> | undefined;
  readonly devDependencies?: Readonly<Record<string, string>> | undefined;
  readonly optionalDependencies?: Readonly<Record<string, string>> | undefined;
  readonly peerDependencies?: Readonly<Record<string, string>> | undefined;
  readonly overrides?: Readonly<Record<string, string>> | undefined;
  readonly scripts?: Readonly<Record<string, string>> | undefined;
  readonly files?: readonly string[] | undefined;
}

/** One package in the workspace, by repo-relative directory. */
export interface WorkspacePackage {
  /** Repo-relative, POSIX separators (`packages/specs`). */
  readonly dir: string;
  readonly manifest: Manifest;
  readonly manifestPath: string;
}

/** The Changesets knobs that decide what may be published. */
export interface ChangesetConfig {
  readonly access?: string | undefined;
  readonly ignore?: readonly string[] | undefined;
  readonly privatePackages?:
    | {
        readonly version?: boolean | undefined;
        readonly tag?: boolean | undefined;
      }
    | undefined;
}

/** Everything the checks read from the repository. */
export interface Workspace {
  readonly root: string;
  readonly rootManifest: Manifest;
  readonly packages: readonly WorkspacePackage[];
  readonly changeset: ChangesetConfig;
  readonly releaseWorkflow: string;
  readonly lockfile: string;
}

/** The groups `turbo` and the release workflow scan for packages. */
const GROUPS = ['packages', 'apps', 'tooling'] as const;

/** Read one JSON manifest. Malformed JSON fails the check loudly. */
export const readManifest = (file: string): Manifest => {
  const raw: Manifest = JSON.parse(readFileSync(file, 'utf8'));
  return raw;
};

/** Read every workspace package under the scanned groups. */
const readPackages = (root: string): readonly WorkspacePackage[] =>
  GROUPS.flatMap((group) => {
    const directory = path.join(root, group);
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${group}/${entry.name}`)
      .filter((dir) => existsSync(path.join(root, dir, 'package.json')))
      .map((dir) => ({
        dir,
        manifestPath: path.join(root, dir, 'package.json'),
        manifest: readManifest(path.join(root, dir, 'package.json')),
      }));
  });

/** Read the repository state the drift and distribution checks assert on. */
export const readWorkspace = (root: string): Workspace => ({
  root,
  rootManifest: readManifest(path.join(root, 'package.json')),
  packages: readPackages(root),
  changeset: JSON.parse(readFileSync(path.join(root, '.changeset', 'config.json'), 'utf8')),
  releaseWorkflow: readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8'),
  lockfile: readFileSync(path.join(root, 'bun.lock'), 'utf8'),
});

/**
 * A package that exposes an OpenCode plugin server entry. The adapter library
 * also ships a `./tui` seam module, so only `./server` identifies a plugin.
 */
export const hasPluginFace = (manifest: Manifest): boolean =>
  manifest.exports?.['./server'] !== undefined;

/** Every package the host can load as a plugin. */
export const pluginPackages = (workspace: Workspace): readonly WorkspacePackage[] =>
  workspace.packages.filter((entry) => hasPluginFace(entry.manifest));

/** Every package that must never reach a public registry. */
export const privatePackages = (workspace: Workspace): readonly WorkspacePackage[] =>
  workspace.packages.filter((entry) => entry.manifest.private === true);

/** The package fields a dependency may be declared in. */
export const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

/** One declared dependency, with the place it was declared. */
export interface Declaration {
  readonly where: string;
  readonly field: (typeof DEPENDENCY_FIELDS)[number];
  readonly dependency: string;
  readonly value: string;
}

/** Every dependency declaration in the workspace, root first. */
export const declarations = (workspace: Workspace): readonly Declaration[] => {
  const sources: readonly { readonly where: string; readonly manifest: Manifest }[] = [
    { where: '.', manifest: workspace.rootManifest },
    ...workspace.packages.map((entry) => ({ where: entry.dir, manifest: entry.manifest })),
  ];
  return sources.flatMap(({ where, manifest }) =>
    DEPENDENCY_FIELDS.flatMap((field) => {
      const record = manifest[field];
      if (record === undefined) return [];
      return Object.entries(record).map(([dependency, value]) => ({
        where,
        field,
        dependency,
        value,
      }));
    }),
  );
};
