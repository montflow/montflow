import type {
  BoxRenderable,
  KeyEvent,
  PasteEvent,
  ScrollBoxRenderable,
  TextareaRenderable,
} from '@opentui/core';
import { useKeyboard, usePaste, useRenderer, useTerminalDimensions } from '@opentui/solid';
import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import { Dashboard, RemoveConfirm, SkillFilter, Workspace } from './modules/index.js';
import { Cause, Effect, Fiber } from 'effect';
import { For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js';
import {
  DetailActions,
  type DetailAction,
  type DetailActionId,
  FilterDialog,
  FlowErrorModal,
  type FlowErrorFocus,
  FlowModal,
  InfoPanel,
  InputDialog,
  Keybinds,
  MenuDialog,
  QUERY_MAX_CHARS,
  type SubmittedInput,
  Panel,
  PanelMessage,
  ProfileDetail,
  type ProfileDetailMode,
  ProfilesPanel,
  PromptDetail,
  type PromptDetailMode,
  PromptsPanel,
  RemoveDialog,
  RunDetail,
  type RunDetailMode,
  RunsPanel,
  SkillDetail,
  type SkillDetailMode,
  SkillsPanel,
  StatusBar,
  ToastStack,
  formatKeybinds,
  palette,
} from './components/index.js';
import type { Toast, ToastVariant } from './components/index.js';
import { GitInfo, Profiles, Prompts, Query, Runs, Skills } from './services/index.js';
import type { Interactive } from '@montflow/pi-skills';

export interface AppProps {
  readonly layout: Dashboard.Layout;
  readonly root: string;
}

/** Promise-backed menu overlay for the Interactive flow ports. */
interface MenuState {
  readonly kind: 'menu';
  readonly title: string;
  readonly subtitle: string | undefined;
  readonly options: ReadonlyArray<string>;
  readonly highlight: number;
  readonly resolve: (picked: string | undefined) => void;
}

/** Promise-backed text-input overlay for the Interactive flow ports. */
interface InputState {
  readonly kind: 'input';
  readonly title: string;
  readonly placeholder: string | undefined;
  readonly value: string;
  readonly resolve: (value: string | undefined) => void;
}

/** Promise-backed filter picker overlay (model picker, searchSelect). */
interface FilterState {
  readonly kind: 'filter';
  readonly title: string;
  readonly query: string;
  readonly highlight: number;
  readonly all: ReadonlyArray<string>;
  /** Index into `all` of the pinned row (session default model), if any — `tab` jumps back to it. */
  readonly current?: number | undefined;
  readonly resolve: (picked: string | undefined) => void;
}

/** Promise-backed timed remove-confirm modal for a list row or open detail. */
interface RemoveState {
  readonly kind: 'remove';
  readonly itemKind: 'skill' | 'profile' | 'prompt';
  readonly id: string;
  readonly name: string;
  readonly remaining: number;
  readonly deleting: boolean;
  readonly focus: RemoveConfirm.RemoveFocus;
  readonly resolve: (confirmed: boolean) => void;
}

/** One open flow dialog, if any. Working runs lock input separately. */
type DialogState = MenuState | InputState | FilterState | RemoveState;

/** Failed agent flow awaiting retry or back: run title, error, and the retry thunk. */
interface FlowFailure {
  readonly title: string;
  readonly error: string;
  readonly retry: () => void;
}

/**
 * Subsequence-narrow the filter picker options, preserving order.
 * Uses the shared extension matcher once a flow has loaded it — blank
 * queries (or the pre-load state, where no picker can be open) keep
 * everything. Module scope: pure, so the linter keeps it out of the
 * component.
 * @param all - full option list
 * @param text - user filter text
 * @returns matching options
 */
const narrowOptions = (all: ReadonlyArray<string>, text: string): ReadonlyArray<string> => {
  const matcher = Skills.loadedMatcher() ?? Profiles.loadedMatcher() ?? Prompts.loadedMatcher();
  if (matcher === undefined || text.trim() === '') return all;
  return all.filter((option) => matcher(option, text));
};

/**
 * Detail status hint for an open skill, profile, or prompt: identical entry sets
 * in every mode, shared so the three details never drift. Module scope:
 * pure, so the linter keeps it out of the component.
 * @param mode - preview or full-view mode
 * @returns one-line hint copy
 */
const detailHint = (mode: SkillDetailMode | ProfileDetailMode | PromptDetailMode): string =>
  mode === 'view'
    ? formatKeybinds([
        Keybinds.menuNavigate(),
        Keybinds.selectRow(),
        Keybinds.scroll(),
        Keybinds.showPreview(),
        Keybinds.remove(),
        Keybinds.modify(),
        Keybinds.refresh(),
        Keybinds.quit(),
      ])
    : formatKeybinds([
        Keybinds.menuNavigate(),
        Keybinds.selectRow(),
        Keybinds.showFull(),
        Keybinds.remove(),
        Keybinds.modify(),
        Keybinds.refresh(),
        Keybinds.quit(),
      ]);

/**
 * Action menu for an open detail: toggle view/preview plus
 * modify/delete/back. Shared so skill, profile, and prompt details
 * never drift. Module scope: pure.
 * @param mode - preview or full-view mode
 * @returns menu actions in display order
 */
const detailActionsFor = (
  mode: SkillDetailMode | ProfileDetailMode | PromptDetailMode,
): ReadonlyArray<DetailAction> => [
  {
    id: 'toggle-view',
    label: mode === 'view' ? 'Show preview' : 'Show full view',
    hint: 'v',
  },
  { id: 'modify', label: 'Modify', hint: 'm' },
  { id: 'delete', label: 'Delete', hint: 'd' },
  { id: 'back', label: 'Back', hint: 'esc' },
];

/**
 * Printable text from a keypress sequence: strips C0 controls and lone
 * ESC (arrow/function sequences carry `\x1b` and must never append).
 * Multi-char sequences arrive from IME, dictation (Handy), and
 * bracketed-paste fallbacks that surface as one keypress — the old
 * `sequence.length === 1` guard dropped every one of them. Module
 * scope: pure.
 * @param sequence - raw key sequence
 * @returns printable slice, or empty when nothing typeable
 */
const printableText = (sequence: string): string => {
  if (sequence.includes('\x1b')) return '';
  const cleaned = [...sequence].filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 && char !== '\t') return false;
    if (code === 127) return false;
    return true;
  });
  return cleaned.join('');
};

/**
 * Decode a bracketed-paste event to insertable text: UTF-8 bytes with
 * CRLF normalized to LF. Dictation tools (Handy) paste dictated words
 * instead of keypressing them, so without this every voice-typed
 * `InputDialog`/`FilterDialog`/search stayed empty. Module scope: pure.
 * @param event - paste event from `usePaste`
 * @returns paste text
 */
const decodePaste = (event: PasteEvent): string => {
  try {
    return new TextDecoder().decode(event.bytes).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  } catch {
    return '';
  }
};

/**
 * Paste cleaner for the input dialog fallback: like `printableText`
 * but keeps newlines — the editor is multiline, so pasted paragraphs
 * must survive. Module scope: pure.
 * @param text - raw paste text
 * @returns insertable slice, or empty when nothing typeable
 */
const pastedInputText = (text: string): string => {
  if (text.includes('\x1b')) return '';
  const cleaned = [...text].filter((char) => {
    if (char === '\n' || char === '\t') return true;
    const code = char.codePointAt(0) ?? 0;
    if (code < 32) return false;
    if (code === 127) return false;
    return true;
  });
  return cleaned.join('');
};

/**
 * Sync one flow-modal overflow flag: true while the scrollbox content
 * actually exceeds its viewport. Measured after layout (microtask, like
 * the card measurements) — the caller re-runs the effect on every input
 * that changes the layout. Module scope: pure.
 * @param node - scrollbox node, if mounted
 * @param set - overflow flag setter
 */
const syncScrollOverflow = (
  node: ScrollBoxRenderable | undefined,
  set: (overflow: boolean) => void,
): void => {
  if (node === undefined || node.isDestroyed) {
    set(false);
    return;
  }
  queueMicrotask(() => {
    if (!node.isDestroyed) set(node.scrollHeight > node.viewport.height);
  });
};

/**
 * Display label with the current-run marker, mirroring the pi picker.
 * Module scope: pure.
 * @param option - picker option
 * @returns display label
 */
const displayModelLabel = (option: Interactive.ModelOption): string =>
  option.current ? `${option.label} (current)` : option.label;

/** Windowed filter picker rows for `FilterDialog`. */
interface FilterView {
  readonly title: string;
  readonly query: string;
  readonly rows: ReadonlyArray<string>;
  readonly highlight: number;
  readonly total: number;
  readonly hasCurrent: boolean;
}

const placeholder = (root: string): Workspace.Info =>
  Workspace.make({ name: Workspace.basename(root), root, branch: '…', clean: true });

const clampHighlight = (index: number, length: number): number =>
  length === 0 ? 0 : Math.min(Math.max(index, 0), length - 1);

/**
 * One-shot wall-clock delay for TUI chrome (toast expiry, post-layout
 * re-measure). Effect.sleep fibers never resolve inside the OpenTUI
 * render loop — only raw timers fire — so chrome timing uses one
 * directly. No TestClock equivalent exists for layout timing.
 * @param ms - delay in milliseconds
 * @param task - work to run once
 */
const later = (ms: number, task: () => void): void => {
  // oxlint-disable-next-line montflow/no-timers -- documented above: Effect Clock hangs here.
  setTimeout(task, ms);
};

/**
 * Fixed skills row budget from the terminal height alone — never read
 * back from the laid-out card. The left rail owns two fifths of the
 * column (minus chrome); the estimate stays conservative so the pinned
 * region always fits and the grid never rebalances. Pure function of
 * terminal height, so resizes are the only height changes.
 */

/**
 * One-line copy for a promise-rejection payload: Effect `runPromise`
 * only rejects here on die/defect (services are `never`-fail). The
 * `cause` name is the repo convention for unparsed rejection input
 * (lint-exempt); it renders safely via narrowing plus String fallback.
 * @param cause - rejection payload
 * @returns display string
 */
const defectMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Workspace dashboard: header bar, configurable panel grid, status
 * footer. Letter keys select a panel (`[i] Info` titles show the
 * binding), `q` quits. The skills, profiles, and prompts panels search
 * independently with `/` — typing filters that panel only (every key
 * is typeable, arrows move), `/` again keeps the filter while every
 * keybind works on the filtered rows, `/` resumes typing, `esc`
 * always clears the filter — open details with enter, and create
 * with `c` (the skills and prompts panels also remove the highlighted
 * row with `x` behind a timed confirm modal); `R` refetches the
 * selected panel for externally changed stores; missing stores install
 * with enter. The skill detail previews the body, the profile detail
 * previews instructions plus checklist, and the prompt detail previews
 * the template (`v` full view with `j`/`k` scroll, `d` delete behind
 * the same timed confirm modal, `m` modify, `R` refetch). Create and
 * modify run the shared
 * `@montflow/pi-skills` / `@montflow/pi-profiles` /
 * `@montflow/pi-prompts` interactive flows — manual or agentic, with a
 * filterable model picker and a locked flow modal (animated spinner,
 * one-line status, the submitted input) while the headless `pi -p`
 * child runs; agent failures open a retry/back error modal instead of
 * a toast. Git, skills, profiles, and prompts load behind transient
 * overlays — no permanent loader in the chrome.
 * @param props - grid layout plus workspace root from the composition root
 * @returns dashboard element
 */
