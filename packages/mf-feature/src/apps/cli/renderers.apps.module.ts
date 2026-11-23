import * as Roles from '../../modules/roles/index.js';
import type * as Engines from './engines.apps.module.js';

/**
 * Pure `data -> text` renderers, one per engine result.
 *
 * Same contract as the other `mf-*` CLIs: token-lean agent default, `--verbose`
 * adds and never removes, `--human` renders aligned tables and glyphs, and
 * failures are never suppressed. Agent lines are `key=value` so a lead can act
 * on them without interpreting prose; every seat line ends with `next=`, the
 * one thing to do with it.
 */

export interface RenderOptions {
  readonly human: boolean;
  readonly verbose: boolean;
}

export const AGENT: RenderOptions = { human: false, verbose: false };

const pad = (text: string, width: number): string => text.padEnd(width, ' ');

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

/** A value safe for one `key=value` token. */
const token = (value: string): string => (/^[^\s"]+$/.test(value) ? value : JSON.stringify(value));

/**
 * Every role: `<role>: default`, or its seats as specs, seats split by ` | `.
 * The spec is the same text `roles set --seat` takes.
 * @param rows - rows from `Engines.show`
 * @param options - output modes
 */
export const show = (
  rows: ReadonlyArray<Engines.ShowRow>,
  options: RenderOptions = AGENT,
): string => {
  if (options.human) {
    const body = rows.flatMap((row) =>
      row.seats === undefined
        ? [[row.role, '-', 'default (mf-feature Subagents section)']]
        : row.seats.map((seat, index) => [
            index === 0 ? row.role : '',
            String(index + 1),
            Roles.formatSeat(seat).replaceAll(',', ' > '),
          ]),
    );
    return table(['ROLE', 'SEAT', 'CANDIDATES (in preference order)'], body);
  }
  return rows
    .map((row) =>
      row.seats === undefined
        ? `${row.role}: default`
        : `${row.role}: ${row.seats.map(Roles.formatSeat).join(' | ')}`,
    )
    .join('\n');
};

/** The line after `set` or `unset`. */
export const changed = (row: Engines.ShowRow): string =>
  row.seats === undefined
    ? `unset ${row.role}: it resolves to the mf-feature defaults`
    : `set ${row.role}: ${row.seats.map(Roles.formatSeat).join(' | ')}`;

/**
 * The verification report: every issue, then a summary line.
 * @param report - report from `Engines.verify`
 * @param options - output modes
 */
export const verify = (report: Engines.VerifyReport, options: RenderOptions = AGENT): string => {
  const lines: Array<string> = [];
  if (!report.exists) {
    lines.push(
      options.human
        ? `No roles file at ${report.path}: every role uses its defaults.`
        : `no-file path=${report.path}`,
    );
  }
  for (const issue of report.issues) {
    const label =
      issue.severity === 'error' ? (options.human ? '✗' : 'error') : options.human ? '⚠' : 'warn';
    lines.push(`${label} [${issue.path}] ${issue.message}`);
  }
  const warnings = report.issues.length - report.errorCount;
  lines.push(
    options.human
      ? `errors ${report.errorCount} · warnings ${warnings}`
      : `summary issues=${report.errorCount} warnings=${warnings}`,
  );
  return lines.join('\n');
};

/** What a lead does with one seat. */
const nextOf = (resolution: Roles.Resolution, seat: Roles.ResolvedSeat): string => {
  if (seat.run === 'dropped') return 'skip this seat and say so';
  if (seat.run === 'dispatch') {
    return `mf-feature dispatch ${resolution.role} --seat ${seat.seat} --brief <file>`;
  }
  return seat.candidate === undefined
    ? `spawn with your subagent tool on the ${resolution.role} default in the mf-feature Subagents section`
    : 'spawn with your subagent tool on this model and effort';
};

const skippedOf = (seat: Roles.ResolvedSeat): string =>
  seat.skipped
    .map((entry) => `${Roles.formatCandidate(entry.candidate)} (${entry.reason})`)
    .join(', ');

/**
 * A resolution: a header line, then one line per seat ending in `next=`.
 * `--verbose` adds the candidates passed over.
 * @param resolution - from `Engines.resolve`
 * @param options - output modes
 */
export const resolve = (resolution: Roles.Resolution, options: RenderOptions = AGENT): string => {
  if (options.human) {
    const headers = ['SEAT', 'HARNESS', 'MODEL', 'EFFORT', 'RUN'];
    if (options.verbose) headers.push('SKIPPED');
    const rows = resolution.seats.map((seat) => {
      const cells = [
        String(seat.seat),
        seat.run === 'dropped' ? '-' : (seat.candidate?.harness ?? resolution.current),
        seat.run === 'dropped' ? '-' : (seat.candidate?.model ?? 'default'),
        seat.candidate?.effort ?? '',
        seat.run,
      ];
      if (options.verbose) cells.push(skippedOf(seat));
      return cells;
    });
    return [
      `${resolution.role} (${resolution.source === 'set' ? 'set' : 'unset: mf-feature defaults'}) from ${resolution.current}`,
      table(headers, rows),
    ].join('\n');
  }
  const header = `role=${resolution.role} source=${resolution.source} current=${resolution.current} seats=${resolution.seats.length}`;
  const lines = resolution.seats.map((seat) => {
    const fields: Array<string> = [`seat=${seat.seat}`, `run=${seat.run}`];
    if (seat.run !== 'dropped') {
      fields.push(`harness=${seat.candidate?.harness ?? resolution.current}`);
      fields.push(`model=${token(seat.candidate?.model ?? 'default')}`);
      if (seat.candidate?.effort !== undefined) fields.push(`effort=${seat.candidate.effort}`);
    }
    if ((options.verbose || seat.run === 'dropped') && seat.skipped.length > 0) {
      fields.push(`skipped=${token(skippedOf(seat))}`);
    }
    fields.push(`next=${token(nextOf(resolution, seat))}`);
    return fields.join(' ');
  });
  return [header, ...lines].join('\n');
};

/**
 * A dry run: the seat and the exact command that would run.
 * @param result - from `Engines.dispatch`
 */
export const dispatchPlan = (result: Engines.DispatchResult): string =>
  [
    `seat=${result.seat.seat}`,
    `harness=${result.seat.candidate?.harness ?? ''}`,
    `model=${token(result.seat.candidate?.model ?? '')}`,
    `command=${token(result.command)}`,
  ].join(' ');
