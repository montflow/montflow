import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core';
import { For, Show, createSignal, onCleanup, type Ref } from 'solid-js';
import type { RemoveFocus } from '../modules/remove-confirm/index.js';
import { DeleteModal } from './delete-modal.js';
import { KeybindBanner } from './keybind-banner.js';
import { Keybinds } from './keybinds.js';
import { FRAME_MS, LOADER_FRAMES } from './loader.js';
import { Modal } from './modal.js';
import { palette } from './palette.js';

export interface MenuDialogProps {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly options: ReadonlyArray<string>;
  readonly highlight: number;
}

/** Visible menu rows: the option list windows to this budget around the highlight. */
export const MENU_ROWS = 8;

/** Windowed menu view: visible slice plus the highlight relative to it. */
export interface MenuWindow {
  readonly rows: ReadonlyArray<string>;
  readonly highlight: number;
}

/**
 * Window the option list so the highlighted row stays visible inside
 * the capped `Modal` frame. Pure helper so the windowing is testable
 * without a renderer.
 * @param options - full option list
 * @param highlight - highlighted index into the full list
 * @returns visible slice plus the highlight relative to it
 */
export const windowMenuOptions = (
  options: ReadonlyArray<string>,
  highlight: number,
): MenuWindow => {
  const start = Math.min(
    Math.max(highlight - MENU_ROWS + 1, 0),
    Math.max(options.length - MENU_ROWS, 0),
  );
  return { rows: options.slice(start, start + MENU_ROWS), highlight: highlight - start };
};

/**
 * Single-choice menu overlay: heading, optional context line, then the
 * option list with the highlighted row inverted, windowed to
 * `MENU_ROWS` around the highlight so long catalogues scroll instead
 * of stretching the capped `Modal` frame. Dumb — the caller owns
 * highlight state and key routing (arrows move, enter picks, esc
 * cancels). Framed by the shared `Modal` shell.
 * @param props - title, options, and highlight index
 * @returns menu overlay element
 */
export const MenuDialog = (props: MenuDialogProps) => {
  const view = (): MenuWindow => windowMenuOptions(props.options, props.highlight);
  return (
    <Modal minWidth={40}>
      <text style={{ fg: palette.text }}>{props.title}</text>
      {props.subtitle !== undefined ? (
        <text style={{ fg: palette.dim }}>{props.subtitle}</text>
      ) : (
        <text> </text>
      )}
      <box flexDirection="column">
        <For each={view().rows}>
          {(option, index) => (
            <box backgroundColor={index() === view().highlight ? palette.highlight : palette.bg}>
              <text style={{ fg: palette.text }}>
                {index() === view().highlight ? `▸ ${option}` : `  ${option}`}
              </text>
            </box>
          )}
        </For>
      </box>
      <KeybindBanner items={[Keybinds.menuNavigate(), Keybinds.selectRow(), Keybinds.cancel()]} />
    </Modal>
  );
};

export interface InputDialogProps {
  readonly title: string;
  readonly placeholder?: string | undefined;
  /**
   * Seed text for the editor buffer (applied on mount) plus the live
   * char-counter mirror. The textarea owns the text after mount — the
   * mirror never flows back in, so typing can never be clobbered by a
   * stale parent render.
   */
  readonly value: string;
  readonly editorRef?: ((node: TextareaRenderable | undefined) => void) | undefined;
  readonly onChange?: ((value: string) => void) | undefined;
  readonly onSubmit?: ((value: string) => void) | undefined;
}

/** Visible input value lines: the value scrolls past this budget with the cursor pinned in view. */
export const INPUT_VALUE_ROWS = 5;

/**
 * Filter/search query budget: phrases, not paragraphs. Raised with the
 * input cap so pasted queries are not silently truncated either.
 */
export const QUERY_MAX_CHARS = 256;

/**
 * Text-input overlay: prompt line plus a native multiline editor. The
 * textarea (word-wrapped, `INPUT_VALUE_ROWS` tall) owns the text —
 * arrows move the cursor in every direction and the viewport follows
 * it with a scroll margin, so overflowed input reviews by moving
 * instead of manual scroll-jogging. `⏎` submits, `shift`/`cmd`+`⏎`
 * inserts a newline, `esc` cancels. The caller owns the submit/cancel
 * routing plus the counter mirror (`onChange`); the editor node is
 * exposed for submit reads. Framed by the shared `Modal` shell.
 * @param props - title, placeholder, seeded value, editor ref, and change/submit sinks
 * @returns input overlay element
 */
