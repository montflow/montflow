import { ORCHESTRATOR } from '../claim/index.js';
import { ISO_INSTANT_SOURCE } from '../stamp/index.js';
import { TASK_ID_PATTERN } from '../task/index.js';
import { type Issue, type Result, finding, noErrors } from '../verify/index.js';

/** Phase broadcast file, one per phase directory. */
export const BOARD_FILE = 'BOARD.md';

/** Task targeted mailbox file, one per task directory. */
export const MAILBOX_FILE = 'MAILBOX.md';

/** Which channel a file is. */
export const CHANNEL_KINDS = ['board', 'mailbox'] as const;

/** Which channel a file is. */
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/** The board's only legal addressee. */
export const BROADCAST = 'all';

/** The middle-dot separator every entry heading carries. */
export const ENTRY_SEPARATOR = '\u00b7';

/** A task-id author or addressee. */
const TASK_OR_ORCHESTRATOR = `(?:[A-Z]{1,2}\\d{3}|${ORCHESTRATOR})`;

/**
 * One entry heading, exactly B004 F8's grammar:
 * `## <instant> · from <task-id|orchestrator> · to <all|task-id>`.
 */
export const CHANNEL_ENTRY_PATTERN = new RegExp(
  `^##\\s+(${ISO_INSTANT_SOURCE})\\s+${ENTRY_SEPARATOR}\\s+from\\s+(${TASK_OR_ORCHESTRATOR})\\s+${ENTRY_SEPARATOR}\\s+to\\s+(all|[A-Z]{1,2}\\d{3})\\s*$`,
);

/** Stable codes for the board and mailbox rules. */
export const CHANNEL_CODES = {
  boardMalformedTitle: 'board.malformed-title',
  boardMalformedEntry: 'board.malformed-entry',
  boardEmptyEntry: 'board.empty-entry',
  boardOutOfOrder: 'board.out-of-order',
  boardTargetInvalid: 'board.target-invalid',
  boardUnknownAuthor: 'board.unknown-author',
  boardStrayContent: 'board.stray-content',
  mailMalformedTitle: 'mail.malformed-title',
  mailMalformedEntry: 'mail.malformed-entry',
  mailEmptyEntry: 'mail.empty-entry',
  mailOutOfOrder: 'mail.out-of-order',
  mailUnknownSender: 'mail.unknown-sender',
  mailUnknownRecipient: 'mail.unknown-recipient',
  mailRecipientMismatch: 'mail.recipient-mismatch',
  mailSelfAddressed: 'mail.self-addressed',
  mailStrayContent: 'mail.stray-content',
  mailNotOrchestrator: 'mail.not-orchestrator',
  mailSteerFailed: 'mail.steer-failed',
  mailWriteFailed: 'mail.write-failed',
} as const;

/** The code family one channel kind uses. */
const codesOf = (kind: ChannelKind) =>
  kind === 'board'
    ? {
        malformedTitle: CHANNEL_CODES.boardMalformedTitle,
        malformedEntry: CHANNEL_CODES.boardMalformedEntry,
        emptyEntry: CHANNEL_CODES.boardEmptyEntry,
        outOfOrder: CHANNEL_CODES.boardOutOfOrder,
        targetInvalid: CHANNEL_CODES.boardTargetInvalid,
        unknownAuthor: CHANNEL_CODES.boardUnknownAuthor,
        strayContent: CHANNEL_CODES.boardStrayContent,
      }
    : {
        malformedTitle: CHANNEL_CODES.mailMalformedTitle,
        malformedEntry: CHANNEL_CODES.mailMalformedEntry,
        emptyEntry: CHANNEL_CODES.mailEmptyEntry,
        outOfOrder: CHANNEL_CODES.mailOutOfOrder,
        targetInvalid: CHANNEL_CODES.mailUnknownRecipient,
        unknownAuthor: CHANNEL_CODES.mailUnknownSender,
        strayContent: CHANNEL_CODES.mailStrayContent,
      };

