/**
 * Share of the panel body a `preview` spends. The scrollable full view
 * uses the whole budget; previews stop here so a detail reads as a
 * summary and the `v view` affordance stays meaningful.
 */
export const PREVIEW_BUDGET_RATIO = 0.7;

/** One windowed slice of a detail body: the rendered lines plus the counts the footer reports. */
export interface MarkdownWindow {
  /** Source lines to render. */
  readonly shown: ReadonlyArray<string>;
  /** Body line budget for this mode. */
  readonly budget: number;
  /** First source line shown. */
  readonly offset: number;
  /** Source lines past the window. */
  readonly hidden: number;
  /** Total source lines. */
  readonly total: number;
}

/**
 * Window a detail body for rendering. `preview` spends
 * {@link PREVIEW_BUDGET_RATIO} of the body budget — or `previewLines`
 * when the caller pins an absolute preview size; `view` uses the whole
 * budget. Both modes honour `scrollOffset` (clamped so the last line
 * stays reachable) so a small window can still be paged through, and
 * both report the window they actually show. Pure — the component and
 * its tests share it.
 * @param lines - source lines of the markdown document
 * @param mode - truncated preview or scrollable full view
 * @param scrollOffset - requested first source line
 * @param maxBodyLines - body line budget available from the panel
 * @param previewLines - absolute preview size, overriding the ratio
 * @returns windowed slice plus footer counts
 */
export const markdownWindow = (
  lines: ReadonlyArray<string>,
  mode: 'preview' | 'view',
  scrollOffset: number,
  maxBodyLines: number,
  previewLines?: number,
): MarkdownWindow => {
  const budget = Math.max(
    mode === 'preview'
      ? (previewLines ?? Math.floor(maxBodyLines * PREVIEW_BUDGET_RATIO))
      : maxBodyLines,
    1,
  );
  const offset = Math.min(Math.max(scrollOffset, 0), Math.max(lines.length - budget, 0));
  const shown = lines.slice(offset, offset + budget);
  return {
    shown,
    budget,
    offset,
    hidden: lines.length - shown.length - offset,
    total: lines.length,
  };
};
