import { Plugin } from '@opencode/plugin';
import { homedir } from './modules/platform/index.js';
import type { Environment, RawOptions } from './modules/config/index.js';
import { resolve } from './modules/config/index.js';
import { sha256 } from './modules/digest/index.js';
import type { IncomingInput } from './modules/event/index.js';
import { consume, ID } from './modules/plugin/index.js';
import { make, once, prune } from './modules/store/index.js';
import type { Viewer } from './modules/viewer/index.js';

/** Cleanup returned to the host; idempotent. */
export type Cleanup = () => Promise<void> | void;

/** The command invocation fields the viewer launcher reads. */
export interface CommandInvocation {
  readonly sessionID: string;
}

/** The command the plugin registers with the host. */
export interface CommandDefinition {
  readonly name: string;
  readonly description?: string;
  readonly execute: (input: CommandInvocation) => Promise<void>;
}

/** Host command registration seam; optional so collection can be tested alone. */
export interface CommandHost {
  transform(
    callback: (editor: { add(definition: CommandDefinition): void }) => void,
  ): Promise<{ dispose(): Promise<void> }>;
}

/** The host slice the plugin reads: options, events, and the command editor. */
export interface HostSlice {
  readonly options: RawOptions;
  readonly event: {
    subscribe(options?: { readonly signal?: AbortSignal }): AsyncIterable<IncomingInput>;
  };
  readonly command?: CommandHost;
}

/** Epoch milliseconds without a Clock service; `created` wins when present. */
const clock = (): number => performance.timeOrigin + performance.now();

/* oxlint-disable montflow/no-process-env -- this plugin is the composition root; the host passes options, and the only environment read is the XDG/HOME data-directory convention. */
const readEnvironment = (): Environment => {
  const home = process.env['HOME'] ?? homedir();
  const xdg = process.env['XDG_DATA_HOME'];
  return xdg === undefined ? { HOME: home } : { HOME: home, XDG_DATA_HOME: xdg };
};
/* oxlint-enable montflow/no-process-env */

/**
 * Start collection and register `/mf-telemetry`. Collection is one in-process
 * subscription appending NDJSON; the viewer is spawned only when the command
 * runs. Nothing listens and nothing is spawned at setup.
 */
const log = (message: string): void => {
  console.error(`[${ID}] ${message}`);
};

export const setup = async (context: HostSlice): Promise<Cleanup> => {
  const notifySetup = once(log);
  const notifyPrune = once(log);
  const notifyWrite = once(log);
  try {
    const settings = resolve(context.options, readEnvironment());
    const writer = make({ directory: settings.directory, notify: notifyWrite });
    try {
      prune({
        directory: settings.directory,
        retentionDays: settings.retentionDays,
        now: clock(),
        notify: notifyPrune,
      });
    } catch (cause) {
      notifyPrune(`prune failed: ${String(cause)}`);
    }
    const controller = new AbortController();
    const done = consume(
      context.event.subscribe({ signal: controller.signal }),
      writer,
      settings,
      clock,
      sha256,
      notifyWrite,
    );
    let dispose: (() => Promise<void>) | undefined;
    const viewers = new Set<Viewer>();
    let currentViewer: Viewer | undefined;
    let viewerPromise: Promise<Viewer> | undefined;
    const getViewer = (sessionID: string): Promise<Viewer> => {
      if (viewerPromise !== undefined) return viewerPromise;
      const pending = import('./modules/viewer/index.js').then(({ start }) =>
        start({ directory: settings.directory, sessionID }),
      );
      viewerPromise = pending.then(
        (started) => {
          viewers.add(started);
          currentViewer = started;
          void started.done.then(() => {
            viewers.delete(started);
            if (currentViewer === started) {
              currentViewer = undefined;
              viewerPromise = undefined;
            }
          });
          return started;
        },
        (cause: unknown) => {
          viewerPromise = undefined;
          throw cause;
        },
      );
      return viewerPromise;
    };
    if (context.command !== undefined) {
      try {
        const registration = await context.command.transform((editor) => {
          editor.add({
            name: 'mf-telemetry',
            description: 'Open /mf-telemetry: the live trace and history viewer for this session.',
            execute: async (input) => {
              try {
                const { open } = await import('./apps/viewer/index.js');
                const started = await getViewer(input.sessionID);
                const url = `${started.url}?session=${encodeURIComponent(input.sessionID)}`;
                console.log(`[${ID}] viewer: ${url}`);
                open(url);
              } catch (cause) {
                notifySetup(`viewer failed: ${String(cause)}`);
              }
            },
          });
        });
        dispose = registration.dispose;
      } catch (cause) {
        notifySetup(`command registration failed: ${String(cause)}`);
      }
    }
    let closed = false;
    return async () => {
      if (closed) return;
      closed = true;
      try {
        controller.abort();
        await done;
        writer.close();
      } catch (cause) {
        notifySetup(`cleanup failed: ${String(cause)}`);
      }
      try {
        const started = await viewerPromise;
        if (started !== undefined) await started.stop();
        await Promise.allSettled([...viewers].map((viewer) => viewer.stop()));
        viewers.clear();
        viewerPromise = undefined;
      } catch (cause) {
        notifySetup(`viewer shutdown failed: ${String(cause)}`);
      }
      try {
        await dispose?.();
      } catch (cause) {
        notifySetup(`cleanup failed: ${String(cause)}`);
      }
    };
  } catch (cause) {
    notifySetup(`setup failed: ${String(cause)}`);
    return () => {};
  }
};

/** OpenCode server plugin entry. */
export default Plugin.define({
  id: ID,
  setup: (context) => setup(context),
});
