import type { ExtensionUIContext, Theme, ThemeColor } from '@earendil-works/pi-coding-agent';
import type { SummaryCounts } from './parse-summary';
import type { FixerActivityStore, StreamStore } from './stream';
import { Option } from 'effect';

export type ReviewerRunStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface ReviewerWidgetRow {
  readonly id: string;
  readonly label: string;
  readonly status: ReviewerRunStatus;
  readonly findingCount?: number;
}

export type SupervisorWidgetStatus =
  | 'idle'
  | 'briefing'
  | 'waiting-specialists'
  | 'aggregating'
  | 'done';

export type FixerWidgetStatus = 'waiting' | 'running' | 'done' | 'skipped';

/** Per-fixer row status while the fixer phase runs. */
export type FixerRunStatus = 'queued' | 'running' | 'done' | 'error';

/** One fixer's row: finding id + status (live tool comes from the activity store). */
export interface FixerWidgetRow {
  readonly id: string;
  readonly status: FixerRunStatus;
}

export interface LoopWidgetState {
  /** 0-based current loop (independent reviewer set). */
  readonly loop: number;
  /** Total loops configured. */
  readonly maxLoops: number;
  /** 0-based next cycle index within the current loop (rendered as cycle + 1). */
  readonly cycle: number;
  /** Max cycles per loop configured. */
  readonly maxCycles: number;
  readonly supervisor: SupervisorWidgetStatus;
  readonly supervisorDetail?: string;
  readonly reviewers: readonly ReviewerWidgetRow[];
  readonly fixer: FixerWidgetStatus;
  readonly summary: Option.Option<SummaryCounts>;
  readonly deadlocks: number;
  readonly phase: string;
  /** Loop-level state shown when a loop ends or a decision is awaited. */
  readonly loopStatus?: 'running' | 'consensus' | 'decision';
  /** Banner text when the loop is waiting on a user decision (cycle max). */
  readonly decision?: string;
  /** Live activity line (e.g. `reviewer generic — read`) while an agent runs. */
  readonly tool?: string;
  /** Per-finding fixer progress, e.g. `wave 2/3 · fixed 3/9`. */
  readonly fixerDetail?: string;
  /** How many fixers run concurrently in the current wave. */
  readonly fixerConcurrency?: number;
  /** How many reviewers run concurrently in the fan-out. */
  readonly reviewerConcurrency?: number;
  /** Epoch ms when the current phase started (drives the live elapsed timer). */
  readonly phaseStartedAt?: number;
  /**
   * Agent key whose live stream the widget shows (`supervisor`, `reviewer:<id>`,
   * `fixer:<findingId>`). Undefined = the roster view.
   */
  readonly focused?: string;
  /**
   * Live agent-stream store — the same mutable reference across renders, so
   * the 1s re-render timer shows fresh deltas without re-pushing the widget.
   */
  readonly streams?: StreamStore;
  /** Live per-fixer tool store (same mutable reference across renders). */
  readonly fixerActivity?: FixerActivityStore;
  /** Per-fixer rows while the fixer phase runs (finding id → status). */
  readonly fixers?: readonly FixerWidgetRow[];
  /** Fixer wave schedule: waves of finding ids, e.g. `[['F1','F2'],['F3']]`. */
  readonly fixerSchedule?: readonly (readonly string[])[];
  /** 1-based current wave index (undefined before the first wave). */
  readonly fixerWave?: number;
}

export interface WidgetUi {
  readonly setWidget: ExtensionUIContext['setWidget'];
  /** Current theme for styling widget lines (available in the TUI). */
  readonly theme?: Theme;
}

const WIDGET_KEY = 'adversarial-review-loop';

/** Role label column width — keeps the rows aligned. */
const ROLE_WIDTH = 11;

/**
 * Colors text with the theme when available, otherwise passes it through
 * (plain output for tests / non-TUI runs).
 * @param {Theme | undefined} theme Current theme
 * @param {ThemeColor} color Theme color name
 * @param {string} text Text to color
 * @returns The (possibly colored) text
 */
const paint = (theme: Theme | undefined, color: ThemeColor, text: string): string =>
  theme === undefined ? text : theme.fg(color, text);

/** Bold via the theme when available, otherwise passes the text through. */
const bold = (theme: Theme | undefined, text: string): string =>
  theme === undefined ? text : theme.bold(text);

