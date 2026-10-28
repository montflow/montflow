import { Data, Effect, Schema } from 'effect';
// eslint-disable-next-line montflow/no-node-platform-imports -- config files are read and written at the CLI/plugin boundary, outside an Effect platform layer.
import { existsSync } from 'node:fs';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: atomic config writes.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: config paths.
import { dirname, join } from 'node:path';
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import { FallbackConfig } from '../fallback-config/index.js';
import type { FallbackTrigger } from '../fallback-trigger/index.js';
import { ModelChain } from '../model-chain/index.js';

/** Package spec the host matches in `plugins`; also the identity used to find the entry. */
export const packageName = '@montflow/model-fallback';

/** Indentation used when this module has to insert or reformat JSON. */
const formatting = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

const PluginObject = Schema.Struct({
  package: Schema.String,
  options: Schema.optional(Schema.Unknown),
});
const PluginEntry = Schema.Union([Schema.String, PluginObject]);
const Document = Schema.Struct({
  plugins: Schema.optional(Schema.Array(PluginEntry)),
});

const isString = Schema.is(Schema.String);

/**
 * True when a plugin spec names this package. The host installs bare specs
 * from npm, so a development checkout is registered by absolute path instead;
 * the last path segment still identifies the package. A scoped npm name for
 * another owner (`@someone/model-fallback`) never matches.
 */
const isPathSpec = (spec: string): boolean =>
  spec.startsWith('/') || spec.startsWith('\\\\') || /^[A-Za-z]:[\\/]/u.test(spec);

const isOurs = (spec: string): boolean =>
  spec === packageName ||
  (isPathSpec(spec) &&
    spec
      .replace(/[/\\]+$/, '')
      .split(/[/\\]/)
      .at(-1) === 'model-fallback');

/** The plugin entry as it exists on disk, decoded. */
export interface Current {
  readonly path: string;
  readonly present: boolean;
  readonly config: FallbackConfig.Config;
}

/** A written configuration, plus whether the file actually changed. */
export interface Written {
  readonly path: string;
  readonly changed: boolean;
}

/** Configuration file problems: unreadable, unparsable, or a conflicting `plugins` value. */
export class FileError extends Data.TaggedError('@montflow/ModelFallbackFileError')<{
  readonly reason: string;
}> {}

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Candidate config files, in the host's resolution order. */
export const candidates = (cwd: string): ReadonlyArray<string> => [
  join(cwd, 'opencode.json'),
  join(cwd, 'opencode.jsonc'),
  join(cwd, '.opencode', 'opencode.json'),
  join(cwd, '.opencode', 'opencode.jsonc'),
];

/** The file to read, or the one to create when none exists yet. */
export const locate = (cwd: string): string =>
  candidates(cwd).find((file) => existsSync(file)) ?? join(cwd, 'opencode.jsonc');

const readText = (file: string): Effect.Effect<string, FileError> =>
  Effect.tryPromise({
    try: () => readFile(file, 'utf8'),
    catch: (cause) => new FileError({ reason: `Could not read ${file}: ${reasonOf(cause)}` }),
  });

/** Decode the plugins array; `undefined` when the file has no `plugins` key. */
const parseDocument = (text: string, file: string) => {
  const errors: ParseError[] = [];
  const parsed = parse(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(`${file} is not valid JSONC (${errors.length} parse errors).`);
  }
  return Schema.decodeUnknownSync(Document)(parsed ?? {});
};

/** Position of this plugin's entry in `plugins`, or `-1`. */
const entryIndex = (plugins: ReadonlyArray<typeof PluginEntry.Type> | undefined): number =>
  plugins?.findIndex((entry) => isOurs(isString(entry) ? entry : entry.package)) ?? -1;

/** The spec already in the file, so a local path survives an update. */
const entrySpec = (plugins: ReadonlyArray<typeof PluginEntry.Type> | undefined): string => {
  const index = entryIndex(plugins);
  const entry = index === -1 || plugins === undefined ? undefined : plugins[index];
  if (entry === undefined) return packageName;
  return isString(entry) ? entry : entry.package;
};

