import fs from 'node:fs';
import { Container, type SelectItem, SelectList, Text } from '@earendil-works/pi-tui';
import { DynamicBorder, type ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { parseFindingBlocks, severityRank, type FindingBlock } from './findings';
import { getActiveLoop } from './graph';
import { loopStatePath } from './loop-state';
import type { FixerActivityStore } from './stream';
import type { FixerWidgetRow } from './widget';

/**
 * Word-wraps text to `width` chars, preserving explicit line breaks. Long
 * unbreakable tokens are hard-cut. Used for the findings detail pane.
 * @param {string} text Text to wrap
 * @param {number} width Max line width
 * @returns The wrapped lines
 */
export const wrapLines = (text: string, width: number): readonly string[] => {
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      lines.push('');
      continue;
    }
    let rest = trimmed;
    while (rest.length > width) {
      let cut = rest.lastIndexOf(' ', width);
      if (cut <= 0) cut = width;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    lines.push(rest);
  }
  return lines;
};

/** The fixer row for a finding id (queued/running/done/error), if scheduled. */
const fixerRowFor = (
  fixerRows: readonly FixerWidgetRow[] | undefined,
  findingId: string,
): FixerWidgetRow | undefined => fixerRows?.find((row) => row.id === findingId);

/** Sort key: running fixers first. */
const runningKey = (row: FixerWidgetRow | undefined): number =>
  row?.status === 'running' ? 0 : 1;

/**
 * Builds the findings table rows for the browser: one SelectItem per finding,
 * sorted with findings whose fixer is RUNNING first (what's happening now),
 * then severity (Critical → …), then finding id. The label is the table's
 * primary column (`F5 · Major · title`); the description is the secondary
 * line (`status · attempts · fixer <status> <tool> · location`).
 * @param {readonly FindingBlock[]} findings Findings from the canonical review
 * @param {readonly FixerWidgetRow[] | undefined} fixerRows Live fixer rows from the widget
 * @param {FixerActivityStore | undefined} fixerActivity Live per-fixer tool store
 * @returns The table items
 */
export const buildFindingsRows = (
  findings: readonly FindingBlock[],
  fixerRows: readonly FixerWidgetRow[] | undefined,
  fixerActivity: FixerActivityStore | undefined,
): SelectItem[] =>
  findings
    .toSorted((left, right) => {
      const leftKey = runningKey(fixerRowFor(fixerRows, left.id));
      const rightKey = runningKey(fixerRowFor(fixerRows, right.id));
      if (leftKey !== rightKey) return leftKey - rightKey;
      const rank = severityRank(left.severity) - severityRank(right.severity);
      if (rank !== 0) return rank;
      return left.id.localeCompare(right.id);
    })
    .map((finding) => {
      const row = fixerRowFor(fixerRows, finding.id);
      const tool = fixerActivity?.getTool(finding.id);
      const fixer =
        row === undefined
          ? '—'
          : `${row.status}${tool !== undefined ? ` · ${tool}` : ''}`;
      return {
        value: finding.id,
        label: `${finding.id} · ${finding.severity} · ${finding.title}`,
        description:
          `${finding.status} · attempts ${finding.attempts} · fixer ${fixer} · ${finding.location}`,
      };
    });

/**
 * Builds the multi-line detail pane for one finding: header (status, attempts,
 * fixer, location, source) + Problem/Impact/Suggestion + the discussion tail.
 * @param {FindingBlock} finding The finding
 * @param {FixerWidgetRow | undefined} fixerRow Its live fixer row (if scheduled)
 * @param {string | undefined} tool The fixer's current tool (if any)
 * @param {string | undefined} fixerModel The fixer model chain label, if known
 * @param {number} [width] Wrap width for the detail body
 * @returns The detail text (multi-line)
 */
export const buildFindingDetail = (
  finding: FindingBlock,
  fixerRow: FixerWidgetRow | undefined,
  tool: string | undefined,
  fixerModel: string | undefined,
  width: number = 72,
): string => {
  const fixer =
    fixerRow === undefined
      ? fixerModel !== undefined
        ? `— (${fixerModel})`
        : '—'
      : `${fixerRow.status}${tool !== undefined ? ` · ${tool}` : ''}${
          fixerModel !== undefined ? ` (${fixerModel})` : ''
        }`;
  const head = [
    `${finding.id} — ${finding.title}`,
    `Status: ${finding.status} · Attempts: ${finding.attempts} · First seen: ${finding.firstSeen}`,
    `Fixer: ${fixer}`,
    `Location: ${finding.location}`,
    `Source: ${finding.sourceReviewers.join(', ') || '—'}`,
  ];
  const sections: string[] = [];
  if (finding.problem !== '') sections.push(`Problem:\n${finding.problem}`);
  if (finding.impact !== '') sections.push(`Impact:\n${finding.impact}`);
  if (finding.suggestion !== '') sections.push(`Suggestion:\n${finding.suggestion}`);

  const lines: string[] = [...head];
  for (const section of sections) {
    lines.push('', ...wrapLines(section, width));
  }
  if (finding.discussion !== '') {
    const discussionLines = wrapLines(finding.discussion, width);
    lines.push('', 'Discussion:');
    // Tail only — the detail pane is bounded; the review file has the full thread.
    lines.push(...discussionLines.slice(-6));
    if (discussionLines.length > 6) lines.unshift('', '… (older turns truncated)');
  }
  return lines.join('\n');
};

