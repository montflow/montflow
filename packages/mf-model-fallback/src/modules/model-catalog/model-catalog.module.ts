import { OpenCode } from '@opencode/client';
import { discover, headers, type Endpoint } from '@opencode/client/service';
import { Config, Data, Effect, Schema } from 'effect';
// eslint-disable-next-line montflow/no-node-platform-imports -- the CLI reads the host's model-preference file from disk.
import { readFile } from 'node:fs/promises';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary: resolving the user state directory.
import { homedir } from 'node:os';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary: joining the preference path.
import { join } from 'node:path';
import type { ModelChain } from '../model-chain/index.js';

/** One model the machine can actually run, as the live catalog reports it. */
export interface Candidate {
  readonly label: string;
  readonly providerID: string;
  readonly modelID: string;
  readonly name: string;
  /** Context window in tokens. */
  readonly context: number;
  /** USD per million output tokens; `0` for free models. */
  readonly outputCost: number;
  readonly tools: boolean;
  readonly status: string;
}

/** The host's model picker preferences, mirrored from `model.json`. */
export interface Preferences {
  readonly favorite: ReadonlyArray<string>;
  readonly recent: ReadonlyArray<string>;
  /** `provider/model` → variant id, when the user picked one. */
  readonly variant: ReadonlyMap<string, string>;
}

/** No usable catalog: no server, or the server refused the request. */
export class CatalogError extends Data.TaggedError('@montflow/ModelFallbackCatalogError')<{
  readonly reason: string;
}> {}

