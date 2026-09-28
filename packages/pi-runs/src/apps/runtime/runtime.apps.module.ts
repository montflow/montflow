import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer, Path } from 'effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import {
  Default as RunnerDefault,
  PiSessionFactory,
  Runner,
  Store,
  WorkspaceBridge,
} from '../../services/index.js';

/**
 * Surface runtime: one file-backed `Runner` layer for the CLI and the Pi
 * extension. Both surfaces call the same engine; only the workspace bridge
 * differs (console vs Pi `ctx.ui`).
 */

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** File-backed store rooted at `<root>/.agents/@montflow/runs`. */
export const storeLayer = (root: string): Layer.Layer<Store.Store> =>
  Layer.effect(
    Store.Store,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const runs = path.join(root, ...Store.RUNS_SEGMENTS);
      return yield* Store.makeWithRoot(runs);
    }),
  ).pipe(Layer.provide(NodeLive));

/** Strip ANSI escapes and control characters from run-controlled text. */
const ESCAPE = String.fromCharCode(27);

const stripAnsi = (text: string): string => {
  const chars = [...text];
  let out = '';
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index] ?? '';
    if (char === ESCAPE && chars[index + 1] === '[') {
      index += 2;
      while (index < chars.length && !/[A-Za-z]/.test(chars[index] ?? '')) index++;
      continue;
    }
    out += char;
  }
  return out;
};

const sanitize = (text: string): string => {
  let out = '';
  for (const char of stripAnsi(text)) {
    const code = char.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? ' ' : char;
  }
  return out.trim();
};

/** Headless workspace bridge: toasts/notifications go to stderr, sanitized. */
export const ConsoleBridge: Layer.Layer<WorkspaceBridge> = Layer.succeed(WorkspaceBridge, {
  toast: (message, variant) =>
    Effect.sync(() => console.error(`[${variant ?? 'info'}] ${sanitize(message)}`)),
  notify: (title, body) =>
    Effect.sync(() => console.error(`[notify] ${sanitize(title)}: ${sanitize(body)}`)),
});

/**
 * Full runner layer: engine + Pi session factory + a workspace bridge, with no
 * remaining requirements so it can be built once and reused (live-run registry
 * must persist across command invocations).
 * @param options - repo root plus the workspace bridge to use
 * @returns runner layer
 */
export const runnerLayer = (options: {
  readonly root: string;
  readonly bridge: Layer.Layer<WorkspaceBridge>;
}): Layer.Layer<Runner> =>
  RunnerDefault.pipe(
    Layer.provide(Layer.mergeAll(storeLayer(options.root), PiSessionFactory, options.bridge)),
  );

/** Lazily-built, per-repo-root runtimes with a shared disposal path. */
export interface RunnerHost {
  /** Build (once) the runner runtime for a repo root. */
  readonly runtimeFor: (root: string) => ManagedRuntime.ManagedRuntime<Runner, never>;
  /** Dispose every runtime built by this host. */
  readonly disposeAll: () => Promise<void>;
}

/**
 * Per-root {@link Runner} runtime cache. Rooting the store per dispatch cwd
 * keeps runs local to their repository and keeps same-id runs in different
 * repos from colliding. {@link RunnerHost.disposeAll} releases every runtime.
 * @param options - layer factory plus per-root bridge factory
 * @returns the runtime host
 */
export const createRunnerHost = (options: {
  readonly layerFor: (root: string, bridge: Layer.Layer<WorkspaceBridge>) => Layer.Layer<Runner>;
  readonly bridgeFor: (root: string) => Layer.Layer<WorkspaceBridge>;
}): RunnerHost => {
  const runtimes = new Map<string, ManagedRuntime.ManagedRuntime<Runner, never>>();
  const runtimeFor = (root: string): ManagedRuntime.ManagedRuntime<Runner, never> => {
    const existing = runtimes.get(root);
    if (existing !== undefined) return existing;
    const created = ManagedRuntime.make(options.layerFor(root, options.bridgeFor(root)));
    runtimes.set(root, created);
    return created;
  };
  const disposeAll = async (): Promise<void> => {
    const all = [...runtimes.values()];
    runtimes.clear();
    await Promise.all(all.map((runtime) => runtime.dispose()));
  };
  return { runtimeFor, disposeAll };
};
