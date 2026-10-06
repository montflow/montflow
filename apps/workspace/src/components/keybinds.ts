/**
 * One keybinding hint: the keystroke plus the action it triggers. `action`
 * stays empty for bare labels (`type to filter`) that open a fragment.
 */
export interface Keybind {
  readonly key: string;
  readonly action?: string | undefined;
}

/**
 * Render entries as `key action · key action`, bare labels pass through
 * verbatim. Single source of truth for every keybind line — panels and
 * the status hint share it so copy never drifts between the two.
 * @param items - banner entries in display order
 * @returns one-line banner copy
 */
export const formatKeybinds = (items: ReadonlyArray<Keybind>): string =>
  items
    .map((item) => (item.action === undefined ? item.key : `${item.key} ${item.action}`))
    .join(' · ');

/**
 * Constructors for the common keybinds. Panels and the status hint build
 * their lines from these — no hand-written `·`-joined copy outside this
 * module (dynamic heads like panel keybinds or counts interpolate around
 * `formatKeybinds` output instead).
 */
export const Keybinds = {
  /** `⏎ install` — missing-store footer and status hint. */
  install: (): Keybind => ({ key: '⏎', action: 'install' }),
  /** `c create` — empty-list footer and status hint. */
  create: (): Keybind => ({ key: 'c', action: 'create' }),
  /** `/ search` — list filter entry. */
  search: (): Keybind => ({ key: '/', action: 'search' }),
  /** `⏎ open` — list detail entry. */
  open: (): Keybind => ({ key: '⏎', action: 'open' }),
  /** `g run` — jump to the dispatched profile-create run's detail. */
  goToRun: (): Keybind => ({ key: 'g', action: 'run' }),
  /** `j/k move` — list highlight entry. */
  move: (): Keybind => ({ key: 'j/k', action: 'move' }),
  /** `A all runs` — runs-list section toggle (Active vs full history). */
  showAll: (): Keybind => ({ key: 'A', action: 'all runs' }),
  /** `j/k scroll` — detail full-view scroll entry. */
  scroll: (): Keybind => ({ key: 'j/k', action: 'scroll' }),
  /** `tab focus` — cycle which run pane the keys act on. */
  toggleFocus: (): Keybind => ({ key: 'tab', action: 'focus' }),
  /** `d details` — focus the run's metadata-and-actions column. */
  focusDetails: (): Keybind => ({ key: 'd', action: 'details' }),
  /** `p prompt` — focus the run's prompt pane. */
  focusPrompt: (): Keybind => ({ key: 'p', action: 'prompt' }),
  /** `t transcript` — focus the run's transcript pane. */
  focusTranscript: (): Keybind => ({ key: 't', action: 'transcript' }),
  /** `↑↓ scroll` — read-only scroll-view entry (flow modals, working status). */
  arrowScroll: (): Keybind => ({ key: '↑↓', action: 'scroll' }),
  /** `↑↓←→ move` — text-input cursor entry (arrows drive the cursor, the view follows). */
  moveArrows: (): Keybind => ({ key: '↑↓←→', action: 'move' }),
  /** `shift+⏎ newline` — text-input newline entry (plain ⏎ submits). */
  insertNewline: (): Keybind => ({ key: 'shift+⏎', action: 'newline' }),
  /** `esc back` — detail close entry. */
  back: (): Keybind => ({ key: 'esc', action: 'back' }),
  /** `q quit` — status hint quit entry. */
  quit: (): Keybind => ({ key: 'q', action: 'quit' }),
  /** `esc cancel` — dialog and delete-confirm cancel entry. */
  cancel: (): Keybind => ({ key: 'esc', action: 'cancel' }),
  /** `⏎ choose` — menu dialog pick entry. */
  choose: (): Keybind => ({ key: '⏎', action: 'choose' }),
  /** `↑↓ select` — menu status-hint move entry. */
  menuSelect: (): Keybind => ({ key: '↑↓', action: 'select' }),
  /** `←/→ select` — remove-dialog button focus entry. */
  modalSelect: (): Keybind => ({ key: '←/→', action: 'select' }),
  /** `↑↓ navigate` — dialog footer move entry. */
  menuNavigate: (): Keybind => ({ key: '↑↓', action: 'navigate' }),
  /** `⏎ submit` — text-input dialog entry. */
  submit: (): Keybind => ({ key: '⏎', action: 'submit' }),
  /** `⏎ select` — filter picker pick entry. */
  selectRow: (): Keybind => ({ key: '⏎', action: 'select' }),
  /** `tab current` — filter picker pinned-row jump (model picker session default). */
  jumpToCurrent: (): Keybind => ({ key: 'tab', action: 'current' }),
  /** Bare `type` — text-input dialog fragment. */
  type: (): Keybind => ({ key: 'type' }),
  /** Bare `type to filter` — filter and search fragments. */
  typeToFilter: (): Keybind => ({ key: 'type to filter' }),
  /** `esc done` — search exit entry. */
  done: (): Keybind => ({ key: 'esc', action: 'done' }),
  /** `/ done` — stop typing, keep the applied filter. */
  stopTyping: (): Keybind => ({ key: '/', action: 'done' }),
  /** `esc clear` — clear the applied filter. */
  clearFilter: (): Keybind => ({ key: 'esc', action: 'clear' }),
  /** `d delete` — detail delete entry. */
  remove: (): Keybind => ({ key: 'd', action: 'delete' }),
  /** `s steer` — run-detail steering entry (live runs). */
  steer: (): Keybind => ({ key: 's', action: 'steer' }),
  /** `a answer` — run-detail parked-question answer entry. */
  answer: (): Keybind => ({ key: 'a', action: 'answer' }),
  /** `x interrupt` — run-detail live-run stop entry. */
  interrupt: (): Keybind => ({ key: 'x', action: 'interrupt' }),
  /** `R refresh` — list refetch entry (panels and details). */
  refresh: (): Keybind => ({ key: 'R', action: 'refresh' }),
  /** `m modify` — detail modify entry. */
  modify: (): Keybind => ({ key: 'm', action: 'modify' }),
  /** `v view` — detail preview-mode entry. */
  showFull: (): Keybind => ({ key: 'v', action: 'view' }),
  /** `v preview` — detail full-view entry. */
  showPreview: (): Keybind => ({ key: 'v', action: 'preview' }),
  /** `x remove` — list quick-remove entry (skills list, status hint). */
  removeFromList: (): Keybind => ({ key: 'x', action: 'remove' }),
  /** `y confirm` — remove-dialog confirm entry. */
  confirmYes: (): Keybind => ({ key: 'y', action: 'confirm' }),
  /**
   * Bare `confirm in Ns…` — remove-dialog countdown fragment.
   * @param remaining - seconds left on the timed guard
   * @returns countdown fragment entry
   */
  confirmIn: (remaining: number): Keybind => ({ key: `confirm in ${remaining}s…` }),
  /**
   * List footer entries: install when the store is missing, create when
   * empty, the full search/open/create/move set otherwise — plus the
   * quick-remove entry for panels whose list supports it (skills `x`).
   * Shared by the skills and profiles panels so both footers stay
   * identical except for the panels' own capabilities.
   * @param installed - store presence flag
   * @param total - filtered row count
   * @param options - capability flags (`quickRemove` for list-level `x`, `allRuns` for the runs section toggle)
   * @returns footer entries in display order
   */
  listBanner: (
    installed: boolean,
    total: number,
    options?: {
      readonly quickRemove?: boolean | undefined;
      readonly allRuns?: boolean | undefined;
    },
  ): ReadonlyArray<Keybind> => {
    if (!installed) return [Keybinds.install()];
    if (total === 0) return [Keybinds.create()];
    const entries: Array<Keybind> = [Keybinds.search(), Keybinds.open(), Keybinds.create()];
    if (options?.quickRemove === true) entries.push(Keybinds.removeFromList());
    entries.push(Keybinds.move());
    if (options?.allRuns === true) entries.push(Keybinds.showAll());
    return entries;
  },
};