/** Reads the fixer model chain label from the loop-state snapshot, if present. */
const readFixerModel = (reviewFile: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(loopStatePath(reviewFile), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const config = (parsed as { config?: { fixerModel?: string; fixerFallbackModels?: string[] } })
      .config;
    const model = config?.fixerModel;
    if (model === undefined || model === '') return undefined;
    const fallbacks = config?.fixerFallbackModels ?? [];
    return fallbacks.length > 0 ? `${model} → ${fallbacks.join(', ')}` : model;
  } catch {
    return undefined;
  }
};

/**
 * The max lines of the detail pane. The dialog is bounded; the full finding
 * lives in the canonical review file.
 */
const DETAIL_MAX_LINES = 16;

/**
 * Live snapshot of the fixer status for a finding, from the running loop's
 * widget state (falls back to the previous snapshot when the widget has no
 * rows yet).
 */
const readFixerStatus = (
  findingId: string,
): { row: FixerWidgetRow | undefined; tool: string | undefined } => {
  const handle = getActiveLoop();
  return {
    row: handle?.widget?.fixers?.find((row) => row.id === findingId),
    tool: handle?.widget?.fixerActivity?.getTool(findingId),
  };
};

/**
 * Opens the interactive findings browser: a searchable table of the review's
 * findings (id · severity · title, with status/attempts/fixer/location on the
 * secondary line) and a live detail pane for the selected finding (status,
 * fixer + current tool, location, problem, impact, suggestion, discussion
 * tail). The detail re-reads the canonical review file on every selection
 * change, so merges that happened while the browser was open show up.
 * `↑↓` navigates, `type` filters, `enter`/`esc` closes.
 * @param {{ readonly ui: ExtensionUIContext }} ctx The UI context
 * @param {string} reviewFile Canonical review file to read findings from
 * @returns Nothing
 */
export const openFindingsBrowser = async (
  ctx: { readonly ui: Pick<ExtensionUIContext, 'custom' | 'notify'> },
  reviewFile: string,
): Promise<void> => {
  const readFindings = (): readonly FindingBlock[] => {
    try {
      return parseFindingBlocks(fs.readFileSync(reviewFile, 'utf8'));
    } catch {
      return [];
    }
  };
  const readFreshDetail = (findingId: string): string => {
    // Re-read the canonical so merges since the browser opened are visible.
    const finding = readFindings().find((f) => f.id === findingId);
    if (finding === undefined) return '';
    const { row, tool } = readFixerStatus(findingId);
    const detail = buildFindingDetail(finding, row, tool, readFixerModel(reviewFile));
    const lines = detail.split('\n');
    const capped =
      lines.length > DETAIL_MAX_LINES
        ? [...lines.slice(0, DETAIL_MAX_LINES), '… (detail truncated — full finding in the review file)']
        : lines;
    return capped.join('\n');
  };

  const findings = readFindings();
  const handle = getActiveLoop();
  const items = buildFindingsRows(findings, handle?.widget?.fixers, handle?.widget?.fixerActivity);
  if (items.length === 0) {
    ctx.ui.notify('[adversarial-review-loop] No findings in the review yet.', 'info');
    return;
  }

  await ctx.ui.custom<string | null>(
    (tui, theme, _keybindings, done) => {
      const container = new Container();
      container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));
      container.addChild(
        new Text(theme.fg('accent', theme.bold('adversarial-review-loop findings')), 1, 0),
      );

      const list = new SelectList(items, Math.min(items.length, 8), {
        selectedPrefix: (t) => theme.fg('accent', t),
        selectedText: (t) => theme.fg('accent', t),
        description: (t) => theme.fg('muted', t),
        scrollInfo: (t) => theme.fg('dim', t),
        noMatch: (t) => theme.fg('warning', t),
      });
      const detail = new Text(theme.fg('dim', ''), 1, 0);
      list.onSelect = () => done(null); // enter closes
      list.onCancel = () => done(null); // esc closes
      list.onSelectionChange = (item) => {
        detail.setText(theme.fg('dim', readFreshDetail(item.value)));
        tui.requestRender();
      };
      container.addChild(list);

      // Initial detail for the preselected (first) row.
      const initial = list.getSelectedItem() ?? items[0];
      if (initial !== undefined) {
        detail.setText(theme.fg('dim', readFreshDetail(initial.value)));
      }
      container.addChild(detail);

      container.addChild(
        new Text(theme.fg('dim', 'type to search • ↑↓ navigate • enter/esc close'), 1, 0),
      );
      container.addChild(new DynamicBorder((s: string) => theme.fg('accent', s)));

      let query = '';
      return {
        render: (w) => container.render(w),
        invalidate: () => container.invalidate(),
        handleInput: (data) => {
          if (data.length === 1 && data >= ' ' && data !== '\x7f' && data !== '\n' && data !== '\r') {
            query += data;
            list.setFilter(query);
          } else if (data === '\x7f' || data === '\b') {
            query = query.slice(0, -1);
            list.setFilter(query);
          } else {
            list.handleInput(data);
          }
          tui.requestRender();
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        width: 120,
        maxHeight: '75%',
        margin: 1,
      },
    },
  );
};
