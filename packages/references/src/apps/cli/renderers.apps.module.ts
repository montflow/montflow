import * as Doctor from '../doctor/index.js';
import type * as Git from '../../modules/git/index.js';
import * as Verifier from '../../modules/verifier/index.js';
import type * as Engines from './engines.apps.module.js';

/**
 * Pure `data -> text` renderers, one per engine result.
 *
 * Same contract as the other `mf-*` CLIs: token-lean agent default, `--verbose`
 * adds and never removes, `--human` renders aligned tables and prose, failures
 * are never suppressed, and the agent path carries no glyph or colour.
 */

/** One-line usage summary, verbs in canonical order. */
export const USAGE = `mf-references — register, materialize, and verify third-party reference clones.

Usage:
  mf-references doctor [--check] [--human] [--verbose] [--dir <path>]
  mf-references list [--status installed|missing] [--human] [--verbose] [--dir <path>]
  mf-references show <name> [--dir <path>]
  mf-references verify [<name>|--all] [--clones] [--human] [--verbose] [--dir <path>]
  mf-references add <url> [--name <slug>] [--ref <ref>] [--purpose <text>] [--human] [--verbose] [--dir <path>]
  mf-references update <name|url>|--all [--force] [--human] [--verbose] [--dir <path>]
  mf-references sync <name>|--all [--human] [--verbose] [--dir <path>]
  mf-references status [<name>] [--fetch] [--human] [--verbose] [--dir <path>]
  mf-references remove <name> [--keep-clone] [--human] [--verbose] [--dir <path>]

A reference lives at .agents/@montflow/references/<slug>/REFERENCE.md; its clone
lives at .agents/references/<slug>.`;

/** Output modes: two independent axes, composed by every renderer. */
export interface RenderOptions {
  /** Render aligned tables and glyphs instead of the agent default. */
  readonly human: boolean;
  /** Add detail to the same lines; never removes or reorders. */
  readonly verbose: boolean;
}

/** The agent-first default every tool and bare CLI invocation uses. */
export const AGENT: RenderOptions = { human: false, verbose: false };

const count = (values: ReadonlyArray<boolean>): number => values.filter(Boolean).length;

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

const sha7 = (sha: string | undefined): string =>
  sha === undefined || sha === '' ? '(none)' : sha.slice(0, 7);

const markOf = (state: string): string => {
  if (state === 'installed' || state === 'present' || state === 'ok') return '✓';
  if (state === 'missing') return '•';
  return '✗';
};

const VERIFY_GLYPHS = ['✓', '✗', '⚠', '•'] as const;

const withoutPrefix = (message: string, prefix: string): string => {
  if (!message.startsWith(prefix)) return message;
  return message.slice(prefix.length).trim();
};

const doctorMark = (entry: Doctor.DoctorCheck): string => {
  if (entry.warning === true) return '⚠';
  if (entry.status === 'ok') return '✓';
  if (entry.status === 'repaired') return '+';
  return '✗';
};

/**
 * One `doctor` run. Agent default prints the summary plus one line per
 * non-ok check; `--verbose` adds the passing checks. A retired-skill warning
 * prints as `warn` and never changes the exit code.
 * @param result - result from `engines.doctor`
 * @param options - output modes
 * @returns the rendered report
 */
export const doctor = (result: Doctor.DoctorResult, options: RenderOptions = AGENT): string => {
  const failed = result.checks.filter((entry) => entry.status === 'drifted').length;
  const repaired = result.checks.filter((entry) => entry.status === 'repaired').length;
  const summary = `summary checks=${result.checks.length} failed=${failed} repaired=${repaired}`;
  if (options.human) {
    const body = result.checks.map((entry) => {
      const state = entry.status === 'drifted' ? 'failed' : entry.status;
      return [doctorMark(entry), entry.name, state, entry.detail];
    });
    return [table(['MARK', 'CHECK', 'STATUS', 'DETAIL'], body), summary].join('\n');
  }
  const lines: Array<string> = [];
  for (const entry of result.checks) {
    if (entry.warning === true) {
      lines.push(`warn ${entry.name}: ${entry.detail}`);
      continue;
    }
    if (entry.status === 'drifted') {
      lines.push(`failed ${entry.name}: ${entry.detail}`);
      continue;
    }
    if (entry.status === 'repaired') {
      lines.push(`repaired ${entry.name}: ${entry.detail}`);
      continue;
    }
    if (options.verbose) lines.push(`ok ${entry.name}: ${entry.detail}`);
  }
  lines.push(summary);
  return lines.join('\n');
};

