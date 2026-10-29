import type { FallbackTrigger } from '../fallback-trigger/index.js';
import { ModelChain } from '../model-chain/index.js';

/** How the session continues after the switch: the in-flight retry, or a fresh resume. */
export type Phase = 'resume' | 'retry';

/** The visible history note left behind by a fallback. */
export interface Notice {
  readonly text: string;
  readonly description: string;
  readonly metadata: Metadata;
}

/** Structured note metadata, so the timeline and logs can filter fallbacks. */
export type Metadata = {
  readonly source: string;
  readonly phase: Phase;
  readonly from: string;
  readonly to: string;
  readonly reason: string;
};

/** Short label the timeline renders next to the note. */
export const description = 'Model fallback';

/** Reason text for the failed model call, status included when the provider sent one. */
const reason = (failure: FallbackTrigger.Failure): string =>
  failure.status === undefined ? failure.type : `${failure.type} (${failure.status})`;

/**
 * Build the note recorded through `session.synthetic`. The text names both
 * models and the failure so a later reader can see why the session changed
 * models without opening logs.
 */
export const make = (input: {
  readonly phase: Phase;
  readonly from: ModelChain.Ref;
  readonly to: ModelChain.Ref;
  readonly failure: FallbackTrigger.Failure;
}): Notice => {
  const cause = reason(input.failure);
  const action = input.phase === 'retry' ? 'retrying' : 'resuming';
  return {
    text: `${ModelChain.label(input.from)} failed with ${cause}; ${action} on ${ModelChain.label(input.to)}.`,
    description,
    metadata: {
      source: 'montflow/model-fallback',
      phase: input.phase,
      from: ModelChain.key(input.from),
      to: ModelChain.key(input.to),
      reason: cause,
    },
  };
};