/** The file name a channel kind lives in. */
export const channelFile = (kind: ChannelKind): string =>
  kind === 'board' ? BOARD_FILE : MAILBOX_FILE;

/** The required level-1 title for a channel file. */
export const channelTitle = (kind: ChannelKind): string =>
  kind === 'board' ? '# Board' : '# Mailbox';

/** One parsed entry: the four grammar fields plus its heading line. */
export interface ChannelEntry {
  /** UTC instant from the heading. */
  readonly at: string;
  /** Author: a task id or {@link ORCHESTRATOR}. */
  readonly from: string;
  /** `all` on a board, a task id on a mailbox. */
  readonly to: string;
  /** Every line between this heading and the next, trimmed. */
  readonly body: string;
  /** 1-based heading line in the file. */
  readonly line: number;
}

/** Parsing result: entries plus every grammar finding. */
export interface ChannelParse {
  readonly entries: ReadonlyArray<ChannelEntry>;
  readonly issues: ReadonlyArray<Issue>;
}

/** Everything the verifier needs to judge an addressee. */
export interface ChannelContext {
  /** Every task id declared in the spec, in any phase. */
  readonly taskIds: ReadonlySet<string>;
  /** The task that owns a mailbox, when the channel is a mailbox. */
  readonly owner?: string | undefined;
}

/** A channel finding under construction, so optional fields stay absent. */
interface ChannelIssueInput {
  code: string;
  field: string;
  message: string;
  line: number;
  expected?: string;
  actual?: string;
  fix?: string;
}

/** Build one channel finding, naming its line in both `field` and `message`. */
const channelFinding = (input: {
  readonly code: string;
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly expected?: string | undefined;
  readonly actual?: string | undefined;
  readonly fix?: string | undefined;
}): Issue => {
  const found: ChannelIssueInput = {
    code: input.code,
    field: `${input.file}:${input.line}`,
    message: `${input.message} (line ${input.line})`,
    line: input.line,
  };
  if (input.expected !== undefined) found.expected = input.expected;
  if (input.actual !== undefined) found.actual = input.actual;
  if (input.fix !== undefined) found.fix = input.fix;
  return finding(found);
};

/** One entry being assembled, before its body is validated. */
interface OpenEntry {
  readonly at: string;
  readonly from: string;
  readonly to: string;
  readonly line: number;
  readonly body: Array<string>;
}

/**
 * Parse one board or mailbox into its entries, rejecting every shape the
 * grammar does not allow. Every finding names the offending line. Pure — the
 * caller supplies the content.
 * @param kind - board or mailbox
 * @param content - raw file contents
 * @returns the valid entries and every grammar finding, in file order
 */
