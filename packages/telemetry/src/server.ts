import { Plugin } from '@opencode/plugin';
// oxlint-disable-next-line montflow/no-node-platform-imports -- the plugin is the composition root: it resolves the user's data directory from the OS, and the telemetry package deliberately has no Effect platform layer on the collection path.
import { homedir } from 'node:os';
import type { Environment, RawOptions } from './modules/config/index.js';
import { resolve } from './modules/config/index.js';
import type { IncomingInput } from './modules/event/index.js';
import { consume, ID } from './modules/plugin/index.js';
import { make, once, prune } from './modules/store/index.js';

/** Cleanup returned to the host; idempotent. */
export type Cleanup = () => Promise<void> | void;

/** The host slice collection reads: plugin options plus the event stream. */
export interface HostSlice {
  readonly options: RawOptions;
  readonly event: {
    subscribe(options?: { readonly signal?: AbortSignal }): AsyncIterable<IncomingInput>;
  };
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
 * Start collection: one in-process subscription appending NDJSON. Starts
 * nothing, listens on nothing; every failure is swallowed so telemetry can
 * never fail the session it observes.
 */
export const start = (context: HostSlice): Cleanup => {
  try {
    const settings = resolve(context.options, readEnvironment());
    const notify = once((message) => {
      console.error(`[${ID}] ${message}`);
    });
    const writer = make({ directory: settings.directory, notify });
    prune({
      directory: settings.directory,
      retentionDays: settings.retentionDays,
      now: clock(),
      notify,
    });
    const controller = new AbortController();
    const done = consume(
      context.event.subscribe({ signal: controller.signal }),
      writer,
      settings,
      clock,
    );
    return async () => {
      controller.abort();
      await done;
      writer.close();
    };
  } catch {
    return () => {};
  }
};

/** OpenCode server plugin entry. */
export default Plugin.define({
  id: ID,
  setup: (context) => start(context),
});
