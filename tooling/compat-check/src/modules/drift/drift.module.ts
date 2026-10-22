import { createRequire } from 'node:module';
import path from 'node:path';
import type { Workspace } from '../workspace/index.js';
import { declarations, readManifest } from '../workspace/index.js';

/** The host line montflow must not diverge from, read from the installed host. */
export interface HostCatalog {
  /** `@opencode/plugin` version, the host release montflow targets. */
  readonly plugin: string;
  /** The host's exact `effect` dependency. */
  readonly effect: string;
  /** The host's peer ranges for the renderer singletons. */
  readonly peers: {
    readonly '@opentui/core': string;
    readonly '@opentui/solid': string;
    readonly 'solid-js': string;
  };
}

/** One divergence between a declared or resolved pin and the host line. */
export interface Drift {
  readonly where: string;
  readonly dependency: string;
  readonly expected: string;
  readonly actual: string;
}

/** Dependencies that must equal the host `effect` line exactly. */
const ALIGNED = new Set([
  'effect',
  '@effect/platform-node',
  '@effect/platform-node-shared',
  '@effect/vitest',
]);

/** Host packages that must equal the host release exactly. */
const HOST_PINNED = new Set(['@opencode/plugin', '@opencode/schema']);

/** Renderer singletons: declared as a host range or an exact version inside it. */
const RANGED = new Set(['@opentui/core', '@opentui/solid', 'solid-js']);

/** The overrides the workspace must carry so no range resolves off the host line. */
const REQUIRED_OVERRIDES = ['effect', '@effect/platform-node-shared'] as const;

/** The host peer range for one renderer singleton. */
const peerRange = (host: HostCatalog, dependency: string): string => {
  const peers: Readonly<Record<string, string>> = host.peers;
  return peers[dependency] ?? '';
};

/** A resolved version read from the lockfile. */
export interface ResolvedVersion {
  readonly dependency: string;
  readonly version: string;
}

const asRecord = (value: Readonly<Record<string, string>> | undefined) => value ?? {};

/** Read the installed host manifest and project the pins montflow must match. */
export const readHostCatalog = (workspace: Workspace): HostCatalog => {
  const require = createRequire(path.join(workspace.root, 'packages', 'opencode', 'package.json'));
  const manifest = readManifest(require.resolve('@opencode/plugin/package.json'));
  const version = manifest.version ?? '';
  const effect = asRecord(manifest.dependencies)['effect'] ?? '';
  const peers = asRecord(manifest.peerDependencies);
  const host: HostCatalog = {
    plugin: version,
    effect,
    peers: {
      '@opentui/core': peers['@opentui/core'] ?? '',
      '@opentui/solid': peers['@opentui/solid'] ?? '',
      'solid-js': peers['solid-js'] ?? '',
    },
  };
  if (host.plugin === '' || host.effect === '') {
    throw new Error('the installed @opencode/plugin manifest declares no version or effect pin');
  }
  for (const [dependency, range] of Object.entries(host.peers)) {
    if (range === '')
      throw new Error(`the installed @opencode/plugin declares no ${dependency} peer`);
  }
  return host;
};

const versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/u;

