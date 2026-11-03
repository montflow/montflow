#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Host } from '@opencode/plugin/host';

/**
 * Loads every plugin the workspace config points at through the same host
 * resolution path OpenCode uses. The config names directories, so resolution
 * runs without a package name: the host probes `server`, then `tui`, then
 * `rpc` beside the directory.
 */

/** Repo root, resolved from this script so the check works at any cwd. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The one config file OpenCode reads from a workspace. */
const CONFIG = path.join(ROOT, 'opencode.jsonc');

/** The Node-style code Bun attaches to a failed resolution. */
const codeOf = (cause: unknown): string | undefined => {
  if (!(cause instanceof Object) || !('code' in cause)) return undefined;
  return cause.code === undefined ? undefined : String(cause.code);
};

// `Host.resolve` ignores a missing subpath only when the rejection is an
// `Error` carrying a Node code. Bun's `ResolveMessage` is not an `Error`, so it
// rethrows on the first absent subpath instead of probing the next one.
const resolveSync = Bun.resolveSync.bind(Bun);
const patchedResolve: typeof Bun.resolveSync = (specifier, parent) => {
  try {
    return resolveSync(specifier, parent);
  } catch (cause) {
    const error: Error & { code?: string } = new Error(
      cause instanceof Error ? cause.message : String(cause),
    );
    const code = codeOf(cause);
    if (code !== undefined) error.code = code;
    throw error;
  }
};
Bun.resolveSync = patchedResolve;

/** What a plugin entry must expose once loaded. */
interface PluginModule {
  readonly default?: {
    readonly id?: unknown;
    readonly effect?: unknown;
    readonly setup?: unknown;
  };
}

/** One config entry reduced to the directory the host resolves. */
const directoryOf = (entry: string): string => {
  if (entry.startsWith('file://')) return fileURLToPath(entry);
  return path.isAbsolute(entry) ? entry : path.resolve(ROOT, entry);
};

/** Import one host entrypoint and check the face that entry must expose. */
const checkEntry = async (
  entrypoint: string,
  face: 'server' | 'tui',
): Promise<string | undefined> => {
  const loaded = (await Host.load(entrypoint)) as PluginModule;
  const plugin = loaded.default;
  if (plugin === undefined) return 'entry has no default export';
  if (face === 'server' && typeof plugin.effect !== 'function') {
    return 'server default has no effect';
  }
  if (face === 'tui' && typeof plugin.setup !== 'function') {
    return 'tui default has no setup';
  }
  return undefined;
};

/** Check every plugin directory named in `opencode.jsonc`. */
const main = async (): Promise<void> => {
  const raw = await readFile(CONFIG, 'utf8').catch(() => undefined);
  if (raw === undefined) {
    console.log(`No ${path.relative(ROOT, CONFIG)}; no plugins to check.`);
    return;
  }
  const config = Bun.JSONC.parse(raw) as { plugins?: unknown; plugin?: unknown };
  const configured = [config.plugins, config.plugin].find(Array.isArray) ?? [];
  const entries = (configured as ReadonlyArray<unknown>).filter(
    (entry): entry is string => typeof entry === 'string' && !entry.startsWith('-'),
  );
  if (entries.length === 0) {
    console.log('No plugins configured.');
    return;
  }

  const failures: Array<string> = [];
  for (const entry of entries) {
    const directory = directoryOf(entry);
    const resolved = Host.resolve({ directory });
    const present: Array<{ face: 'server' | 'tui'; entrypoint: string }> = [];
    if (typeof resolved.server === 'string') {
      present.push({ face: 'server', entrypoint: resolved.server });
    }
    if (typeof resolved.tui === 'string') {
      present.push({ face: 'tui', entrypoint: resolved.tui });
    }
    if (present.length === 0) {
      failures.push(`${entry}: no server, tui, or rpc entry`);
      continue;
    }
    for (const { face, entrypoint } of present) {
      // oxlint-disable-next-line no-await-in-loop -- one failure report per entrypoint.
      const problem = await checkEntry(entrypoint, face).catch(
        (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)),
      );
      if (problem === undefined) {
        console.log(`  ✓ ${entry} (${face})`);
      } else {
        failures.push(`${entry} (${face}): ${problem}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} plugin entr${failures.length === 1 ? 'y' : 'ies'} failed:`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(`\n${entries.length} plugin(s) resolved and loaded.`);
};

await main();
