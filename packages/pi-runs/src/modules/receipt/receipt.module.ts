import { Schema } from 'effect';
import { Id as RunId } from '../run/run.module.ts';

/** Terminal outcome. Distinct name from `Run.Status`: receipt is terminal-only. */
export const Outcome = Schema.Literals(['done', 'failed']);

/** Terminal outcome. */
export type Outcome = typeof Outcome.Type;

/**
 * Settlement proof for one run. Written once by `Store.settle`, never mutated.
 *
 * Invariant: receipt exists ⟺ run is terminal and `Run.status` matches
 * `outcome`. Load-time check, never silent drift. No `status` field here
 * on purpose — `outcome` is terminal-only, so the two can't be confused.
 */
export class Receipt extends Schema.Class<Receipt>('Receipt')({
  runId: RunId,
  outcome: Outcome,
  summary: Schema.String.check(Schema.isMinLength(1)),
  endedAt: Schema.String.check(Schema.isMinLength(1)),
}) {}

/**
 * Decode untrusted input (receipt.md frontmatter, RPC payloads) into a `Receipt`.
 */
export const decodeUnknown = Schema.decodeUnknownEffect(Receipt);

/**
 * Encode a `Receipt` for persistence (`receipt.md`).
 */
export const encode = Schema.encodeSync(Receipt);
