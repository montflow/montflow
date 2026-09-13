import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import type { Component } from '@earendil-works/pi-tui';
import * as Menu from '../index.js';

/** Exact factory shape `ui.custom` expects — avoids naming Pi's TUI types. */
type CustomFactory = Parameters<ExtensionUIContext['custom']>[0];

/** Pi's completion callback as a named domain type, so the harness never restates its shape. */
type DoneCallback = CustomFactory extends (...args: [never, never, never, infer Done]) => object
  ? Done
  : never;

/**
 * Headless harness: runs the factory synchronously against inert stubs
 * and hands back the mounted component for render/input assertions.
 */
const mountUi = (onComponent: (component: Component & { dispose?(): void }) => void) => ({
  custom: <T>(factory: CustomFactory): Promise<T> =>
    new Promise<T>((resolve) => {
      const done = (result: T): void => {
        resolve(result);
      };
      // SAFETY: Pi completes a custom dialog with the factory's own `T`,
      // so our `T`-typed callback never observes a non-`T` argument
      // through the `unknown`-typed `done` slot.
      const component = factory(
        { requestRender: () => {} } as never,
        {
          fg: (_key: string, text: string) => text,
          bg: (_color: 'selectedBg', text: string) => text,
        } as never,
        {} as never,
        done as DoneCallback,
      );
      if (component instanceof Promise) {
        void component.then(onComponent);
      } else {
        onComponent(component);
      }
    }),
});

Vitest.describe('Menu.menuDialog', () => {
  Vitest.it('renders heading, info panel, and options', () => {
    let rendered: ReadonlyArray<string> = [];
    const ui = mountUi((component) => {
      rendered = component.render(80);
    });
    // Never settles by design — the harness only needs the mount.
    Menu.menuDialog(ui, 'Skills', ['Browse skills', 'Exit'], ['✓ authoring-skills']).pipe(
      Effect.runFork,
    );
    const text = rendered.join('\n');
    Vitest.expect(text).toContain('Skills');
    Vitest.expect(text).toContain('✓ authoring-skills');
    Vitest.expect(text).toContain('Browse skills');
    Vitest.expect(text).toContain('Exit');
  });

  Vitest.it('renders without a panel when info is absent', () => {
    let rendered: ReadonlyArray<string> = [];
    const ui = mountUi((component) => {
      rendered = component.render(80);
    });
    Menu.menuDialog(ui, 'Skills', ['Exit']).pipe(Effect.runFork);
    const text = rendered.join('\n');
    Vitest.expect(text).toContain('Skills');
    Vitest.expect(text).toContain('Exit');
  });

  Vitest.it.effect('resolves undefined immediately when empty', () =>
    Effect.gen(function* () {
      const seen: Array<Component & { dispose?(): void }> = [];
      const ui = mountUi((component) => {
        seen.push(component);
      });
      const result = yield* Menu.menuDialog(ui, 'Skills', []);
      Vitest.expect(result).toBeUndefined();
      Vitest.expect(seen).toStrictEqual([]);
    }),
  );
});
