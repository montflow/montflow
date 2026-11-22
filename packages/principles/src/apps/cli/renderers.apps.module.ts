import * as Principle from '../../modules/principle/index.js';
import type * as Doctor from '../doctor/index.js';
import type * as Engines from './engines.apps.module.js';

/**
 * Pure `data -> text` renderers, one per engine result.
 *
 * Same contract as the other `mf-*` CLIs: token-lean agent default, `--verbose`
 * adds and never removes, `--human` renders aligned tables and glyphs, and
 * failures are never suppressed. The agent path carries no glyph.
 */

/** Output modes: two independent axes, composed by every renderer. */
export interface RenderOptions {
  /** Render aligned tables and glyphs instead of the agent default. */
  readonly human: boolean;
  /** Add detail to the same output; never removes or reorders. */
  readonly verbose: boolean;
}

/** The agent-first default. */
export const AGENT: RenderOptions = { human: false, verbose: false };

const pad = (text: string, width: number): string => text.padEnd(width, ' ');

/** Render an aligned plain-text table, header first. */
const table = (
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): string => {
  const widths = headers.map((header, index) =>
    rows.reduce((width, row) => Math.max(width, (row[index] ?? '').length), header.length),
  );
  const line = (cells: ReadonlyArray<string>): string =>
    cells
      .map((cell, index) => pad(cell, widths[index] ?? 0))
      .join('  ')
      .trimEnd();
  return [
    line(headers),
    widths.map((width) => '-'.repeat(width)).join('  '),
    ...rows.map(line),
  ].join('\n');
};

/** Store-relative path of one principle file. */
const pathOf = (name: string): string =>
  `${Principle.STORE_DIR.join('/')}/${name}/${Principle.FILE}`;

/**
 * The store index: one `<name>: <description>` line per principle. This is
 * the line agents read to decide which principle applies. `--verbose` adds the
 * file path; `--human` is a table with a count.
 * @param rows - rows from `Engines.list`
 * @param options - output modes
 * @returns the rendered index
 */
export const list = (
  rows: ReadonlyArray<Engines.ListRow>,
  options: RenderOptions = AGENT,
): string => {
  if (rows.length === 0) return 'No principles.';
  if (options.human) {
    const headers = ['NAME', 'DESCRIPTION'];
    if (options.verbose) headers.push('PATH');
    const body = rows.map((row) =>
      options.verbose ? [row.name, row.description, pathOf(row.name)] : [row.name, row.description],
    );
    return [table(headers, body), `${rows.length} principle${rows.length === 1 ? '' : 's'}`].join(
      '\n',
    );
  }
  return rows
    .map((row) =>
      options.verbose
        ? `${row.name}: ${row.description} path=${pathOf(row.name)}`
        : `${row.name}: ${row.description}`,
    )
    .join('\n');
};

/** The leading word (agent) or glyph (human) for one finding. */
const labelOf = (issue: Principle.VerifyIssue, options: RenderOptions): string => {
  if (Principle.isError(issue)) return options.human ? '✗' : 'error';
  return options.human ? '⚠' : 'warn';
};

/**
 * One verification report. Every error and warning is printed; `--verbose`
 * adds a line per passing entry. Warnings never change the exit code.
 * @param report - report from `Engines.verify`
 * @param options - output modes
 * @returns the rendered report
 */
export const verify = (report: Engines.VerifyReport, options: RenderOptions = AGENT): string => {
  const lines: Array<string> = [];
  for (const entry of report.entries) {
    if (entry.result.issues.length === 0) {
      if (options.verbose) lines.push(`${options.human ? '✓' : 'ok'} ${entry.name}`);
      continue;
    }
    for (const issue of entry.result.issues) {
      lines.push(`${labelOf(issue, options)} ${entry.name} [${issue.field}] ${issue.message}`);
    }
  }
  lines.push(
    options.human
      ? `entries ${report.entries.length} · errors ${report.issueCount} · warnings ${report.warningCount}`
      : `summary entries=${report.entries.length} issues=${report.issueCount} warnings=${report.warningCount}`,
  );
  return lines.join('\n');
};

/**
 * One doctor run: the shared payload engine's report, one line per shipped
 * principle plus the repair hint when unhealthy.
 * @param result - result from `Engines.doctor`
 * @returns the rendered report
 */
export const doctor = (result: Doctor.DoctorResult): string => result.message;
