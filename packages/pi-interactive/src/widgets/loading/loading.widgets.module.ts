import { Loader, type Component } from '@earendil-works/pi-tui';
import { Effect } from 'effect';
import * as Batch from '../batch/index.js';
import type { CustomUi } from '../filter-select/index.js';
import * as Widget from '../widget/index.js';

/**
 * Outcome of {@link dialog}: the wrapped work settled. `failed`
 * only happens on defects — expected failures travel inside the tagged
 * result via {@link run}.
 */
export type Outcome<A> =
  | { readonly status: 'done'; readonly value: A }
  | { readonly status: 'failed' };

/** Theme slice the loading shell needs: spinner ink plus batch background. */
interface ShellTheme {
  readonly fg: (color: 'accent' | 'muted', text: string) => string;
  readonly bg: (color: 'selectedBg', text: string) => string;
}

/** The `tui` handle `Loader` needs, without naming Pi's TUI types. */
type LoaderTui = ConstructorParameters<typeof Loader>[0];

/**
 * Start the spinner inside a gray batch container. The `Loader` renders
 * a leading blank line, which would stack with the container's top
 * padding and push the spinner off-center — trim it so the batch
 * padding owns the whitespace symmetrically.
 * @param theme - Pi theme for spinner ink and container background
 * @param tui - Pi TUI handle for the spinner
 * @param message - status text beside the spinner
 * @returns the batch handle to compile at the `ui.custom` boundary plus the running spinner to stop
 */
const startShelled = (theme: ShellTheme, tui: LoaderTui, message: string) => {
  const loader = new Loader(
    tui,
    (text) => theme.fg('accent', text),
    (text) => theme.fg('muted', text),
    message,
  );
  loader.start();
  const trimmed: Component = {
    render: (width) => loader.render(width).slice(1),
    invalidate: () => loader.invalidate(),
  };
  return { batch: Batch.box(theme, [trimmed]), loader };
};

/**
 * "Loading…" modal: a spinner dialog that locks input until `work`
 * settles. Plain `Loader` in a gray batch container (not cancellable) —
 * every key is ignored while it is up. The spinner stops deterministically
 * before dismissal. TUI-only — callers fall back to a pre-run notify
 * elsewhere.
 * @param ui - Pi ui context with custom component support
 * @param message - status text beside the spinner
 * @param work - Effect to run behind the dialog (failures resolve `failed`)
 * @returns Effect resolving to the outcome once the dialog dismisses
 */
export const dialog = <A, E>(ui: CustomUi, message: string, work: Effect.Effect<A, E>) =>
  Effect.promise(() =>
    ui.custom<Outcome<A>>((tui, theme, _keybindings, done) => {
      const { batch, loader } = startShelled(theme, tui, message);
      work
        .pipe(
          Effect.match({
            onFailure: () => ({ status: 'failed' }) satisfies Outcome<A>,
            onSuccess: (value) => ({ status: 'done', value }) satisfies Outcome<A>,
          }),
          Effect.runPromise,
        )
        .then(
          (outcome) => {
            loader.stop();
            done(outcome);
          },
          () => {
            loader.stop();
            done({ status: 'failed' });
          },
        );
      return Widget.compile(batch);
    }),
  );

/** Tagged generation result carried past the dialog. */
type Settled<A, E> =
  | { readonly outcome: 'success'; readonly value: A }
  | { readonly outcome: 'failure'; readonly error: E };

/**
 * Run an Effect behind the "Loading…" modal, then unwrap it past
 * the dialog: failures come back as failures, the value as success.
 * @param ui - Pi ui context with custom component support
 * @param message - status text beside the spinner
 * @param self - Effect to run (no requirements left)
 * @returns Effect resolving to the wrapped value, failing with its error
 */
export const run = <A, E>(ui: CustomUi, message: string, self: Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const settled = yield* Effect.promise(() =>
      ui.custom<Settled<A, E>>((tui, theme, _keybindings, done) => {
        const { batch, loader } = startShelled(theme, tui, message);
        self
          .pipe(
            Effect.match({
              onFailure: (error) => ({ outcome: 'failure', error }) satisfies Settled<A, E>,
              onSuccess: (value) => ({ outcome: 'success', value }) satisfies Settled<A, E>,
            }),
            Effect.runPromise,
          )
          .then(
            (result) => {
              loader.stop();
              done(result);
            },
            (defect) => {
              loader.stop();
              throw new Error(`Loading dialog crashed: ${message}`, { cause: defect });
            },
          );
        return Widget.compile(batch);
      }),
    );
    if (settled.outcome === 'success') return settled.value;
    return yield* Effect.fail(settled.error);
  });
