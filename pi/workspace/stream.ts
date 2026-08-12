/**
 * Live per-agent token streams.
 *
 * The loop's agents emit `message_update` events carrying `text_delta` /
 * `thinking_delta` chunks (see runner.ts runOneTurn). This store keeps a
 * rolling buffer per agent so the loop widget can render one agent's live
 * output while it runs. The SAME store instance is shared by the graph
 * context and the widget state, so the widget's 1s re-render timer always
 * reads the latest deltas without re-pushing the widget per token.
 */

/** What kind of token stream an agent emits. */
export type StreamKind = 'text' | 'thinking';

/** Rolling buffer for one agent's live output. */
export interface AgentStream {
  readonly key: string;
  readonly label: string;
  text: string;
  thinking: string;
  updatedAt: number;
  /** Monotonic append order (drives `active()` — Date.now() can collide). */
  readonly seq: number;
}

/**
 * Cap per stream: keep the tail so long brief/aggregate turns (or a whole
 * loop's accumulated supervisor output) can't grow without bound.
 */
export const MAX_STREAM_CHARS = 40_000;

/**
 * Mutable store of live agent streams, keyed by agent — `supervisor`,
 * `reviewer:<id>`, `fixer:<findingId>`. Appending keeps the tail past
 * {@link MAX_STREAM_CHARS}. `active()` lists the streams that have produced
 * output, newest first (for the focus command's picker).
 */
export class StreamStore {
  private readonly streams = new Map<string, AgentStream>();
  private seq = 0;

  /** The stream for a key, or undefined when it has never produced output. */
  get(key: string): AgentStream | undefined {
    return this.streams.get(key);
  }

  /** Appends a token delta to the agent's buffer (keeps the tail when over the cap). */
  append(key: string, label: string, kind: StreamKind, delta: string): void {
    if (delta === '') return;
    const existing = this.streams.get(key);
    const stream: AgentStream =
      existing ?? { key, label, text: '', thinking: '', updatedAt: Date.now(), seq: ++this.seq };
    if (kind === 'text') {
      stream.text = (stream.text + delta).slice(-MAX_STREAM_CHARS);
    } else {
      stream.thinking = (stream.thinking + delta).slice(-MAX_STREAM_CHARS);
    }
    stream.updatedAt = Date.now();
    this.streams.set(key, stream);
  }

  /** All streams that have produced output, newest first. */
  active(): readonly AgentStream[] {
    return [...this.streams.values()]
      .filter((stream) => stream.text !== '' || stream.thinking !== '')
      .toSorted((a, b) => b.seq - a.seq);
  }

  /** Drops every buffer (used when the loop ends). */
  clear(): void {
    this.streams.clear();
  }
}

/**
 * Mutable per-fixer live-tool store, shared with the widget (same reference
 * pattern as {@link StreamStore}): the 1s render reads each fixer's current
 * tool without per-token widget pushes. Parallel fixers each get their own
 * row in the roster view.
 */
export class FixerActivityStore {
  private readonly tools = new Map<string, string>();

  /** Records the tool a fixer is currently running (undefined clears it). */
  setTool(findingId: string, tool: string | undefined): void {
    if (tool === undefined) {
      this.tools.delete(findingId);
    } else {
      this.tools.set(findingId, tool);
    }
  }

  /** The tool the fixer for `findingId` is currently running, if any. */
  getTool(findingId: string): string | undefined {
    return this.tools.get(findingId);
  }

  /** Drops every entry (used when the loop ends). */
  clear(): void {
    this.tools.clear();
  }
}