import type { Settings } from '../config/index.js';
import { extract, type IncomingInput, type Line } from '../event/index.js';
import type { Writer } from '../store/index.js';

/** Id the host reports for this plugin. */
export const ID = 'montflow.telemetry';

/** Clock seam so the loop is deterministic under test. */
export type Clock = () => number;

const safeExtract = (event: IncomingInput, settings: Settings, clock: Clock): Line | undefined => {
  try {
    return extract(event, settings, clock());
  } catch {
    return undefined;
  }
};

/**
 * Drain the host event stream into the writer until it ends, the writer
 * disables itself, or the subscription aborts. Extraction failures skip one
 * event; stream failures end the loop. Nothing here throws into the session.
 */
export const consume = async (
  events: AsyncIterable<IncomingInput>,
  writer: Writer,
  settings: Settings,
  clock: Clock,
): Promise<void> => {
  try {
    for await (const event of events) {
      if (writer.disabled) return;
      const line = safeExtract(event, settings, clock);
      if (line !== undefined) writer.append(line);
    }
  } catch {
    // A failing or aborted subscription is not a session error; the writer has
    // already reported any write failure it saw.
  }
};
