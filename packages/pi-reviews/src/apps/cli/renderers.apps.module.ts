import * as Review from '../../modules/review/index.js';
import * as Doctor from '../doctor/index.js';
import type * as Engines from './engines.apps.module.js';

/**
 * Pure `data -> text` renderers, one per engine result. Same contract as the
 * other pi-* CLIs: token-lean by default, `--verbose` adds and never removes,
 * failures are never suppressed, and no ANSI or colour (the output is piped,
 * captured, and diffed).
 */

/** One-line usage summary. */
export const USAGE = `mf-reviews — inspect, verify, and scaffold review series.

Usage:
  mf-reviews doctor [--check] [--verbose]
  mf-reviews list [--verbose] [--dir <path>]
  mf-reviews show <name> [--round <NNN>] [--dir <path>]
  mf-reviews verify <name>|<--all> [--dir <path>] [--verbose]
  mf-reviews create <name> [--target <text>] [--profile <name>] [--round <NNN>] [--dir <path>]
  mf-reviews resume <name> [--dir <path>]

A series lives at .agents/@montflow/reviews/<name>/ with a REVIEW.md ledger and
one directory per round (001/, 002/, …), each holding a REVIEW.md.`;

/** How much detail to print. */
export interface Verbosity {
  readonly verbose: boolean;
}

/**
 * Stored review series. Lean prints one status line per series; verbose adds a
 * line per round.
 * @param series - summaries from `engines.list`
 * @param options - verbosity
 * @returns the rendered list
 */
export const list = (
  series: ReadonlyArray<Engines.SeriesSummary>,
  options: Verbosity = { verbose: false },
): string => {
  if (series.length === 0) {
    return 'No review series yet. Create one with: mf-reviews create <name>';
  }
  return series
    .map((entry) => {
      const rounds = `${entry.rounds.length} round${entry.rounds.length === 1 ? '' : 's'}`;
      const head = `${entry.name}  ${entry.status} · ${rounds} · ${entry.open} open`;
      if (!options.verbose) return head;
      const detail = entry.rounds.map(
        (round) =>
          `  ${round.round}: ${round.status} · ${round.findings} finding(s) · ${round.open} open`,
      );
      return [
        head,
        `  target: ${entry.target === '' ? '(unknown)' : entry.target}`,
        ...detail,
      ].join('\n');
    })
    .join('\n');
};

/**
 * A single-series verification report: one block per failing file, a one-line
 * pass when everything is clean, and any warnings. `⚠` lines never fail the run.
 * @param report - report from `engines.verifySeries`
 * @param options - verbosity; verbose also shows passing files
 * @returns the rendered report
 */
export const verify = (
  report: Engines.VerifySeriesReport,
  options: Verbosity = { verbose: false },
): string => {
  const entries = report.entries;
  const shown = options.verbose ? entries : entries.filter((entry) => !entry.result.valid);
  const failures = entries.filter((entry) => !entry.result.valid);
  const blocks =
    failures.length === 0
      ? [`✓ ${entries.length} review file${entries.length === 1 ? '' : 's'} verified.`]
      : shown.map((entry) => Review.verifyReport(entry.path, entry.result));
  for (const warning of report.warnings) blocks.push(`⚠ ${warning}`);
  return blocks.join('\n\n');
};

/**
 * A whole-store verification report. Failures are never suppressed; a passing
 * file appears only under `verbose`. Warnings (`⚠`) never fail the run.
 * @param report - report from `engines.verifyAll`
 * @param options - verbosity
 * @returns the display text
 */
export const verifyAll = (
  report: Engines.VerifyAllReport,
  options: Verbosity = { verbose: false },
): string => {
  const lines: Array<string> = [];
  for (const entry of report.entries) {
    if (entry.result.valid && !options.verbose) continue;
    lines.push(Review.verifyReport(entry.path, entry.result));
  }
  if (report.entries.length === 0) lines.push('No review series yet.');
  for (const warning of report.warnings) lines.push(`⚠ ${warning}`);
  lines.push(
    `${report.entries.length} file${report.entries.length === 1 ? '' : 's'} \u00b7 ${report.issueCount} issue${report.issueCount === 1 ? '' : 's'}`,
  );
  return lines.join('\n');
};

/** A series round was scaffolded. */
export const created = (result: Engines.ScaffoldResult): string =>
  [
    `Created review round '${result.round}' in series '${result.name}'.`,
    `  round:  ${result.roundPath}`,
    `  ledger: ${result.ledgerPath}`,
  ].join('\n');

/**
 * Where an in-flight review left off: series state and the file to open next.
 * @param result - result from `engines.resume`
 * @returns the continuation report
 */
export const resumed = (result: Engines.ResumeResult): string => {
  const rounds = `${result.rounds.length} round${result.rounds.length === 1 ? '' : 's'}`;
  const lines = [
    `Review series '${result.name}' — ${result.status} · ${rounds} · ${result.open} open`,
    `  latest: ${result.latest}${result.latestRound === undefined ? ' (ledger)' : ''}`,
  ];
  if (result.target !== '') lines.push(`  target: ${result.target}`);
  return lines.join('\n');
};

/** The full doctor report, one line per skill. */
export const doctor = (result: Doctor.DoctorResult): string => Doctor.doctorMessage(result);

/** The two-line gate message an execution stops on. */
export const gate = (result: Doctor.DoctorResult, invocation = '/mf-reviews doctor'): string =>
  Doctor.doctorGateMessage(result, invocation);