/** Theme color for a status. */
const statusColor = (
  status: ReviewerRunStatus | FixerWidgetStatus | FixerRunStatus | SupervisorWidgetStatus,
): ThemeColor => {
  if (status === 'running') return 'warning';
  if (status === 'done') return 'success';
  if (status === 'error') return 'error';
  if (status === 'skipped' || status === 'idle' || status === 'waiting' || status === 'queued') {
    return 'muted';
  }
  return 'warning'; // active supervisor phases (briefing / dispatch / aggregating)
};

/**
 * Formats a reviewer status glyph.
 * @param {ReviewerRunStatus} status Reviewer status
 * @returns Glyph character
 */
const reviewerGlyph = (status: ReviewerRunStatus): string => {
  if (status === 'done') return '●';
  if (status === 'running') return '◉';
  if (status === 'error') return '✗';
  if (status === 'skipped') return '–';
  return '○';
};

/** Human-readable label for a reviewer status. */
export const reviewerStatusLabel = (status: ReviewerRunStatus): string => {
  switch (status) {
    case 'running':
      return 'reviewing';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    case 'skipped':
      return 'skipped';
    default:
      return 'queued';
  }
};

/** Human-readable label for a supervisor status. */
export const supervisorStatusLabel = (status: SupervisorWidgetStatus): string => {
  switch (status) {
    case 'briefing':
      return 'briefing';
    case 'waiting-specialists':
      return 'waiting on reviewers';
    case 'aggregating':
      return 'aggregating';
    case 'done':
      return 'done';
    default:
      return 'idle';
  }
};

/** Human-readable label for a fixer status. */
export const fixerStatusLabel = (status: FixerWidgetStatus): string => {
  switch (status) {
    case 'running':
      return 'fixing';
    case 'done':
      return 'done';
    case 'skipped':
      return 'skipped';
    default:
      return 'waiting';
  }
};

/**
 * Friendly text for a graph phase string, e.g. `supervisor:brief` →
 * `supervisor brief`, `reviewer:security` → `reviewer security`.
 * @param {string} phase Raw phase string
 * @returns The human-readable phase
 */
export const phaseLabel = (phase: string): string => {
  switch (phase) {
    case 'starting':
      return 'starting';
    case 'supervisor:brief':
      return 'supervisor brief';
    case 'reviewers':
      return 'dispatch reviewers';
    case 'supervisor:aggregate':
      return 'supervisor aggregate';
    case 'merge':
      return 'merge';
    case 'reviewed':
      return 'reviewed';
    case 'fixer':
      return 'fixer';
    case 'fixed':
      return 'fixed';
    case 'consensus':
      return 'loop consensus';
    case 'decision':
      return 'cycle-max decision';
    case 'loop:advance':
      return 'next loop';
    default:
      if (phase.startsWith('reviewer:')) return `reviewer ${phase.slice('reviewer:'.length)}`;
      if (phase.startsWith('fixer:')) return `fixer ${phase.slice('fixer:'.length)}`;
      return phase;
  }
};

/** Spinner frames shown while the loop is active (1s per frame via the widget timer). */
const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'] as const;

/**
 * Keybind hints — always visible in both the roster and focused views so the
 * inspect actions stay discoverable: `inspect agent` (drill into one agent's
 * live stream) and `inspect issues` (the findings table).
 * @param {Theme | undefined} theme Current theme
 * @param {string[]} lines Widget lines to append to
 * @returns Nothing
 */
const renderKeysHints = (theme: Theme | undefined, lines: string[]): void => {
  lines.push(
    paint(theme, 'muted', 'keys'.padEnd(ROLE_WIDTH)) +
      paint(theme, 'dim', 'ctrl+shift+f — inspect agent stream'),
    paint(theme, 'muted', 'keys'.padEnd(ROLE_WIDTH)) +
      paint(theme, 'dim', 'ctrl+shift+i — inspect issues table'),
  );
};

/** The spinner frame for the current time. */
const spinnerFrame = (now: number): string =>
  SPINNER_FRAMES[Math.floor(now / 1000) % SPINNER_FRAMES.length] ?? '◐';

/**
 * Formats a duration as `42s`, `2m 5s`, or `1h 3m`.
 * @param {number} now Current epoch ms
 * @param {number} startedAt Phase start epoch ms
 * @returns The formatted duration
 */