/**
 * The gate message for an unhealthy `--check` run.
 * @param result - result from `engines.doctor`
 * @param invocation - caller form used in the fix-it line
 * @returns the terse two-line message
 */
export const gate = (
  result: Doctor.DoctorResult,
  invocation: string = '/mf-references doctor',
): string => Doctor.doctorGateMessage(result, invocation);

/**
 * Every store entry. Agent rows are `<state> <slug>  <purpose>`; `--verbose`
 * appends `url=`/`ref=` and a derived `path:` line. Human mode is a table.
 * @param rows - rows from `engines.list`
 * @param options - output modes
 * @returns the rendered list
 */
export const list = (
  rows: ReadonlyArray<Engines.ReferenceRow>,
  options: RenderOptions = AGENT,
): string => {
  const summary = `summary total=${rows.length} installed=${count(rows.map((row) => row.installed))} missing=${count(rows.map((row) => !row.installed))}`;
  if (options.human) {
    const headers = ['STATE', 'SLUG', 'PURPOSE'];
    if (options.verbose) headers.push('URL', 'REF', 'PATH');
    const body = rows.map((row) => {
      const cells = [markOf(row.installed ? 'installed' : 'missing'), row.slug, row.purpose];
      if (options.verbose) cells.push(row.url, row.ref ?? '-', row.path);
      return cells;
    });
    return [table(headers, body), summary].filter((part) => part !== '').join('\n');
  }
  const lines = rows.map((row) => {
    const head = `${row.installed ? 'installed' : 'missing'} ${row.slug}  ${row.purpose}`;
    if (!options.verbose) return head;
    const detail = [`url=${row.url}`];
    if (row.ref !== undefined && row.ref !== '') detail.push(`ref=${row.ref}`);
    return `${head} ${detail.join(' ')}\n  path: ${row.path}`;
  });
  lines.push(summary);
  return lines.join('\n');
};

/** One verification block, agent or human. */
const verifyBlock = (entry: Engines.VerifyEntryReport, options: RenderOptions): string => {
  const errors = entry.issues.filter(Verifier.isError);
  const warnings = entry.issues.filter(Verifier.isWarning);
  const total = errors.length + warnings.length;
  const lines: Array<string> = [];
  if (errors.length > 0) {
    const label = options.human ? '✗' : 'error';
    lines.push(
      `${label} ${entry.path} has ${total} issue${total === 1 ? '' : 's'}. Fix each one and run verify again.`,
    );
    errors.forEach((issue, index) => {
      lines.push('');
      lines.push(`${index + 1}. [${issue.field}] ${issue.message}`);
      if (issue.fix !== undefined) lines.push(`Fix: ${issue.fix}`);
    });
  }
  for (const issue of warnings) {
    lines.push(`${options.human ? '⚠' : 'warn'} [${issue.field}] ${issue.message}`);
  }
  return lines.join('\n');
};

/**
 * One verification report. Failing entries are always printed; warnings never
 * change the exit code; `--verbose` adds `ok <path>` per passing entry.
 * @param report - report from `engines.verify`
 * @param options - output modes
 * @returns the rendered report
 */
export const verify = (report: Engines.VerifyReport, options: RenderOptions = AGENT): string => {
  const allEntries = [...report.entries, ...report.skills];
  const blocks: Array<string> = [];
  for (const entry of allEntries) {
    const hasErrors = entry.issues.some(Verifier.isError);
    if (hasErrors) {
      blocks.push(verifyBlock(entry, options));
      continue;
    }
    if (!options.verbose) continue;
    blocks.push(`${options.human ? '✓' : 'ok'} ${entry.path}`);
  }
  for (const entry of allEntries) {
    const hasErrors = entry.issues.some(Verifier.isError);
    if (hasErrors) continue;
    const warnings = entry.issues.filter(Verifier.isWarning);
    if (warnings.length > 0) {
      blocks.push(
        warnings
          .map((issue) => `${options.human ? '⚠' : 'warn'} [${issue.field}] ${issue.message}`)
          .join('\n'),
      );
    }
  }
  const summary = options.human
    ? `entries ${allEntries.length} · errors ${report.issueCount} · warnings ${report.warningCount}`
    : `summary entries=${allEntries.length} issues=${report.issueCount} warnings=${report.warningCount}`;
  blocks.push(summary);
  return blocks.join('\n\n');
};

/**
 * Whole-store verification, the `--all` form of {@link verify}.
 * @param report - report from `engines.verifyAll`
 * @param options - output modes
 * @returns the rendered report
 */
