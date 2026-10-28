import { Model } from '@opencode/schema/model';

/** One model a session may fall back to. */
export type Ref = Model.Ref;

/** Stable identity of a model reference, ignoring its variant. */
export const key = (ref: Pick<Ref, 'id' | 'providerID'>): string => `${ref.providerID}/${ref.id}`;

/** Configured model reference, including the variant when one was picked. */
export const label = (ref: Ref): string =>
  ref.variant === undefined ? key(ref) : `${key(ref)}#${ref.variant}`;

/**
 * Parse configured `provider/model[#variant]` strings into model references.
 * Repeats collapse onto the first occurrence, so a chain never retries a model
 * twice.
 */
export const parse = (entries: ReadonlyArray<string>): ReadonlyArray<Ref> => {
  const seen = new Set<string>();
  const refs: Array<Ref> = [];
  for (const entry of entries) {
    const ref = Model.Ref.parse(entry);
    const id = key(ref);
    if (seen.has(id)) continue;
    seen.add(id);
    refs.push(ref);
  }
  return refs;
};

/**
 * The next model to try: the first chain entry after `current` that is not in
 * `tried`. A model outside the chain starts from the head of the chain. The
 * chain never wraps, so an exhausted chain returns `undefined` instead of
 * cycling back to the model that just failed.
 */
export const next = (
  chain: ReadonlyArray<Ref>,
  current: Pick<Ref, 'id' | 'providerID'>,
  tried: ReadonlySet<string>,
): Ref | undefined => {
  const index = chain.findIndex((entry) => key(entry) === key(current));
  const candidates = index === -1 ? chain : chain.slice(index + 1);
  return candidates.find((entry) => !tried.has(key(entry)));
};
