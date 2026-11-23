import { Data, Effect, Ref, Schema, type Scope } from 'effect';
// eslint-disable-next-line montflow/no-node-platform-imports -- the store is read and watched by the plugin and CLI, outside an Effect platform layer.
import { existsSync, statSync } from 'node:fs';
// eslint-disable-next-line montflow/no-node-platform-imports -- atomic store writes: unique temp name plus rename.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary: unique temp-file names.
import { randomUUID } from 'node:crypto';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary: store paths.
import { dirname, join } from 'node:path';
import { FallbackConfig } from '../fallback-config/index.js';
import { FallbackTrigger } from '../fallback-trigger/index.js';
import { ModelChain } from '../model-chain/index.js';

/** Store layout version this build understands. */
export const version = 1;

/** Directory segments under a workspace root. */
export const segments = ['.agents', '@montflow', 'model-fallback'] as const;

/** One reason a store document cannot be used, tied to the field that caused it. */
export interface Issue {
  readonly field: string;
  readonly message: string;
  /** Concrete next step, when one exists. */
  readonly fix?: string | undefined;
}

/** The configuration the plugin acts on. */
export interface Config {
  readonly chain: ReadonlyArray<ModelChain.Ref>;
  readonly triggers: ReadonlyArray<FallbackTrigger.Trigger>;
}

/** Where the configuration in force came from. */
export type Source = 'store' | 'options' | 'none';

/** The store file plus what it decoded to. */
export interface Snapshot {
  readonly path: string;
  readonly present: boolean;
  readonly source: Source;
  readonly config: Config;
  readonly issues: ReadonlyArray<Issue>;
  /** Legacy options are present but shadowed by a valid store. */
  readonly legacy: boolean;
}

/** The store document as read from disk, before precedence decisions. */
export interface Document {
  readonly present: boolean;
  readonly config: Config;
  readonly issues: ReadonlyArray<Issue>;
}

/** Store IO failures: unreadable or unwritable, not invalid content. */
export class StoreError extends Data.TaggedError('@montflow/ModelFallbackStoreError')<{
  readonly reason: string;
  /** True only for "the file is not there" (ENOENT/ENOTDIR); permission errors stay errors. */
  readonly absent?: boolean | undefined;
}> {}

/** The idle configuration: no chain, default triggers. */
export const idle: Config = { chain: [], triggers: FallbackTrigger.defaults };

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Strip control characters so store content cannot forge log or terminal lines. */
export const plain = (value: string): string => value.replaceAll(/\p{Cc}/gu, ' ');

/** Store directory for a workspace root. */
export const directory = (root: string): string => join(root, ...segments);

/** Store file for a workspace root. */
export const file = (root: string): string => join(directory(root), 'config.json');

/** Guard for a JSON object; external values are decoded, never trusted. */
// eslint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- the store file is external JSON; this guard is its boundary.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  // eslint-disable-next-line anti-slop/no-runtime-typeof -- same boundary: distinguish a JSON object from arrays and scalars.
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = Schema.is(Schema.String);
const isArray = Schema.is(Schema.Array(Schema.Unknown));

/** Decoded document: the config plus every reason it is unusable. */
export interface Decoded {
  readonly config: Config;
  readonly issues: ReadonlyArray<Issue>;
}

/** Decode one raw document into a config plus every shape issue. */
export const decode = (
  // eslint-disable-next-line anti-slop/no-unknown-parameters -- the store file is external JSON; decode is its boundary.
  raw: unknown,
): Decoded => {
  const issues: Array<Issue> = [];
  if (!isRecord(raw)) {
    return {
      config: idle,
      issues: [
        {
          field: '$',
          message: 'expected a JSON object',
          fix: 'rewrite the file with mf-model-fallback set',
        },
      ],
    };
  }

  const rawVersion = raw['version'];
  if (rawVersion !== undefined && rawVersion !== version) {
    issues.push({
      field: 'version',
      message: `expected ${version}`,
      fix: `set version to ${version} or delete the field`,
    });
  }

  const chain: Array<ModelChain.Ref> = [];
  const seen = new Set<string>();
  const rawChain = raw['chain'];
  if (!isArray(rawChain)) {
    issues.push({
      field: 'chain',
      message: 'expected an array of provider/model labels',
      fix: 'run mf-model-fallback set --chain <provider/model>,...',
    });
  } else if (rawChain.length === 0) {
    issues.push({
      field: 'chain',
      message: 'chain must not be empty; delete the file to disable',
      fix: 'run mf-model-fallback set --chain <provider/model>,...',
    });
  } else {
    for (const [index, entry] of rawChain.entries()) {
      const field = `chain[${index}]`;
      if (!isString(entry)) {
        issues.push({
          field,
          message: 'expected a provider/model label',
          fix: 'use provider/model or provider/model#variant',
        });
        continue;
      }
      let parsed: ModelChain.Ref | undefined;
      try {
        [parsed] = ModelChain.parse([entry]);
      } catch {
        issues.push({
          field,
          message: `invalid model reference '${plain(entry)}'`,
          fix: 'use provider/model or provider/model#variant',
        });
        continue;
      }
      if (parsed === undefined) continue;
      const key = ModelChain.key(parsed);
      if (seen.has(key)) {
        issues.push({
          field,
          message: `duplicate model '${plain(key)}' in chain`,
          fix: 'remove the repeat',
        });
        continue;
      }
      seen.add(key);
      chain.push(parsed);
    }
  }

  const triggers: Array<FallbackTrigger.Trigger> = [];
  const rawTriggers = raw['triggers'];
  if (rawTriggers === undefined) {
    triggers.push(...FallbackTrigger.defaults);
  } else if (!isArray(rawTriggers)) {
    issues.push({
      field: 'triggers',
      message: 'expected an array of trigger names',
      fix: `use ${FallbackTrigger.all.join(', ')}`,
    });
  } else {
    for (const [index, entry] of rawTriggers.entries()) {
      const field = `triggers[${index}]`;
      if (!isString(entry)) {
        issues.push({
          field,
          message: 'expected a trigger name',
          fix: `use ${FallbackTrigger.all.join(', ')}`,
        });
        continue;
      }
      const trigger = FallbackTrigger.from(entry);
      if (trigger === undefined) {
        issues.push({
          field,
          message: `unknown trigger '${plain(entry)}'`,
          fix: `use one of ${FallbackTrigger.all.join(', ')}`,
        });
        continue;
      }
      if (!triggers.includes(trigger)) triggers.push(trigger);
    }
  }

  return {
    config: chain.length === 0 ? idle : { chain, triggers },
    issues,
  };
};

