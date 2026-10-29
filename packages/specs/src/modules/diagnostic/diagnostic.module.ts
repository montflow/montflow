import type { LayerTrace } from '../verify/index.js';

/**
 * The one agent-first diagnostic shape: what failed, where, and how to repair
 * it. Every surface that prints a coded failure — the CLI, a slash form, the
 * host tools, and the skill advisories appended to a rendered prompt — renders
 * through {@link renderDiagnostic}, so the labels never drift apart.
 */
export interface DiagnosticBlock {
  /** Stable, greppable failure class. */
  readonly code: string;
  /** File, spec, or `spec/task` that carries the failure. */
  readonly path: string;
  /** Field inside that path. */
  readonly field: string;
  /** What is wrong. */
  readonly problem: string;
  /** What the contract requires, when naming it helps. */
  readonly expected?: string | undefined;
  /** What the file actually holds, when naming it helps. */
  readonly actual?: string | undefined;
  /** Concrete edit or command that repairs the failure. */
  readonly fix?: string | undefined;
  /** Preserved cause, rendered as a chain only under `verbose`. */
  readonly cause?: unknown;
  /** Precedence layers a sizing finding consulted; rendered under `verbose`. */
  readonly layers?: LayerTrace | undefined;
  /** Stack of an unexpected defect; rendered only under `verbose`. */
  readonly stack?: string | undefined;
  /** True when the finding is advisory rather than fatal. */
  readonly warning?: boolean | undefined;
  /** Command to re-run once the failure is repaired. */
  readonly next: string;
}

/** Label column width across every diagnostic field. */
const LABEL_WIDTH = 8;

/**
 * One link of a cause chain, as text, or undefined when it has no message.
 * @param cause - the preserved cause
 * @returns the message, or undefined for an empty value
 */
export const causeMessage = (cause: unknown): string | undefined => {
  if (cause instanceof Error) return cause.message === '' ? undefined : cause.message;
  if (cause === undefined || cause === null) return undefined;
  const text = String(cause);
  return text === '' ? undefined : text;
};

/** The wrapped cause followed by each nested `cause`, linked with ` <- `. */
const causeChain = (cause: unknown): string => {
  const messages: Array<string> = [];
  const seen = new Set<unknown>();
  let current: unknown = cause;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    const message = causeMessage(current);
    if (message !== undefined) messages.push(message);
    current = current instanceof Error ? current.cause : undefined;
  }
  return messages.length === 0 ? String(cause) : messages.join(' <- ');
};

/** Render a layer trace: which layers were consulted, and which supplied the finding. */
const layerText = (trace: LayerTrace): string => {
  const parts = [`consulted ${trace.consulted.join(',')}`];
  if (trace.layer !== undefined) parts.push(`layer ${trace.layer}`);
  if (trace.phase !== undefined) parts.push(`phase ${trace.phase}`);
  return parts.join(' \u00b7 ');
};

/** Pairs of label and value a diagnostic prints, in canonical order. */
const diagnosticRows = (
  found: DiagnosticBlock,
  verbose: boolean,
): ReadonlyArray<readonly [string, string]> => {
  const rows: Array<readonly [string, string]> = [
    ['code', found.warning === true ? `! ${found.code}` : found.code],
    ['path', found.path],
    ['field', found.field],
    ['problem', found.problem],
  ];
  if (found.expected !== undefined) rows.push(['expected', found.expected]);
  if (found.actual !== undefined) rows.push(['actual', found.actual]);
  if (found.fix !== undefined) rows.push(['fix', found.fix]);
  // `verbose` is the only switch over the diagnostic's detail rows, so
  // `check --verbose`, `status --verbose`, and `execute --verbose` add the
  // same rows for the same field and the default output adds none of them.
  if (verbose && found.cause !== undefined) rows.push(['cause', causeChain(found.cause)]);
  if (verbose && found.layers !== undefined) rows.push(['layers', layerText(found.layers)]);
  if (verbose && found.stack !== undefined) rows.push(['stack', found.stack]);
  rows.push(['next', found.next]);
  return rows;
};

/**
 * Render one diagnostic, one labelled line per field. A labelled block stays
 * greppable and never echoes a thrown exception or raw JSON.
 * @param found - the diagnostic
 * @param verbose - add the cause chain, layer trace, and stack; the default
 *   block carries only the failing value and its repair
 * @returns the display text
 */
export const renderDiagnostic = (found: DiagnosticBlock, verbose = false): string =>
  diagnosticRows(found, verbose)
    .map(([label, value]) => `${label.padEnd(LABEL_WIDTH)} ${value}`)
    .join('\n');

/**
 * Render several diagnostics, separated by a blank line.
 * @param diagnostics - the diagnostics, in discovery order
 * @param verbose - add causes, layer traces, and stacks to every block
 * @returns the display text
 */
export const renderDiagnostics = (
  diagnostics: ReadonlyArray<DiagnosticBlock>,
  verbose = false,
): string => diagnostics.map((found) => renderDiagnostic(found, verbose)).join('\n\n');
