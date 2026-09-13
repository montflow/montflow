import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import type { CustomUi } from '../../filter-select/index.js';
import * as Loading from '../index.js';

/** Exact factory shape `ui.custom` expects — avoids naming Pi's TUI types. */
type CustomFactory = Parameters<ExtensionUIContext['custom']>[0];

/** Pi's completion callback as a named domain type, so the harness never restates its shape. */
type DoneCallback = CustomFactory extends (...args: [never, never, never, infer Done]) => object
  ? Done
  : never;

/** Headless harness: runs the factory synchronously against inert stubs. */
const immediateUi = (): CustomUi => ({
  custom: <T>(factory: CustomFactory): Promise<T> =>
    new Promise<T>((resolve) => {
      const done = (result: T): void => {
        resolve(result);
      };
      // SAFETY: Pi completes a custom dialog with the factory's own `T`,
      // so our `T`-typed callback never observes a non-`T` argument
      // through the `unknown`-typed `done` slot.
      void factory(
        { requestRender: () => {} } as never,
        { fg: (_key: string, text: string) => text } as never,
        {} as never,
        done as DoneCallback,
      );
    }),
});

Vitest.describe('Loading.dialog', () => {
  Vitest.it.effect('resolves the value when work succeeds', () =>
    Effect.gen(function* () {
      const outcome = yield* Loading.dialog(immediateUi(), 'Loading…', Effect.succeed(42));
      Vitest.expect(outcome).toStrictEqual({ status: 'done', value: 42 });
    }),
  );

  Vitest.it.effect('resolves failed when work fails', () =>
    Effect.gen(function* () {
      const outcome = yield* Loading.dialog(immediateUi(), 'Loading…', Effect.fail('boom'));
      Vitest.expect(outcome).toStrictEqual({ status: 'failed' });
    }),
  );
});

Vitest.describe('Loading.run', () => {
  Vitest.it.effect('passes the wrapped value through', () =>
    Effect.gen(function* () {
      const value = yield* Loading.run(immediateUi(), 'Loading…', Effect.succeed('skill'));
      Vitest.expect(value).toBe('skill');
    }),
  );

  Vitest.it.effect('fails with the wrapped error', () =>
    Effect.gen(function* () {
      const error = yield* Loading.run(immediateUi(), 'Loading…', Effect.fail('boom')).pipe(
        Effect.flip,
      );
      Vitest.expect(error).toBe('boom');
    }),
  );
});
