import { Plugin } from '@opencode/plugin';
import { file } from './modules/path/index.js';
import { homedir } from './modules/platform/index.js';
import type { Environment, RawOptions } from './modules/config/index.js';
import { resolve, retentionFromFile } from './modules/config/index.js';
import { sha256 } from './modules/digest/index.js';
import type { IncomingInput } from './modules/event/index.js';
import { consume, ID } from './modules/plugin/index.js';
import { all, parseDuration, session as purgeSession, olderThan } from './modules/purge/index.js';
import { make, once, prune } from './modules/store/index.js';
import type { Viewer } from './modules/viewer/index.js';

/** Cleanup returned to the host; idempotent. */
export type Cleanup = () => Promise<void> | void;

/** The command invocation fields the viewer and delete actions read. */
export interface CommandInvocation {
  readonly sessionID: string;
  readonly prompt?: { readonly text?: string };
}

/** Text shown when `/mf-telemetry` gets an action it does not understand. */
export const USAGE =
  'mf-telemetry [delete --all | --session <id|current> | --older-than <30d>] | cleanup';

const valueOf = (tokens: readonly string[], name: string): string | undefined => {
  const index = tokens.indexOf(name);
  return index === -1 ? undefined : tokens[index + 1];
};

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
    const database = file(settings.directory, 'telemetry.db');
    const store = { directory: settings.directory, database };
    const configuredRetention =
      context.options['retentionDays'] === undefined
        ? retentionFromFile(settings.directory)
        : undefined;
    const retentionDays = configuredRetention ?? settings.retentionDays;
    const writer = make({ directory: settings.directory, notify: notifyWrite });
    try {
      prune({
        directory: settings.directory,
        database,
        retentionDays,
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
    const stopViewer = async (): Promise<void> => {
      const started =
        viewerPromise === undefined ? undefined : await viewerPromise.catch(() => undefined);
      if (started !== undefined) await started.stop();
    };
    const deletion = async (input: CommandInvocation, tokens: readonly string[]): Promise<void> => {
      const action = tokens[0];
      const allFlag = tokens.includes('--all');
      const target = valueOf(tokens, '--session');
      const window = valueOf(tokens, '--older-than');
      const selectors = [allFlag, target !== undefined, window !== undefined].filter(
        Boolean,
      ).length;
      const cleanup = action === 'cleanup';
      if ((!cleanup && action !== 'delete') || (!cleanup && selectors === 0)) {
        log(USAGE);
        return;
      }
      if ((!cleanup && selectors !== 1) || (cleanup && (allFlag || target !== undefined))) {
        log(USAGE);
        return;
      }
      await stopViewer();
      writer.close();
      let result;
      if (allFlag) {
        result = all(store);
      } else if (target !== undefined) {
        const sessionID = target === 'current' ? input.sessionID : target;
        result = purgeSession(store, sessionID);
      } else {
        const duration = window === undefined ? retentionDays * 86_400_000 : parseDuration(window);
        if (duration === undefined) {
          log(`invalid window ${String(window)}; use 30d, 12h, 45m, or 10s`);
          return;
        }
        result = olderThan(store, clock() - duration);
      }
      console.log(
        `[${ID}] removed ${result.files} files, ${result.lines} lines, ${result.bytes} bytes${result.database ? ', database' : ''}`,
      );
    };
    if (context.command !== undefined) {
      try {
        const registration = await context.command.transform((editor) => {
          editor.add({
            name: 'mf-telemetry',
            description:
              'Open /mf-telemetry, or delete history: delete --all | --session <id|current> | --older-than <30d>, or cleanup.',
            execute: async (input) => {
              try {
                const tokens = (input.prompt?.text ?? '')
                  .split(/\s+/u)
                  .filter(
                    (token) =>
                      token !== '' && token !== '/mf-telemetry' && token !== 'mf-telemetry',
                  );
                if (tokens.length > 0) {
                  await deletion(input, tokens);
                  return;
                }
                const { open } = await import('./apps/viewer/index.js');
                const started = await getViewer(input.sessionID);
                const url = `${started.url}?session=${encodeURIComponent(input.sessionID)}`;
                console.log(`[${ID}] viewer: ${url}`);
                open(url);
              } catch (cause) {
                notifySetup(`command failed: ${String(cause)}`);
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