export const parseChannel = (kind: ChannelKind, content: string): ChannelParse => {
  const file = channelFile(kind);
  const codes = codesOf(kind);
  const lines = content.split(/\r?\n/);
  const entries: Array<ChannelEntry> = [];
  const issues: Array<Issue> = [];

  const firstContent = lines.findIndex((line) => line.trim() !== '');
  if (firstContent === -1) {
    issues.push(
      channelFinding({
        code: codes.malformedTitle,
        file,
        line: 1,
        message: `${file} is empty; it must begin with '${channelTitle(kind)}'.`,
        expected: channelTitle(kind),
        actual: 'empty file',
        fix: `Add '${channelTitle(kind)}' as the first line.`,
      }),
    );
    return { entries, issues };
  }
  const titleLine = (lines[firstContent] ?? '').trim();
  if (titleLine !== channelTitle(kind)) {
    issues.push(
      channelFinding({
        code: codes.malformedTitle,
        file,
        line: firstContent + 1,
        message: `${file} must begin with '${channelTitle(kind)}'.`,
        expected: channelTitle(kind),
        actual: titleLine,
        fix: `Make the first non-blank line '${channelTitle(kind)}'.`,
      }),
    );
    return { entries, issues };
  }

  let open: OpenEntry | undefined;
  let skipUntilNextHeading = false;

  const flush = (): void => {
    if (open === undefined) return;
    const body = open.body.join('\n').trim();
    if (body === '') {
      issues.push(
        channelFinding({
          code: codes.emptyEntry,
          file,
          line: open.line,
          message: `${kind === 'board' ? 'Board' : 'Mailbox'} entry has an empty body.`,
          expected: 'at least one non-blank line after the heading',
          actual: 'empty',
          fix: 'Write the message body below the entry heading.',
        }),
      );
    }
    entries.push({
      at: open.at,
      from: open.from,
      to: open.to,
      body,
      line: open.line,
    });
    open = undefined;
  };

  for (let index = firstContent + 1; index < lines.length; index++) {
    const raw = lines[index] ?? '';
    const line = index + 1;
    // A level-2 heading always ends the previous entry. A malformed one is
    // reported instead of being folded into body text, which would hide it.
    if (/^##\s/.test(raw)) {
      flush();
      skipUntilNextHeading = false;
      const match = CHANNEL_ENTRY_PATTERN.exec(raw);
      if (match === null) {
        issues.push(
          channelFinding({
            code: codes.malformedEntry,
            file,
            line,
            message: `${kind === 'board' ? 'Board' : 'Mailbox'} entry heading does not match '## <instant> \u00b7 from <task-id|orchestrator> \u00b7 to <${kind === 'board' ? 'all' : 'task-id'}>'.`,
            expected:
              '## 2026-11-02T21:15:00Z \u00b7 from <task-id|orchestrator> \u00b7 to <all|task-id>',
            actual: raw.trim(),
            fix: 'Write the entry with `mf-specs mail`; never hand-edit a channel entry.',
          }),
        );
        skipUntilNextHeading = true;
        continue;
      }
      open = {
        at: match[1] ?? '',
        from: match[2] ?? '',
        to: match[3] ?? '',
        line,
        body: [],
      };
      continue;
    }
    if (open !== undefined) {
      open.body.push(raw);
      continue;
    }
    if (skipUntilNextHeading) continue;
    if (raw.trim() === '') continue;
    issues.push(
      channelFinding({
        code: codes.strayContent,
        file,
        line,
        message: `${file} has content before its first entry.`,
        expected: `only '${channelTitle(kind)}' and blank lines before the first entry`,
        actual: raw.trim(),
        fix: 'Move the prose into an entry body, or remove it.',
      }),
    );
  }
  flush();

  let previous: ChannelEntry | undefined;
  for (const entry of entries) {
    if (previous !== undefined && entry.at < previous.at) {
      issues.push(
        channelFinding({
          code: codes.outOfOrder,
          file,
          line: entry.line,
          message: `Entry timestamp '${entry.at}' is earlier than the previous entry at line ${previous.line} ('${previous.at}').`,
          expected: 'entries in non-decreasing timestamp order',
          actual: entry.at,
          fix: 'Append entries with `mf-specs mail`; never insert an older one.',
        }),
      );
    } else if (previous === undefined || entry.at > previous.at) {
      previous = entry;
    }
  }

  return { entries, issues };
};

/**
 * Verify one channel against B004 F8, including its addressees. A board entry
 * must address `all` and its author must be a task in this spec or
 * `orchestrator`; a mailbox entry must address the task that owns the file and
 * name a known sender, never itself.
 * @param kind - board or mailbox
 * @param content - raw file contents
 * @param context - known task ids and, for a mailbox, its owner
 * @returns the result; `valid` is true only with zero issues
 */
