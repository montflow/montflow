import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** A workspace manifest, as packing consumes it. */
export interface Manifest {
  readonly name: string;
  readonly version?: string | undefined;
  readonly exports?: Readonly<Record<string, string>> | undefined;
  readonly dependencies?: Readonly<Record<string, string>> | undefined;
  readonly peerDependencies?: Readonly<Record<string, string>> | undefined;
}

/** One package in the workspace, by repo-relative directory. */
export interface WorkspacePackage {
  /** Repo-relative, POSIX separators (`packages/specs`). */
  readonly dir: string;
  readonly manifest: Manifest;
  readonly manifestPath: string;
}

/** Everything packing reads from the repository. */
export interface Workspace {
  readonly root: string;
  readonly packages: readonly WorkspacePackage[];
}

/** The groups `turbo` scans for packages. */
const GROUPS = ['packages', 'apps', 'tooling'] as const;

/** Read one JSON manifest. */
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

/** Read the repository state packing needs. */
export const readWorkspace = (root: string): Workspace => ({
  root,
  packages: readPackages(root),
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