export const verifyAll = (
  report: Engines.VerifyAllReport,
  options: RenderOptions = AGENT,
): string => verify(report, options);

const relativeClone = (slug: string): string => `.agents/references/${slug}`;

/**
 * One `add` result. A routed add prints its notice and then update's own line;
 * a refusal or failure is the whole output.
 * @param result - result from `engines.add`
 * @param options - output modes
 * @returns the rendered result
 */
export const added = (result: Git.AddResult, options: RenderOptions = AGENT): string => {
  if (result.kind === 'routed') {
    return [result.notice, updated(result.update, options)].join('\n');
  }
  if (result.kind !== 'created') return result.message;
  if (options.human) {
    const lines = [`Created ${result.slug}.`, `  url: ${result.url}`];
    if (result.ref !== undefined && result.ref !== '') lines.push(`  ref: ${result.ref}`);
    if (options.verbose) {
      lines.push(`  path: ${relativeClone(result.slug)}`);
      if (result.head !== undefined) lines.push(`  head: ${sha7(result.head)}`);
    }
    return lines.join('\n');
  }
  if (!options.verbose) return result.message;
  const detail = [`path=${relativeClone(result.slug)}`];
  if (result.head !== undefined && result.head !== '') detail.push(`head=${sha7(result.head)}`);
  return `${result.message} ${detail.join(' ')}`;
};

/** True when an update result is a refusal or failure. */
export const updateFailed = (result: Git.UpdateResult): boolean =>
  result.kind === 'refused' || result.kind === 'failed';

/**
 * One `update` result.
 * @param result - result from `engines.update`
 * @param options - output modes
 * @returns the rendered result
 */
export const updated = (result: Git.UpdateResult, options: RenderOptions = AGENT): string => {
  if (result.kind !== 'created' && result.kind !== 'updated' && result.kind !== 'present') {
    return result.message;
  }
  if (options.human) {
    const lines: Array<string> = [];
    if (result.kind === 'created') {
      lines.push(`Created ${result.slug}.`);
      lines.push(`  url: ${result.url}`);
      if (result.ref !== undefined && result.ref !== '') lines.push(`  ref: ${result.ref}`);
    } else if (result.kind === 'updated') {
      lines.push(
        `Updated ${result.slug}${result.head === undefined ? '' : ` to ${sha7(result.head)}`}.`,
      );
    } else {
      lines.push(`${result.slug} is present.`);
    }
    if (options.verbose) {
      if (result.origin !== undefined && result.origin !== '') {
        lines.push(`  origin: ${result.origin}`);
      }
      if (result.upstream !== undefined && result.upstream !== '') {
        lines.push(`  upstream: ${result.upstream}`);
      }
      lines.push(`  path: ${relativeClone(result.slug)}`);
    }
    return lines.join('\n');
  }
  if (!options.verbose) return result.message;
  const detail: Array<string> = [];
  if (result.origin !== undefined && result.origin !== '') detail.push(`origin=${result.origin}`);
  if (result.upstream !== undefined && result.upstream !== '') {
    detail.push(`upstream=${result.upstream}`);
  }
  detail.push(`path=${relativeClone(result.slug)}`);
  return `${result.message} ${detail.join(' ')}`;
};

/**
 * Every `update --all` result plus the summary line.
 * @param report - report from `engines.updateAll`
 * @param options - output modes
 * @returns the rendered report
 */
export const updatedAll = (
  report: Engines.UpdateAllReport,
  options: RenderOptions = AGENT,
): string => {
  if (options.human) {
    const body = report.entries.map((entry) => [
      updateFailed(entry.result) ? '✗' : '✓',
      entry.slug,
      withoutPrefix(entry.result.message, `${entry.result.kind} ${entry.slug}`),
      options.verbose ? relativeClone(entry.slug) : '',
    ]);
    const headers = options.verbose
      ? ['STATE', 'SLUG', 'RESULT', 'PATH']
      : ['STATE', 'SLUG', 'RESULT'];
    return [
      table(
        headers,
        body.map((row) => (options.verbose ? row : row.slice(0, 3))),
      ),
      report.summary,
    ].join('\n');
  }
  const lines = report.entries.map((entry) => updated(entry.result, options));
  lines.push(report.summary);
  return lines.join('\n');
};

/**
 * One `sync` run plus its summary line.
 * @param report - report from `engines.sync`
 * @param options - output modes
 * @returns the rendered report
 */
