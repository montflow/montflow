import { Context, Effect, Layer, Ref } from 'effect';

export const Id = '@montflow/FallbackState';
export type Id = typeof Id;

const make = Effect.gen(function* () {
  const sessions = yield* Ref.make(new Map<string, Set<string>>());

  const tried = (sessionID: string): Effect.Effect<ReadonlySet<string>> =>
    Ref.get(sessions).pipe(Effect.map((all) => all.get(sessionID) ?? new Set<string>()));

  const mark = (sessionID: string, model: string): Effect.Effect<void> =>
    Ref.update(sessions, (all) => {
      const next = new Map(all);
      const keys = new Set(next.get(sessionID) ?? []);
      keys.add(model);
      next.set(sessionID, keys);
      return next;
    });

  const forget = (sessionID: string): Effect.Effect<void> =>
    Ref.update(sessions, (all) => {
      const next = new Map(all);
      next.delete(sessionID);
      return next;
    });

  return { tried, mark, forget } as const;
});

export type Impl = Effect.Success<typeof make>;

/** Models each session already left behind, so a chain is walked once per session. */
export class FallbackState extends Context.Service<FallbackState, Impl>()(Id) {}

export const Default = Layer.effect(FallbackState, make);
