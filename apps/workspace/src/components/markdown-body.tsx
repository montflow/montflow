import { type BoxRenderable, SyntaxStyle } from '@opentui/core';
import { Show, createSignal } from 'solid-js';
import { Keybinds, formatKeybinds } from './keybinds.js';
import { markdownWindow } from './markdown-window.js';
import { palette } from './palette.js';

/** Lazily built markdown style — native FFI init happens on first detail render, never at import. */
let cachedSyntaxStyle: SyntaxStyle | undefined;

/**
 * The shared markdown syntax style, built once from the dashboard
 * palette. Deferred so importing this module (typecheck, unit tests)
 * never touches the native render library.
 * @returns the dashboard markdown syntax style
 */
export const markdownSyntaxStyle = (): SyntaxStyle =>
  (cachedSyntaxStyle ??= SyntaxStyle.fromStyles({
    'markup.heading': { fg: palette.accent, bold: true },
    'markup.heading.1': { fg: palette.accent, bold: true },
    'markup.heading.2': { fg: palette.accent, bold: true },
    'markup.heading.3': { fg: palette.accent, bold: true },
    'markup.heading.4': { fg: palette.accent, bold: true },
    'markup.heading.5': { fg: palette.accent, bold: true },
    'markup.heading.6': { fg: palette.accent, bold: true },
    'markup.strong': { fg: palette.text, bold: true },
    'markup.italic': { fg: palette.text, italic: true },
    'markup.strikethrough': { fg: palette.dim },
    'markup.list': { fg: palette.dim },
    'markup.raw': { fg: palette.accent },
    'markup.quote': { fg: palette.dim, italic: true },
    'markup.link': { fg: palette.accent, underline: true },
    'markup.link.label': { fg: palette.accent, underline: true },
    'markup.link.url': { fg: palette.dim, underline: true },
    conceal: { fg: palette.dim },
    default: { fg: palette.text },
  }));

export interface MarkdownBodyProps {
  /** Source lines of the markdown document. */
  readonly lines: ReadonlyArray<string>;
  /** Truncated preview or scrollable full view. */
  readonly mode: 'preview' | 'view';
  /** First source line of the full-view window. */
  readonly scrollOffset: number;
  /** Body line budget available from the panel. */
  readonly maxBodyLines: number;
  /**
   * Absolute preview size, overriding the shared preview ratio. The
   * run detail pins a small card-sized preview while its metadata
   * lives in the sidebar; the other details leave it unset.
   */
  readonly previewLines?: number | undefined;
  /**
   * True when the caller pages the preview with `j`/`k` (the run
   * transcript). The footer then reports the window position instead of
   * a `… N more lines` teaser, so the counts always match the screen.
   */
  readonly previewScroll?: boolean | undefined;
}

/**
 * Markdown body shared by the skill, profile, prompt, and run details:
 * the source renders through OpenTUI's `markdown` component (headings,
 * lists, emphasis, code) instead of raw text. Windowing comes from
 * {@link markdownWindow}, which takes an optional absolute preview size
 * for callers that pin a small card. Chromeless — the caller owns border,
 * title, and any framing around the body. The footer names the next
 * action (`v` toggles modes, `j`/`k` scroll the full view).
 * @param props - source lines, view mode, scroll window, body line budget, and optional pinned preview size
 * @returns markdown body plus footer
 */
export const MarkdownBody = (props: MarkdownBodyProps) => {
  const window = () =>
    markdownWindow(
      props.lines,
      props.mode,
      props.scrollOffset,
      props.maxBodyLines,
      props.previewLines,
    );
  /**
   * Rendered height of the body box, measured from the live layout. The
   * box is flex-grown, so this is the space left after the detail's own
   * rows and this footer — the one number that holds for every detail,
   * whatever chrome it renders. `undefined` until the first layout pass,
   * when the source-line budget stands in.
   */
  const [measured, setMeasured] = createSignal<number | undefined>(undefined);
  const cap = () => measured() ?? Math.max(window().budget, 1);

  return (
    <box flexDirection="column" flexGrow={1} minHeight={0}>
      <box
        flexGrow={1}
        minHeight={0}
        overflow="hidden"
        onSizeChange={function (this: BoxRenderable) {
          setMeasured(Math.max(Math.floor(this.height), 1));
        }}
      >
        <Show
          when={window().shown.length > 0}
          fallback={<text style={{ fg: palette.dim }}>No content.</text>}
        >
          {/* Markdown renders taller than its source lines — text wraps,
              blocks carry spacing, tables and fences add rows. It also
              defaults to `flexShrink: 0`, so an unconstrained renderable
              outgrows this box and paints over the footer and the
              keybinds below the panel. `flexShrink` + `minHeight` let it
              give way to the box, and `maxHeight` caps the measurement it
              lays its blocks out against at the space that actually
              exists. */}
          <markdown
            content={window().shown.join('\n')}
            syntaxStyle={markdownSyntaxStyle()}
            flexShrink={1}
            minHeight={0}
            maxHeight={cap()}
          />
        </Show>
      </box>
      <Show
        when={props.mode === 'preview'}
        fallback={
          <text style={{ fg: palette.dim }}>
            lines {window().total === 0 ? 0 : window().offset + 1}–
            {window().offset + window().shown.length}/{window().total} ·{' '}
            {formatKeybinds([Keybinds.scroll(), Keybinds.showPreview()])}
          </text>
        }
      >
        <Show
          when={props.previewScroll === true}
          fallback={
            window().hidden > 0 ? (
              <text style={{ fg: palette.dim }}>
                … {window().hidden} more lines · {formatKeybinds([Keybinds.showFull()])}
              </text>
            ) : undefined
          }
        >
          <Show when={window().total > 0} fallback={undefined}>
            <text style={{ fg: palette.dim }}>
              lines {window().offset + 1}–{window().offset + window().shown.length}/{window().total}{' '}
              · {formatKeybinds([Keybinds.scroll(), Keybinds.showFull()])}
            </text>
          </Show>
        </Show>
      </Show>
    </box>
  );
};