/** Decode this plugin's options for one `plugins` array. */
const entryConfig = (
  plugins: ReadonlyArray<typeof PluginEntry.Type> | undefined,
): Effect.Effect<FallbackConfig.Config, FileError> => {
  const index = entryIndex(plugins);
  const entry = index === -1 || plugins === undefined ? undefined : plugins[index];
  const options = entry === undefined || isString(entry) ? {} : (entry.options ?? {});
  return FallbackConfig.decode(options).pipe(
    Effect.catch((error) => Effect.fail(new FileError({ reason: error.reason }))),
  );
};

/** Read the workspace configuration and decode this plugin's options. */
export const read = (cwd: string): Effect.Effect<Current, FileError> =>
  Effect.gen(function* () {
    const file = locate(cwd);
    if (!existsSync(file)) {
      return { path: file, present: false, config: FallbackConfig.idle };
    }
    const text = yield* readText(file);
    const document = yield* Effect.try({
      try: () => parseDocument(text, file),
      catch: (cause) => new FileError({ reason: reasonOf(cause) }),
    });
    const config = yield* entryConfig(document.plugins);
    return { path: file, present: true, config };
  });

const writeText = (file: string, text: string): Effect.Effect<void, FileError> =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      await writeFile(temporary, text.endsWith('\n') ? text : `${text}\n`, { mode: 0o600 });
      await rename(temporary, file);
    },
    catch: (cause) => new FileError({ reason: `Could not write ${file}: ${reasonOf(cause)}` }),
  });

const applyDocument = (text: string, file: string, next: (draft: string) => string): string => {
  const base = text.trim() === '' ? '{}\n' : text;
  const edited = next(base);
  return edited.trim() === '' ? base : edited;
};

/** Write this plugin's entry, updating it in place when it already exists. */
export const write = (
  cwd: string,
  config: {
    readonly chain: ReadonlyArray<ModelChain.Ref>;
    readonly triggers: ReadonlyArray<FallbackTrigger.Trigger>;
  },
): Effect.Effect<Written, FileError> =>
  Effect.gen(function* () {
    const file = locate(cwd);
    const text = existsSync(file) ? yield* readText(file) : '';
    const document = yield* Effect.try({
      try: () => parseDocument(text.trim() === '' ? '{}' : text, file),
      catch: (cause) => new FileError({ reason: reasonOf(cause) }),
    });
    const entry = {
      package: entrySpec(document.plugins),
      options: {
        chain: config.chain.map((ref) => ModelChain.label(ref)),
        triggers: config.triggers,
      },
    };
    const index = entryIndex(document.plugins);
    const next = applyDocument(text, file, (base) => {
      if (document.plugins === undefined) {
        return applyEdits(base, modify(base, ['plugins'], [entry], formatting));
      }
      const path = index === -1 ? ['plugins', document.plugins.length] : ['plugins', index];
      return applyEdits(base, modify(base, path, entry, formatting));
    });
    if (next === text) return { path: file, changed: false };
    yield* writeText(file, next);
    return { path: file, changed: true };
  });

/** Remove this plugin's entry, if present. */
export const remove = (cwd: string): Effect.Effect<Written, FileError> =>
  Effect.gen(function* () {
    const file = locate(cwd);
    if (!existsSync(file)) return { path: file, changed: false };
    const text = yield* readText(file);
    const document = yield* Effect.try({
      try: () => parseDocument(text, file),
      catch: (cause) => new FileError({ reason: reasonOf(cause) }),
    });
    const index = entryIndex(document.plugins);
    if (index === -1) return { path: file, changed: false };
    const next = applyEdits(text, modify(text, ['plugins', index], undefined, formatting));
    yield* writeText(file, next);
    return { path: file, changed: true };
  });
