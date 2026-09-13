import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { Effect } from 'effect';

/** Failure value when the user cancels a dialog. Notified as info, not an error. */
export const CANCELLED = 'Cancelled.';

/**
 * Minimal UI surface the `/mf-*` flows need. Mirrors Pi's own narrowing
 * for dialogs, so any real `ctx.ui` is assignable and fakes stay tiny.
 */
export interface InteractiveUi {
  readonly select: (title: string, options: string[]) => Promise<string | undefined>;
  readonly confirm: (title: string, message: string) => Promise<boolean>;
  readonly input: (title: string, placeholder?: string) => Promise<string | undefined>;
  readonly notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
  /** Live filter-as-you-type picker. Absent outside the TUI (falls back to input+select). */
  readonly searchSelect?: (title: string, options: string[]) => Promise<string | undefined>;
}

/** UI surface available where custom TUI components can render (TUI mode). */
export interface FilterUi extends InteractiveUi {
  readonly custom: ExtensionUIContext['custom'];
}

/** One model offered for agentic runs: `provider/model-id` plus current-run marker. */
export interface ModelOption {
  readonly label: string;
  readonly current: boolean;
}

/**
 * TUI model picker port the consuming extension injects (search UI with the
 * current session model pinned). Absent outside the TUI (falls back to the
 * menu-driven picker).
 */
export type ModelPickerFn = (models: ReadonlyArray<ModelOption>) => Promise<string | undefined>;

/**
 * TUI loading-modal port the consuming extension injects (spinner that
 * locks input while a closed Effect runs). Absent outside the TUI
 * (runs the Effect directly).
 */
export type LoadingFn = <A, E>(
  message: string,
  self: Effect.Effect<A, E, never>,
) => Effect.Effect<A, E>;

/**
 * TUI main-menu port the consuming extension injects (heading, info
 * panel, then options). Absent outside the TUI (falls back to Pi-native
 * `select`).
 */
export type MenuFn = (
  title: string,
  info: ReadonlyArray<string>,
  options: ReadonlyArray<string>,
) => Effect.Effect<string | undefined>;

/**
 * Split args on whitespace, keeping `"quoted spans"` together (quotes stripped).
 * @param args - raw slash-command args
 * @returns token list
 */
export const tokenize = (args: string): readonly string[] => {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of args.matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens.filter((token) => token !== '');
};