export const verifyChannel = (
  kind: ChannelKind,
  content: string,
  context: ChannelContext,
): Result => {
  const file = channelFile(kind);
  const codes = codesOf(kind);
  const parsed = parseChannel(kind, content);
  const issues: Array<Issue> = [...parsed.issues];

  const known = (id: string): boolean => id === ORCHESTRATOR || context.taskIds.has(id);

  for (const entry of parsed.entries) {
    if (kind === 'board' && entry.to !== BROADCAST) {
      issues.push(
        channelFinding({
          code: codes.targetInvalid,
          file,
          line: entry.line,
          message: `Board entry addresses '${entry.to}'; a board entry must address '${BROADCAST}'.`,
          expected: `to ${BROADCAST}`,
          actual: entry.to,
          fix: 'Send targeted mail with `mf-specs mail --to <task-id>`.',
        }),
      );
    }
    if (!known(entry.from)) {
      issues.push(
        channelFinding({
          code: codes.unknownAuthor,
          file,
          line: entry.line,
          message: `${kind === 'board' ? 'Board author' : 'Mailbox sender'} '${entry.from}' is not a task in this spec and is not '${ORCHESTRATOR}'.`,
          expected: `a task id in this spec, or '${ORCHESTRATOR}'`,
          actual: entry.from,
          fix: 'Name an existing task id, or let `mf-specs mail` derive the orchestrator sender.',
        }),
      );
    }
    if (kind === 'mailbox') {
      if (!TASK_ID_PATTERN.test(entry.to) || !context.taskIds.has(entry.to)) {
        issues.push(
          channelFinding({
            code: codes.targetInvalid,
            file,
            line: entry.line,
            message: `Mailbox entry addresses unknown task '${entry.to}'; no task with that id exists in this spec.`,
            expected: 'a task id declared in this spec',
            actual: entry.to,
            fix: 'Address the task the mailbox belongs to.',
          }),
        );
      } else if (context.owner !== undefined && entry.to !== context.owner) {
        issues.push(
          channelFinding({
            code: CHANNEL_CODES.mailRecipientMismatch,
            file,
            line: entry.line,
            message: `Mailbox owned by '${context.owner}' holds an entry addressed to '${entry.to}'.`,
            expected: `to ${context.owner}`,
            actual: entry.to,
            fix: "Address the owning task, or write to that task's own mailbox.",
          }),
        );
      }
      if (entry.from === entry.to) {
        issues.push(
          channelFinding({
            code: CHANNEL_CODES.mailSelfAddressed,
            file,
            line: entry.line,
            message: `Mailbox entry from '${entry.from}' addresses itself.`,
            expected: 'a sender other than the addressee',
            actual: entry.from,
            fix: 'Targeted mail is sent by the orchestrator to a worker.',
          }),
        );
      }
    }
  }

  return { valid: noErrors(issues), issues };
};

/** Input for {@link renderChannelEntry}. */
export interface ChannelEntryInput {
  /** Instant from the stamping helper. */
  readonly at: string;
  /** Author: a task id or {@link ORCHESTRATOR}. */
  readonly from: string;
  /** `all` on a board, a task id on a mailbox. */
  readonly to: string;
  /** Message body; trimmed before it is written. */
  readonly text: string;
}

/**
 * Render one entry exactly as the grammar expects: heading, blank line, body,
 * blank line. The caller supplies a stamped instant; this function never reads
 * the clock.
 * @param entry - the entry fields
 * @returns the entry text, ending with one newline
 */
export const renderChannelEntry = (entry: ChannelEntryInput): string =>
  `## ${entry.at} ${ENTRY_SEPARATOR} from ${entry.from} ${ENTRY_SEPARATOR} to ${entry.to}\n\n${entry.text.trim()}\n`;

/**
 * Append one rendered entry to a channel file's contents, creating the title
 * when the file does not exist yet. The previous contents stay a prefix, so the
 * file is append-only by construction.
 * @param kind - board or mailbox
 * @param existing - current contents, or undefined when the file is new
 * @param entry - the stamped entry
 * @returns the complete new file contents
 */
export const appendChannelEntry = (
  kind: ChannelKind,
  existing: string | undefined,
  entry: ChannelEntryInput,
): string => {
  const head =
    existing === undefined || existing.trim() === ''
      ? `${channelTitle(kind)}\n\n`
      : `${existing.replace(/\n*$/, '\n\n')}`;
  return `${head}${renderChannelEntry(entry)}\n`;
};

/** True when a body would break the entry grammar with a level-2 heading. */
export const bodyBreaksGrammar = (text: string): boolean =>
  text.split(/\r?\n/).some((line) => /^##\s/.test(line));