export const App = (props: AppProps) => {
  const renderer = useRenderer();
  const root = props.root;
  const layout = props.layout;
  const cells = createMemo(() => Dashboard.flatten(layout));
  const [selected, setSelected] = createSignal(Dashboard.firstPanel(layout));
  const [info, setInfo] = createSignal(placeholder(root));
  const [loaded, setLoaded] = createSignal(false);
  const queryClient = useQueryClient();
  const [skillsPhase, setSkillsPhase] = createSignal<Skills.SkillsPhase>('extension');
  const skillsQuery = createQuery(() => ({
    queryKey: Query.skillsKey,
    queryFn: () => Query.fetchSkillsList(root, setSkillsPhase),
  }));
  const skillRows = createMemo(() => skillsQuery.data?.rows ?? []);
  const skillsInstalled = createMemo(() => skillsQuery.data?.installed ?? false);
  const skillsLoaded = createMemo(() => !skillsQuery.isPending);
  const [skillQuery, setSkillQuery] = createSignal('');
  const [skillTyping, setSkillTyping] = createSignal(false);
  const [skillHighlight, setSkillHighlight] = createSignal(0);
  const [profileQuery, setProfileQuery] = createSignal('');
  const [profileTyping, setProfileTyping] = createSignal(false);
  const [profileHighlight, setProfileHighlight] = createSignal(0);
  const [detailId, setDetailId] = createSignal<string | undefined>(undefined);
  const [detailMode, setDetailMode] = createSignal<SkillDetailMode>('preview');
  const [detailScroll, setDetailScroll] = createSignal(0);
  const [detailAction, setDetailAction] = createSignal(0);
  const [skillsCard, setSkillsCard] = createSignal<BoxRenderable | undefined>(undefined);
  const [measuredRows, setMeasuredRows] = createSignal<number | undefined>(undefined);
  const [profilesPhase, setProfilesPhase] = createSignal<Profiles.ProfilesPhase>('extension');
  const profilesQuery = createQuery(() => ({
    queryKey: Query.profilesKey,
    queryFn: () => Query.fetchProfilesList(root, setProfilesPhase),
  }));
  const profileRows = createMemo(() => profilesQuery.data?.rows ?? []);
  const profilesInstalled = createMemo(() => profilesQuery.data?.installed ?? false);
  const profilesLoaded = createMemo(() => !profilesQuery.isPending);
  const [profileDetailId, setProfileDetailId] = createSignal<string | undefined>(undefined);
  const [profileDetailMode, setProfileDetailMode] = createSignal<ProfileDetailMode>('preview');
  const [profileDetailScroll, setProfileDetailScroll] = createSignal(0);
  const [profileDetailAction, setProfileDetailAction] = createSignal(0);
  const [profilesCard, setProfilesCard] = createSignal<BoxRenderable | undefined>(undefined);
  const [measuredProfileRows, setMeasuredProfileRows] = createSignal<number | undefined>(undefined);
  const [profileInstalling, setProfileInstalling] = createSignal(false);
  const [promptsPhase, setPromptsPhase] = createSignal<Prompts.PromptsPhase>('extension');
  const promptsQuery = createQuery(() => ({
    queryKey: Query.promptsKey,
    queryFn: () => Query.fetchPromptsList(root, setPromptsPhase),
  }));
  const promptRows = createMemo(() => promptsQuery.data?.rows ?? []);
  const promptsInstalled = createMemo(() => promptsQuery.data?.installed ?? false);
  const promptsLoaded = createMemo(() => !promptsQuery.isPending);
  const [promptQuery, setPromptQuery] = createSignal('');
  const [promptTyping, setPromptTyping] = createSignal(false);
  const [promptHighlight, setPromptHighlight] = createSignal(0);
  const [promptDetailId, setPromptDetailId] = createSignal<string | undefined>(undefined);
  const [promptDetailMode, setPromptDetailMode] = createSignal<PromptDetailMode>('preview');
  const [promptDetailScroll, setPromptDetailScroll] = createSignal(0);
  const [promptDetailAction, setPromptDetailAction] = createSignal(0);
  const [promptsCard, setPromptsCard] = createSignal<BoxRenderable | undefined>(undefined);
  const [measuredPromptRows, setMeasuredPromptRows] = createSignal<number | undefined>(undefined);
  const [promptInstalling, setPromptInstalling] = createSignal(false);
  const [runsPhase, setRunsPhase] = createSignal<Runs.RunsPhase>('extension');
  const runsQuery = createQuery(() => ({
    queryKey: Query.runsKey,
    queryFn: () => Query.fetchRunsList(root, setRunsPhase),
  }));
  const runRows = createMemo(() => runsQuery.data?.rows ?? []);
  const runsStoreInstalled = createMemo(() => runsQuery.data?.installed ?? false);
  const runsLoaded = createMemo(() => !runsQuery.isPending);
  const [runQuery, setRunQuery] = createSignal('');
  const [runTyping, setRunTyping] = createSignal(false);
  const [runHighlight, setRunHighlight] = createSignal(0);
  const [runDetailId, setRunDetailId] = createSignal<string | undefined>(undefined);
  const [runDetailData, setRunDetailData] = createSignal<Runs.RunDetail | undefined>(undefined);
  const [runDetailLoading, setRunDetailLoading] = createSignal(false);
  const [runDetailMode, setRunDetailMode] = createSignal<RunDetailMode>('preview');
  const [runDetailScroll, setRunDetailScroll] = createSignal(0);
  const [runDetailAction, setRunDetailAction] = createSignal(0);
  const [runsCard, setRunsCard] = createSignal<BoxRenderable | undefined>(undefined);
  const [measuredRunRows, setMeasuredRunRows] = createSignal<number | undefined>(undefined);
  const [runsInstalling, setRunsInstalling] = createSignal(false);
  /** Run id with an in-flight agent fiber: the esc-interrupt path cancels its store receipt. */
  const [pendingAgentRunId, setPendingAgentRunId] = createSignal<string | undefined>(undefined);
  const [toasts, setToasts] = createSignal<ReadonlyArray<Toast>>([]);
  const [dialog, setDialog] = createSignal<DialogState | undefined>(undefined);
  const [inputEditor, setInputEditor] = createSignal<TextareaRenderable | undefined>(undefined);
  const [lastInput, setLastInput] = createSignal<SubmittedInput | undefined>(undefined);
  const [flowError, setFlowError] = createSignal<FlowFailure | undefined>(undefined);
  const [flowErrorFocus, setFlowErrorFocus] = createSignal<FlowErrorFocus>('retry');
  const [flowSubmitScroll, setFlowSubmitScroll] = createSignal<ScrollBoxRenderable | undefined>(
    undefined,
  );
  const [flowErrorScroll, setFlowErrorScroll] = createSignal<ScrollBoxRenderable | undefined>(
    undefined,
  );

  // Stale scroll nodes never survive their modal: clearing on close
  // keeps arrow-scroll from touching destroyed renderables.
  createEffect(() => {
    if (flowError() === undefined) setFlowErrorScroll(undefined);
  });

  /**
   * Scroll-overflow flags for the flow modals: true while the content
   * actually exceeds the viewport — gates the `↑↓ scroll` hints so they
   * never show on fittable text. Re-measured after layout (microtask,
   * like the card measurements) on every input that changes the layout:
   * run state, submitted text, scroll node, terminal size.
   */
  const [flowCanScroll, setFlowCanScroll] = createSignal(false);
  const [flowErrorCanScroll, setFlowErrorCanScroll] = createSignal(false);

  createEffect(() => {
    working();
    lastInput();
    flowSubmitScroll();
    dimensions();
    syncScrollOverflow(flowSubmitScroll(), setFlowCanScroll);
  });
  createEffect(() => {
    flowError();
    flowErrorScroll();
    dimensions();
    syncScrollOverflow(flowErrorScroll(), setFlowErrorCanScroll);
  });
  const [working, setWorking] = createSignal<string | undefined>(undefined);
  /** In-flight agent fiber while `working` is set: `esc` interrupts it to cancel the run. */
  const [flowFiber, setFlowFiber] = createSignal<Fiber.Fiber<unknown, unknown> | undefined>(
    undefined,
  );
  const [installing, setInstalling] = createSignal(false);

  let toastId = 0;

  /**
   * Report without panicking the TUI: stack the toast (max three,
   * opencode-style title plus variant) and expire it after its duration
   * (default five seconds, like opencode's `toast.show`). Every Effect
   * defect and load failure routes here — nothing fails silent, nothing
   * throws into the renderer.
   * @param message - one-line copy
   * @param options - optional title, variant (default info), and duration
   */
  const pushToast = (
    message: string,
    options?: {
      readonly title?: string;
      readonly variant?: ToastVariant;
      readonly duration?: number;
    },
  ): void => {
    toastId += 1;
    const id = toastId;
    const toast: Toast = {
      id,
      message,
      title: options?.title,
      variant: options?.variant ?? 'info',
      duration: options?.duration ?? 5000,
    };
    setToasts((current) => [...current.slice(-2), toast]);
    later(toast.duration, () => {
      setToasts((current) => current.filter((entry) => entry.id !== id));
    });
  };

  const dimensions = useTerminalDimensions();
  const size = createMemo(() => `${dimensions().width}×${dimensions().height}`);

  /** Rows shown in the filter picker window. */
  const FILTER_ROWS = 8;

  /**
   * Open a menu overlay for an Interactive flow port. Resolves with the
   * picked option; clearing the dialog first so chained prompts (menu
   * after menu) never stack.
   * @param title - dialog heading
   * @param subtitle - context line, if any
   * @param options - menu choices
   * @returns picked option, or undefined on cancel
   */
  const askMenu = (
    title: string,
    subtitle: string | undefined,
    options: ReadonlyArray<string>,
  ): Promise<string | undefined> =>
    new Promise((resolve) => {
      setDialog({
        kind: 'menu',
        title,
        subtitle,
        options,
        highlight: 0,
        resolve: (picked) => {
          setDialog(undefined);
          resolve(picked);
        },
      });
    });

  /**
   * Open a text-input overlay for an Interactive flow port.
   * @param title - prompt line
   * @param ghost - ghost text when empty
   * @returns entered value, or undefined on cancel
   */
  const askInput = (title: string, ghost?: string): Promise<string | undefined> =>
    new Promise((resolve) => {
      // The editor node brackets the dialog lifetime exactly: cleared
      // here and on resolve, populated by the `InputDialog` ref while
      // mounted — submit never reads a stale node.
      setInputEditor(undefined);
      setDialog({
        kind: 'input',
        title,
        placeholder: ghost,
        value: '',
        resolve: (value) => {
          setDialog(undefined);
          setInputEditor(undefined);
          // The flow modal shows the submitted text back during the
          // agent run — stash it here so long dictated input stays
          // visible (and scrollable) after this dialog exits out.
          setLastInput(value === undefined || value === '' ? undefined : { title, value });
          resolve(value);
        },
      });
    });

  /**
   * Open a filter-as-you-type picker overlay (model picker, searchSelect).
   * @param title - dialog heading
   * @param all - full option list
   * @returns picked row, or undefined on cancel
   */
  const askFilter = (
    title: string,
    all: ReadonlyArray<string>,
    options?: { readonly highlight?: number | undefined; readonly current?: number | undefined },
  ): Promise<string | undefined> =>
    new Promise((resolve) => {
      setDialog({
        kind: 'filter',
        title,
        query: '',
        highlight: options?.highlight ?? 0,
        all,
        current: options?.current,
        resolve: (picked) => {
          setDialog(undefined);
          resolve(picked);
        },
      });
    });

  /**
   * Open a timed remove-confirm modal for the highlighted row. The
   * countdown runs as an Effect (`RemoveConfirm.countdown` over the
   * raw-timer second — Effect Clock fibers never resolve inside the
   * OpenTUI render loop): each tick steps the modal's `remaining`
   * signal down until confirm unlocks. Cancelling clears the dialog;
   * confirming leaves it open so the caller can flip `deleting` while
   * the delete Effect runs. Ticks after a cancel find no remove dialog
   * and no-op.
   * @param id - row id under delete (skill/profile directory name, prompt slug)
   * @param name - display name for the modal title
   * @param itemKind - skill, profile, or prompt, for the modal copy
   * @returns true on confirm, false on cancel
   */
  const askRemove = (
    id: string,
    name: string,
    itemKind: 'skill' | 'profile' | 'prompt',
  ): Promise<boolean> =>
    new Promise((resolve) => {
      setDialog({
        kind: 'remove',
        itemKind,
        id,
        name,
        remaining: RemoveConfirm.REMOVE_CONFIRM_DELAY_S,
        deleting: false,
        focus: 'cancel',
        resolve: (confirmed) => {
          if (!confirmed) setDialog(undefined);
          resolve(confirmed);
        },
      });
      void RemoveConfirm.countdown(RemoveConfirm.REMOVE_CONFIRM_DELAY_S, (ticked) => {
        const current = dialog();
        if (current?.kind === 'remove' && !current.deleting)
          setDialog({ ...current, remaining: ticked });
      }).pipe(Effect.runPromise);
    });

  /**
   * `InteractiveUi` over the TUI overlays: menus, inputs, and the
   * filter picker answer flow prompts; notifies land as toasts.
   */
  const uiAdapter: Interactive.InteractiveUi = {
    select: (title, options) => askMenu(title, undefined, options),
    confirm: (title, message) =>
      askMenu(title, message, ['Yes', 'No']).then((picked) => picked === 'Yes'),
    input: (title, ghost) => askInput(title, ghost),
    notify: (message) => {
      pushToast(message, { variant: 'info' });
    },
    searchSelect: (title, options) => askFilter(title, options),
  };

  /**
   * `ModelPickerFn` over the filter overlay: the catalogue rows pick a
   * `provider/model-id` label; esc cancels the flow. Only called with a
   * non-empty catalogue — empty catalogues skip the picker and run on
   * the session default.
   */
  const modelPickerFn: Interactive.ModelPickerFn = (models) => {
    // The session default opens highlighted — `⏎` keeps it with no
    // navigation, typing filters down to a new one, `tab` jumps back.
    const current = models.findIndex((option) => option.current);
    const rows = models.map(displayModelLabel);
    return askFilter(`Model picker · ${models.length} available`, rows, {
      highlight: current >= 0 ? current : 0,
      current: current >= 0 ? current : undefined,
    }).then((picked) =>
      picked === undefined
        ? undefined
        : models.find((option) => displayModelLabel(option) === picked)?.label,
    );
  };

  /**
   * `LoadingFn` over the working overlay: status line up while the
   * closed Effect runs, cleared on every exit path.
   */
  const loadingFn: Interactive.LoadingFn = (message, self) =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        setFlowSubmitScroll(undefined);
        setWorking(message);
      }),
      () => self,
      () =>
        Effect.sync(() => {
          setWorking(undefined);
          setFlowSubmitScroll(undefined);
        }),
    );

  /** Overlay ports for the service flow runners (dialogs plus picker and working overlay). */
  const flowPorts = (): Skills.FlowPorts => ({
    ui: uiAdapter,
    modelPicker: modelPickerFn,
    loading: loadingFn,
  });

  /**
   * Overlay ports for the profiles flow runners. The skills and profiles
   * `Interactive` surfaces are structurally identical (same dialogs,
   * picker, and loading shapes), so the shared adapters satisfy both
   * without conversion — no parsing or assertion involved.
   */
  const profileFlowPorts = (): Profiles.FlowPorts => ({
    ui: uiAdapter,
    modelPicker: modelPickerFn,
    loading: loadingFn,
  });

  /**
   * Overlay ports for the prompts flow runners. The skills, profiles,
   * and prompts `Interactive` surfaces are structurally identical (same
   * dialogs, picker, and loading shapes), so the shared adapters satisfy
   * all three without conversion — no parsing or assertion involved.
   */
  const promptFlowPorts = (): Prompts.FlowPorts => ({
    ui: uiAdapter,
    modelPicker: modelPickerFn,
    loading: loadingFn,
  });

  /**
   * TanStack mutation for one agent flow (create/modify/delete behind
   * the overlays): the user stays parked — arrows scroll, `esc`
   * cancels the agent fiber — until the flow settles; on completion any
   * stray dialog exits out, the `done` toast names the finished task,
   * and the list cache updates through the query client so the UI
   * follows without signals. The flow runs on a forked fiber tracked in
   * `flowFiber` so `esc` can interrupt it mid-run (the headless child
   * is killed); interruptions land as silent undefined, exactly like a
   * flow the user backed out of mid-prompt. Real failures toast.
   * Non-Error rejections (Effect string failures) normalize to Error so
   * `onError` reads `.message` directly.
   * @param options - flow runner plus the completion handler
   * @returns mutation with `mutate`/`isPending` for the runner guard
   */
  const flowMutation = <T, V, E>(options: {
    readonly run: (variables: V) => Effect.Effect<T | undefined, E>;
    readonly done: (result: T, variables: V) => void;
    readonly fail?: ((error: Error, variables: V) => void) | undefined;
  }) =>
    createMutation(() => ({
      mutationFn: (variables: V) =>
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(options.run(variables));
          yield* Effect.sync(() => {
            setFlowFiber(fiber);
          });
          return yield* Fiber.join(fiber);
        })
          .pipe(
            Effect.catchCause((cause) =>
              // SAFETY: interruption carries no value — landing as the same
              // silent undefined the prompt-backout path resolves is exact.
              Cause.hasInterruptsOnly(cause)
                ? Effect.succeed(undefined as T | undefined)
                : Effect.failCause(cause),
            ),
            Effect.ensuring(
              Effect.sync(() => {
                setFlowFiber(undefined);
              }),
            ),
            Effect.runPromise,
          )
          .catch((reason) => {
            throw reason instanceof Error ? reason : new Error(String(reason));
          }),
      onSuccess: (result, variables) => {
        setDialog(undefined);
        if (result === undefined) return;
        options.done(result, variables);
      },
      onError: (error, variables) => {
        setDialog(undefined);
        if (options.fail !== undefined) options.fail(error, variables);
        else pushToast(error.message, { variant: 'error' });
      },
    }));

  /**
   * Open the flow-error modal for a failed agent flow: the run title,
   * the error, and retry over the same variables (the full flow
   * re-runs, prompts included). Focus starts on retry.
   * @param title - run title (`Creating prompt failed`)
   * @param error - failure error
   * @param retry - thunk re-firing the mutation
   */
  const openFlowError = (title: string, error: Error, retry: () => void): void => {
    setFlowErrorFocus('retry');
    setFlowErrorScroll(undefined);
    setFlowError({ title, error: error.message, retry });
  };

  /**
   * Create flow: the service runner lazy-loads the extension, runs the
   * shared `createSkill` flow behind the overlays, and persists. Lands
   * on the new skill's detail; cancellations stay silent.
   */
  const createSkillMutation = flowMutation({
    run: () => Skills.runCreateFlow(root, flowPorts()),
    done: (skill) => {
      pushToast(`Saved skill '${skill.id}'.`, { variant: 'success' });
      setDetailId(skill.id);
      setDetailMode('preview');
      setDetailScroll(0);
      setDetailAction(0);
      refreshSkills();
    },
    fail: (error) => {
      openFlowError('Creating skill failed', error, () => {
        setFlowError(undefined);
        createSkillMutation.mutate(undefined);
      });
    },
  });

  const runCreateSkill = (): void => {
    if (
      !skillsInstalled() ||
      dialog() !== undefined ||
      working() !== undefined ||
      createSkillMutation.isPending
    )
      return;
    createSkillMutation.mutate(undefined);
  };

  /**
   * Modify flow for the open detail: the service runner lazy-loads the
   * extension, runs the shared `modifySkill` flow, and persists. The
   * detail stays open on the updated row; cancellations stay silent.
   */
  const modifySkillMutation = flowMutation({
    run: (id: string) => Skills.runModifyFlow(root, id, flowPorts()),
    done: (skill) => {
      pushToast(`Saved skill '${skill.id}'.`, { variant: 'success' });
      refreshSkills();
    },
    fail: (error, id) => {
      openFlowError('Modifying skill failed', error, () => {
        setFlowError(undefined);
        modifySkillMutation.mutate(id);
      });
    },
  });

  const runModifySkill = (): void => {
    const target = detail();
    if (
      target === undefined ||
      dialog() !== undefined ||
      working() !== undefined ||
      modifySkillMutation.isPending
    )
      return;
    modifySkillMutation.mutate(target.id);
  };

  /**
   * Remove flow for the highlighted skills-panel row: opens the timed
   * confirm modal, then deletes through the extension's `SkillStore`
   * port on confirm. Cancellations stay silent; the modal locks input
   * behind the `deleting` flag while the delete Effect runs. The cache
   * patch drops the row instantly so the UI follows with no refetch.
   */
  const removeSkillMutation = flowMutation({
    run: (target: Skills.SkillSummary) =>
      Effect.promise(() => askRemove(target.id, target.name, 'skill')).pipe(
        Effect.flatMap((confirmed) => {
          if (!confirmed) return Effect.succeed(false);
          return Effect.sync(() => {
            const current = dialog();
            if (current?.kind === 'remove') setDialog({ ...current, deleting: true });
          }).pipe(
            Effect.flatMap(() => Skills.storeFor(root).delete(target.id)),
            Effect.map(() => true),
          );
        }),
        Effect.mapError((error) => new Error(`Remove failed: ${error}`)),
      ),
    done: (didDelete, target) => {
      if (!didDelete) return;
      pushToast(`Removed skill '${target.id}'.`, { variant: 'success' });
      if (skillHighlight() >= filtered().length - 1 && skillHighlight() > 0)
        setSkillHighlight(skillHighlight() - 1);
      queryClient.setQueryData(Query.skillsKey, (previous: Query.SkillsList | undefined) =>
        previous === undefined
          ? previous
          : { ...previous, rows: previous.rows.filter((entry) => entry.id !== target.id) },
      );
    },
  });

  const runRemoveSkill = (): void => {
    const row = filtered()[skillHighlight()];
    if (
      row === undefined ||
      !skillsInstalled() ||
      dialog() !== undefined ||
      working() !== undefined ||
      removeSkillMutation.isPending
    )
      return;
    removeSkillMutation.mutate(row);
  };

  /**
   * Create flow: the service runner lazy-loads the profiles extension,
   * runs the shared `createProfile` flow behind the overlays, and
   * persists. Lands on the new profile's detail; cancellations stay silent.
   */
  const createProfileMutation = flowMutation({
    run: () => Profiles.runCreateFlow(root, profileFlowPorts()),
    done: (profile) => {
      pushToast(`Saved profile '${profile.id}'.`, { variant: 'success' });
      setProfileDetailId(profile.id);
      setProfileDetailMode('preview');
      setProfileDetailScroll(0);
      setProfileDetailAction(0);
      refreshProfiles();
    },
    fail: (error) => {
      openFlowError('Creating profile failed', error, () => {
        setFlowError(undefined);
        createProfileMutation.mutate(undefined);
      });
    },
  });

  const runCreateProfile = (): void => {
    if (
      !profilesInstalled() ||
      dialog() !== undefined ||
      working() !== undefined ||
      createProfileMutation.isPending
    )
      return;
    createProfileMutation.mutate(undefined);
  };

  /**
   * Modify flow for the open profile detail: the service runner
   * lazy-loads the extension, runs the shared `modifyProfile` flow, and
   * persists. The detail stays open on the updated row; cancellations
   * stay silent.
   */
  const modifyProfileMutation = flowMutation({
    run: (id: string) => Profiles.runModifyFlow(root, id, profileFlowPorts()),
    done: (profile) => {
      pushToast(`Saved profile '${profile.id}'.`, { variant: 'success' });
      refreshProfiles();
    },
    fail: (error, id) => {
      openFlowError('Modifying profile failed', error, () => {
        setFlowError(undefined);
        modifyProfileMutation.mutate(id);
      });
    },
  });

  const runModifyProfile = (): void => {
    const target = profileDetail();
    if (
      target === undefined ||
      dialog() !== undefined ||
      working() !== undefined ||
      modifyProfileMutation.isPending
    )
      return;
    modifyProfileMutation.mutate(target.id);
  };

  /**
   * Create flow: the service runner lazy-loads the prompts extension,
   * runs the shared `createPrompt` flow behind the overlays, and
   * persists. Lands on the new prompt's detail; cancellations stay silent.
   */
  const createPromptMutation = flowMutation({
    run: () => Prompts.runCreateFlow(root, promptFlowPorts()),
    done: (prompt) => {
      pushToast(`Saved prompt '${prompt.id}'.`, { variant: 'success' });
      setPromptDetailId(prompt.id);
      setPromptDetailMode('preview');
      setPromptDetailScroll(0);
      setPromptDetailAction(0);
      refreshPrompts();
    },
    fail: (error) => {
      openFlowError('Creating prompt failed', error, () => {
        setFlowError(undefined);
        createPromptMutation.mutate(undefined);
      });
    },
  });

  const runCreatePrompt = (): void => {
    if (
      !promptsInstalled() ||
      dialog() !== undefined ||
      working() !== undefined ||
      createPromptMutation.isPending
    )
      return;
    createPromptMutation.mutate(undefined);
  };

  /**
   * Modify flow for the open prompt detail: the service runner
   * lazy-loads the extension, runs the shared `modifyPrompt` flow, and
   * persists. The detail stays open on the updated row; cancellations
   * stay silent.
   */
  const modifyPromptMutation = flowMutation({
    run: (id: string) => Prompts.runModifyFlow(root, id, promptFlowPorts()),
    done: (prompt) => {
      pushToast(`Saved prompt '${prompt.id}'.`, { variant: 'success' });
      refreshPrompts();
    },
    fail: (error, id) => {
      openFlowError('Modifying prompt failed', error, () => {
        setFlowError(undefined);
        modifyPromptMutation.mutate(id);
      });
    },
  });

  const runModifyPrompt = (): void => {
    const target = promptDetail();
    if (
      target === undefined ||
      dialog() !== undefined ||
      working() !== undefined ||
      modifyPromptMutation.isPending
    )
      return;
    modifyPromptMutation.mutate(target.id);
  };

  /**
   * Remove flow for the highlighted prompts-panel row: opens the timed
   * confirm modal, then deletes the prompt file on confirm.
   * Cancellations stay silent; the modal locks input behind the
   * `deleting` flag while the delete Effect runs. The cache patch
   * drops the row instantly so the UI follows with no refetch.
   */
  const removePromptMutation = flowMutation({
    run: (target: Prompts.PromptSummary) =>
      Effect.promise(() => askRemove(target.id, target.name, 'prompt')).pipe(
        Effect.flatMap((confirmed) => {
          if (!confirmed) return Effect.succeed(false);
          return Effect.sync(() => {
            const current = dialog();
            if (current?.kind === 'remove') setDialog({ ...current, deleting: true });
          }).pipe(
            Effect.flatMap(() => Prompts.deletePrompt(root, target.id)),
            Effect.map(() => true),
          );
        }),
        Effect.mapError((error) => new Error(`Remove failed: ${error.message}`)),
      ),
    done: (didDelete, target) => {
      if (!didDelete) return;
      pushToast(`Removed prompt '${target.id}'.`, { variant: 'success' });
      if (promptHighlight() >= filteredPrompts().length - 1 && promptHighlight() > 0)
        setPromptHighlight(promptHighlight() - 1);
      queryClient.setQueryData(Query.promptsKey, (previous: Query.PromptsList | undefined) =>
        previous === undefined
          ? previous
          : { ...previous, rows: previous.rows.filter((entry) => entry.id !== target.id) },
      );
    },
  });

  const runRemovePrompt = (): void => {
    const row = filteredPrompts()[promptHighlight()];
    if (
      row === undefined ||
      !promptsInstalled() ||
      dialog() !== undefined ||
      working() !== undefined ||
      removePromptMutation.isPending
    )
      return;
    removePromptMutation.mutate(row);
  };

  /**
   * Store installs behind mutations so the installing flags and the
   * list refresh settle together: success toasts the completed
   * install and invalidates the list key; failures toast. The flags
   * clear in `onSettled` at the call site, mirroring the deletes.
   */
  const installSkillsMutation = flowMutation({
    run: () =>
      Skills.installSkills(root).pipe(
        Effect.mapError((error) => new Error(`Skill install failed: ${error.message}`)),
        Effect.as(true),
      ),
    done: () => {
      pushToast('Installed skills store.', { variant: 'success' });
      refreshSkills();
    },
  });

  const installProfilesMutation = flowMutation({
    run: () =>
      Profiles.installProfiles(root).pipe(
        Effect.mapError((error) => new Error(`Profile install failed: ${error.message}`)),
        Effect.as(true),
      ),
    done: () => {
      pushToast('Installed profiles store.', { variant: 'success' });
      refreshProfiles();
    },
  });

  const installPromptsMutation = flowMutation({
    run: () =>
      Prompts.installPrompts(root).pipe(
        Effect.mapError((error) => new Error(`Prompt install failed: ${error.message}`)),
        Effect.as(true),
      ),
    done: () => {
      pushToast('Installed prompts store.', { variant: 'success' });
      refreshPrompts();
    },
  });

  /**
   * Reload the open run detail from the store: transcript plus receipt.
   * Failures toast — the detail keeps its last snapshot.
   * @param id - run id under view
   */
  const loadRunDetail = (id: string): void => {
    setRunDetailLoading(true);
    void Runs.loadRun(root, id)
      .pipe(Effect.runPromise)
      .then(
        (data) => {
          // Stale loads (closed while another run opened) never paint.
          if (runDetailId() !== id) return;
          setRunDetailData(data);
          setRunDetailLoading(false);
        },
        (error) => {
          if (runDetailId() !== id) return;
          setRunDetailLoading(false);
          pushToast(
            `Run detail failed: ${error instanceof Error ? error.message : String(error)}`,
            {
              variant: 'error',
            },
          );
        },
      );
  };

  /**
   * Open a run's detail page: park the list state, reset the view, and
   * load the transcript. The agent keeps running behind the detail —
   * the list refresh on settle updates the row underneath.
   * @param id - run id to open
   */
  const openRunDetail = (id: string): void => {
    setRunDetailId(id);
    setRunDetailData(undefined);
    setRunDetailMode('preview');
    setRunDetailScroll(0);
    setRunDetailAction(0);
    setRunTyping(false);
    loadRunDetail(id);
  };

  const closeRunDetail = (): void => {
    setRunDetailId(undefined);
    setRunDetailData(undefined);
    setRunDetailLoading(false);
    setRunDetailMode('preview');
    setRunDetailScroll(0);
    setRunDetailAction(0);
  };

  /** Scroll window for the run full view: transcript lines. */
  const scrollRunDetail = (delta: number): void => {
    if (runDetailMode() !== 'view') return;
    setRunDetailScroll((offset) => Math.min(Math.max(offset + delta, 0), runDetailMaxScroll()));
  };

  /**
   * Action menu for the open run detail: toggle view/preview plus
   * interrupt (live runs), answer (parked runs), and back. The actions
   * mirror the `x`/`a`/`esc` keybinds so menu and keys never drift.
   * @param status - run status, if loaded
   * @returns menu actions in display order
   */
  const runDetailActionsFor = (status: string | undefined): ReadonlyArray<DetailAction> => {
    const actions: Array<DetailAction> = [
      {
        id: 'toggle-view',
        label: runDetailMode() === 'view' ? 'Show preview' : 'Show full view',
        hint: 'v',
      },
    ];
    if (status === 'running' || status === 'awaiting-input')
      actions.push({ id: 'interrupt', label: 'Interrupt run', hint: 'x' });
    if (status === 'awaiting-input')
      actions.push({ id: 'answer', label: 'Answer question', hint: 'a' });
    actions.push({ id: 'back', label: 'Back', hint: 'esc' });
    return actions;
  };

  /**
   * Detail status hint for the open run: view toggle plus the live
   * keys (`x` interrupt while running, `a` answer while parked).
   * @returns one-line hint copy
   */
  const runDetailHint = (): string => {
    const mode = runDetailMode();
    const status = runDetailData()?.summary.status;
    const entries = [
      Keybinds.menuNavigate(),
      Keybinds.selectRow(),
      ...(mode === 'view' ? [Keybinds.scroll(), Keybinds.showPreview()] : [Keybinds.showFull()]),
      ...(status === 'running' || status === 'awaiting-input'
        ? [{ key: 'x', action: 'interrupt' }]
        : []),
      ...(status === 'awaiting-input' ? [{ key: 'a', action: 'answer' }] : []),
      Keybinds.refresh(),
      Keybinds.back(),
    ];
    return formatKeybinds(entries);
  };

  /**
   * Interrupt the open run: when its agent fiber is in flight, esc
   * semantics apply (interrupt the fiber — the child dies — then write
   * the cancelled receipt); when the run is live but fiberless (a
   * stale live run after a restart), cancel the store directly.
   * Reloads the detail and the list either way.
   */
  const interruptRun = (): void => {
    const id = runDetailId();
    if (id === undefined || dialog() !== undefined) return;
    const fiber = pendingAgentRunId() === id ? flowFiber() : undefined;
    if (fiber !== undefined) {
      void Fiber.interrupt(fiber)
        .pipe(
          Effect.flatMap(() => Runs.cancelRun(root, id)),
          Effect.runPromise,
        )
        .then(
          () => {
            setPendingAgentRunId(undefined);
            pushToast('Agent run cancelled.', { variant: 'info' });
            refreshRuns();
            loadRunDetail(id);
          },
          () => {
            setPendingAgentRunId(undefined);
            refreshRuns();
            loadRunDetail(id);
          },
        );
      return;
    }
    void Runs.cancelRun(root, id)
      .pipe(Effect.runPromise)
      .then(
        () => {
          pushToast('Run cancelled.', { variant: 'success' });
          refreshRuns();
          loadRunDetail(id);
        },
        (error) => {
          pushToast(`Cancel failed: ${error instanceof Error ? error.message : String(error)}`, {
            variant: 'error',
          });
        },
      );
  };

  /**
   * Answer a parked run: prompt for the reply, append it through
   * `Store.answer` (parked back to running), then relaunch the agent
   * so it continues with the answer in context.
   */
  const answerRunMutation = flowMutation({
    run: (id: string) =>
      Effect.promise(() => askInput('Answer the agent', 'Type your answer…')).pipe(
        Effect.flatMap((text) => {
          if (text === undefined || text.trim() === '') return Effect.succeed(undefined);
          return Runs.answerRun(root, id, text.trim()).pipe(
            Effect.map(() => ({ id, resumed: true as const })),
          );
        }),
      ),
    done: (result) => {
      if (result === undefined) return;
      pushToast('Answer sent — resuming run.', { variant: 'success' });
      refreshRuns();
      loadRunDetail(result.id);
      const data = runDetailData();
      if (data !== undefined && runDetailId() === result.id)
        launchAgentMutation.mutate({
          id: result.id,
          prompt: `Continue run '${result.id}'. The user answered your question — read the latest transcript in ${data.summary.id} and continue.`,
          model: data.summary.model === '' ? undefined : data.summary.model,
        });
    },
  });

  const runAnswerFlow = (): void => {
    const id = runDetailId();
    const status = runDetailData()?.summary.status;
    if (
      id === undefined ||
      status !== 'awaiting-input' ||
      dialog() !== undefined ||
      working() !== undefined ||
      answerRunMutation.isPending
    )
      return;
    answerRunMutation.mutate(id);
  };

  /**
   * Agent execution for one run: the headless `pi -p` child runs on a
   * forked fiber (tracked in `flowFiber` so esc interrupts it) with
   * the working overlay up. Completion reloads the detail and the
   * list; interruptions land silent (the esc path owns the cancelled
   * receipt); agent failures toast — the store already settled the
   * run as failed, so no error modal (retry would re-run on a
   * terminal run).
   */
  const launchAgentMutation = flowMutation({
    run: (input: {
      readonly id: string;
      readonly prompt: string;
      readonly model: string | undefined;
    }) =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          setPendingAgentRunId(input.id);
          setWorking(`Running ${input.id}…`);
        }),
        () => Runs.runAgent(root, input.id, input.prompt, input.model),
        () =>
          Effect.sync(() => {
            setWorking(undefined);
          }),
      ),
    done: (reply, variables) => {
      setPendingAgentRunId(undefined);
      pushToast(
        reply.trim() === '' ? `Run '${variables.id}' done.` : `Run '${variables.id}' done.`,
        { variant: 'success' },
      );
      refreshRuns();
      if (runDetailId() === variables.id) loadRunDetail(variables.id);
    },
    fail: (error, variables) => {
      setPendingAgentRunId(undefined);
      pushToast(`Agent run failed: ${error.message}`, { variant: 'error' });
      refreshRuns();
      if (runDetailId() === variables.id) loadRunDetail(variables.id);
    },
  });

  /**
   * Create flow: name plus initial prompt through the input dialogs,
   * model through the filter picker (session default pinned, like the
   * skills flows), then `Store.create` + `start` + first append. Lands
   * on the new run's detail and launches its agent; cancellations
   * stay silent.
   */
  const createRunMutation = flowMutation({
    run: () =>
      Effect.gen(function* () {
        const name = yield* Effect.promise(() => askInput('Run name', 'Fix login flow'));
        if (name === undefined || name.trim() === '') return undefined;
        const prompt = yield* Effect.promise(() =>
          askInput('Initial prompt', 'What should the agent do?'),
        );
        if (prompt === undefined || prompt.trim() === '') return undefined;
        const refs = yield* Skills.listModelLabels();
        const fallback = yield* Skills.listDefaultModel();
        let model: string | undefined;
        if (refs.length > 0) {
          const options: Array<Interactive.ModelOption> = refs.map((ref) => ({
            label: `${ref.provider}/${ref.id}`,
            current:
              fallback !== undefined &&
              fallback.provider === ref.provider &&
              fallback.id === ref.id,
          }));
          const current = options.findIndex((option) => option.current);
          const rows = options.map(displayModelLabel);
          const picked = yield* Effect.promise(() =>
            askFilter(`Model picker · ${options.length} available`, rows, {
              highlight: current >= 0 ? current : 0,
              current: current >= 0 ? current : undefined,
            }),
          );
          if (picked === undefined) return undefined;
          model = options.find((option) => displayModelLabel(option) === picked)?.label;
        }
        const created = yield* Runs.createRun(root, {
          name: name.trim(),
          prompt: prompt.trim(),
          model,
        });
        return { created, prompt: prompt.trim(), model };
      }),
    done: (result) => {
      pushToast(`Created run '${result.created.id}'.`, { variant: 'success' });
      refreshRuns();
      openRunDetail(result.created.id);
      launchAgentMutation.mutate({
        id: result.created.id,
        prompt: result.prompt,
        model: result.model,
      });
    },
    fail: (error) => {
      openFlowError('Creating run failed', error, () => {
        setFlowError(undefined);
        createRunMutation.mutate(undefined);
      });
    },
  });

  const runCreateRun = (): void => {
    if (
      !runsStoreInstalled() ||
      dialog() !== undefined ||
      working() !== undefined ||
      createRunMutation.isPending
    )
      return;
    createRunMutation.mutate(undefined);
  };

  /**
   * Store install behind a mutation so the installing flag and the
   * list refresh settle together: success toasts and invalidates the
   * runs key; failures toast.
   */
  const installRunsMutation = flowMutation({
    run: () =>
      Runs.ensureRunsStore(root).pipe(
        Effect.mapError((message) => new Error(`Runs install failed: ${message}`)),
        Effect.as(true),
      ),
    done: () => {
      pushToast('Installed runs store.', { variant: 'success' });
      refreshRuns();
    },
  });

  /**
   * Route one key to the open dialog. Highlight and value edits replace
   * the state (Solid signals hold immutable snapshots); resolving
   * clears the dialog first — see `askMenu`.
   * @param state - open dialog snapshot
   * @param key - pressed key event
   */
  const handleDialogKey = (state: DialogState, key: KeyEvent): void => {
    if (state.kind === 'menu') {
      if (key.name === 'escape') state.resolve(undefined);
      else if (key.name === 'enter' || key.name === 'return')
        state.resolve(state.options[state.highlight]);
      else if (key.name === 'up' || key.sequence === 'k')
        setDialog({
          ...state,
          highlight: clampHighlight(state.highlight - 1, state.options.length),
        });
      else if (key.name === 'down' || key.sequence === 'j')
        setDialog({
          ...state,
          highlight: clampHighlight(state.highlight + 1, state.options.length),
        });
      return;
    }
    if (state.kind === 'remove') {
      if (state.deleting) return;
      if (key.name === 'escape' || key.sequence === 'n') state.resolve(false);
      else if (key.sequence === 'y' && RemoveConfirm.canConfirmRemove(state.remaining))
        state.resolve(true);
      else if (
        key.name === 'left' ||
        key.name === 'right' ||
        key.sequence === 'h' ||
        key.sequence === 'l'
      ) {
        if (RemoveConfirm.canConfirmRemove(state.remaining))
          setDialog({ ...state, focus: RemoveConfirm.toggleRemoveFocus(state.focus) });
      } else if (key.name === 'enter' || key.name === 'return') {
        if (state.focus === 'cancel') state.resolve(false);
        else if (RemoveConfirm.canConfirmRemove(state.remaining)) state.resolve(true);
      }
      return;
    }
    if (state.kind === 'input') {
      // The focused textarea edits natively (typing, backspace, arrows in
      // every direction with the viewport following the cursor) — the app
      // only claims submit and cancel, and must preventDefault both so the
      // editor never double-applies them. Everything else falls through to
      // the editor's own key bindings; the value mirror follows via onChange.
      if (key.name === 'escape') {
        key.preventDefault();
        state.resolve(undefined);
      } else if (key.name === 'enter' || key.name === 'return' || key.name === 'kpenter') {
        // Plain Enter submits; shift/cmd+Enter falls through to the editor's
        // newline binding so multiline input stays typeable.
        if (key.shift || key.meta || key.ctrl || key.super === true) return;
        key.preventDefault();
        state.resolve(inputEditor()?.plainText ?? state.value);
      }
      return;
    }
    const matches = narrowOptions(state.all, state.query);
    if (key.name === 'escape') state.resolve(undefined);
    else if (key.name === 'enter' || key.name === 'return') {
      const picked = matches[state.highlight];
      if (picked !== undefined) state.resolve(picked);
    } else if (
      (key.name === 'tab' || key.sequence === '\t') &&
      !key.ctrl &&
      !key.meta &&
      state.current !== undefined
    ) {
      // Pinned-row jump: clear the filter and park the highlight back
      // on the session default. Only the model picker pins a row —
      // `searchSelect` falls through to type the tab as before.
      key.preventDefault();
      setDialog({ ...state, query: '', highlight: state.current });
    } else if (key.name === 'up')
      setDialog({ ...state, highlight: clampHighlight(state.highlight - 1, matches.length) });
    else if (key.name === 'down')
      setDialog({ ...state, highlight: clampHighlight(state.highlight + 1, matches.length) });
    else if (key.name === 'backspace' || key.name === 'delete')
      setDialog({ ...state, query: state.query.slice(0, -1), highlight: 0 });
    else if (!key.ctrl && !key.meta) {
      const text = printableText(key.sequence);
      if (text !== '')
        setDialog({
          ...state,
          query: (state.query + text).slice(0, QUERY_MAX_CHARS),
          highlight: 0,
        });
    }
  };

  /** Panels with an independent filter, typing flag, and highlight: skills, profiles, prompts, and runs search separately. */
  type SearchPanel = 'skills' | 'profiles' | 'prompts' | 'runs';

  /**
   * Read the typing flag for one panel: true while keystrokes filter
   * that panel's list. Filters persist per panel after typing stops.
   * @param panel - skills, profiles, prompts, or runs
   * @returns typing flag
   */
  const typingOf = (panel: SearchPanel): boolean =>
    panel === 'profiles'
      ? profileTyping()
      : panel === 'prompts'
        ? promptTyping()
        : panel === 'runs'
          ? runTyping()
          : skillTyping();

  /**
   * Read the filter query for one panel.
   * @param panel - skills, profiles, prompts, or runs
   * @returns filter query
   */
  const queryOf = (panel: SearchPanel): string =>
    panel === 'profiles'
      ? profileQuery()
      : panel === 'prompts'
        ? promptQuery()
        : panel === 'runs'
          ? runQuery()
          : skillQuery();

  const filtered = createMemo(() => SkillFilter.filterByQuery(skillRows(), skillQuery()));
  const detail = createMemo(() => skillRows().find((row) => row.id === detailId()));
  const filteredProfiles = createMemo(() =>
    SkillFilter.filterByQuery(profileRows(), profileQuery()),
  );
  const profileDetail = createMemo(() => profileRows().find((row) => row.id === profileDetailId()));
  const filteredPrompts = createMemo(() => SkillFilter.filterByQuery(promptRows(), promptQuery()));
  const promptDetail = createMemo(() => promptRows().find((row) => row.id === promptDetailId()));
  const filteredRuns = createMemo(() => SkillFilter.filterByQuery(runRows(), runQuery()));

  /** Panel chrome lines: border top/bottom plus padding top/bottom. Owned by `Panel`, constant. */
  const CARD_CHROME_LINES = 4;

  /** Reserved lines inside the skills content: search line plus footer line. Owned by `SkillsPanel`, constant. */
  const SKILLS_RESERVED_LINES = 2;

  /** Reserved lines inside the profiles content: search line plus footer line. Owned by `ProfilesPanel`, constant. */
  const PROFILES_RESERVED_LINES = 2;

  /** Reserved lines inside the prompts content: search line plus footer line. Owned by `PromptsPanel`, constant. */
  const PROMPTS_RESERVED_LINES = 2;

  /** Reserved lines inside the runs content: search line plus footer line. Owned by `RunsPanel`, constant. */
  const RUNS_RESERVED_LINES = 2;

  /**
   * Read the live card height into a row budget: chrome plus the
   * reserved search/footer lines leave the rest for rows. Pre-layout
   * reads stay below a full card and are skipped — the estimate covers
   * the first frames.
   */
  const measureSkillsCard = (): void => {
    const node = skillsCard();
    if (node === undefined) return;
    const rows = Math.floor(node.height) - CARD_CHROME_LINES - SKILLS_RESERVED_LINES;
    if (rows >= 1) setMeasuredRows(rows);
  };

  /**
   * Card measurement triggers: ref attach (mount and detail close),
   * terminal resize, and the loading-to-list content swap. Never on
   * highlight, query, or row-window changes — the measured card size is
   * flex-determined and content-independent, so measuring cannot loop:
   * sizing content to the measurement never moves the card.
   */
  createEffect(() => {
    skillsCard();
    dimensions();
    skillsLoaded();
    queueMicrotask(measureSkillsCard);
  });

  /**
   * Read the live profiles card height into a row budget: same chrome
   * math as the skills card — the `ProfilesPanel` shares its shape so
   * the pinned region fills it exactly.
   */
  const measureProfilesCard = (): void => {
    const node = profilesCard();
    if (node === undefined) return;
    const rows = Math.floor(node.height) - CARD_CHROME_LINES - PROFILES_RESERVED_LINES;
    if (rows >= 1) setMeasuredProfileRows(rows);
  };

  /**
   * Profiles card measurement triggers: same contract as the skills
   * card — flex-determined size, content-independent, so measuring
   * cannot loop.
   */
  createEffect(() => {
    profilesCard();
    dimensions();
    profilesLoaded();
    queueMicrotask(measureProfilesCard);
  });

  /**
   * Read the live prompts card height into a row budget: same chrome
   * math as the skills card — the `PromptsPanel` shares its shape so
   * the pinned region fills it exactly.
   */
  const measurePromptsCard = (): void => {
    const node = promptsCard();
    if (node === undefined) return;
    const rows = Math.floor(node.height) - CARD_CHROME_LINES - PROMPTS_RESERVED_LINES;
    if (rows >= 1) setMeasuredPromptRows(rows);
  };

  /**
   * Prompts card measurement triggers: same contract as the skills
   * card — flex-determined size, content-independent, so measuring
   * cannot loop.
   */
  createEffect(() => {
    promptsCard();
    dimensions();
    promptsLoaded();
    queueMicrotask(measurePromptsCard);
  });

  /**
   * Read the live runs card height into a row budget: same chrome
   * math as the skills card — the `RunsPanel` shares its shape so
   * the pinned region fills it exactly.
   */
  const measureRunsCard = (): void => {
    const node = runsCard();
    if (node === undefined) return;
    const rows = Math.floor(node.height) - CARD_CHROME_LINES - RUNS_RESERVED_LINES;
    if (rows >= 1) setMeasuredRunRows(rows);
  };

  /**
   * Runs card measurement triggers: same contract as the skills
   * card — flex-determined size, content-independent, so measuring
   * cannot loop.
   */
  createEffect(() => {
    runsCard();
    dimensions();
    runsLoaded();
    queueMicrotask(measureRunsCard);
  });

  /**
   * Visible list window: measured from the live card so the pinned
   * region fills it exactly — no spill onto the border, no blank gap.
   * The terminal-height estimate only covers pre-measure frames (the
   * loader phase, where no rows render yet).
   */
  const visibleCount = createMemo(() => {
    const measured = measuredRows();
    if (measured !== undefined) return measured;
    const height = dimensions().height;
    return Math.max(2, Math.floor((2 * (height - 6)) / 5) - 6);
  });
  const windowStart = createMemo(() => {
    const count = visibleCount();
    const length = filtered().length;
    return Math.min(Math.max(skillHighlight() - count + 1, 0), Math.max(length - count, 0));
  });
  const visibleRows = createMemo(() =>
    filtered().slice(windowStart(), windowStart() + visibleCount()),
  );
  const relativeHighlight = createMemo(() => skillHighlight() - windowStart());
  /** Visible list window for the profiles panel: same measured-card contract as skills. */
  const profileVisibleCount = createMemo(() => {
    const measured = measuredProfileRows();
    if (measured !== undefined) return measured;
    const height = dimensions().height;
    return Math.max(2, Math.floor((2 * (height - 6)) / 5) - 6);
  });
  const profileWindowStart = createMemo(() => {
    const count = profileVisibleCount();
    const length = filteredProfiles().length;
    return Math.min(Math.max(profileHighlight() - count + 1, 0), Math.max(length - count, 0));
  });
  const profileVisibleRows = createMemo(() =>
    filteredProfiles().slice(profileWindowStart(), profileWindowStart() + profileVisibleCount()),
  );
  const profileRelativeHighlight = createMemo(() => profileHighlight() - profileWindowStart());
  /** Visible list window for the prompts panel: same measured-card contract as skills. */
  const promptVisibleCount = createMemo(() => {
    const measured = measuredPromptRows();
    if (measured !== undefined) return measured;
    const height = dimensions().height;
    return Math.max(2, Math.floor((2 * (height - 6)) / 5) - 6);
  });
  const promptWindowStart = createMemo(() => {
    const count = promptVisibleCount();
    const length = filteredPrompts().length;
    return Math.min(Math.max(promptHighlight() - count + 1, 0), Math.max(length - count, 0));
  });
  const promptVisibleRows = createMemo(() =>
    filteredPrompts().slice(promptWindowStart(), promptWindowStart() + promptVisibleCount()),
  );
  const promptRelativeHighlight = createMemo(() => promptHighlight() - promptWindowStart());
  /** Visible list window for the runs panel: same measured-card contract as skills. */
  const runVisibleCount = createMemo(() => {
    const measured = measuredRunRows();
    if (measured !== undefined) return measured;
    const height = dimensions().height;
    return Math.max(2, Math.floor((2 * (height - 6)) / 5) - 6);
  });
  const runWindowStart = createMemo(() => {
    const count = runVisibleCount();
    const length = filteredRuns().length;
    return Math.min(Math.max(runHighlight() - count + 1, 0), Math.max(length - count, 0));
  });
  const runVisibleRows = createMemo(() =>
    filteredRuns().slice(runWindowStart(), runWindowStart() + runVisibleCount()),
  );
  const runRelativeHighlight = createMemo(() => runHighlight() - runWindowStart());
  const maxBodyLines = createMemo(() => Math.max(5, dimensions().height - 13));

  /** Keybinds in canonical panel order for the status hint. */
  const orderedKeybinds = createMemo(() =>
    Dashboard.PANELS.flatMap((panel) => {
      const cell = cells().find((known) => known.panel === panel.id);
      return cell === undefined ? [] : [cell.keybind];
    }),
  );

  const selectedMissing = createMemo(() => {
    const current = selected();
    if (current === 'skills') return skillsLoaded() && !skillsInstalled();
    if (current === 'profiles') return profilesLoaded() && !profilesInstalled();
    if (current === 'prompts') return promptsLoaded() && !promptsInstalled();
    if (current === 'runs') return runsLoaded() && !runsStoreInstalled();
    return false;
  });

  const skillsInteractive = createMemo(
    () => selected() === 'skills' && skillsLoaded() && skillsInstalled() && filtered().length > 0,
  );

  const profilesInteractive = createMemo(
    () =>
      selected() === 'profiles' &&
      profilesLoaded() &&
      profilesInstalled() &&
      filteredProfiles().length > 0,
  );

  const promptsInteractive = createMemo(
    () =>
      selected() === 'prompts' &&
      promptsLoaded() &&
      promptsInstalled() &&
      filteredPrompts().length > 0,
  );

  const runsInteractive = createMemo(
    () =>
      selected() === 'runs' && runsLoaded() && runsStoreInstalled() && filteredRuns().length > 0,
  );

  /** Filter picker view: windowed rows plus a relative highlight. */
  const filterView = createMemo((): FilterView | undefined => {
    const state = dialog();
    if (state === undefined || state.kind !== 'filter') return undefined;
    const matches = narrowOptions(state.all, state.query);
    const start = Math.min(
      Math.max(state.highlight - FILTER_ROWS + 1, 0),
      Math.max(matches.length - FILTER_ROWS, 0),
    );
    return {
      title: state.title,
      query: state.query,
      rows: matches.slice(start, start + FILTER_ROWS),
      highlight: state.highlight - start,
      total: matches.length,
      hasCurrent: state.current !== undefined,
    };
  });

  const removeView = createMemo(() => {
    const state = dialog();
    return state !== undefined && state.kind === 'remove' ? state : undefined;
  });

  const menuView = createMemo(() => {
    const state = dialog();
    return state !== undefined && state.kind === 'menu' ? state : undefined;
  });

  const inputView = createMemo(() => {
    const state = dialog();
    return state !== undefined && state.kind === 'input' ? state : undefined;
  });

  const hint = createMemo(() => {
    const active = working();
    if (active !== undefined)
      return `${active} · ${formatKeybinds([Keybinds.cancel(), ...(flowCanScroll() ? [Keybinds.arrowScroll()] : [])])}`;
    const overlay = dialog();
    if (overlay !== undefined) {
      if (overlay.kind === 'menu')
        return formatKeybinds([Keybinds.menuSelect(), Keybinds.choose(), Keybinds.cancel()]);
      if (overlay.kind === 'input')
        return formatKeybinds([
          Keybinds.type(),
          Keybinds.submit(),
          Keybinds.moveArrows(),
          Keybinds.insertNewline(),
          Keybinds.cancel(),
        ]);
      if (overlay.kind === 'remove')
        return overlay.remaining > 0
          ? formatKeybinds([Keybinds.cancel()])
          : formatKeybinds([
              Keybinds.modalSelect(),
              Keybinds.choose(),
              Keybinds.confirmYes(),
              Keybinds.cancel(),
            ]);
      return formatKeybinds([
        Keybinds.typeToFilter(),
        ...(overlay.current !== undefined ? [Keybinds.jumpToCurrent()] : []),
        Keybinds.selectRow(),
        Keybinds.cancel(),
      ]);
    }
    if (flowError() !== undefined)
      return formatKeybinds([
        Keybinds.modalSelect(),
        Keybinds.choose(),
        ...(flowErrorCanScroll() ? [Keybinds.arrowScroll()] : []),
        Keybinds.back(),
      ]);
    if (detail() !== undefined) return detailHint(detailMode());
    if (profileDetail() !== undefined) return detailHint(profileDetailMode());
    if (promptDetail() !== undefined) return detailHint(promptDetailMode());
    if (runDetailId() !== undefined) return runDetailHint();
    if (
      (selected() === 'skills' && skillTyping()) ||
      (selected() === 'profiles' && profileTyping()) ||
      (selected() === 'prompts' && promptTyping()) ||
      (selected() === 'runs' && runTyping())
    )
      return formatKeybinds([
        Keybinds.typeToFilter(),
        Keybinds.open(),
        Keybinds.stopTyping(),
        Keybinds.clearFilter(),
      ]);
    if (installing() || profileInstalling() || promptInstalling() || runsInstalling())
      return formatKeybinds([{ key: 'installing…' }, Keybinds.quit()]);
    const base = formatKeybinds([
      { key: orderedKeybinds().join('/'), action: 'select' },
      Keybinds.quit(),
    ]);
    if (selectedMissing()) return `${base} · ${formatKeybinds([Keybinds.install()])}`;
    if (selected() === 'skills' && skillsLoaded() && skillsInstalled()) {
      if (skillsInteractive()) {
        const entries = [
          Keybinds.search(),
          Keybinds.open(),
          Keybinds.create(),
          Keybinds.removeFromList(),
          Keybinds.refresh(),
        ];
        if (skillQuery() !== '') entries.push(Keybinds.clearFilter());
        return `${base} · ${formatKeybinds(entries)}`;
      }
      return `${base} · ${formatKeybinds([Keybinds.create(), Keybinds.refresh()])}`;
    }
    if (selected() === 'profiles' && profilesLoaded() && profilesInstalled()) {
      if (profilesInteractive()) {
        const entries = [Keybinds.search(), Keybinds.open(), Keybinds.create(), Keybinds.refresh()];
        if (profileQuery() !== '') entries.push(Keybinds.clearFilter());
        return `${base} · ${formatKeybinds(entries)}`;
      }
      return `${base} · ${formatKeybinds([Keybinds.create(), Keybinds.refresh()])}`;
    }
    if (selected() === 'prompts' && promptsLoaded() && promptsInstalled()) {
      if (promptsInteractive()) {
        const entries = [
          Keybinds.search(),
          Keybinds.open(),
          Keybinds.create(),
          Keybinds.removeFromList(),
          Keybinds.refresh(),
        ];
        if (promptQuery() !== '') entries.push(Keybinds.clearFilter());
        return `${base} · ${formatKeybinds(entries)}`;
      }
      return `${base} · ${formatKeybinds([Keybinds.create(), Keybinds.refresh()])}`;
    }
    if (selected() === 'runs' && runsLoaded() && runsStoreInstalled()) {
      if (runsInteractive()) {
        const entries = [Keybinds.search(), Keybinds.open(), Keybinds.create(), Keybinds.refresh()];
        if (runQuery() !== '') entries.push(Keybinds.clearFilter());
        return `${base} · ${formatKeybinds(entries)}`;
      }
      return `${base} · ${formatKeybinds([Keybinds.create(), Keybinds.refresh()])}`;
    }
    return base;
  });

  const moveHighlight = (delta: number): void => {
    if (selected() === 'profiles')
      setProfileHighlight((index) => clampHighlight(index + delta, filteredProfiles().length));
    else if (selected() === 'prompts')
      setPromptHighlight((index) => clampHighlight(index + delta, filteredPrompts().length));
    else if (selected() === 'runs')
      setRunHighlight((index) => clampHighlight(index + delta, filteredRuns().length));
    else if (selected() === 'skills')
      setSkillHighlight((index) => clampHighlight(index + delta, filtered().length));
  };

  const openHighlighted = (): void => {
    if (selected() === 'profiles') {
      const row = filteredProfiles()[profileHighlight()];
      if (row !== undefined) {
        setProfileDetailId(row.id);
        setProfileDetailMode('preview');
        setProfileDetailScroll(0);
        setProfileDetailAction(0);
        setProfileTyping(false);
      }
      return;
    }
    if (selected() === 'prompts') {
      const row = filteredPrompts()[promptHighlight()];
      if (row !== undefined) {
        setPromptDetailId(row.id);
        setPromptDetailMode('preview');
        setPromptDetailScroll(0);
        setPromptDetailAction(0);
        setPromptTyping(false);
      }
      return;
    }
    if (selected() === 'runs') {
      const row = filteredRuns()[runHighlight()];
      if (row !== undefined) openRunDetail(row.id);
      return;
    }
    const row = filtered()[skillHighlight()];
    if (row !== undefined) {
      setDetailId(row.id);
      setDetailMode('preview');
      setDetailScroll(0);
      setDetailAction(0);
      setSkillTyping(false);
    }
  };

  const closeDetail = (): void => {
    setDetailId(undefined);
    setDetailMode('preview');
    setDetailScroll(0);
    setDetailAction(0);
  };

  const closeProfileDetail = (): void => {
    setProfileDetailId(undefined);
    setProfileDetailMode('preview');
    setProfileDetailScroll(0);
    setProfileDetailAction(0);
  };

  const closePromptDetail = (): void => {
    setPromptDetailId(undefined);
    setPromptDetailMode('preview');
    setPromptDetailScroll(0);
    setPromptDetailAction(0);
  };

  /**
   * Switch panels: typing stops everywhere, but each panel keeps its
   * own filter query and highlight so returning restores the list.
   * @param panel - panel id to select
   */
  const switchPanel = (panel: string): void => {
    setSelected(panel);
    setSkillTyping(false);
    setProfileTyping(false);
    setPromptTyping(false);
    setRunTyping(false);
  };

  /** Scroll window for the profile full view: instructions plus checklist lines. */
  const profileDetailLineCount = createMemo(() => {
    const profile = profileDetail();
    if (profile === undefined) return 0;
    const lines = profile.instructions.split('\n').length + profile.checklist.length;
    return lines;
  });
  const profileDetailMaxScroll = createMemo(() =>
    Math.max(profileDetailLineCount() - maxBodyLines(), 0),
  );
  const scrollProfileDetail = (delta: number): void => {
    if (profileDetailMode() !== 'view') return;
    setProfileDetailScroll((offset) =>
      Math.min(Math.max(offset + delta, 0), profileDetailMaxScroll()),
    );
  };

  /** Scroll window for the prompt full view: template lines. */
  const promptDetailLineCount = createMemo(() => promptDetail()?.template.split('\n').length ?? 0);
  const promptDetailMaxScroll = createMemo(() =>
    Math.max(promptDetailLineCount() - maxBodyLines(), 0),
  );
  const scrollPromptDetail = (delta: number): void => {
    if (promptDetailMode() !== 'view') return;
    setPromptDetailScroll((offset) =>
      Math.min(Math.max(offset + delta, 0), promptDetailMaxScroll()),
    );
  };

  /** Scroll window for the full view: line budget minus scroll offset. */
  const detailLineCount = createMemo(() => detail()?.body.split('\n').length ?? 0);
  const detailMaxScroll = createMemo(() => Math.max(detailLineCount() - maxBodyLines(), 0));
  const scrollDetail = (delta: number): void => {
    if (detailMode() !== 'view') return;
    setDetailScroll((offset) => Math.min(Math.max(offset + delta, 0), detailMaxScroll()));
  };

  /** Scroll window for the run full view: transcript event count. */
  const runDetailLineCount = createMemo(() => runDetailData()?.events.length ?? 0);
  const runDetailMaxScroll = createMemo(() => Math.max(runDetailLineCount() - maxBodyLines(), 0));

  /**
   * Delete the open skill: opens the timed remove-confirm modal, and on
   * confirm removes the store directory through the mutation — closing
   * the detail, toasting, and patching the row out of the list cache
   * together. The modal locks input while it is open, so double
   * presses cannot stack.
   */
  const deleteSkillMutation = flowMutation({
    run: (target: Skills.SkillSummary) =>
      Effect.promise(() => askRemove(target.id, target.name, 'skill')).pipe(
        Effect.flatMap((confirmed) => {
          if (!confirmed) return Effect.succeed(false);
          return Effect.sync(() => {
            const current = dialog();
            if (current?.kind === 'remove') setDialog({ ...current, deleting: true });
          }).pipe(
            Effect.flatMap(() => Skills.deleteSkill(root, target.id)),
            Effect.map(() => true),
          );
        }),
        Effect.mapError((error) => new Error(`Delete failed: ${error.message}`)),
      ),
    done: (didDelete, target) => {
      if (!didDelete) return;
      setDetailId(undefined);
      setDetailMode('preview');
      setDetailScroll(0);
      setDetailAction(0);
      pushToast(`Deleted skill '${target.id}'.`, { variant: 'success' });
      queryClient.setQueryData(Query.skillsKey, (previous: Query.SkillsList | undefined) =>
        previous === undefined
          ? previous
          : { ...previous, rows: previous.rows.filter((entry) => entry.id !== target.id) },
      );
    },
  });

  const confirmDetailDelete = (): void => {
    const target = detail();
    if (target === undefined || deleteSkillMutation.isPending) return;
    deleteSkillMutation.mutate(target);
  };

  /**
   * Delete the open profile: opens the timed remove-confirm modal, and
   * on confirm removes the store directory through the mutation —
   * closing the detail, toasting, and patching the row out of the list
   * cache together. The modal locks input while it is open, so double
   * presses cannot stack.
   */
  const deleteProfileMutation = flowMutation({
    run: (target: Profiles.ProfileSummary) =>
      Effect.promise(() => askRemove(target.id, target.name, 'profile')).pipe(
        Effect.flatMap((confirmed) => {
          if (!confirmed) return Effect.succeed(false);
          return Effect.sync(() => {
            const current = dialog();
            if (current?.kind === 'remove') setDialog({ ...current, deleting: true });
          }).pipe(
            Effect.flatMap(() => Profiles.deleteProfile(root, target.id)),
            Effect.map(() => true),
          );
        }),
        Effect.mapError((error) => new Error(`Delete failed: ${error.message}`)),
      ),
    done: (didDelete, target) => {
      if (!didDelete) return;
      setProfileDetailId(undefined);
      setProfileDetailMode('preview');
      setProfileDetailScroll(0);
      setProfileDetailAction(0);
      pushToast(`Deleted profile '${target.id}'.`, { variant: 'success' });
      queryClient.setQueryData(Query.profilesKey, (previous: Query.ProfilesList | undefined) =>
        previous === undefined
          ? previous
          : { ...previous, rows: previous.rows.filter((entry) => entry.id !== target.id) },
      );
    },
  });

  const confirmProfileDelete = (): void => {
    const target = profileDetail();
    if (target === undefined || deleteProfileMutation.isPending) return;
    deleteProfileMutation.mutate(target);
  };

  /**
   * Delete the open prompt: opens the timed remove-confirm modal, and
   * on confirm removes the prompt file through the mutation — closing
   * the detail, toasting, and patching the row out of the list cache
   * together. The modal locks input while it is open, so double
   * presses cannot stack.
   */
  const deletePromptMutation = flowMutation({
    run: (target: Prompts.PromptSummary) =>
      Effect.promise(() => askRemove(target.id, target.name, 'prompt')).pipe(
        Effect.flatMap((confirmed) => {
          if (!confirmed) return Effect.succeed(false);
          return Effect.sync(() => {
            const current = dialog();
            if (current?.kind === 'remove') setDialog({ ...current, deleting: true });
          }).pipe(
            Effect.flatMap(() => Prompts.deletePrompt(root, target.id)),
            Effect.map(() => true),
          );
        }),
        Effect.mapError((error) => new Error(`Delete failed: ${error.message}`)),
      ),
    done: (didDelete, target) => {
      if (!didDelete) return;
      setPromptDetailId(undefined);
      setPromptDetailMode('preview');
      setPromptDetailScroll(0);
      setPromptDetailAction(0);
      pushToast(`Deleted prompt '${target.id}'.`, { variant: 'success' });
      queryClient.setQueryData(Query.promptsKey, (previous: Query.PromptsList | undefined) =>
        previous === undefined
          ? previous
          : { ...previous, rows: previous.rows.filter((entry) => entry.id !== target.id) },
      );
    },
  });

  const confirmPromptDelete = (): void => {
    const target = promptDetail();
    if (target === undefined || deletePromptMutation.isPending) return;
    deletePromptMutation.mutate(target);
  };

  /**
   * Toggle preview/full-view for one detail kind and reset its scroll.
   * @param kind - skill, profile, or prompt detail
   */
  const toggleDetailView = (kind: 'skill' | 'profile' | 'prompt'): void => {
    if (kind === 'profile') {
      setProfileDetailMode((mode) => (mode === 'view' ? 'preview' : 'view'));
      setProfileDetailScroll(0);
    } else if (kind === 'prompt') {
      setPromptDetailMode((mode) => (mode === 'view' ? 'preview' : 'view'));
      setPromptDetailScroll(0);
    } else {
      setDetailMode((mode) => (mode === 'view' ? 'preview' : 'view'));
      setDetailScroll(0);
    }
  };

  /**
   * Activate one action-menu row for an open detail: Enter on the
   * highlighted action runs the same path as its keybind (`v`/`m`/
   * `d`/`esc`), so menu navigation and keybinds never drift.
   * @param kind - skill, profile, or prompt detail
   * @param action - menu action id
   */
  const activateDetailAction = (
    kind: 'skill' | 'profile' | 'prompt',
    action: DetailActionId,
  ): void => {
    if (action === 'toggle-view') toggleDetailView(kind);
    else if (action === 'modify') {
      if (kind === 'profile') runModifyProfile();
      else if (kind === 'prompt') runModifyPrompt();
      else runModifySkill();
    } else if (action === 'delete') {
      if (kind === 'profile') confirmProfileDelete();
      else if (kind === 'prompt') confirmPromptDelete();
      else confirmDetailDelete();
    } else if (kind === 'profile') closeProfileDetail();
    else if (kind === 'prompt') closePromptDetail();
    else closeDetail();
  };

  /**
   * Move the action-menu highlight for one open detail, clamped to
   * the shared four-row menu.
   * @param kind - skill, profile, or prompt detail
   * @param delta - row step
   */
  const moveDetailAction = (kind: 'skill' | 'profile' | 'prompt', delta: number): void => {
    const count = detailActionsFor('preview').length;
    if (kind === 'profile') setProfileDetailAction((index) => clampHighlight(index + delta, count));
    else if (kind === 'prompt')
      setPromptDetailAction((index) => clampHighlight(index + delta, count));
    else setDetailAction((index) => clampHighlight(index + delta, count));
  };

  /**
   * Insert pasted/dictated text into whatever text sink is active:
   * the input dialog, the filter picker, or the selected panel's
   * search query. Bracketed paste arrives here (not as keypresses),
   * which is why Handy dictation typed nothing before — every sink
   * only listened to `useKeyboard`. The input editor inserts pastes
   * itself (multiline-aware); this sink only covers the pre-focus
   * mount race.
   * @param text - pasted text
   */
  const insertPastedText = (text: string): void => {
    if (working() !== undefined) return;
    const overlay = dialog();
    if (overlay?.kind === 'input') {
      const editor = inputEditor();
      if (editor !== undefined && !editor.isDestroyed) return;
      const cleaned = pastedInputText(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
      if (cleaned === '') return;
      setDialog({
        ...overlay,
        value: overlay.value + cleaned,
      });
      return;
    }
    const cleaned = printableText(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
    if (cleaned === '') return;
    if (overlay?.kind === 'filter') {
      setDialog({
        ...overlay,
        query: (overlay.query + cleaned).slice(0, QUERY_MAX_CHARS),
        highlight: 0,
      });
      return;
    }
    if (overlay !== undefined) return;
    if (detail() !== undefined || profileDetail() !== undefined || promptDetail() !== undefined)
      return;
    if (selected() === 'profiles' && profileTyping()) {
      setProfileQuery((value) => (value + cleaned).slice(0, QUERY_MAX_CHARS));
      setProfileHighlight(0);
    } else if (selected() === 'prompts' && promptTyping()) {
      setPromptQuery((value) => (value + cleaned).slice(0, QUERY_MAX_CHARS));
      setPromptHighlight(0);
    } else if (selected() === 'skills' && skillTyping()) {
      setSkillQuery((value) => (value + cleaned).slice(0, QUERY_MAX_CHARS));
      setSkillHighlight(0);
    }
  };

  useKeyboard((key) => {
    try {
      handleKey(key);
    } catch (error) {
      pushToast(`Key handler failed: ${error instanceof Error ? error.message : String(error)}`, {
        variant: 'error',
      });
    }
  });

  usePaste((event) => {
    try {
      insertPastedText(decodePaste(event));
    } catch (error) {
      pushToast(`Paste failed: ${error instanceof Error ? error.message : String(error)}`, {
        variant: 'error',
      });
    }
  });

  /**
   * Keyboard dispatch: signals only, never throws past the `useKeyboard`
   * wrapper — unexpected defects surface as toasts, never as a panic.
   * @param key - pressed key event
   */
  const handleKey = (key: KeyEvent): void => {
    // Agent run in flight: arrows scroll overflowed input, `esc`
    // interrupts the agent fiber (the headless child is killed) and the
    // flow settles as a silent cancel. Every other key (including quit)
    // stays locked out.
    if (working() !== undefined) {
      if (key.name === 'escape') {
        const fiber = flowFiber();
        if (fiber !== undefined) {
          key.preventDefault();
          // Agent fibers settle silent on interrupt (the flow sees a
          // cancel, not a failure) — the pending run id owns the
          // cancelled receipt, written here once the child is dead.
          const interruptedRunId = pendingAgentRunId();
          void Fiber.interrupt(fiber)
            .pipe(Effect.runPromise)
            .then(() => {
              if (interruptedRunId === undefined) {
                pushToast('Agent run cancelled.', { variant: 'info' });
                return;
              }
              setPendingAgentRunId(undefined);
              void Runs.cancelRun(root, interruptedRunId)
                .pipe(Effect.runPromise)
                .then(
                  () => {
                    pushToast('Agent run cancelled.', { variant: 'info' });
                    refreshRuns();
                    if (runDetailId() === interruptedRunId) loadRunDetail(interruptedRunId);
                  },
                  () => {
                    refreshRuns();
                    if (runDetailId() === interruptedRunId) loadRunDetail(interruptedRunId);
                  },
                );
            });
        }
        return;
      }
      if (key.name === 'up' || key.name === 'down')
        flowSubmitScroll()?.scrollBy({ x: 0, y: key.name === 'up' ? -1 : 1 });
      return;
    }
    const overlay = dialog();
    if (overlay !== undefined) {
      handleDialogKey(overlay, key);
      return;
    }
    // Failed agent flow: only the error modal answers — arrows move
    // between Retry and Back, enter chooses, escape backs out. Every
    // other key (including `q`) stays locked out until it resolves.
    const failure = flowError();
    if (failure !== undefined) {
      if (key.name === 'up' || key.name === 'down')
        flowErrorScroll()?.scrollBy({ x: 0, y: key.name === 'up' ? -1 : 1 });
      else if (
        key.name === 'left' ||
        key.name === 'right' ||
        key.sequence === 'h' ||
        key.sequence === 'l'
      )
        setFlowErrorFocus((focus) => (focus === 'retry' ? 'back' : 'retry'));
      else if (key.name === 'enter' || key.name === 'return') {
        if (flowErrorFocus() === 'retry') failure.retry();
        else setFlowError(undefined);
      } else if (key.name === 'escape') setFlowError(undefined);
      return;
    }
    if (runDetailId() !== undefined) {
      const actions = runDetailActionsFor(runDetailData()?.summary.status);
      if (key.name === 'escape') closeRunDetail();
      else if (key.name === 'q') renderer.destroy();
      else if (key.sequence === 'v') {
        setRunDetailMode((mode) => (mode === 'view' ? 'preview' : 'view'));
        setRunDetailScroll(0);
      } else if (key.sequence === 'R') {
        const id = runDetailId();
        refreshRuns();
        if (id !== undefined) loadRunDetail(id);
      } else if (key.sequence === 'x') interruptRun();
      else if (key.sequence === 'a') runAnswerFlow();
      else if (key.name === 'enter' || key.name === 'return') {
        const action = actions[runDetailAction()];
        if (action?.id === 'toggle-view') {
          setRunDetailMode((mode) => (mode === 'view' ? 'preview' : 'view'));
          setRunDetailScroll(0);
        } else if (action?.id === 'interrupt') interruptRun();
        else if (action?.id === 'answer') runAnswerFlow();
        else closeRunDetail();
      } else if (key.name === 'up' || key.name === 'down')
        setRunDetailAction((index) =>
          clampHighlight(index + (key.name === 'up' ? -1 : 1), actions.length),
        );
      else if (key.sequence === 'j' || key.sequence === 'k') {
        if (runDetailMode() === 'view') scrollRunDetail(key.sequence === 'j' ? 1 : -1);
        else
          setRunDetailAction((index) =>
            clampHighlight(index + (key.sequence === 'j' ? 1 : -1), actions.length),
          );
      }
      return;
    }
    if (detail() !== undefined) {
      const actions = detailActionsFor(detailMode());
      if (key.name === 'escape') closeDetail();
      else if (key.name === 'q') renderer.destroy();
      else if (key.sequence === 'v') toggleDetailView('skill');
      else if (key.sequence === 'p') {
        setDetailMode('preview');
        setDetailScroll(0);
      } else if (key.sequence === 'd' || key.name === 'delete') confirmDetailDelete();
      else if (key.sequence === 'R') refreshSkills();
      else if (key.sequence === 'm' || key.sequence === 'e') {
        runModifySkill();
      } else if (key.name === 'enter' || key.name === 'return') {
        const action = actions[detailAction()];
        if (action !== undefined) activateDetailAction('skill', action.id);
      } else if (key.name === 'up' || key.name === 'down') {
        moveDetailAction('skill', key.name === 'up' ? -1 : 1);
      } else if (key.sequence === 'j' || key.sequence === 'k') {
        if (detailMode() === 'view') scrollDetail(key.sequence === 'j' ? 1 : -1);
        else moveDetailAction('skill', key.sequence === 'j' ? 1 : -1);
      }
      return;
    }
    if (profileDetail() !== undefined) {
      if (key.name === 'escape') closeProfileDetail();
      else if (key.name === 'q') renderer.destroy();
      else if (key.sequence === 'v') toggleDetailView('profile');
      else if (key.sequence === 'p') {
        setProfileDetailMode('preview');
        setProfileDetailScroll(0);
      } else if (key.sequence === 'd' || key.name === 'delete') confirmProfileDelete();
      else if (key.sequence === 'R') refreshProfiles();
      else if (key.sequence === 'm' || key.sequence === 'e') {
        runModifyProfile();
      } else if (key.name === 'enter' || key.name === 'return') {
        const action = detailActionsFor(profileDetailMode())[profileDetailAction()];
        if (action !== undefined) activateDetailAction('profile', action.id);
      } else if (key.name === 'up' || key.name === 'down') {
        moveDetailAction('profile', key.name === 'up' ? -1 : 1);
      } else if (key.sequence === 'j' || key.sequence === 'k') {
        if (profileDetailMode() === 'view') scrollProfileDetail(key.sequence === 'j' ? 1 : -1);
        else moveDetailAction('profile', key.sequence === 'j' ? 1 : -1);
      }
      return;
    }
    if (promptDetail() !== undefined) {
      if (key.name === 'escape') closePromptDetail();
      else if (key.name === 'q') renderer.destroy();
      else if (key.sequence === 'v') toggleDetailView('prompt');
      else if (key.sequence === 'p') {
        setPromptDetailMode('preview');
        setPromptDetailScroll(0);
      } else if (key.sequence === 'd' || key.name === 'delete') confirmPromptDelete();
      else if (key.sequence === 'R') refreshPrompts();
      else if (key.sequence === 'm' || key.sequence === 'e') {
        runModifyPrompt();
      } else if (key.name === 'enter' || key.name === 'return') {
        const action = detailActionsFor(promptDetailMode())[promptDetailAction()];
        if (action !== undefined) activateDetailAction('prompt', action.id);
      } else if (key.name === 'up' || key.name === 'down') {
        moveDetailAction('prompt', key.name === 'up' ? -1 : 1);
      } else if (key.sequence === 'j' || key.sequence === 'k') {
        if (promptDetailMode() === 'view') scrollPromptDetail(key.sequence === 'j' ? 1 : -1);
        else moveDetailAction('prompt', key.sequence === 'j' ? 1 : -1);
      }
      return;
    }

    // Typing mode for the selected panel: every printable keystroke
    // filters that panel's list only — even `j`, `k`, and the rest of
    // the keybind letters, so any query is typeable. Arrows still move;
    // `⏎` opens; `/` stops typing but keeps the filter (every keybind
    // then works on the filtered rows, `/` resumes typing); `esc`
    // always clears the filter entirely.
    const selectedPanel = selected();
    const typingPanel: SearchPanel | undefined =
      selectedPanel === 'skills' ||
      selectedPanel === 'profiles' ||
      selectedPanel === 'prompts' ||
      selectedPanel === 'runs'
        ? selectedPanel
        : undefined;
    if (typingPanel !== undefined && typingOf(typingPanel)) {
      const applyQuery = (update: (value: string) => string): void => {
        if (typingPanel === 'profiles') {
          setProfileQuery(update);
          setProfileHighlight(0);
        } else if (typingPanel === 'prompts') {
          setPromptQuery(update);
          setPromptHighlight(0);
        } else if (typingPanel === 'runs') {
          setRunQuery(update);
          setRunHighlight(0);
        } else {
          setSkillQuery(update);
          setSkillHighlight(0);
        }
      };
      const exitTyping = (clear: boolean): void => {
        if (typingPanel === 'profiles') {
          setProfileTyping(false);
          if (clear) {
            setProfileQuery('');
            setProfileHighlight(0);
          }
        } else if (typingPanel === 'prompts') {
          setPromptTyping(false);
          if (clear) {
            setPromptQuery('');
            setPromptHighlight(0);
          }
        } else if (typingPanel === 'runs') {
          setRunTyping(false);
          if (clear) {
            setRunQuery('');
            setRunHighlight(0);
          }
        } else {
          setSkillTyping(false);
          if (clear) {
            setSkillQuery('');
            setSkillHighlight(0);
          }
        }
      };
      if (key.name === 'escape') exitTyping(true);
      else if (key.name === 'enter' || key.name === 'return') openHighlighted();
      else if (key.sequence === '/' && !key.ctrl && !key.meta) exitTyping(false);
      else if (key.name === 'up') moveHighlight(-1);
      else if (key.name === 'down') moveHighlight(1);
      else if (key.name === 'backspace' || key.name === 'delete')
        applyQuery((value) => value.slice(0, -1));
      else if (!key.ctrl && !key.meta) {
        const text = printableText(key.sequence);
        if (text !== '') applyQuery((value) => (value + text).slice(0, QUERY_MAX_CHARS));
      }
      return;
    }

    if (key.name === 'q') {
      renderer.destroy();
      return;
    }
    // A leftover filter captures `esc` to clear instead of quitting —
    // quitting stays on `q` while any panel filter is applied.
    if (key.name === 'escape') {
      if (selected() === 'profiles' && queryOf('profiles') !== '') {
        setProfileQuery('');
        setProfileHighlight(0);
        return;
      }
      if (selected() === 'prompts' && queryOf('prompts') !== '') {
        setPromptQuery('');
        setPromptHighlight(0);
        return;
      }
      if (selected() === 'skills' && queryOf('skills') !== '') {
        setSkillQuery('');
        setSkillHighlight(0);
        return;
      }
      if (selected() === 'runs' && queryOf('runs') !== '') {
        setRunQuery('');
        setRunHighlight(0);
        return;
      }
      renderer.destroy();
      return;
    }
    if (
      (key.name === 'enter' || key.name === 'return') &&
      selectedMissing() &&
      !installing() &&
      !profileInstalling() &&
      !promptInstalling() &&
      !runsInstalling()
    ) {
      // SAFETY: selectedMissing is true only for skills/profiles/prompts/runs, all ExtensionPanels.
      const current = selected() as Skills.ExtensionPanel;
      if (current === 'profiles') {
        setProfileInstalling(true);
        installProfilesMutation.mutate(undefined, {
          onSettled: () => {
            setProfileInstalling(false);
          },
        });
        return;
      }
      if (current === 'prompts') {
        setPromptInstalling(true);
        installPromptsMutation.mutate(undefined, {
          onSettled: () => {
            setPromptInstalling(false);
          },
        });
        return;
      }
      if (current === 'skills') {
        setInstalling(true);
        installSkillsMutation.mutate(undefined, {
          onSettled: () => {
            setInstalling(false);
          },
        });
      } else if (current === 'runs') {
        setRunsInstalling(true);
        installRunsMutation.mutate(undefined, {
          onSettled: () => {
            setRunsInstalling(false);
          },
        });
      } else {
        pushToast(`Install ${current}: ${Skills.installHint(current)} (stub)`, {
          variant: 'warning',
        });
      }
      return;
    }
    if (selected() === 'skills' && skillsLoaded() && skillsInstalled()) {
      if (key.sequence === 'c') {
        runCreateSkill();
        return;
      }
    }
    if (selected() === 'profiles' && profilesLoaded() && profilesInstalled()) {
      if (key.sequence === 'c') {
        runCreateProfile();
        return;
      }
    }
    if (selected() === 'prompts' && promptsLoaded() && promptsInstalled()) {
      if (key.sequence === 'c') {
        runCreatePrompt();
        return;
      }
    }
    if (selected() === 'runs' && runsLoaded() && runsStoreInstalled()) {
      if (key.sequence === 'c') {
        runCreateRun();
        return;
      }
    }
    // Manual refetch for externally changed stores: stale-while-
    // revalidate keeps the old rows on screen, failures toast through
    // the query error effects. `R` (shift) never collides with the
    // lowercase panel-select keybinds (`r` opens runs).
    if (key.sequence === 'R') {
      if (selected() === 'skills' && skillsLoaded() && skillsInstalled()) {
        refreshSkills();
        return;
      }
      if (selected() === 'profiles' && profilesLoaded() && profilesInstalled()) {
        refreshProfiles();
        return;
      }
      if (selected() === 'prompts' && promptsLoaded() && promptsInstalled()) {
        refreshPrompts();
        return;
      }
      if (selected() === 'runs' && runsLoaded() && runsStoreInstalled()) {
        refreshRuns();
        return;
      }
    }
    if (selected() === 'profiles' && profilesInteractive()) {
      if (key.sequence === '/') {
        setProfileTyping(true);
        return;
      }
      if (key.name === 'enter' || key.name === 'return') {
        openHighlighted();
        return;
      }
      if (key.name === 'up' || key.name === 'k') {
        moveHighlight(-1);
        return;
      }
      if (key.name === 'down' || key.name === 'j') {
        moveHighlight(1);
        return;
      }
    }
    if (selected() === 'prompts' && promptsInteractive()) {
      if (key.sequence === 'x' || key.name === 'delete') {
        runRemovePrompt();
        return;
      }
      if (key.sequence === '/') {
        setPromptTyping(true);
        return;
      }
      if (key.name === 'enter' || key.name === 'return') {
        openHighlighted();
        return;
      }
      if (key.name === 'up' || key.name === 'k') {
        moveHighlight(-1);
        return;
      }
      if (key.name === 'down' || key.name === 'j') {
        moveHighlight(1);
        return;
      }
    }
    if (selected() === 'runs' && runsInteractive()) {
      if (key.sequence === '/') {
        setRunTyping(true);
        return;
      }
      if (key.name === 'enter' || key.name === 'return') {
        openHighlighted();
        return;
      }
      if (key.name === 'up' || key.name === 'k') {
        moveHighlight(-1);
        return;
      }
      if (key.name === 'down' || key.name === 'j') {
        moveHighlight(1);
        return;
      }
    }
    if (selected() === 'skills' && skillsInteractive()) {
      if (key.sequence === 'x' || key.name === 'delete') {
        runRemoveSkill();
        return;
      }
      if (key.sequence === '/') {
        setSkillTyping(true);
        return;
      }
      if (key.name === 'enter' || key.name === 'return') {
        openHighlighted();
        return;
      }
      if (key.name === 'up' || key.name === 'k') {
        moveHighlight(-1);
        return;
      }
      if (key.name === 'down' || key.name === 'j') {
        moveHighlight(1);
        return;
      }
    }
    const panel = Dashboard.selectByKeybind(layout, key.name);
    if (panel !== undefined) switchPanel(panel);
  };

  /**
   * Schedule a skills-list refetch behind the `skills` query key:
   * stale-while-revalidate keeps the old rows on screen, so unlike
   * the old signal reset this never flashes the panel Loader. Used
   * after install/create/modify plus the boot prefetch; deletes patch
   * the cache directly instead (exact filter, no reread).
   */
  const refreshSkills = (): void => {
    void queryClient.invalidateQueries({ queryKey: Query.skillsKey });
  };

  /**
   * Toast one skills-list failure per query error: the effect tracks
   * `skillsQuery.error`, so it fires once when a fetch rejects, never
   * on rerender. Reads nothing else, writes only toasts — cannot loop.
   */
  createEffect(() => {
    const failure = skillsQuery.error;
    if (failure instanceof Error)
      pushToast(`Skills list failed: ${failure.message}`, { variant: 'error' });
  });

  /**
   * Schedule a profiles-list refetch behind the `profiles` query key:
   * same stale-while-revalidate contract as `refreshSkills` — the old
   * rows stay on screen, so create/modify/install never flash the
   * panel Loader. Deletes patch the cache directly instead.
   */
  const refreshProfiles = (): void => {
    void queryClient.invalidateQueries({ queryKey: Query.profilesKey });
  };

  /**
   * Toast one profiles-list failure per query error: mirrors the
   * skills error effect — fires once when a fetch rejects, never on
   * rerender. Reads nothing else, writes only toasts — cannot loop.
   */
  createEffect(() => {
    const failure = profilesQuery.error;
    if (failure instanceof Error)
      pushToast(`Profiles list failed: ${failure.message}`, { variant: 'error' });
  });

  /**
   * Schedule a prompts-list refetch behind the `prompts` query key:
   * same stale-while-revalidate contract as `refreshSkills` — the old
   * rows stay on screen, so create/modify/install never flash the
   * panel Loader. Deletes patch the cache directly instead.
   */
  const refreshPrompts = (): void => {
    void queryClient.invalidateQueries({ queryKey: Query.promptsKey });
  };

  /**
   * Toast one prompts-list failure per query error: mirrors the
   * skills error effect — fires once when a fetch rejects, never on
   * rerender. Reads nothing else, writes only toasts — cannot loop.
   */
  createEffect(() => {
    const failure = promptsQuery.error;
    if (failure instanceof Error)
      pushToast(`Prompts list failed: ${failure.message}`, { variant: 'error' });
  });

  /**
   * Schedule a runs-list refetch behind the `runs` query key: same
   * stale-while-revalidate contract as `refreshSkills` — the old rows
   * stay on screen, so create/settle/install never flash the panel
   * Loader.
   */
  const refreshRuns = (): void => {
    void queryClient.invalidateQueries({ queryKey: Query.runsKey });
  };

  /**
   * Toast one runs-list failure per query error: mirrors the skills
   * error effect — fires once when a fetch rejects, never on rerender.
   * Reads nothing else, writes only toasts — cannot loop.
   */
  createEffect(() => {
    const failure = runsQuery.error;
    if (failure instanceof Error)
      pushToast(`Runs list failed: ${failure.message}`, { variant: 'error' });
  });

  onMount(() => {
    GitInfo.getInfo(root)
      .pipe(Effect.runPromise)
      .then((next) => {
        setInfo(next);
        setLoaded(true);
      })
      .catch((defect) => {
        setLoaded(true);
        pushToast(`Git info failed: ${defectMessage(defect)}`, { variant: 'error' });
      });
  });

  return (
    <box flexGrow={1} flexDirection="column" backgroundColor={palette.bg}>
      <box backgroundColor={palette.highlight} paddingLeft={1} paddingRight={1} flexShrink={0}>
        <text style={{ fg: palette.text }}>{Workspace.title(info())}</text>
      </box>
      <Show
        when={
          detail() === undefined &&
          profileDetail() === undefined &&
          promptDetail() === undefined &&
          runDetailId() === undefined
        }
        fallback={
          <Show
            when={runDetailId() === undefined}
            fallback={
              <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} padding={1}>
                <box flexDirection="column" width={30} flexShrink={0} minHeight={0}>
                  <Panel title="Run — Actions" selected={false}>
                    <DetailActions
                      actions={runDetailActionsFor(runDetailData()?.summary.status)}
                      highlight={runDetailAction()}
                    />
                    <box flexShrink={0}>
                      <text style={{ fg: palette.dim }}>↑↓ navigate · ⏎ select</text>
                    </box>
                  </Panel>
                </box>
                <box flexDirection="column" flexGrow={1} flexBasis={0} minHeight={0}>
                  <Panel
                    title={`Run — ${runDetailData()?.summary.name ?? ''} · ${runDetailMode() === 'view' ? 'view' : 'preview'}`}
                    selected={false}
                  >
                    <Show
                      when={runDetailData()}
                      fallback={
                        <PanelMessage message={runDetailLoading() ? 'Loading run…' : 'No run.'} />
                      }
                    >
                      {(run: () => Runs.RunDetail) => (
                        <RunDetail
                          detail={run()}
                          mode={runDetailMode()}
                          scrollOffset={runDetailScroll()}
                          maxBodyLines={maxBodyLines()}
                        />
                      )}
                    </Show>
                  </Panel>
                </box>
              </box>
            }
          >
            <Show
              when={detail() === undefined}
              fallback={
                <box flexDirection="row" flexGrow={1} minHeight={0} gap={1}>
                  <box flexDirection="column" width={30} flexShrink={0} minHeight={0}>
                    <Panel title="Skill — Actions" selected={false}>
                      <DetailActions
                        actions={detailActionsFor(detailMode())}
                        highlight={detailAction()}
                      />
                      <box flexShrink={0}>
                        <text style={{ fg: palette.dim }}>↑↓ navigate · ⏎ select</text>
                      </box>
                    </Panel>
                  </box>
                  <box flexDirection="column" flexGrow={1} flexBasis={0} minHeight={0}>
                    <Panel
                      title={`Skill — ${detail()?.name ?? ''} · ${detailMode() === 'view' ? 'view' : 'preview'}`}
                      selected={false}
                    >
                      <Show when={detail()} fallback={<PanelMessage message="No skill." />}>
                        {(skill: () => Skills.SkillSummary) => (
                          <SkillDetail
                            skill={skill()}
                            mode={detailMode()}
                            scrollOffset={detailScroll()}
                            maxBodyLines={maxBodyLines()}
                          />
                        )}
                      </Show>
                    </Panel>
                  </box>
                </box>
              }
            >
              <Show
                when={profileDetail() === undefined}
                fallback={
                  <box flexDirection="row" flexGrow={1} minHeight={0} gap={1}>
                    <box flexDirection="column" width={30} flexShrink={0} minHeight={0}>
                      <Panel title="Profile — Actions" selected={false}>
                        <DetailActions
                          actions={detailActionsFor(profileDetailMode())}
                          highlight={profileDetailAction()}
                        />
                        <box flexShrink={0}>
                          <text style={{ fg: palette.dim }}>↑↓ navigate · ⏎ select</text>
                        </box>
                      </Panel>
                    </box>
                    <box flexDirection="column" flexGrow={1} flexBasis={0} minHeight={0}>
                      <Panel
                        title={`Profile — ${profileDetail()?.name ?? ''} · ${profileDetailMode() === 'view' ? 'view' : 'preview'}`}
                        selected={false}
                      >
                        <Show
                          when={profileDetail()}
                          fallback={<PanelMessage message="No profile." />}
                        >
                          {(profile: () => Profiles.ProfileSummary) => (
                            <ProfileDetail
                              profile={profile()}
                              mode={profileDetailMode()}
                              scrollOffset={profileDetailScroll()}
                              maxBodyLines={maxBodyLines()}
                            />
                          )}
                        </Show>
                      </Panel>
                    </box>
                  </box>
                }
              >
                <box flexDirection="row" flexGrow={1} minHeight={0} gap={1}>
                  <box flexDirection="column" width={30} flexShrink={0} minHeight={0}>
                    <Panel title="Prompt — Actions" selected={false}>
                      <DetailActions
                        actions={detailActionsFor(promptDetailMode())}
                        highlight={promptDetailAction()}
                      />
                      <box flexShrink={0}>
                        <text style={{ fg: palette.dim }}>↑↓ navigate · ⏎ select</text>
                      </box>
                    </Panel>
                  </box>
                  <box flexDirection="column" flexGrow={1} flexBasis={0} minHeight={0}>
                    <Panel
                      title={`Prompt — ${promptDetail()?.name ?? ''} · ${promptDetailMode() === 'view' ? 'view' : 'preview'}`}
                      selected={false}
                    >
                      <Show when={promptDetail()} fallback={<PanelMessage message="No prompt." />}>
                        {(prompt: () => Prompts.PromptSummary) => (
                          <PromptDetail
                            prompt={prompt()}
                            mode={promptDetailMode()}
                            scrollOffset={promptDetailScroll()}
                            maxBodyLines={maxBodyLines()}
                          />
                        )}
                      </Show>
                    </Panel>
                  </box>
                </box>
              </Show>
            </Show>
          </Show>
        }
      >
        <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} padding={1}>
          <For each={layout.columns}>
            {(column) => (
              <box
                flexDirection="column"
                flexGrow={column.width ?? 1}
                flexBasis={0}
                minHeight={0}
                gap={1}
              >
                <For each={column.cells}>
                  {(cell) => (
                    <Panel
                      title={`[${cell.keybind}] ${Dashboard.titleFor(cell.panel)}`}
                      selected={selected() === cell.panel}
                      grow={cell.height ?? 1}
                      panelRef={
                        cell.panel === 'skills'
                          ? setSkillsCard
                          : cell.panel === 'profiles'
                            ? setProfilesCard
                            : cell.panel === 'prompts'
                              ? setPromptsCard
                              : cell.panel === 'runs'
                                ? setRunsCard
                                : undefined
                      }
                    >
                      {cell.panel === 'info' ? (
                        <InfoPanel info={info()} />
                      ) : cell.panel === 'skills' ? (
                        <SkillsPanel
                          loading={!skillsLoaded()}
                          installing={installing()}
                          loadingVariant={skillsPhase()}
                          installed={skillsInstalled()}
                          rows={visibleRows()}
                          highlight={relativeHighlight()}
                          total={filtered().length}
                          query={skillQuery()}
                          searching={skillTyping()}
                          capacity={visibleCount()}
                          selected={selected() === 'skills'}
                        />
                      ) : cell.panel === 'profiles' ? (
                        <ProfilesPanel
                          loading={!profilesLoaded()}
                          installing={profileInstalling()}
                          loadingVariant={profilesPhase()}
                          installed={profilesInstalled()}
                          rows={profileVisibleRows()}
                          highlight={profileRelativeHighlight()}
                          total={filteredProfiles().length}
                          query={profileQuery()}
                          searching={profileTyping()}
                          capacity={profileVisibleCount()}
                          selected={selected() === 'profiles'}
                        />
                      ) : cell.panel === 'prompts' ? (
                        <PromptsPanel
                          loading={!promptsLoaded()}
                          installing={promptInstalling()}
                          loadingVariant={promptsPhase()}
                          installed={promptsInstalled()}
                          rows={promptVisibleRows()}
                          highlight={promptRelativeHighlight()}
                          total={filteredPrompts().length}
                          query={promptQuery()}
                          searching={promptTyping()}
                          capacity={promptVisibleCount()}
                          selected={selected() === 'prompts'}
                        />
                      ) : cell.panel === 'runs' ? (
                        <RunsPanel
                          loading={!runsLoaded()}
                          installing={runsInstalling()}
                          loadingVariant={runsPhase()}
                          installed={runsStoreInstalled()}
                          rows={runVisibleRows()}
                          highlight={runRelativeHighlight()}
                          total={filteredRuns().length}
                          query={runQuery()}
                          searching={runTyping()}
                          capacity={runVisibleCount()}
                          selected={selected() === 'runs'}
                        />
                      ) : (
                        <PanelMessage message="No data source yet." />
                      )}
                    </Panel>
                  )}
                </For>
              </box>
            )}
          </For>
        </box>
      </Show>
      <StatusBar hint={hint()} trailing={`${size()} · ${Workspace.summarize(info())}`} />
      <Show when={!loaded()}>
        <box
          position="absolute"
          left={0}
          right={0}
          bottom={1}
          justifyContent="center"
          alignItems="center"
        >
          <box backgroundColor={palette.highlight} paddingLeft={1} paddingRight={1}>
            <text>Loading workspace…</text>
          </box>
        </box>
      </Show>
      <Show when={menuView()}>
        {(view: () => MenuState) => (
          <MenuDialog
            title={view().title}
            subtitle={view().subtitle}
            options={view().options}
            highlight={view().highlight}
          />
        )}
      </Show>
      <Show when={inputView()}>
        {(view: () => InputState) => (
          <InputDialog
            title={view().title}
            placeholder={view().placeholder}
            value={view().value}
            editorRef={setInputEditor}
            onChange={(next) => {
              const current = dialog();
              if (current?.kind === 'input') setDialog({ ...current, value: next });
            }}
            onSubmit={(next) => {
              const current = dialog();
              if (current?.kind === 'input') current.resolve(next);
            }}
          />
        )}
      </Show>
      <Show when={removeView()}>
        {(view: () => RemoveState) => (
          <RemoveDialog
            name={view().name}
            kind={view().itemKind}
            remaining={view().remaining}
            deleting={view().deleting}
            focus={view().focus}
          />
        )}
      </Show>
      <Show when={filterView()}>
        {(view: () => FilterView) => (
          <FilterDialog
            title={view().title}
            query={view().query}
            rows={view().rows}
            highlight={view().highlight}
            total={view().total}
            showCurrentHint={view().hasCurrent}
          />
        )}
      </Show>
      <Show when={working()}>
        {(message: () => string) => (
          <FlowModal
            status={message()}
            submitted={lastInput()}
            scrollRef={setFlowSubmitScroll}
            canScroll={flowCanScroll()}
          />
        )}
      </Show>
      <Show when={flowError()}>
        {(failure: () => FlowFailure) => (
          <FlowErrorModal
            title={failure().title}
            error={failure().error}
            focus={flowErrorFocus()}
            scrollRef={setFlowErrorScroll}
            canScroll={flowErrorCanScroll()}
          />
        )}
      </Show>
      <ToastStack toasts={toasts()} />
    </box>
  );
};