/** Errno code on a caught filesystem error, when it has one. */
const WithCode = Schema.Struct({ code: Schema.String });
const codeOf = (cause: unknown): string | undefined =>
  Schema.is(WithCode)(cause) ? cause.code : undefined;

const readText = (target: string): Effect.Effect<string | undefined, StoreError> =>
  Effect.tryPromise({
    try: () => readFile(target, 'utf8'),
    catch: (cause) => {
      const code = codeOf(cause);
      return new StoreError({
        reason: `Could not read ${target}: ${reasonOf(cause)}`,
        absent: code === 'ENOENT' || code === 'ENOTDIR',
      });
    },
  });

/**
 * Read the store document. Missing, unreadable, and malformed all become
 * shape issues rather than hard failures, so a valid legacy configuration can
 * still win and a running plugin keeps its chain.
 */
export const read = (root: string): Effect.Effect<Document> =>
  Effect.gen(function* () {
    const target = file(root);
    const loaded = yield* readText(target).pipe(
      Effect.match({
        onFailure: (error) => ({
          ok: false as const,
          absent: error.absent === true,
          reason: error.reason,
        }),
        onSuccess: (text) => ({ ok: true as const, text }),
      }),
    );
    if (!loaded.ok && loaded.absent) {
      return { present: false, config: idle, issues: [] };
    }
    if (!loaded.ok) {
      return {
        present: true,
        config: idle,
        issues: [{ field: '$', message: plain(loaded.reason ?? 'unreadable store') }],
      };
    }
    const text = loaded.text;
    if (text === undefined) return { present: false, config: idle, issues: [] };
    const parsed = yield* Effect.try(() => JSON.parse(text)).pipe(
      Effect.orElseSucceed(() => undefined),
    );
    if (parsed === undefined) {
      return {
        present: true,
        config: idle,
        issues: [
          {
            field: '$',
            message: 'file is not valid JSON',
            fix: 'fix the JSON by hand or delete the file',
          },
        ],
      };
    }
    return { present: true, ...decode(parsed) };
  });

/**
 * Resolve the configuration in force: a valid store wins, then the legacy
 * `opencode.jsonc` options, then idle. Store issues are always reported.
 */
export const resolve = (
  root: string,
  // eslint-disable-next-line anti-slop/no-unknown-parameters -- host plugin options arrive untyped; this is the boundary parse.
  options: unknown,
): Effect.Effect<Snapshot> =>
  Effect.gen(function* () {
    const legacy = yield* legacyConfig(options);
    return yield* resolveWith(root, legacy.config, legacy.issue);
  });

/** Legacy options decoding, using the same schema as the store so one source of truth decides validity. */
const legacyConfig = (
  // eslint-disable-next-line anti-slop/no-unknown-parameters -- host plugin options arrive untyped; this is the boundary parse.
  options: unknown,
): Effect.Effect<{ readonly config?: Config | undefined; readonly issue?: Issue | undefined }> =>
  Effect.gen(function* () {
    if (options === undefined) return {};
    return yield* FallbackConfig.decode(options).pipe(
      Effect.match({
        onFailure: (error) => ({
          issue: {
            field: 'options',
            message: plain(error.reason),
            fix: 'fix the opencode.jsonc options by hand, then run mf-model-fallback migrate',
          },
        }),
        onSuccess: (config) => (config.chain.length === 0 ? {} : { config }),
      }),
    );
  });