export const synced = (report: Git.SyncReport, options: RenderOptions = AGENT): string => {
  const total = report.entries.length;
  const kinds = (kind: Git.SyncEntry['kind']): number =>
    report.entries.filter((entry) => entry.kind === kind).length;
  const summary = `summary total=${total} created=${kinds('created')} updated=${kinds('updated')} ok=${kinds('ok')} skipped=${kinds('skipped')} failed=${kinds('failed')}`;
  if (options.human) {
    const body = report.entries.map((entry) => [
      markOf(entry.kind === 'created' || entry.kind === 'updated' ? 'ok' : entry.kind),
      entry.kind,
      entry.slug,
      withoutPrefix(entry.message, `${entry.kind} ${entry.slug}`),
      options.verbose ? relativeClone(entry.slug) : '',
      options.verbose ? sha7(entry.head) : '',
    ]);
    const headers = options.verbose
      ? ['STATE', 'KIND', 'SLUG', 'DETAIL', 'PATH', 'HEAD']
      : ['STATE', 'KIND', 'SLUG', 'DETAIL'];
    return [
      table(
        headers,
        body.map((row) => (options.verbose ? row : row.slice(0, 4))),
      ),
      summary,
    ].join('\n');
  }
  const lines = report.entries.map((entry) => {
    if (!options.verbose) return entry.message;
    const detail = [`path=${relativeClone(entry.slug)}`];
    if (entry.head !== undefined && entry.head !== '') detail.push(`head=${sha7(entry.head)}`);
    return `${entry.message} ${detail.join(' ')}`;
  });
  lines.push(summary);
  return lines.join('\n');
};

/**
 * One `status` run: one row per entry with its state, then the summary line.
 * `--verbose` appends `path=`, `origin=`, `head=`, and `upstream=`.
 * @param report - report from `engines.status`
 * @param options - output modes
 * @returns the rendered report
 */
export const status = (report: Git.StatusReport, options: RenderOptions = AGENT): string => {
  if (options.human) {
    const headers = ['STATE', 'SLUG', 'DETAIL'];
    if (options.verbose) headers.push('PATH', 'ORIGIN', 'HEAD', 'UPSTREAM');
    const body = report.rows.map((row) => {
      const cells = [
        markOf(row.state),
        row.state,
        row.slug,
        withoutPrefix(row.message, `${row.state} ${row.slug}`),
      ];
      if (options.verbose) {
        cells.push(row.path ?? `-`, row.origin ?? '-', sha7(row.head), row.upstream ?? '-');
      }
      return cells;
    });
    const humanHeaders = options.verbose
      ? ['MARK', 'STATE', 'SLUG', 'DETAIL', 'PATH', 'ORIGIN', 'HEAD', 'UPSTREAM']
      : ['MARK', 'STATE', 'SLUG', 'DETAIL'];
    const failures = report.rows.flatMap((row) =>
      row.failure === undefined ? [] : [row.failure.message],
    );
    return [table(humanHeaders, body), ...failures, report.summary].join('\n');
  }
  const lines: Array<string> = [];
  for (const row of report.rows) {
    if (!options.verbose) {
      lines.push(row.message);
    } else {
      const detail = [`path=${row.path ?? relativeClone(row.slug)}`];
      if (row.origin !== undefined && row.origin !== '') detail.push(`origin=${row.origin}`);
      if (row.head !== undefined && row.head !== '') detail.push(`head=${sha7(row.head)}`);
      if (row.upstream !== undefined && row.upstream !== '') {
        detail.push(`upstream=${row.upstream}`);
      }
      lines.push(`${row.message} ${detail.join(' ')}`);
    }
    if (row.failure !== undefined) lines.push(row.failure.message);
  }
  lines.push(report.summary);
  return lines.join('\n');
};

/**
 * One `remove` result.
 * @param result - result from `engines.remove`
 * @param options - output modes
 * @returns the rendered result
 */
export const removed = (result: Engines.RemoveResult, options: RenderOptions = AGENT): string => {
  if (options.human) {
    const lines = [
      result.keptClone ? `Removed ${result.slug}; clone kept.` : `Removed ${result.slug}.`,
    ];
    if (options.verbose) lines.push(`  path: ${result.path}`);
    return lines.join('\n');
  }
  return options.verbose ? `${result.message} path=${result.path}` : result.message;
};

/** Every glyph the agent default must never print. Exposed for the renderer test. */
export const HUMAN_ONLY_GLYPHS: ReadonlyArray<string> = VERIFY_GLYPHS;
