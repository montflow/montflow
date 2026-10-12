import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer, Path } from 'effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import {
  Default as SessionRunnerDefault,
  PiSessionFactory,
  SessionRunner,
  Store,
  WorkspaceBridge,
} from '../../services/index.js';

/**
 * Surface runtime: one file-backed `SessionRunner` layer for the CLI and the Pi
 * extension. Both surfaces call the same engine; only the workspace bridge
 * differs (console vs Pi `ctx.ui`).
 */

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** File-backed store rooted at `<root>/.agents/@montflow/sessions`. */
export const storeLayer = (root: string): Layer.Layer<Store.Store> =>
  Layer.effect(
    Store.Store,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const sessions = path.join(root, ...Store.SESSIONS_SEGMENTS);
      return yield* Store.makeWithRoot(sessions);
    }),
  ).pipe(Layer.provide(NodeLive));

/** Strip ANSI escapes and control characters from session-controlled text. */
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
 * Full session runner layer: engine + Pi session factory + a workspace bridge, with no
 * remaining requirements so it can be built once and reused (live-session registry
 * must persist across command invocations).
 * @param options - repo root plus the workspace bridge to use
 * @returns session runner layer
 */
export const sessionRunnerLayer = (options: {
  readonly root: string;
  readonly bridge: Layer.Layer<WorkspaceBridge>;
}): Layer.Layer<SessionRunner> =>
  SessionRunnerDefault.pipe(
    Layer.provide(Layer.mergeAll(storeLayer(options.root), PiSessionFactory, options.bridge)),
    // The engine reads the repo `.gitignore` to verify the store stays local.
    Layer.provide(NodeLive),
  );

/** Lazily-built, per-repo-root runtimes with a shared disposal path. */
export interface SessionRunnerHost {
  /** Build (once) the session runner runtime for a repo root. */
  readonly runtimeFor: (root: string) => ManagedRuntime.ManagedRuntime<SessionRunner, never>;
  /** Dispose every runtime built by this host. */
  readonly disposeAll: () => Promise<void>;
}

/**
 * Per-root {@link SessionRunner} runtime cache. Rooting the store per dispatch cwd
 * keeps sessions local to their repository and keeps same-id sessions in different
 * repos from colliding. {@link SessionRunnerHost.disposeAll} releases every runtime.
 * @param options - layer factory plus per-root bridge factory
 * @returns the runtime host
 */
export const createSessionRunnerHost = (options: {
  readonly layerFor: (
    root: string,
    bridge: Layer.Layer<WorkspaceBridge>,
  ) => Layer.Layer<SessionRunner>;
  readonly bridgeFor: (root: string) => Layer.Layer<WorkspaceBridge>;
}): SessionRunnerHost => {
  const runtimes = new Map<string, ManagedRuntime.ManagedRuntime<SessionRunner, never>>();
  const runtimeFor = (root: string): ManagedRuntime.ManagedRuntime<SessionRunner, never> => {
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

/** The session runner host the current Pi session is using, if one has been built. */
let activeHost: SessionRunnerHost | undefined;

/**
 * Register the session runner host so sibling extensions (e.g. pi-reviews)
 * can dispatch sessions through the same runtime and share its live-session registry.
 * @param host - the host built by the sessions extension
 */
export const setActiveSessionRunnerHost = (host: SessionRunnerHost): void => {
  activeHost = host;
};

/**
 * The session runner host, or undefined when the sessions extension has not
 * loaded yet. Callers read this lazily (at dispatch time), not at load time.
 * @returns the active host, if any
 */
export const activeSessionRunnerHost = (): SessionRunnerHost | undefined => activeHost;