/** Resolve against an already-decoded legacy configuration. */
export const resolveWith = (
  root: string,
  legacy: Config | undefined,
  legacyIssue?: Issue | undefined,
): Effect.Effect<Snapshot> =>
  Effect.gen(function* () {
    const target = file(root);
    const store = yield* read(root);
    const valid = store.present && store.issues.length === 0;
    const issues = legacyIssue === undefined ? store.issues : [...store.issues, legacyIssue];

    if (valid) {
      return {
        path: target,
        present: true,
        source: 'store',
        config: store.config,
        issues: [],
        legacy: legacy !== undefined,
      };
    }
    if (legacy !== undefined && legacy.chain.length > 0) {
      return {
        path: target,
        present: store.present,
        source: 'options',
        config: legacy,
        issues,
        legacy: false,
      };
    }
    return {
      path: target,
      present: store.present,
      source: 'none',
      config: idle,
      issues,
      legacy: false,
    };
  });

/**
 * The configuration to keep after a store change. Issues mean the edit is
 * unusable, so the chain already in force stays; only a clean snapshot replaces
 * it. This is what stops one typo from silently disabling fallback.
 */
export const adopt = (current: Config, snapshot: Snapshot): Config =>
  snapshot.issues.length > 0 ? current : snapshot.config;

/** Serialize a store document, keeping keys this build does not understand. */
const serialize = (
  // eslint-disable-next-line anti-slop/no-unsafe-dictionary-type -- unknown keys are preserved verbatim; values are never interpreted here.
  base: Record<string, unknown>,
  config: Config,
): string => {
  const document = {
    ...base,
    version,
    chain: config.chain.map((ref) => ModelChain.label(ref)),
    triggers: config.triggers,
  };
  return `${JSON.stringify(document, null, 2)}\n`;
};

/**
 * Write the chain and triggers, preserving unknown top-level keys. Returns
 * `changed: false` when the bytes would not move. The temp file is unique, so
 * two writers cannot interleave through one shared name.
 */
export const write = (
  root: string,
  config: Config,
): Effect.Effect<{ readonly path: string; readonly changed: boolean }, StoreError> =>
  Effect.gen(function* () {
    const target = file(root);
    const existing =
      (yield* readText(target).pipe(
        Effect.catch((error) =>
          error.absent === true
            ? Effect.succeed<string | undefined>(undefined)
            : Effect.fail(error),
        ),
      )) ?? '';
    const base = yield* Effect.try({
      try: () => {
        const parsed: unknown = existing.trim() === '' ? {} : JSON.parse(existing);
        return isRecord(parsed) ? parsed : {};
      },
      catch: () => new StoreError({ reason: `${target} is not valid JSON; fix it before writing` }),
    });
    const text = serialize(base, config);
    if (text === existing) return { path: target, changed: false };
    yield* Effect.tryPromise({
      try: async () => {
        await mkdir(dirname(target), { recursive: true });
        const temporary = `${target}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
          await rename(temporary, target);
        } catch (cause) {
          await rm(temporary, { force: true }).catch(() => undefined);
          throw cause;
        }
      },
      catch: (cause) => new StoreError({ reason: `Could not write ${target}: ${reasonOf(cause)}` }),
    });
    return { path: target, changed: true };
  });

/** Delete the store file. Removing an absent file reports `changed: false`. */
export const remove = (root: string): Effect.Effect<{ readonly changed: boolean }, StoreError> =>
  Effect.gen(function* () {
    const target = file(root);
    if (!existsSync(target)) return { changed: false };
    yield* Effect.tryPromise({
      try: () => rm(target, { recursive: true, force: true }),
      catch: (cause) =>
        new StoreError({ reason: `Could not remove ${target}: ${reasonOf(cause)}` }),
    });
    return { changed: true };
  });

/** Nearest existing ancestor of the store directory, ending at the workspace root. */
/**
 * Cheap change token for the store: size plus mtime, or `absent`. Polling this
 * is the only reliable option in the Bun host: `fs.watch` never reports
 * dot-named entries (`.agents`), and replacing the watched directory emits no
 * move event.
 */
export const changeToken = (root: string): string => {
  try {
    const info = statSync(file(root));
    return `${info.size}:${info.mtimeMs}`;
  } catch {
    return 'absent';
  }
};

/**
 * Watch for store changes and run `onChange` once per observed change. Scoped:
 * the poll fiber dies with the plugin. A one-second cadence is well below any
 * human edit loop and costs one stat call.
 */
export const watch = (
  root: string,
  onChange: Effect.Effect<void>,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const token = yield* Ref.make(changeToken(root));
    yield* Effect.gen(function* () {
      yield* Effect.sleep('1 second');
      const next = yield* Effect.sync(() => changeToken(root));
      const previous = yield* Ref.getAndSet(token, next);
      if (next !== previous) yield* onChange;
    }).pipe(Effect.forever, Effect.forkScoped, Effect.asVoid);
  });
