import { Model } from '@opencode/schema/model';
import { Data, Effect, Schema } from 'effect';
import { FallbackTrigger } from '../fallback-trigger/index.js';
import { ModelChain } from '../model-chain/index.js';

/** Raw `options` block from `opencode.jsonc`, before decoding. */
export const Options = Schema.Struct({
  chain: Schema.optional(Schema.Array(Schema.String)),
  triggers: Schema.optional(Schema.Array(Schema.String)),
});

/** Decoded plugin configuration. */
export interface Config {
  readonly chain: ReadonlyArray<Model.Ref>;
  readonly triggers: ReadonlyArray<FallbackTrigger.Trigger>;
}

/** Options the plugin cannot act on: bad JSON shape, unknown trigger, unparsable model. */
export class InvalidOptions extends Data.TaggedError('@montflow/ModelFallbackInvalidOptions')<{
  readonly reason: string;
}> {}

/** Configuration used when options are missing or unusable: the plugin stays idle. */
export const idle: Config = { chain: [], triggers: FallbackTrigger.defaults };

/**
 * Decode the host `options` record into a configuration. Fails on anything the
 * plugin cannot honour instead of silently falling back to half a chain.
 */
export const decode = (
  // eslint-disable-next-line anti-slop/no-unknown-parameters -- host options and config files arrive untyped; this decode is the boundary parse.
  options: unknown,
): Effect.Effect<Config, InvalidOptions> =>
  Effect.try({
    try: () => {
      const decoded = Schema.decodeUnknownSync(Options)(options);
      const triggers = (decoded.triggers ?? FallbackTrigger.defaults).map((id) => {
        const trigger = FallbackTrigger.from(id);
        if (trigger === undefined) {
          throw new Error(
            `Unknown fallback trigger '${id}'. Known triggers: ${FallbackTrigger.all.join(', ')}.`,
          );
        }
        return trigger;
      });
      return {
        chain: ModelChain.parse(decoded.chain ?? []),
        triggers: [...new Set(triggers)],
      };
    },
    catch: (cause) =>
      new InvalidOptions({ reason: cause instanceof Error ? cause.message : String(cause) }),
  });