export const formatElapsed = (now: number, startedAt: number): string => {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 === 0 ? `${minutes}m` : `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

/**
 * Tail of a stream for the widget: the last `lines` lines, each truncated to
 * `maxLine` chars (token streams can be one long unbroken run). A leading
 * `…` marks elided earlier content.
 * @param {string} text Stream text
 * @param {number} [lines] Max lines to show
 * @param {number} [maxLine] Max chars per line
 * @returns The tail lines
 */
const streamTail = (text: string, lines: number = 10, maxLine: number = 120): readonly string[] => {
  const parts = text.split('\n');
  const tail = parts.slice(-lines).map((line) =>
    line.length > maxLine ? `…${line.slice(-(maxLine - 1))}` : line,
  );
  if (parts.length > lines) tail.unshift('…');
  return tail;
};

/**
 * Focused view: one agent's live stream in place of the roster. Header + tool
 * line stay, so you still see the phase/elapsed and what the agent is doing.
 * @param {LoopWidgetState} state Widget state (focused + streams set)
 * @param {Theme} [theme] Current theme
 * @param {number} now Current epoch ms
 * @returns Widget lines
 */
const renderFocusedStream = (
  state: LoopWidgetState,
  theme: Theme | undefined,
  now: number,
): string[] => {
  const lines: string[] = [];
  const elapsed =
    state.phaseStartedAt === undefined
      ? ''
      : paint(theme, 'dim', `  · ${formatElapsed(now, state.phaseStartedAt)}`);
  lines.push(
    bold(theme, paint(theme, 'accent', 'adversarial-review-loop')) +
      paint(theme, 'dim', `  loop ${state.loop + 1}/${state.maxLoops}`) +
      paint(theme, 'dim', `  · cycle ${state.cycle + 1}/${state.maxCycles}`) +
      paint(theme, 'accent', `  · ${spinnerFrame(now)} ${phaseLabel(state.phase)}`) +
      elapsed,
  );

  const key = state.focused;
  if (key === undefined) {
    lines.push(paint(theme, 'muted', 'focus'.padEnd(ROLE_WIDTH)) + paint(theme, 'dim', 'idle'));
    renderKeysHints(theme, lines);
    return lines;
  }
  const stream = state.streams?.get(key);
  if (stream === undefined) {
    lines.push(
      paint(theme, 'muted', 'focus'.padEnd(ROLE_WIDTH)) +
        paint(theme, 'warning', `${key} — no stream yet`),
    );
    lines.push(
      paint(theme, 'muted', 'focus'.padEnd(ROLE_WIDTH)) +
        paint(theme, 'dim', '/adversarial-review-loop-focus off — back to roster'),
    );
    renderKeysHints(theme, lines);
    return lines;
  }

  // Prefer visible text; fall back to thinking when only thinking has streamed.
  const body = stream.text !== '' ? stream.text : stream.thinking;
  const mode =
    stream.text !== '' ? (stream.thinking !== '' ? 'text + thinking' : 'streaming') : 'thinking';
  lines.push(
    paint(theme, 'muted', 'focus'.padEnd(ROLE_WIDTH)) +
      paint(theme, 'accent', stream.label) +
      paint(theme, 'dim', `  · ${mode}`),
  );
  if (state.tool !== undefined) {
    lines.push(paint(theme, 'muted', 'now'.padEnd(ROLE_WIDTH)) + paint(theme, 'dim', state.tool));
  }
  for (const line of streamTail(body)) {
    lines.push(paint(theme, 'dim', line));
  }
  lines.push(
    paint(theme, 'muted', 'focus'.padEnd(ROLE_WIDTH)) +
      paint(theme, 'dim', '/adversarial-review-loop-focus off — back to roster'),
  );
  renderKeysHints(theme, lines);
  return lines;
};

/** Max per-fixer rows shown in the widget (done rows collapse into `fixed N/M`). */
const MAX_FIXER_ROWS = 5;

/** Status glyph for a fixer row. */
const fixerGlyph = (status: FixerRunStatus): string => {
  if (status === 'done') return '●';
  if (status === 'running') return '◉';
  if (status === 'error') return '✗';
  return '○'; // queued
};

/**
 * Renders the fixer wave schedule as a small diagram, e.g.
 * `✓[F1 F2] ▶[F3] [F4 F5]` — done waves checked/dim, the current wave
 * highlighted with `▶`, later waves plain.
 * @param {readonly (readonly string[])[]} schedule Waves of finding ids
 * @param {number | undefined} currentWave 1-based current wave index
 * @param {Theme | undefined} theme Current theme
 * @returns The diagram line
 */
const renderFixerSchedule = (
  schedule: readonly (readonly string[])[],
  currentWave: number | undefined,
  theme: Theme | undefined,
): string =>
  schedule
    .map((wave, index) => {
      const label = `[${wave.join(' ')}]`;
      const waveNumber = index + 1;
      if (currentWave === undefined || waveNumber === currentWave) {
        return paint(theme, 'warning', `▶${label}`);
      }
      if (waveNumber < currentWave) return paint(theme, 'dim', `✓${label}`);
      return paint(theme, 'muted', label);
    })
    .join(' ');

/**
 * Renders loop widget lines for Pi's setWidget API. Summary-first so the
 * most useful information survives Pi's widget line limit with large rosters.
 * The header carries the loop/cycle progress and a live elapsed timer for the
 * current phase. When `state.focused` is set, the roster is replaced by that
 * agent's live stream (see {@link renderFocusedStream}).
 * @param {LoopWidgetState} state Current loop visualization state
 * @param {Theme} [theme] Current theme (colors applied when present)
 * @param {number} [now] Current epoch ms (for the elapsed timer)
 * @returns Widget lines
 */
export const renderLoopWidget = (state: LoopWidgetState, theme?: Theme, now: number = Date.now()): string[] => {
  if (state.focused !== undefined) {
    return renderFocusedStream(state, theme, now);
  }
  const lines: string[] = [];

  // Header: title, loop/cycle progress, current phase, elapsed since the phase started.
  const elapsed =
    state.phaseStartedAt === undefined
      ? ''
      : paint(theme, 'dim', `  · ${formatElapsed(now, state.phaseStartedAt)}`);
  lines.push(
    bold(theme, paint(theme, 'accent', 'adversarial-review-loop')) +
      paint(theme, 'dim', `  loop ${state.loop + 1}/${state.maxLoops}`) +
      paint(theme, 'dim', `  · cycle ${state.cycle + 1}/${state.maxCycles}`) +
      paint(theme, 'accent', `  · ${spinnerFrame(now)} ${phaseLabel(state.phase)}`) +
      elapsed,
  );

  // Loop-level banner: consensus reached (advancing) or waiting on a decision.
  if (state.loopStatus === 'consensus') {
    lines.push(
      paint(theme, 'muted', 'loop'.padEnd(ROLE_WIDTH)) +
        paint(
          theme,
          'success',
          `✓ loop ${state.loop + 1} consensus — all findings resolved · next loop spawns fresh reviewers`,
        ),
    );
  } else if (state.loopStatus === 'decision' || state.decision !== undefined) {
    lines.push(
      paint(theme, 'muted', 'loop'.padEnd(ROLE_WIDTH)) +
        paint(
          theme,
          'warning',
          `? ${state.decision ?? `cycle max reached — waiting on you (loop ${state.loop + 1})`}`,
        ),
    );
  }

  // Summary (the scoreboard) — kept above the roster so truncation never hides it.
  if (Option.isSome(state.summary)) {
    const s = state.summary.value;
    let summary =
      `open ${paint(theme, 'accent', String(s.open))}` +
      ` · in-review ${paint(theme, 'accent', String(s.inReview))}` +
      ` · resolved ${paint(theme, 'success', String(s.resolved))}` +
      ` · escalated ${paint(theme, 'warning', String(s.escalated))}`;
    if (state.deadlocks > 0) {
      summary += `  ${paint(theme, 'warning', `⚠ deadlocks ${state.deadlocks}`)}`;
    }
    lines.push(paint(theme, 'muted', 'summary'.padEnd(ROLE_WIDTH)) + summary);
  } else {
    lines.push(paint(theme, 'muted', 'summary'.padEnd(ROLE_WIDTH)) + paint(theme, 'dim', 'pending'));
  }

  // Supervisor.
  lines.push(
    paint(theme, 'muted', 'supervisor'.padEnd(ROLE_WIDTH)) +
      paint(theme, statusColor(state.supervisor), supervisorStatusLabel(state.supervisor)),
  );

  // Reviewers (first row carries the role label; the rest are indented).
  const maxLabel = Math.max(0, ...state.reviewers.map((reviewer) => reviewer.label.length));
  state.reviewers.forEach((reviewer, index) => {
    const role = index === 0 ? 'reviewers' : '';
    const glyph = paint(theme, statusColor(reviewer.status), reviewerGlyph(reviewer.status));
    const name = paint(
      theme,
      reviewer.status === 'running' ? 'text' : 'dim',
      reviewer.label,
    );
    const status = paint(theme, statusColor(reviewer.status), reviewerStatusLabel(reviewer.status));
    const count =
      reviewer.findingCount !== undefined
        ? paint(theme, 'success', `  ${reviewer.findingCount} findings`)
        : '';
    const concurrency =
      index === 0 && state.reviewerConcurrency !== undefined
        ? paint(theme, 'dim', ` · ${state.reviewerConcurrency} concurrent`)
        : '';
    lines.push(
      paint(theme, 'muted', role.padEnd(ROLE_WIDTH)) +
        `${glyph} ${name.padEnd(maxLabel)}  ${status}${count}${concurrency}`,
    );
  });

  // Fixer.
  const concurrency =
    state.fixerConcurrency !== undefined ? ` · ${state.fixerConcurrency} concurrent` : '';
  const fixerDetail =
    state.fixerDetail !== undefined ? ` · ${state.fixerDetail}` : '';
  lines.push(
    paint(theme, 'muted', 'fixer'.padEnd(ROLE_WIDTH)) +
      paint(theme, statusColor(state.fixer), fixerStatusLabel(state.fixer)) +
      paint(theme, 'dim', concurrency) +
      paint(theme, 'dim', fixerDetail),
  );

  // Fixer wave schedule diagram + per-fixer rows (only while fixers run).
  if (state.fixer === 'running' && state.fixers !== undefined) {
    if (state.fixerSchedule !== undefined && state.fixerSchedule.length > 0) {
      lines.push(
        paint(theme, 'muted', 'waves'.padEnd(ROLE_WIDTH)) +
          renderFixerSchedule(state.fixerSchedule, state.fixerWave, theme),
      );
    }
    // Current-wave rows (running + queued), each with its live tool; done rows
    // collapse into the `fixed N/M` detail line above.
    const visible = state.fixers.filter(
      (row) => row.status === 'running' || row.status === 'queued',
    );
    for (const row of visible.slice(0, MAX_FIXER_ROWS)) {
      const tool = state.fixerActivity?.getTool(row.id);
      const glyph = paint(theme, statusColor(row.status), fixerGlyph(row.status));
      lines.push(
        paint(theme, 'muted', ''.padEnd(ROLE_WIDTH)) +
          `${glyph} ${row.id}${tool !== undefined ? paint(theme, 'dim', ` — ${tool}`) : ''}`,
      );
    }
    if (visible.length > MAX_FIXER_ROWS) {
      lines.push(
        paint(theme, 'muted', ''.padEnd(ROLE_WIDTH)) +
          paint(theme, 'dim', `+${visible.length - MAX_FIXER_ROWS} more`),
      );
    }
  }

  // Live tool activity (dim, transient — cleared at the next phase transition).
  if (state.tool !== undefined) {
    lines.push(paint(theme, 'muted', 'now'.padEnd(ROLE_WIDTH)) + paint(theme, 'dim', state.tool));
  }

  // Keybind hints — the inspect actions, always visible.
  renderKeysHints(theme, lines);

  return lines;
};

/**
 * Pushes the loop widget to the Pi UI (no-op when setWidget is unavailable).
 * Uses the component-factory form so the elapsed timer can tick: a 1s
 * interval requests re-renders, and render() recomputes the elapsed time.
 * @param {WidgetUi | undefined} ui UI handle
 * @param {LoopWidgetState} state Widget state
 * @returns Nothing
 */
export const setLoopWidget = (ui: WidgetUi | undefined, state: LoopWidgetState): void => {
  if (ui?.setWidget === undefined) return;
  ui.setWidget(WIDGET_KEY, (tui, theme) => {
    const timer = setInterval(() => tui.requestRender(), 1000);
    return {
      render: () => renderLoopWidget(state, theme, Date.now()),
      invalidate: () => {},
      dispose: () => clearInterval(timer),
    };
  });
};

/**
 * Clears the loop widget from the Pi UI.
 * @param {WidgetUi | undefined} ui UI handle
 * @returns Nothing
 */
export const clearLoopWidget = (ui: WidgetUi | undefined): void => {
  if (ui?.setWidget === undefined) return;
  ui.setWidget(WIDGET_KEY, undefined);
};