export const InputDialog = (props: InputDialogProps) => {
  let editor: TextareaRenderable | undefined;

  /**
   * Attach the editor node: forward the ref, then focus with the cursor
   * parked at the end so fresh dialogs type at the tail and overflowed
   * seeds open pinned to the cursor, not the head.
   * @param node - mounted editor node, undefined on unmount
   */
  const attachEditor = (node: TextareaRenderable | undefined): void => {
    editor = node;
    props.editorRef?.(node);
    if (node === undefined) return;
    queueMicrotask(() => {
      if (!node.isDestroyed) {
        node.focus();
        node.gotoBufferEnd();
      }
    });
  };

  /** Mirror editor text to the parent counter. No length cap — dictated
   * and pasted descriptions run long and nothing should wall typing. */
  const mirrorEditor = (): void => {
    const node = editor;
    if (node === undefined || node.isDestroyed) return;
    props.onChange?.(node.plainText);
  };

  return (
    <Modal minWidth={48}>
      <text style={{ fg: palette.text }}>{props.title}</text>
      <textarea
        ref={attachEditor}
        focused
        height={INPUT_VALUE_ROWS}
        wrapMode="word"
        scrollMargin={1}
        initialValue={props.value}
        placeholder={props.placeholder ?? ''}
        textColor={palette.text}
        focusedTextColor={palette.text}
        cursorColor={palette.accent}
        placeholderColor={palette.dim}
        keyBindings={[
          { name: 'return', action: 'submit' },
          { name: 'kpenter', action: 'submit' },
          { name: 'linefeed', action: 'submit' },
          { name: 'return', shift: true, action: 'newline' },
          { name: 'kpenter', shift: true, action: 'newline' },
          { name: 'return', meta: true, action: 'newline' },
          { name: 'kpenter', meta: true, action: 'newline' },
        ]}
        onContentChange={mirrorEditor}
        onSubmit={() => {
          if (editor !== undefined && !editor.isDestroyed) props.onSubmit?.(editor.plainText);
        }}
      />
      <box flexDirection="row" justifyContent="space-between">
        <KeybindBanner
          items={[
            Keybinds.type(),
            Keybinds.submit(),
            Keybinds.moveArrows(),
            Keybinds.insertNewline(),
            Keybinds.cancel(),
          ]}
        />
        <text style={{ fg: palette.dim }}>{props.value.length} chars</text>
      </box>
    </Modal>
  );
};

export interface FilterDialogProps {
  readonly title: string;
  readonly query: string;
  readonly rows: ReadonlyArray<string>;
  readonly highlight: number;
  readonly total: number;
  /** True while a pinned row exists (model picker) — shows the `tab` jump hint. */
  readonly showCurrentHint?: boolean | undefined;
}

/**
 * Filter-as-you-type picker overlay: query line over a windowed row
 * list. Backs both the model picker and the `searchSelect` port — the
 * caller owns filtering, windowing, and highlight. Empty rows render
 * a no-match line so the overlay keeps its shape while typing. The
 * `tab current` hint only shows while a pinned row exists (model
 * picker). Framed by the shared `Modal` shell.
 * @param props - title, query, visible rows, highlight, match total, and hint flag
 * @returns filter picker overlay element
 */
export const FilterDialog = (props: FilterDialogProps) => (
  <Modal minWidth={48}>
    <text style={{ fg: palette.text }}>{props.title}</text>
    <text style={{ fg: palette.accent }}>/{props.query}▊</text>
    <box flexDirection="column" minHeight={Math.max(props.rows.length, 1)}>
      <Show
        when={props.rows.length > 0}
        fallback={<text style={{ fg: palette.dim }}>no match</text>}
      >
        <For each={props.rows}>
          {(row, index) => (
            <box backgroundColor={index() === props.highlight ? palette.highlight : palette.bg}>
              <text style={{ fg: palette.text }}>
                {index() === props.highlight ? `▸ ${row}` : `  ${row}`}
              </text>
            </box>
          )}
        </For>
      </Show>
    </box>
    <box flexDirection="row" justifyContent="space-between">
      <KeybindBanner
        items={[
          Keybinds.menuNavigate(),
          Keybinds.typeToFilter(),
          ...(props.showCurrentHint === true ? [Keybinds.jumpToCurrent()] : []),
          Keybinds.selectRow(),
          Keybinds.cancel(),
        ]}
      />
      <text style={{ fg: palette.dim }}>
        {props.rows.length}/{props.total}
      </text>
    </box>
  </Modal>
);

export interface RemoveDialogProps {
  readonly name: string;
  readonly kind: 'skill' | 'profile' | 'prompt';
  readonly remaining: number;
  readonly deleting: boolean;
  readonly focus: RemoveFocus;
}

/**
 * Skill/profile/prompt remove-confirm modal: thin wrapper over the
 * generic `DeleteModal` with the item title/message shape (mirroring
 * opencode's `DialogConfirm`). Keeps the `RemoveFocus`
 * (`cancel`/`delete`) contract so `app.tsx` key routing and the
 * remove-confirm countdown stay untouched — `cancel` maps to the
 * modal's `back` button.
 * @param props - item name, item kind, seconds left, deleting flag, focused button
 * @returns remove-confirm overlay element
 */
export const RemoveDialog = (props: RemoveDialogProps) => (
  <DeleteModal
    title={`Remove ${props.kind} '${props.name}'?`}
    message={
      props.kind === 'skill'
        ? 'This removes its SKILL.md and cannot be undone.'
        : props.kind === 'profile'
          ? 'This removes its PROFILE.md and cannot be undone.'
          : 'This removes its JSON file and cannot be undone.'
    }
    remaining={props.remaining}
    deleting={props.deleting}
    focus={props.focus === 'cancel' ? 'back' : 'delete'}
  />
);

