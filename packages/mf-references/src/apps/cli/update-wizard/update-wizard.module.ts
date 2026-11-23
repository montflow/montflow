import { Effect } from 'effect';
import type { GitPortImpl } from '../../../modules/git/index.js';
import { COMMIT_PATTERN } from '../../../modules/reference/index.js';

/**
 * The interactive `mf-references update --wizard` prompt.
 *
 * Owns only the interactive concern: TTY detection, the "specific commit or
 * latest" choice, resolving a commit hash against the remote, and the
 * subject/date display before anything is written. It consumes the lifecycle
 * commit-metadata helper and returns the chosen target; the caller runs the
 * actual `update`. Every input/output seam is injected so the whole prompt is
 * testable headlessly with no real stdin or stdout.
 */

/** A commit subject/date pair shown by the wizard before writing. */
export interface CommitMeta {
  readonly subject: string;
  readonly date: string;
}

/** Output the wizard writes (notify / stdout), injectable for headless tests. */
export interface WizardOutput {
  readonly write: (text: string) => Effect.Effect<void>;
}

/** A cancel or read failure from the interactive prompt. */
export class WizardCancel {
  constructor(
    readonly reason: 'cancel' | 'eof' | 'unreadable',
    readonly message = 'wizard cancelled',
  ) {}
}

/** One line the wizard reads; the reader resolves after the user answers. */
export interface WizardInput {
  readonly readLine: (prompt: string) => Effect.Effect<string, WizardCancel>;
}

/** The target a wizard run chooses. */
export type WizardTarget =
  | { readonly kind: 'ref'; readonly ref: string }
  | { readonly kind: 'latest' };

/** True when stdin is a real terminal; injectable for headless tests. */
export const isInteractive = (value?: boolean | undefined): boolean =>
  value ?? process.stdin.isTTY ?? false;

/** Render the commit subject + date for the pre-write confirmation. */
export const describeCommit = (meta: CommitMeta): string => `${meta.subject} (${meta.date})`;

/** Normalize one entered hash/ref, or refuse when it is not a plausible id. */
export const parseCommitCandidate = (raw: string): string | undefined => {
  const value = raw.trim();
  if (value === '' || !COMMIT_PATTERN.test(value)) return undefined;
  return value;
};

/** One answer from a list, trimmed and lowercased. */
const answerKey = (value: string): string => value.trim().toLowerCase();

/**
 * Choose a target: "specific commit" or "latest on the tracked branch".
 *
 * The commit path prompts for a hash, resolves it against the clone's remote
 * (fetching first), and shows the subject/date for confirmation; the latest
 * path just confirms and returns `latest`.
 * @param deps - the git port, clone path, and injected io
 * @returns the chosen target, or a {@link WizardCancel}
 */
export const runWizard = (deps: {
  readonly git: GitPortImpl;
  readonly clone: string;
  readonly dirty: boolean;
  readonly out: WizardOutput;
  readonly input: WizardInput;
}): Effect.Effect<WizardTarget, WizardCancel> =>
  Effect.gen(function* () {
    const { git, clone, dirty, out, input } = deps;
    yield* out.write(
      dirty
        ? 'the clone is dirty; this update would need --force'
        : 'the clone is clean; this update needs no --force',
    );
    yield* out.write('Which target?\n  1) specific commit\n  2) latest on the tracked branch');
    const choice = yield* input.readLine('choice [1/2]: ');

    if (answerKey(choice) === '2' || answerKey(choice) === 'latest') {
      const branch = yield* git.defaultBranch(clone);
      if (branch === undefined) {
        return yield* Effect.fail(
          new WizardCancel('unreadable', 'the clone has no default branch to track'),
        );
      }
      const head = yield* git.head(clone);
      yield* out.write(
        head === undefined ? `tracking ${branch}` : `tracking ${branch} (head ${head.slice(0, 7)})`,
      );
      const confirm = yield* input.readLine('follow the latest commit on this branch? [y/N]: ');
      if (answerKey(confirm) === 'y' || answerKey(confirm) === 'yes') return { kind: 'latest' };
      return yield* Effect.fail(new WizardCancel('cancel'));
    }

    const raw = yield* input.readLine('commit hash (full or abbreviated): ');
    const candidate = parseCommitCandidate(raw);
    if (candidate === undefined) {
      return yield* Effect.fail(
        new WizardCancel('unreadable', 'refused: that is not a 7-40 char commit hash'),
      );
    }
    const fetched = yield* git.fetch(clone);
    if (!fetched.ok) {
      return yield* Effect.fail(
        new WizardCancel('unreadable', `failed: could not reach the remote: ${fetched.message}`),
      );
    }
    const resolution = yield* git.resolveRef(clone, candidate);
    if (!resolution.resolved || resolution.sha === undefined) {
      return yield* Effect.fail(
        new WizardCancel(
          'unreadable',
          `refused: commit '${candidate}' does not resolve in ${clone}`,
        ),
      );
    }
    const meta = yield* git.commitMeta(clone, resolution.sha);
    const expanded = resolution.sha;
    if (meta === undefined) {
      yield* out.write(`commit ${expanded.slice(0, 7)}`);
    } else {
      yield* out.write(`commit ${expanded.slice(0, 7)}: ${describeCommit(meta)}`);
    }
    const confirm = yield* input.readLine('pin this commit? [y/N]: ');
    if (answerKey(confirm) === 'y' || answerKey(confirm) === 'yes') {
      return { kind: 'ref', ref: expanded };
    }
    return yield* Effect.fail(new WizardCancel('cancel'));
  });
