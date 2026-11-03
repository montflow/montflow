import { type Issue, type Result, issue, noErrors } from '../verify/index.js';
import { TASK_ID_PATTERN } from '../task/index.js';

// ─── Patterns ─────────────────────────────────────────────────────────

/**
 * Entry grammar: `<ISO 8601 timestamp> · from <task-id|phase-id|orchestrator> · to <all|<task-id>|<role>> · <message>`
 */
const ENTRY_PATTERN = /^(.+?) · from (.+?) · to (.+?) · (.+)$/;

// ─── Types ────────────────────────────────────────────────────────────

/** Parsed board/mailbox entry. */
export interface Entry {
  readonly timestamp: string;
  readonly from: string;
  readonly to: string;
  readonly message: string;
}

// ─── Parsing ──────────────────────────────────────────────────────────

/**
 * Parse a single entry line.
 * @param line - entry line
 * @returns parsed entry or undefined if malformed
 */
export const parseEntry = (line: string): Entry | undefined => {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return undefined;
  const match = ENTRY_PATTERN.exec(trimmed);
  if (match === null) return undefined;
  const timestamp = match[1];
  const from = match[2];
  const to = match[3];
  const message = match[4];
  if (timestamp === undefined || from === undefined || to === undefined || message === undefined) {
    return undefined;
  }
  return {
    timestamp: timestamp.trim(),
    from: from.trim(),
    to: to.trim(),
    message: message.trim(),
  };
};

/**
 * Parse all entries from board/mailbox content.
 * @param markdown - file contents
 * @returns parsed entries
 */
export const parseEntries = (markdown: string): ReadonlyArray<Entry> => {
  const entries: Array<Entry> = [];
  for (const line of markdown.split(/\r?\n/)) {
    const entry = parseEntry(line);
    if (entry !== undefined) {
      entries.push(entry);
    }
  }
  return entries;
};

// ─── Verification ─────────────────────────────────────────────────────

/**
 * Check if an addressee is valid.
 * Valid: `all`, a task id, a phase id (single/double letter), `orchestrator`, or a role slug.
 */
const isValidAddressee = (addressee: string): boolean => {
  if (addressee === 'all') return true;
  if (addressee === 'orchestrator') return true;
  // task id
  if (TASK_ID_PATTERN.test(addressee)) return true;
  // phase id (single or two uppercase letters)
  if (/^[A-Z]{1,2}$/.test(addressee)) return true;
  // role slug (kebab case)
  if (/^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/.test(addressee)) return true;
  return false;
};

/**
 * Check if a sender is valid.
 */
const isValidSender = (sender: string): boolean => {
  if (sender === 'orchestrator') return true;
  if (TASK_ID_PATTERN.test(sender)) return true;
  if (/^[A-Z]{1,2}$/.test(sender)) return true;
  if (/^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/.test(sender)) return true;
  return false;
};

/**
 * Mechanically verify a BOARD.md or MAILBOX.md file.
 * @param markdown - raw file contents
 * @param knownTaskIds - set of known task ids for validation
 * @param knownPhaseIds - set of known phase ids for validation
 * @returns the result
 */
export const verifyBoardFile = (
  markdown: string,
  knownTaskIds: ReadonlySet<string> = new Set(),
  knownPhaseIds: ReadonlySet<string> = new Set(),
): Result => {
  const issues: Array<Issue> = [];
  const lines = markdown.split(/\r?\n/);
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber++;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const match = ENTRY_PATTERN.exec(trimmed);
    if (match === null) {
      issues.push(
        issue(
          'entry',
          'Malformed entry. Expected format: `<ISO 8601 timestamp> · from <sender> · to <addressee> · <message>`',
          undefined,
          lineNumber,
        ),
      );
      continue;
    }

    const from = match[2];
    const to = match[3];
    if (from === undefined || to === undefined) {
      issues.push(
        issue(
          'entry',
          'Malformed entry. Expected format: `<ISO 8601 timestamp> · from <sender> · to <addressee> · <message>`',
          undefined,
          lineNumber,
        ),
      );
      continue;
    }
    const fromTrimmed = from.trim();
    const toTrimmed = to.trim();

    if (!isValidSender(fromTrimmed)) {
      issues.push(issue('from', `Unknown sender '${fromTrimmed}'`, undefined, lineNumber));
      continue;
    }

    if (!isValidAddressee(toTrimmed)) {
      issues.push(issue('to', `Unknown addressee '${toTrimmed}'`, undefined, lineNumber));
      continue;
    }

    // If we have known IDs, validate against them for stricter checking
    if (
      toTrimmed !== 'all' &&
      toTrimmed !== 'orchestrator' &&
      !/^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/.test(toTrimmed)
    ) {
      if (TASK_ID_PATTERN.test(toTrimmed)) {
        if (knownTaskIds.size > 0 && !knownTaskIds.has(toTrimmed)) {
          issues.push(issue('to', `Unknown addressee '${toTrimmed}'`, undefined, lineNumber));
        }
      } else if (/^[A-Z]{1,2}$/.test(toTrimmed)) {
        if (knownPhaseIds.size > 0 && !knownPhaseIds.has(toTrimmed)) {
          issues.push(issue('to', `Unknown addressee '${toTrimmed}'`, undefined, lineNumber));
        }
      }
    }
  }

  return { valid: noErrors(issues), issues };
};

export { verifyBoardFile as verifyMailboxFile };
