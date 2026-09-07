import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import type { Component } from '@earendil-works/pi-tui';
import * as Menu from '../index.js';

/** Exact factory shape `ui.custom` expects — avoids naming Pi's TUI types. */
type CustomFactory = Parameters<ExtensionUIContext['custom']>[0];

/**
 * Headless harness: runs the factory synchronously against inert stubs
 * and hands back the mounted component for render/input assertions.
 */
const mountUi = (onComponent: (component: Component & { dispose?(): void }) => void) => ({
  custom: <T>(factory: CustomFactory): Promise<T> =>
    new Promise<T>((resolve) => {
      const done = (result: unknown): void => {
        // SAFETY: Pi always completes a custom dialog with the factory's
        // own result type, so `unknown` here is `T` by construction.
        resolve(result as T);
      };
      // SAFETY: headless harness — the dialog only reads theme colors and
      // calls `requestRender`; the stubs cover every method it touches.
      const component = factory(
        { requestRender: () => {} } as never,
        {
          fg: (_key: string, text: string) => text,
          bg: (_color: 'selectedBg', text: string) => text,
        } as never,
        {} as never,
        done,
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
    Effect.runFork(
      Menu.menuDialog(ui, 'Skills', ['Browse skills', 'Exit'], ['✓ authoring-skills']),
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
    Effect.runFork(Menu.menuDialog(ui, 'Skills', ['Exit']));
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
