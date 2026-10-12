import { Schema } from 'effect';
import * as ReceiptSchema from '../receipt/receipt.module.ts';
import * as SessionSchema from '../session/session.module.ts';
import * as SessionEventSchema from '../session-event/session-event.module.ts';
import { Replay } from '../replay/index.js';

/**
 * Mechanical session verification: a pure check over a session's raw files plus the
 * store's git-ignore guard, mirroring the profile/spec verifiers. `valid`
 * means the session is well-formed; `resumable` means it can be replayed on
 * another machine. Invalid or non-resumable sessions must refuse to resume.
 */

/** One verification failure, scoped to a field. */
export interface VerifyIssue {
  readonly field: string;
  readonly message: string;
}

/** Verification verdict for one session. */
export interface VerifyResult {
  readonly valid: boolean;
  readonly resumable: boolean;
  readonly issues: ReadonlyArray<VerifyIssue>;
}

/** Raw session files to verify. */
export interface VerifyInput {
  readonly id: string;
  readonly sessionMd: string;
  readonly session: string;
  readonly receipt: string | undefined;
}

/** Verdict for the sessions store's git-ignore guard. */
export interface StoreIgnoreResult {
  /** True when the repo ignores the sessions store, keeping transcripts local. */
  readonly ignored: boolean;
  readonly issues: ReadonlyArray<VerifyIssue>;
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
 * Verify one session's raw files: descriptor, transcript ordering, receipt
 * consistency, and resumability.
 * @param input - raw `session.md`, `session.jsonl`, and optional `receipt.md`
 * @returns verdict with per-field issues
 */
export const verifySession = (input: VerifyInput): VerifyResult => {
  const issues: Array<VerifyIssue> = [];

  let session: SessionSchema.Session | undefined;
  const sessionJson = frontmatter(input.sessionMd);
  if (sessionJson === undefined) {
    issues.push(issue('session.md', 'Missing frontmatter block.'));
  } else {
    try {
      session = Schema.decodeUnknownSync(SessionSchema.Session)(JSON.parse(sessionJson));
    } catch {
      issues.push(issue('session.md', 'Frontmatter is not a valid session descriptor.'));
    }
  }
  if (session !== undefined && session.id !== input.id) {
    issues.push(issue('session.id', `'${session.id}' does not match directory '${input.id}'.`));
  }

  const events: Array<SessionEventSchema.Event> = [];
  const lines = input.session.split('\n').filter((line) => line.trim() !== '');
  lines.forEach((line, index) => {
    try {
      const event = Schema.decodeUnknownSync(SessionEventSchema.Event)(JSON.parse(line));
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

  if (session !== undefined) {
    const terminal = TERMINAL.has(session.status);
    if (terminal && receipt === undefined) {
      issues.push(issue('receipt', `Status '${session.status}' requires a receipt.`));
    }
    if (!terminal && receipt !== undefined) {
      issues.push(issue('status', `Receipt present but status is '${session.status}'.`));
    }
    if (receipt !== undefined && receipt.outcome !== session.status) {
      issues.push(
        issue('receipt.outcome', `'${receipt.outcome}' does not match status '${session.status}'.`),
      );
    }
    if (receipt !== undefined && receipt.sessionId !== input.id) {
      issues.push(
        issue('receipt.sessionId', `'${receipt.sessionId}' does not match session '${input.id}'.`),
      );
    }
  }

  const resumable =
    issues.length === 0 &&
    session !== undefined &&
    receipt === undefined &&
    (session.status === 'running' || session.status === 'awaiting-input') &&
    Replay.canReplay(events);

  return { valid: issues.length === 0, resumable, issues };
};

/**
 * Verify the repo ignores the sessions store so transcripts stay local and out of
 * git. The last matching rule wins, so a rule that is commented out (or later
 * re-enabled with `!`) does not count as ignored. Pure — the session runner reads
 * `.gitignore` and calls this.
 * @param gitignore - contents of the repo `.gitignore` (empty when absent)
 * @param sessionsPath - repo-relative sessions store path, e.g. `.agents/@montflow/sessions`
 * @returns verdict with a `.gitignore` issue when the path is not ignored
 */
export const verifyStoreIgnored = (gitignore: string, sessionsPath: string): StoreIgnoreResult => {
  const normalized = sessionsPath.replace(/^\.\//, '').replace(/\/+$/, '');
  let ignored = false;
  for (const raw of gitignore.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const negated = line.startsWith('!');
    const body = negated ? line.slice(1) : line;
    const pattern = body
      .replace(/\/\*\*$/, '')
      .replace(/\/+$/, '')
      .replace(/^\.\//, '');
    if (pattern === normalized || pattern === `/${normalized}`) ignored = !negated;
  }
  if (ignored) return { ignored: true, issues: [] };
  return {
    ignored: false,
    issues: [
      issue(
        '.gitignore',
        `sessions path '${normalized}' is not ignored; transcripts would be git-tracked.`,
      ),
    ],
  };
};