const Preference = Schema.Struct({
  providerID: Schema.String,
  modelID: Schema.String,
});
const PreferenceFile = Schema.Struct({
  recent: Schema.optional(Schema.Array(Preference)),
  favorite: Schema.optional(Schema.Array(Preference)),
  variant: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** State directory the host writes `model.json` into. */
const stateDirectory = (): Effect.Effect<string> =>
  Effect.gen(function* () {
    const xdg = yield* Config.String('XDG_STATE_HOME').pipe(Effect.orElseSucceed(() => ''));
    return xdg === '' ? join(homedir(), '.local', 'state') : xdg;
  });

const label = (input: { readonly providerID: string; readonly modelID: string }): string =>
  `${input.providerID}/${input.modelID}`;

/** Read the host's favorite/recent models. Missing or malformed files read as empty. */
export const preferences = (): Effect.Effect<Preferences> =>
  Effect.gen(function* () {
    const empty: Preferences = { favorite: [], recent: [], variant: new Map() };
    const directory = yield* stateDirectory();
    const file = join(directory, 'opencode', 'model.json');
    const raw = yield* Effect.tryPromise(() => readFile(file, 'utf8')).pipe(
      Effect.orElseSucceed(() => ''),
    );
    if (raw === '') return empty;
    const fallback: typeof PreferenceFile.Type = { recent: [], favorite: [], variant: {} };
    const decoded = yield* Effect.try(() =>
      Schema.decodeUnknownSync(PreferenceFile)(JSON.parse(raw)),
    ).pipe(Effect.orElseSucceed(() => fallback));
    return {
      favorite: (decoded.favorite ?? []).map(label),
      recent: (decoded.recent ?? []).map(label),
      variant: new Map(Object.entries(decoded.variant ?? {})),
    };
  });

/** The subset of a catalog model entry this module reads. */
interface CatalogModel {
  readonly providerID: string;
  readonly modelID: string;
  readonly name: string;
  readonly capabilities: { readonly tools: boolean };
  readonly status: string;
  readonly limit?: { readonly context?: number | undefined } | undefined;
  readonly cost?: ReadonlyArray<{ readonly output: number }> | undefined;
}

const toCandidate = (model: CatalogModel): Candidate => ({
  label: label({ providerID: model.providerID, modelID: model.modelID }),
  providerID: model.providerID,
  modelID: model.modelID,
  name: model.name,
  context: model.limit?.context ?? 0,
  outputCost: model.cost?.[0]?.output ?? 0,
  tools: model.capabilities.tools,
  status: model.status,
});

/**
 * Every model the running host reports as usable in `directory`. A server is
 * required: it is the only source that knows which providers have credentials.
 */
export const load = (input: {
  readonly directory: string;
  readonly server?: string | undefined;
}): Effect.Effect<ReadonlyArray<Candidate>, CatalogError> =>
  Effect.gen(function* () {
    const discovered =
      input.server === undefined ? yield* Effect.promise(() => discover()) : undefined;
    const url = discovered?.url ?? input.server;
    if (url === undefined) {
      return yield* new CatalogError({
        reason: 'No running OpenCode server found. Start `opencode serve`, or pass --server <url>.',
      });
    }
    const endpoint: Endpoint =
      discovered?.auth === undefined ? { url } : { url, auth: discovered.auth };
    const client =
      endpoint.auth === undefined
        ? OpenCode.make({ baseUrl: endpoint.url })
        : OpenCode.make({ baseUrl: endpoint.url, headers: headers(endpoint) });
    const result = yield* Effect.tryPromise({
      try: () => client.model.list({ location: { directory: input.directory } }),
      catch: (cause) =>
        new CatalogError({
          reason: `Could not list models from ${endpoint.url}: ${reasonOf(cause)}`,
        }),
    });
    return result.data.map(toCandidate).filter((candidate) => candidate.tools);
  });

const cheapest = (a: Candidate, b: Candidate): number =>
  a.outputCost - b.outputCost || b.context - a.context;

/** A ranked candidate, tagged with where the ranking saw it. */
export interface Ranked extends Candidate {
  readonly favorite: boolean;
  readonly recent: boolean;
}

/**
 * Order candidates for a fallback chain: the user's favorites, then recent
 * models, then the cheapest active model per provider. Ordering is stable and
 * duplicates collapse, so a suggestion never names the same model twice.
 */
export const rank = (
  candidates: ReadonlyArray<Candidate>,
  prefs: Preferences,
): ReadonlyArray<Ranked> => {
  const favorites = new Set(prefs.favorite);
  const recents = new Set(prefs.recent);
  const byLabel = new Map(candidates.map((candidate) => [candidate.label, candidate]));
  const ordered: Array<Ranked> = [];
  const seen = new Set<string>();
  const take = (entry: Candidate | undefined): void => {
    if (entry === undefined || seen.has(entry.label)) return;
    seen.add(entry.label);
    ordered.push({
      ...entry,
      favorite: favorites.has(entry.label),
      recent: recents.has(entry.label) && !favorites.has(entry.label),
    });
  };

  for (const entry of [...prefs.favorite, ...prefs.recent]) take(byLabel.get(entry));

  const active = candidates
    .filter((candidate) => candidate.status !== 'deprecated')
    .toSorted(cheapest);
  const providers = new Set<string>();
  for (const candidate of active) {
    if (providers.has(candidate.providerID)) continue;
    providers.add(candidate.providerID);
    take(candidate);
  }
  for (const candidate of active) take(candidate);
  // Deprecated models stay visible so `models` and the picker can explain a
  // chain that already points at one; they are never suggested first.
  for (const candidate of candidates) take(candidate);
  return ordered;
};

/** Chain labels for the first `max` ranked models, carrying the user's variant when picked. */
export const suggest = (
  ranked: ReadonlyArray<Candidate>,
  prefs: Preferences,
  max: number,
): ReadonlyArray<string> =>
  ranked.slice(0, max).map((candidate) => {
    const variant = prefs.variant.get(candidate.label);
    return variant === undefined || variant === 'default'
      ? candidate.label
      : `${candidate.label}#${variant}`;
  });

/** True when every chain label names a catalog model, ignoring the variant. */
export const unknown = (
  chain: ReadonlyArray<ModelChain.Ref>,
  candidates: ReadonlyArray<Candidate>,
): ReadonlyArray<string> => {
  const known = new Set(candidates.map((candidate) => candidate.label));
  return chain
    .filter((ref) => !known.has(`${ref.providerID}/${ref.id}`))
    .map((ref) => `${ref.providerID}/${ref.id}`);
};
