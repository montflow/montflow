/**
 * @description Parses the `## Summary` block of a review file and reports
 * the per-status counts. Kept in its own module (no runtime/agent imports)
 * so a regression test can exercise the regex in isolation. See review
 * finding F15 — the previous regex used `\z`, which is a literal `z` in
 * JS, not an end-of-string anchor.
 */

import { Effect, Option } from 'effect';
import { FileSystem } from 'effect/FileSystem';

/**
 * `(?=^##\s|$(?![\s\S]))` is the JS-correct end-of-section terminator:
 * - `^##\s` lookahead matches the next `## ` heading (start of next section)
 * - `$(?![\s\S])` is the true end-of-input even under the `m` flag (the
 *   negative lookahead asserts no character — including newlines — follows,
 *   which rules out the `$`-before-`\n` case that `m` otherwise allows).
 * Together they stop the lazy capture at the next section boundary or at
 * true EOF, whichever comes first.
 */
const SUMMARY_RE = /^## Summary\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/m;

export interface SummaryCounts {
  readonly open: number;
  readonly inReview: number;
  readonly escalated: number;
  readonly resolved: number;
  readonly wontFix: number;
}

/**
 * Parse the `## Summary` block of a review file. Returns Option.none when the
 * file is missing or unparseable. Used to detect the all-terminal termination
 * condition (no `Open`/`In Review`/`Escalated` findings remain).
 *
 * @param {string} filePath Absolute path to the review file
 * @returns The parsed summary counts, or none when unavailable
 */
export const parseSummary = (
  filePath: string,
): Effect.Effect<Option.Option<SummaryCounts>, never, FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const exists = yield* fileSystem
      .exists(filePath)
      .pipe(Effect.orElseSucceed(() => false));
    if (!exists) return Option.none<SummaryCounts>();

    const text = yield* fileSystem
      .readFileString(filePath, 'utf8')
      .pipe(
        // Defensive: treat unreadable files as not-terminal so the loop keeps
        // iterating rather than crashing or falsely declaring victory.
        Effect.orElseSucceed(() => null),
      );
    if (text === null) return Option.none<SummaryCounts>();

    return parseSummaryText(text);
  });

/**
 * Parse the `## Summary` block from review-file text. Pure function —
 * extracted so tests can feed fixture strings directly.
 * @param {string} text The full review file contents
 * @returns The parsed summary counts, or none when no Summary block exists
 */
export const parseSummaryText = (text: string): Option.Option<SummaryCounts> => {
  const section = text.match(SUMMARY_RE);
  if (!section) return Option.none();

  const body = section[1] ?? '';
  const count = (label: string): number => {
    const match = body.match(new RegExp(`- \\*\\*${label}\\*\\*:\\s*(\\d+)`, 'm'));
    const digits = match?.[1];
    return digits === undefined ? 0 : parseInt(digits, 10);
  };

  const counts = {
    open: count('Open'),
    inReview: count('In Review'),
    escalated: count('Escalated'),
    resolved: count('Resolved'),
    wontFix: count("Won't Fix"),
  };

  // A present-but-empty/malformed Summary block (no recognized count lines)
  // would otherwise look like all-zero → all-terminal → false victory.
  // Treat it as not-parseable so the loop keeps iterating rather than
  // declaring success on a reviewer formatting drift.
  const hasCountLines = /- \*\*(Open|In Review|Escalated|Resolved|Won't Fix)\*\*:\s*\d+/.test(body);
  if (!hasCountLines) return Option.none();

  return Option.some(counts);
};

/**
 * True when every finding is terminal (Resolved or Won't Fix) — the loop
 * can stop. Defensive: missing summary counts as not-terminal so the loop
 * keeps iterating rather than falsely declaring victory.
 *
 * @param {Option.Option<SummaryCounts>} summary The parsed summary counts
 * @returns True when no Open/In Review/Escalated findings remain
 */
export const isAllTerminal = (summary: Option.Option<SummaryCounts>): boolean =>
  Option.isSome(summary) &&
  summary.value.open === 0 &&
  summary.value.inReview === 0 &&
  summary.value.escalated === 0;