const numericVersion = (version: string): readonly [number, number, number] | undefined => {
  const match = versionPattern.exec(version);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const compareVersions = (left: string, right: string): number => {
  const a = numericVersion(left);
  const b = numericVersion(right);
  if (a === undefined || b === undefined) return Number.NaN;
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  // A prerelease sorts below its release (`4.0.0-rc.112 < 4.0.0`).
  const leftPre = left.includes('-');
  const rightPre = right.includes('-');
  if (leftPre !== rightPre) return leftPre ? -1 : 1;
  return 0;
};

/** Whether `version` satisfies a `>=x.y.z` host floor. */
export const satisfiesFloor = (version: string, floor: string): boolean => {
  if (!floor.startsWith('>=')) return version === floor;
  const comparison = compareVersions(version, floor.slice(2).trim());
  return Number.isNaN(comparison) ? false : comparison >= 0;
};

/** Read the top-level resolved versions from `bun.lock`. */
export const readResolvedVersions = (lockfile: string): readonly ResolvedVersion[] =>
  lockfile.split('\n').flatMap((line) => {
    const entry = /^ {4}"([^"]+)": \["([^"]+)"/u.exec(line);
    if (entry === null) return [];
    const [, key, spec] = entry;
    if (key === undefined || spec === undefined) return [];
    // Nested resolutions (`"@opentui/solid/solid-js": ["solid-js@1.9.12"...]`)
    // are a distinct graph node, not the workspace's declared copy.
    if (!spec.startsWith(`${key}@`)) return [];
    return [{ dependency: key, version: spec.slice(key.length + 1) }];
  });

const actualOf = (values: readonly string[]): string =>
  values.length === 0 ? '(none resolved)' : values.join(', ');

/** Assert every declared and resolved pin against the host line. */
export const checkDrift = (
  workspace: Workspace,
  host: HostCatalog,
  resolved: readonly ResolvedVersion[],
): readonly Drift[] => {
  const drift: Drift[] = [];
  const resolvedFor = (dependency: string) =>
    resolved.filter((entry) => entry.dependency === dependency).map((entry) => entry.version);

  for (const declaration of declarations(workspace)) {
    const { where, dependency, value } = declaration;
    if (ALIGNED.has(dependency) && value !== host.effect) {
      drift.push({ where, dependency, expected: host.effect, actual: value });
    }
    if (HOST_PINNED.has(dependency) && value !== host.plugin) {
      drift.push({ where, dependency, expected: host.plugin, actual: value });
    }
    if (RANGED.has(dependency)) {
      const range = peerRange(host, dependency);
      if (!value.startsWith('>=') && !satisfiesFloor(value, range)) {
        drift.push({ where, dependency, expected: range, actual: value });
      }
      if (value.startsWith('>=') && value !== range) {
        drift.push({ where, dependency, expected: range, actual: value });
      }
    }
  }

  const overrides = asRecord(workspace.rootManifest.overrides);
  for (const dependency of REQUIRED_OVERRIDES) {
    const value = overrides[dependency];
    if (value !== host.effect) {
      drift.push({ where: '.', dependency, expected: host.effect, actual: value ?? '(missing)' });
    }
  }

  // One copy of each renderer singleton: every exact declaration agrees.
  for (const dependency of RANGED) {
    const exact = [
      ...new Set(
        declarations(workspace)
          .filter((entry) => entry.dependency === dependency && !entry.value.startsWith('>='))
          .map((entry) => entry.value),
      ),
    ];
    const [first, ...rest] = exact;
    if (first !== undefined && rest.length > 0) {
      drift.push({
        where: 'workspace',
        dependency,
        expected: `a single ${dependency} pin`,
        actual: exact.join(', '),
      });
    }
  }

  for (const dependency of [...ALIGNED, ...HOST_PINNED]) {
    const expected = HOST_PINNED.has(dependency) ? host.plugin : host.effect;
    const actual = resolvedFor(dependency);
    const divergent = actual.filter((version) => version !== expected);
    if (divergent.length > 0) {
      drift.push({
        where: 'bun.lock',
        dependency,
        expected,
        actual: actualOf(divergent),
      });
    }
  }

  for (const dependency of RANGED) {
    const range = peerRange(host, dependency);
    const actual = resolvedFor(dependency);
    const outside = actual.filter((version) => !satisfiesFloor(version, range));
    if (outside.length > 0) {
      drift.push({ where: 'bun.lock', dependency, expected: range, actual: actualOf(outside) });
    }
    if (new Set(actual).size > 1) {
      drift.push({
        where: 'bun.lock',
        dependency,
        expected: `a single resolved ${dependency}`,
        actual: actualOf(actual),
      });
    }
  }

  return drift;
};
