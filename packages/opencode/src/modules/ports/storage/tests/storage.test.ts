import * as Vitest from '@effect/vitest';
import * as StoragePort from '../index.js';

/** A minimal host storage: one live object per key, mutated through the setter. */
const makeContext = () => {
  const durable = new Map<string, object>();
  const ephemeral = new Map<string, object>();
  const context: StoragePort.StorageContext = {
    storage: {
      store: <Value extends object>(key: string, options: { readonly initial: Value }) => {
        // SAFETY: the map stores exactly the `Value` the caller registered for
        // this key, and a returning caller asks for the same `Value` again.
        const existing = (durable.get(key) ?? options.initial) as Value;
        durable.set(key, existing);
        const update = async (mutation: (draft: Value) => void): Promise<void> => {
          mutation(existing);
          return Promise.resolve();
        };
        return [existing, update] as const;
      },
      memory: <Value extends object>(key: string, options: { readonly initial: Value }) => {
        // SAFETY: same key-to-`Value` invariant as the durable store above.
        const existing = (ephemeral.get(key) ?? options.initial) as Value;
        ephemeral.set(key, existing);
        const update = (mutation: (draft: Value) => void): void => {
          mutation(existing);
        };
        return [existing, update] as const;
      },
    },
  };
  return { context, durable, ephemeral };
};

Vitest.describe('StoragePort runtime', () => {
  Vitest.it('store hands back the live value and applies draft mutations', async () => {
    const { context, durable } = makeContext();
    const port = StoragePort.makeStoragePort(context);
    const handle = port.store('workspace', { initial: { panel: 'info', visits: 0 } });
    Vitest.expect(handle.value).toStrictEqual({ panel: 'info', visits: 0 });
    await handle.update((draft) => {
      draft.panel = 'skills';
    });
    Vitest.expect(handle.value.panel).toBe('skills');
    Vitest.expect(durable.get('workspace')).toStrictEqual({ panel: 'skills', visits: 0 });
  });

  Vitest.it('memory applies mutations synchronously and stays out of the durable store', () => {
    const { context, durable, ephemeral } = makeContext();
    const port = StoragePort.makeStoragePort(context);
    const handle = port.memory('page', { initial: { panel: 'specs', visits: 1 } });
    handle.update((draft) => {
      draft.visits += 1;
    });
    Vitest.expect(handle.value.visits).toBe(2);
    Vitest.expect(ephemeral.get('page')).toStrictEqual({ panel: 'specs', visits: 2 });
    Vitest.expect(durable.size).toBe(0);
  });

  Vitest.it('throws at call time without a TUI context', () => {
    const port = StoragePort.makeStoragePort({});
    Vitest.expect(() => port.store('workspace', { initial: { panel: 'info' } })).toThrow(
      /ctx\.storage/,
    );
    Vitest.expect(() => port.memory('workspace', { initial: { panel: 'info' } })).toThrow(
      /ctx\.storage/,
    );
  });
});
