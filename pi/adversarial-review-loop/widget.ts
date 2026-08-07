import type { ExtensionUIContext, Theme, ThemeColor } from '@earendil-works/pi-coding-agent';
import type { SummaryCounts } from './parse-summary';
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
  status: ReviewerRunStatus | FixerWidgetStatus | SupervisorWidgetStatus,
): ThemeColor => {
  if (status === 'running') return 'warning';
  if (status === 'done') return 'success';
  if (status === 'error') return 'error';
  if (status === 'skipped' || status === 'idle' || status === 'waiting') return 'muted';
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
 * Renders loop widget lines for Pi's setWidget API. Summary-first so the
 * most useful information survives Pi's widget line limit with large rosters.
 * The header carries the loop/cycle progress and a live elapsed timer for the
 * current phase.
 * @param {LoopWidgetState} state Current loop visualization state
 * @param {Theme} [theme] Current theme (colors applied when present)
 * @param {number} [now] Current epoch ms (for the elapsed timer)
 * @returns Widget lines
 */
export const renderLoopWidget = (state: LoopWidgetState, theme?: Theme, now: number = Date.now()): string[] => {
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

  // Live tool activity (dim, transient — cleared at the next phase transition).
  if (state.tool !== undefined) {
    lines.push(paint(theme, 'muted', 'now'.padEnd(ROLE_WIDTH)) + paint(theme, 'dim', state.tool));
  }

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
