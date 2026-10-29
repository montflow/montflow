/** One model a session may fall back to: `provider/model[#variant]`. */
export interface Ref {
  readonly providerID: string;
  readonly id: string;
  readonly variant?: string | undefined;
}

/** Stable identity of a model reference, ignoring its variant. */
export const key = (ref: Pick<Ref, 'id' | 'providerID'>): string => `${ref.providerID}/${ref.id}`;

/** Configured model reference, including the variant when one was picked. */
export const label = (ref: Ref): string =>
  ref.variant === undefined ? key(ref) : `${key(ref)}#${ref.variant}`;

/** Thrown for a label that is not `provider/model` or `provider/model#variant`. */
export class InvalidReference extends Error {
  constructor(reference: string) {
    super(`Invalid model reference: ${reference}`);
    this.name = 'InvalidReference';
  }
}

/**
 * Parse one `provider/model[#variant]` label. This mirrors the host's own model
 * reference grammar without importing its schema, which cannot be evaluated
 * against the current Effect release.
 */
export const parseOne = (entry: string): Ref => {
  const slash = entry.indexOf('/');
  if (slash <= 0) throw new InvalidReference(entry);
  const providerID = entry.slice(0, slash);
  const variantAt = entry.indexOf('#', slash + 1);
  const id = entry.slice(slash + 1, variantAt === -1 ? undefined : variantAt);
  const variant = variantAt === -1 ? undefined : entry.slice(variantAt + 1);
  if (
    id === '' ||
    providerID.includes('#') ||
    (variant !== undefined && (variant === '' || variant.includes('#')))
  ) {
    throw new InvalidReference(entry);
  }
  return variant === undefined ? { providerID, id } : { providerID, id, variant };
};

/**
 * Parse configured labels into model references. Repeats collapse onto the
 * first occurrence, so a chain never retries a model twice.
 */
export const parse = (entries: ReadonlyArray<string>): ReadonlyArray<Ref> => {
  const seen = new Set<string>();
  const refs: Array<Ref> = [];
  for (const entry of entries) {
    const ref = parseOne(entry);
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
