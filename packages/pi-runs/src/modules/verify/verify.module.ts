import { Schema } from 'effect';
import * as ReceiptSchema from '../receipt/receipt.module.ts';
import * as RunSchema from '../run/run.module.ts';
import * as RunEventSchema from '../run-event/run-event.module.ts';
import { Replay } from '../replay/index.js';

/**
 * Mechanical run verification: a pure check over a run's raw files, mirroring
 * the profile/feature verifiers. `valid` means the run is well-formed;
 * `resumable` means it can be replayed on another machine. Invalid or
 * non-resumable runs must refuse to resume.
 */

/** One verification failure, scoped to a field. */
export interface VerifyIssue {
  readonly field: string;
  readonly message: string;
}

/** Verification verdict for one run. */
export interface VerifyResult {
  readonly valid: boolean;
  readonly resumable: boolean;
  readonly issues: ReadonlyArray<VerifyIssue>;
}

/** Raw run files to verify. */
export interface VerifyInput {
  readonly id: string;
  readonly runMd: string;
  readonly session: string;
  readonly receipt: string | undefined;
}

/** Terminal statuses that require a receipt. */
const TERMINAL = new Set(['done', 'failed', 'cancelled']);

const issue = (field: string, message: string): VerifyIssue => ({ field, message });

/** Extract the JSON frontmatter block, or undefined when malformed. */
const frontmatter = (markdown: string): string | undefined => {
  const lines = markdown.split('\n');
  if (lines[0] !== '---') return undefined;
  const end = lines.indexOf('---', 1);
  if (end === -1) return undefined;
  return lines.slice(1, end).join('\n');
};

/**
 * Verify one run's raw files: descriptor, transcript ordering, receipt
 * consistency, and resumability.
 * @param input - raw `run.md`, `session.jsonl`, and optional `receipt.md`
 * @returns verdict with per-field issues
 */
export const verifyRun = (input: VerifyInput): VerifyResult => {
  const issues: Array<VerifyIssue> = [];

  let run: RunSchema.Run | undefined;
  const runJson = frontmatter(input.runMd);
  if (runJson === undefined) {
    issues.push(issue('run.md', 'Missing frontmatter block.'));
  } else {
    try {
      run = Schema.decodeUnknownSync(RunSchema.Run)(JSON.parse(runJson));
    } catch {
      issues.push(issue('run.md', 'Frontmatter is not a valid run descriptor.'));
    }
  }
  if (run !== undefined && run.id !== input.id) {
    issues.push(issue('run.id', `'${run.id}' does not match directory '${input.id}'.`));
  }

  const events: Array<RunEventSchema.Event> = [];
  const lines = input.session.split('\n').filter((line) => line.trim() !== '');
  lines.forEach((line, index) => {
    try {
      const event = Schema.decodeUnknownSync(RunEventSchema.Event)(JSON.parse(line));
      if (event.seq !== index + 1) {
        issues.push(issue('session.seq', `line ${index + 1} has seq ${event.seq}.`));
      }
      if (event.message !== undefined && !Replay.isReplayMessage(event.message)) {
        issues.push(
          issue('session.message', `line ${index + 1} has a raw message that is not a Pi message.`),
        );
      }
      events.push(event);
    } catch {
      issues.push(issue('session', `line ${index + 1} is not a valid event.`));
    }
  });

  let receipt: ReceiptSchema.Receipt | undefined;
  if (input.receipt !== undefined) {
    const receiptJson = frontmatter(input.receipt);
    if (receiptJson === undefined) {
      issues.push(issue('receipt.md', 'Missing frontmatter block.'));
    } else {
      try {
        receipt = Schema.decodeUnknownSync(ReceiptSchema.Receipt)(JSON.parse(receiptJson));
      } catch {
        issues.push(issue('receipt.md', 'Frontmatter is not a valid receipt.'));
      }
    }
  }

  if (run !== undefined) {
    const terminal = TERMINAL.has(run.status);
    if (terminal && receipt === undefined) {
      issues.push(issue('receipt', `Status '${run.status}' requires a receipt.`));
    }
    if (!terminal && receipt !== undefined) {
      issues.push(issue('status', `Receipt present but status is '${run.status}'.`));
    }
    if (receipt !== undefined && receipt.outcome !== run.status) {
      issues.push(
        issue('receipt.outcome', `'${receipt.outcome}' does not match status '${run.status}'.`),
      );
    }
    if (receipt !== undefined && receipt.runId !== input.id) {
      issues.push(issue('receipt.runId', `'${receipt.runId}' does not match run '${input.id}'.`));
    }
  }

  const resumable =
    issues.length === 0 &&
    run !== undefined &&
    receipt === undefined &&
    (run.status === 'running' || run.status === 'awaiting-input') &&
    Replay.canReplay(events);

  return { valid: issues.length === 0, resumable, issues };
};
