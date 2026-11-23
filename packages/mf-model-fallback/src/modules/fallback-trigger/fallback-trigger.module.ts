/**
 * Why a model call is worth abandoning in favour of the next chain model.
 * Provider failures arrive as session error types plus an optional HTTP status;
 * both are folded onto this closed set so options stay readable.
 */
export type Trigger =
  | 'auth'
  | 'provider-internal'
  | 'quota'
  | 'rate-limit'
  | 'timeout'
  | 'transport';

/** The provider failure a fallback decision is based on. */
export interface Failure {
  readonly type: string;
  readonly status?: number | undefined;
}

/** Every trigger the plugin understands. */
export const all: ReadonlyArray<Trigger> = [
  'quota',
  'rate-limit',
  'auth',
  'timeout',
  'provider-internal',
  'transport',
];

/**
 * Triggers enabled when options omit `triggers`. Quota and rate limits are the
 * daily-limit case; auth means the key is dead for that provider. Transient
 * failures stay out so the built-in retry policy keeps its chance.
 */
export const defaults: ReadonlyArray<Trigger> = ['quota', 'rate-limit', 'auth'];

const byType = new Map<string, Trigger>([
  ['provider.quota', 'quota'],
  ['provider.rate-limit', 'rate-limit'],
  ['provider.auth', 'auth'],
  ['provider.timeout', 'timeout'],
  ['provider.internal', 'provider-internal'],
  ['provider.transport', 'transport'],
]);

/** Resolve a configured trigger id, or `undefined` when it is unknown. */
export const from = (id: string): Trigger | undefined => all.find((trigger) => trigger === id);

const fromStatus = (status: number): Trigger | undefined => {
  if (status === 402) return 'quota';
  if (status === 429) return 'rate-limit';
  if (status === 401 || status === 403) return 'auth';
  if (status === 408 || status === 504) return 'timeout';
  if (status >= 500) return 'provider-internal';
  return undefined;
};

/** Fold a provider failure onto a trigger; the session error type wins over the status. */
export const classify = (failure: Failure): Trigger | undefined =>
  byType.get(failure.type) ??
  (failure.status === undefined ? undefined : fromStatus(failure.status));

/** True when the failure classifies as one of the enabled triggers. */
export const matches = (failure: Failure, enabled: ReadonlyArray<Trigger>): boolean => {
  const trigger = classify(failure);
  return trigger !== undefined && enabled.includes(trigger);
};