/** Submitted flow input shown back during the agent run. */
export interface SubmittedInput {
  readonly title: string;
  readonly value: string;
}

export interface FlowModalProps {
  readonly status: string;
  readonly submitted?: SubmittedInput | undefined;
  readonly scrollRef?: Ref<ScrollBoxRenderable> | undefined;
  /** True while the submitted text overflows the scrollbox — gates the scroll hint. */
  readonly canScroll: boolean;
}

/** Visible submitted-input lines inside the flow modal. */
export const FLOW_INPUT_ROWS = 5;

/**
 * Agentic-run modal: same `Modal` chrome as every dialog, with an
 * animated braille spinner beside the one-line run status plus the
 * just-submitted input (scrollable past `FLOW_INPUT_ROWS`) so long
 * dictated text stays visible while the agent works. Mounted while
 * `working` is set — `esc` cancels the agent fiber (the child is
 * killed), arrows scroll overflowed input, every other key stays
 * locked out. The scroll hint only renders while `canScroll` says the
 * text actually overflows. Framed by the shared `Modal` shell.
 * @param props - run status, submitted input, and overflow flag
 * @returns flow overlay element
 */
export const FlowModal = (props: FlowModalProps) => {
  const [frame, setFrame] = createSignal(0);
  // oxlint-disable-next-line montflow/no-timers -- Loader pattern: Effect Clock hangs here.
  const timer = setInterval(() => {
    setFrame((index) => (index + 1) % LOADER_FRAMES.length);
  }, FRAME_MS);
  onCleanup(() => {
    // oxlint-disable-next-line montflow/no-timers -- spinner teardown for the raw interval above.
    clearInterval(timer);
  });
  return (
    <Modal minWidth={56}>
      <text style={{ fg: palette.accent }}>
        {`${LOADER_FRAMES[frame() % LOADER_FRAMES.length]} ${props.status}`}
      </text>
      <Show when={props.submitted} fallback={undefined}>
        {(input: () => SubmittedInput) => (
          <box flexDirection="column">
            <text style={{ fg: palette.dim }}>You asked · {input().title}</text>
            <scrollbox
              {...(props.scrollRef === undefined ? {} : { ref: props.scrollRef })}
              maxHeight={FLOW_INPUT_ROWS}
              stickyScroll
              stickyStart="bottom"
            >
              <text style={{ fg: palette.text }}>{`${input().value}▊`}</text>
            </scrollbox>
          </box>
        )}
      </Show>
      <KeybindBanner
        items={[Keybinds.cancel(), ...(props.canScroll ? [Keybinds.arrowScroll()] : [])]}
      />
    </Modal>
  );
};

/** Focusable flow-error button. Retry re-runs the failed flow. */
export type FlowErrorFocus = 'retry' | 'back';

export interface FlowErrorModalProps {
  readonly title: string;
  readonly error: string;
  readonly focus: FlowErrorFocus;
  readonly scrollRef?: Ref<ScrollBoxRenderable> | undefined;
  /** True while the error text overflows the scrollbox — gates the scroll hint. */
  readonly canScroll: boolean;
}

/** Visible error lines inside the flow-error modal. */
export const FLOW_ERROR_ROWS = 6;

/**
 * Flow-failure modal: the run title, the scrollable error, and
 * Retry/Back buttons — retry re-fires the failed flow, back returns
 * to the view beneath. Mounted while a flow failure is open; the key
 * handler owns navigation so every other key stays locked out.
 * Framed by the shared `Modal` shell.
 * @param props - run title, error text, and focused button
 * @returns flow-error overlay element
 */
export const FlowErrorModal = (props: FlowErrorModalProps) => (
  <Modal minWidth={56}>
    <text style={{ fg: palette.bad }}>{props.title}</text>
    <scrollbox
      {...(props.scrollRef === undefined ? {} : { ref: props.scrollRef })}
      maxHeight={FLOW_ERROR_ROWS}
      stickyScroll
      stickyStart="bottom"
    >
      <text style={{ fg: palette.text }}>{props.error}</text>
    </scrollbox>
    <box flexDirection="row" justifyContent="center" gap={2}>
      <box
        backgroundColor={props.focus === 'retry' ? palette.highlight : palette.bg}
        paddingLeft={1}
        paddingRight={1}
      >
        <text style={{ fg: palette.text }}>{props.focus === 'retry' ? '▸ Retry' : '  Retry'}</text>
      </box>
      <box
        backgroundColor={props.focus === 'back' ? palette.highlight : palette.bg}
        paddingLeft={1}
        paddingRight={1}
      >
        <text style={{ fg: palette.dim }}>{props.focus === 'back' ? '▸ Back' : '  Back'}</text>
      </box>
    </box>
    <KeybindBanner
      items={[
        Keybinds.modalSelect(),
        Keybinds.choose(),
        ...(props.canScroll ? [Keybinds.arrowScroll()] : []),
        Keybinds.back(),
      ]}
    />
  </Modal>
);
