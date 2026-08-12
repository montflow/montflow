/**
 * Run-title generation for agentic runs.
 *
 * The run's display title is generated from the user's prompt by a tiny
 * one-shot opencode call on the `opencode/big-pickle` model — cheap, fast,
 * stateless (no session reuse). Generation is fire-and-forget from the
 * caller's point of view: any failure (missing binary, timeout, empty or
 * garbled reply) yields null, and the caller falls back to the raw prompt —
 * exactly what the UI showed before titles existed.
 */

import { spawn } from 'node:child_process';

/** Model used to summarize the prompt into a title. */
export const TITLE_MODEL = 'opencode/big-pickle';

/** How long to wait for the title model before falling back. */
const TITLE_TIMEOUT_MS = 15_000;

/** Longest title we keep — anything longer is truncated. */
const MAX_TITLE_LENGTH = 32;

/** Overridable opencode binary (non-PATH installs / tests). */
const opencodeBin = (): string => process.env.OPENCODE_BIN ?? 'opencode';

/** Collapse whitespace and strip quotes/markdown noise from a raw reply. */
const cleanTitle = (raw: string): string =>
  raw
    .replace(/[*_`#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Truncates to the budget at a word boundary when possible, so a too-long
 * reply degrades to "error-handling audit" rather than "error-handling-au".
 */
const cutToBudget = (text: string, budget: number): string => {
  if (text.length <= budget) return text;
  const cut = text.slice(0, budget);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
};

/**
 * Collects the assistant's plain-text output from opencode's JSON event
 * stream (`--format json`). Only `text` parts count — step/tool events and
 * thinking blocks are ignored. Malformed or partial lines are skipped.
 * @param {string[]} chunks Raw stdout chunks from the child process
 * @returns The cleaned assistant text, or '' when nothing usable arrived
 */
export const titleFromOpencodeOutput = (chunks: readonly string[]): string => {
  const parts: string[] = [];
  for (const chunk of chunks) {
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      let event: { readonly type?: string; readonly part?: { readonly type?: string; readonly text?: string } };
      try {
        event = JSON.parse(trimmed) as typeof event;
      } catch {
        continue; // stray/partial line — skip
      }
      if (event.type === 'text' && event.part?.type === 'text' && typeof event.part.text === 'string') {
        parts.push(event.part.text);
      }
    }
  }
  return cleanTitle(parts.join(''));
};

/** Options for {@link generateRunTitle}. */
export interface GenerateTitleOptions {
  /**
   * Text prepended to the generated name, e.g. `[skill-create]` produces
   * `[skill-create] Audit PRs`. Empty/whitespace-only disables the prefix.
   * The name part is sized so prefix + name stay under {@link MAX_TITLE_LENGTH}.
   */
  readonly prefix?: string;
}

/**
 * Generates a short title for an agentic run from the user's prompt using
 * opencode's `opencode/big-pickle` model. Returns null when the title cannot
 * be produced (binary missing, timeout, empty/garbled reply) so callers fall
 * back to the prompt itself.
 * @param {string} prompt The user's raw request text
 * @param {GenerateTitleOptions} [options] Optional title prefix
 * @returns A promise for the generated title, or null
 */
export const generateRunTitle = (
  prompt: string,
  options?: GenerateTitleOptions,
): Promise<string | null> => {
  const cleanPrompt = prompt.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (cleanPrompt === '') return Promise.resolve(null);

  const prefix = options?.prefix?.trim() ?? '';
  const prefixLabel = prefix === '' ? '' : `${prefix} `;
  const nameBudget = Math.max(1, MAX_TITLE_LENGTH - prefixLabel.length);

  const instruction =
    'Write a short, specific title for the following coding task. ' +
    `The full title MUST be under ${MAX_TITLE_LENGTH} characters. ` +
    (prefix === ''
      ? 'Reply with ONLY the title, 2-4 words, no quotes, no trailing punctuation, no explanation.'
      : `The title will be prefixed with \`${prefixLabel.trim()}\` (${prefixLabel.length} characters), ` +
        `so the name part MUST be 2-3 words and under ${nameBudget} characters total. ` +
        'Reply with ONLY the name part, no quotes, no trailing punctuation, no explanation.') +
    '\n\n' +
    `Task: ${cleanPrompt}`;

  return new Promise((resolve) => {
    const child = spawn(
      opencodeBin(),
      ['run', '--format', 'json', '-m', TITLE_MODEL, instruction],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const chunks: string[] = [];
    const stderr: string[] = [];
    let settled = false;

    const finish = (title: string | null): void => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve(title);
    };

    const timer = setTimeout(() => finish(null), TITLE_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => chunks.push(String(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(String(chunk)));
    child.on('error', (error) => {
      clearTimeout(timer);
      console.error(`[workspace] run-title: opencode failed to start: ${error.message}`);
      finish(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const raw = titleFromOpencodeOutput(chunks);
      if (raw === '') {
        if (code !== 0) {
          const detail = stderr.join('').trim().slice(0, 300);
          console.error(`[workspace] run-title: opencode exited ${code}${detail === '' ? '' : ` — ${detail}`}`);
        }
        finish(null);
        return;
      }
      // The name part respects its budget; the prefix rides along. The final
      // slice is a hard guarantee that prefix + name never exceed the cap.
      const name = cutToBudget(raw, nameBudget);
      finish(`${prefixLabel}${name}`.slice(0, MAX_TITLE_LENGTH));
    });
  });
};
