/**
 * Provider-reported token/cost usage for one agent turn, summed across the
 * turn's assistant messages. Matches the pi SDK's per-message `usage` shape;
 * consumers (e.g. cost accounting) read it directly.
 */
export interface TurnUsage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly cost?: { readonly total: number };
}
