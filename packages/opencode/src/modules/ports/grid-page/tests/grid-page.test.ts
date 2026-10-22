import * as Vitest from '@effect/vitest';
import * as GridPage from '../index.js';

const makeContext = () => {
  const calls: Array<string> = [];
  const layers: Array<GridPage.KeymapLayer> = [];
  const context: GridPage.GridPageContext = {
    ui: {
      router: {
        register: (page) => {
          calls.push(`register:${page.name}`);
          return () => calls.push(`unregister:${page.name}`);
        },
        navigate: (destination) => calls.push(`navigate:${destination.type}`),
        current: () => ({ type: 'home' }),
      },
      slot: (claim) => {
        calls.push(`slot:${claim.append ?? claim.prepend ?? claim.replace ?? ''}`);
        return () => calls.push('unclaim');
      },
    },
    keymap: {
      layer: (input) => {
        const layer = input();
        layers.push(layer);
        calls.push(`layer:${layer.mode ?? 'base'}`);
      },
    },
  };
  return { context, calls, layers };
};

Vitest.describe('GridPagePort runtime', () => {
  Vitest.it('registerPage registers and the cleanup unregisters', () => {
    const { context, calls } = makeContext();
    const port = GridPage.makeGridPagePort(context);
    const cleanup = port.registerPage({ name: 'workspace', render: () => ({ page: 'workspace' }) });
    Vitest.expect(calls).toStrictEqual(['register:workspace']);
    cleanup();
    Vitest.expect(calls).toStrictEqual(['register:workspace', 'unregister:workspace']);
  });

  Vitest.it('navigate and current reach the host router', () => {
    const { context, calls } = makeContext();
    const port = GridPage.makeGridPagePort(context);
    port.navigate({ type: 'plugin', name: 'workspace' });
    Vitest.expect(port.current()).toStrictEqual({ type: 'home' });
    Vitest.expect(calls).toStrictEqual(['navigate:plugin']);
  });

  Vitest.it('slot claims and releases a placement', () => {
    const { context, calls } = makeContext();
    const port = GridPage.makeGridPagePort(context);
    const cleanup = port.slot({
      append: 'home.footer.status',
      render: () => ({ chip: 'workspace' }),
    });
    cleanup();
    Vitest.expect(calls).toStrictEqual(['slot:home.footer.status', 'unclaim']);
  });

  Vitest.it('keymapLayer builds the layer through the host keymap', () => {
    const { context, calls, layers } = makeContext();
    const port = GridPage.makeGridPagePort(context);
    port.keymapLayer(() => ({ mode: 'global', commands: [] }));
    Vitest.expect(calls).toStrictEqual(['layer:global']);
    Vitest.expect(layers).toStrictEqual([{ mode: 'global', commands: [] }]);
  });

  Vitest.it('throws at call time without a TUI context', () => {
    const port = GridPage.makeGridPagePort({});
    Vitest.expect(() => port.navigate({ type: 'home' })).toThrow(/ctx\.ui\.router/);
    Vitest.expect(() => port.keymapLayer(() => ({}))).toThrow(/ctx\.ui\.router|ctx\.keymap/);
  });
});
