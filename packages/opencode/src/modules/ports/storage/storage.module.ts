/**
 * Durable or ephemeral key/value state handed over once by the host. The
 * tuple is the host's `ctx.storage.store` / `.memory` shape: a live Solid
 * store plus a mutation applier. Typed structurally so the port carries no
 * `solid-js` dependency and fakes stay one object.
 */
export interface StorageSource {
  readonly store: <Value extends object>(
    key: string,
    options: { readonly initial: Value },
  ) => readonly [Value, (mutation: (draft: Value) => void) => Promise<void>];
  readonly memory: <Value extends object>(
    key: string,
    options: { readonly initial: Value },
  ) => readonly [Value, (mutation: (draft: Value) => void) => void];
}

/** The slice of the host TUI context `StoragePort` needs. */
export interface StorageContext {
  readonly storage?: StorageSource | undefined;
}

/**
 * One acquired store: `value` stays reactive (it is the host store proxy),
 * `update` applies a draft mutation through the host setter.
 */
export interface StorageHandle<Value extends object> {
  readonly value: Value;
  readonly update: (mutation: (draft: Value) => void) => Promise<void>;
}

/** Ephemeral counterpart of {@link StorageHandle}: the draft applies synchronously. */
export interface MemoryHandle<Value extends object> {
  readonly value: Value;
  readonly update: (mutation: (draft: Value) => void) => void;
}

/**
 * TUI-plugin-only state seam. `store` persists JSON across restarts and is
 * live-synced between running TUIs; `memory` lasts for the TUI process.
 * Reading `value` inside a Solid computation tracks the host store.
 */
export interface StoragePort {
  readonly store: <Value extends object>(
    key: string,
    options: { readonly initial: Value },
  ) => StorageHandle<Value>;
  readonly memory: <Value extends object>(
    key: string,
    options: { readonly initial: Value },
  ) => MemoryHandle<Value>;
}

const unavailable = (): Error =>
  new Error('StoragePort requires a TUI plugin context (ctx.storage)');

/** Build the state seam over the host TUI storage. */
export const makeStoragePort = (context: StorageContext): StoragePort => {
  const storage = context.storage;

  return {
    store: (key, options) => {
      if (storage === undefined) throw unavailable();
      const [value, update] = storage.store(key, options);
      return { value, update };
    },
    memory: (key, options) => {
      if (storage === undefined) throw unavailable();
      const [value, update] = storage.memory(key, options);
      return { value, update };
    },
  };
};
