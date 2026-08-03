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
  | 'done'
  | 'skipped';

export type ReconcileWidgetStatus =
  | 'idle'
  | 'programmatic'
  | 'llm'
  | 'skipped'
  | 'done';

export type FixerWidgetStatus = 'waiting' | 'running' | 'done' | 'skipped';

export interface LoopWidgetState {
  readonly cycle: number;
  readonly maxLoops: number;
  readonly supervisor: SupervisorWidgetStatus;
  readonly supervisorDetail?: string;
  readonly reviewers: readonly ReviewerWidgetRow[];
  readonly reconcile: ReconcileWidgetStatus;
  readonly reconcileDetail?: string;
  readonly fixer: FixerWidgetStatus;
  readonly summary: Option.Option<SummaryCounts>;
  readonly deadlocks: number;
  readonly phase: string;
}

export interface WidgetUi {
  readonly setWidget: (
    key: string,
    content: string[] | undefined,
    options?: { readonly placement?: 'aboveEditor' | 'belowEditor' },
  ) => void;
}

const WIDGET_KEY = 'adversarial-review-loop';

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

/**
 * Renders loop widget lines for Pi's setWidget API.
 * @param {LoopWidgetState} state Current loop visualization state
 * @returns Widget lines
 */
export const renderLoopWidget = (state: LoopWidgetState): string[] => {
  const lines: string[] = [
    `adversarial-review-loop  cycle ${state.cycle}/${state.maxLoops}  (${state.phase})`,
  ];

  const supervisorExtra =
    state.supervisorDetail !== undefined ? ` — ${state.supervisorDetail}` : '';
  lines.push(`  supervisor    ${state.supervisor}${supervisorExtra}`);

  for (const reviewer of state.reviewers) {
    const count =
      reviewer.findingCount !== undefined ? `  ${reviewer.findingCount} findings` : '';
    lines.push(
      `  ${reviewerGlyph(reviewer.status)} ${reviewer.label.padEnd(12)} ${reviewer.status}${count}`,
    );
  }

  const reconcileExtra = state.reconcileDetail !== undefined ? ` — ${state.reconcileDetail}` : '';
  lines.push(`  reconcile     ${state.reconcile}${reconcileExtra}`);
  lines.push(`  fixer         ${state.fixer}`);

  if (Option.isSome(state.summary)) {
    const summary = state.summary.value;
    lines.push(
      `Summary: Open ${summary.open} · In Review ${summary.inReview} · Resolved ${summary.resolved} · Escalated ${summary.escalated} · Deadlocks ${state.deadlocks}`,
    );
  } else {
    lines.push(`Summary: (pending) · Deadlocks ${state.deadlocks}`);
  }

  return lines;
};

/**
 * Pushes the loop widget to the Pi UI (no-op when setWidget is unavailable).
 * @param {WidgetUi | undefined} ui UI handle
 * @param {LoopWidgetState} state Widget state
 * @returns Nothing
 */
export const setLoopWidget = (ui: WidgetUi | undefined, state: LoopWidgetState): void => {
  if (ui?.setWidget === undefined) return;
  ui.setWidget(WIDGET_KEY, renderLoopWidget(state));
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
