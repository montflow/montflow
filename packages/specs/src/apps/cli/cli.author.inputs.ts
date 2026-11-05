import { Effect } from 'effect';
import { PromptStore } from '@montflow/prompts';
import { type LoadedPrompt, PromptError, load as loadPrompt } from '../../modules/prompt/index.js';
import { RIGOR_HINT, isRigor } from '../../modules/rigor/index.js';
import { SURFACE_CODES, SurfaceError } from './cli.shared.module.js';
import { authoringFailure } from './cli.authoring.helpers.js';

/** The authoring inputs every front end resolves before it renders. */
export interface AuthorOptions {
  /** The user's request, as typed; required by the prompt. */
  readonly request: string;
  /** Extra constraints to carry into the authoring session. */
  readonly notes?: string | undefined;
  /** The user's chosen rigor; required, no default. */
  readonly rigor?: string | undefined;
  /** `yes` to author in an isolated worktree, `no` for the current checkout. */
  readonly isolated?: string | undefined;
  /** Worktree origin: `current`, `main`, or `other` (isolated runs only). */
  readonly origin?: string | undefined;
  /** Freeform origin branch, required when `origin` is `other`. */
  readonly originBranch?: string | undefined;
  /** Kebab-case worktree directory name (isolated runs only). */
  readonly worktreeName?: string | undefined;
}

/** The base authoring invocation every composed rerun starts from. */
export const AUTHOR_RERUN = 'mf-specs author --request <text> --rigor <level> --isolated <yes|no>';

const ORIGINS = ['current', 'main', 'other'] as const;
const WORKTREE_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** One coded refusal for an authoring input the surface could not supply. */
const invalidAuthorArgument = (
  workspace: string,
  field: string,
  problem: string,
  expected: string,
  actual: string,
  fix: string,
  rerun: string,
): SurfaceError =>
  authoringFailure('author', {
    code: SURFACE_CODES.invalidArgument,
    path: workspace,
    field,
    problem,
    rerun,
    expected,
    actual,
    fix,
  });

/**
 * Compose the exact rerun for a refusal from the answers already accepted, so
 * the missing flag is the only thing the user has to add. A value that was not
 * accepted is replaced by its placeholder, never echoed back.
 * @param options - the answers the caller supplied
 * @param override - the flag the refusal is about, appended last
 * @returns a runnable `mf-specs author` command
 */
const composeAuthorRerun = (options: AuthorOptions): string => {
  const rigor = isRigor((options.rigor ?? '').trim()) ? (options.rigor ?? '').trim() : '<level>';
  const isolated =
    options.isolated === 'yes' || options.isolated === 'no' ? options.isolated : '<yes|no>';
  const parts = [
    'mf-specs author',
    '--request <text>',
    `--rigor ${rigor}`,
    `--isolated ${isolated}`,
  ];
  if (isolated === 'yes') {
    const origin = ORIGINS.some((value) => value === (options.origin ?? '').trim())
      ? (options.origin ?? '').trim()
      : '<current|main|other>';
    const worktreeName = WORKTREE_NAME_PATTERN.test((options.worktreeName ?? '').trim())
      ? (options.worktreeName ?? '').trim()
      : '<kebab-case>';
    parts.push(`--origin ${origin}`, `--worktree-name ${worktreeName}`);
    if (origin === 'other') {
      const branch = (options.originBranch ?? '').trim();
      parts.push(`--origin-branch ${branch === '' ? '<branch>' : branch}`);
    }
  }
  return parts.join(' ');
};

/**
 * Load and render the shipped authoring prompt. The binary stays model-free:
 * this returns text to print, and the host tool is what dispatches it.
 *
 * The user's authoring choices are validated here, once, so every surface
 * (`mf-specs author`, `/specs author`, `spec_author`) refuses an absent or
 * invalid value with the same coded diagnostic instead of rendering a prompt
 * the loader cannot satisfy. The isolation answers are only passed when the
 * run is isolated; a hidden branch is dropped, never rendered.
 * @param workspace - workspace root that owns `.agents/@montflow/prompts/`
 * @param options - the request, notes, rigor, and isolation answers
 * @returns the rendered prompt and the skills it declares
 */
export const author = (
  workspace: string,
  options: AuthorOptions,
): Effect.Effect<LoadedPrompt, PromptError | SurfaceError, PromptStore.PromptStore> =>
  Effect.gen(function* () {
    if (options.request.trim() === '') {
      return yield* Effect.fail(
        invalidAuthorArgument(
          workspace,
          '--request',
          'author requires --request <text>.',
          'a non-empty --request value',
          'missing',
          'Pass --request with the text the spec should accomplish.',
          composeAuthorRerun(options),
        ),
      );
    }

    const rigor = (options.rigor ?? '').trim();
    if (rigor === '') {
      return yield* Effect.fail(
        invalidAuthorArgument(
          workspace,
          '--rigor',
          'author requires --rigor <level>.',
          `one of ${RIGOR_HINT}`,
          'missing',
          `Pass the rigor the user chose: ${RIGOR_HINT}.`,
          composeAuthorRerun(options),
        ),
      );
    }
    if (!isRigor(rigor)) {
      return yield* Effect.fail(
        invalidAuthorArgument(
          workspace,
          '--rigor',
          `--rigor '${rigor}' is not a rigor level.`,
          `one of ${RIGOR_HINT}`,
          rigor,
          `Use one of ${RIGOR_HINT}; the user chooses and there is no default.`,
          composeAuthorRerun(options),
        ),
      );
    }

    const isolated = (options.isolated ?? '').trim();
    if (isolated === '') {
      return yield* Effect.fail(
        invalidAuthorArgument(
          workspace,
          '--isolated',
          'author requires --isolated yes|no.',
          'yes or no',
          'missing',
          'Pass --isolated yes to author in a worktree, or --isolated no to stay in place.',
          composeAuthorRerun(options),
        ),
      );
    }
    if (isolated !== 'yes' && isolated !== 'no') {
      return yield* Effect.fail(
        invalidAuthorArgument(
          workspace,
          '--isolated',
          `--isolated '${isolated}' is not yes or no.`,
          'yes or no',
          isolated,
          'Pass --isolated yes or --isolated no.',
          composeAuthorRerun(options),
        ),
      );
    }

    const values = new Map<string, string>([
      ['request', options.request],
      ['rigor', rigor],
      ['isolated', isolated],
    ]);
    const notes = options.notes ?? '';
    if (notes !== '') values.set('notes', notes);

    if (isolated === 'yes') {
      const origin = (options.origin ?? '').trim();
      if (origin === '') {
        return yield* Effect.fail(
          invalidAuthorArgument(
            workspace,
            '--origin',
            'an isolated run requires --origin current|main|other.',
            'current, main, or other',
            'missing',
            'Pass the branch the worktree starts from.',
            composeAuthorRerun(options),
          ),
        );
      }
      if (!ORIGINS.some((value) => value === origin)) {
        return yield* Effect.fail(
          invalidAuthorArgument(
            workspace,
            '--origin',
            `--origin '${origin}' is not current, main, or other.`,
            'current, main, or other',
            origin,
            'Pass --origin current, --origin main, or --origin other.',
            composeAuthorRerun(options),
          ),
        );
      }

      const worktreeName = (options.worktreeName ?? '').trim();
      if (worktreeName === '') {
        return yield* Effect.fail(
          invalidAuthorArgument(
            workspace,
            '--worktree-name',
            'an isolated run requires --worktree-name <kebab-case>.',
            'a kebab-case worktree name',
            'missing',
            'Pass the worktree directory name, for example ship-login.',
            composeAuthorRerun(options),
          ),
        );
      }
      if (!WORKTREE_NAME_PATTERN.test(worktreeName)) {
        return yield* Effect.fail(
          invalidAuthorArgument(
            workspace,
            '--worktree-name',
            `--worktree-name '${worktreeName}' is not kebab-case.`,
            'a kebab-case worktree name',
            worktreeName,
            'Use lowercase letters, digits, and single hyphens, for example ship-login.',
            composeAuthorRerun(options),
          ),
        );
      }

      values.set('origin', origin);
      values.set('worktree_name', worktreeName);
      if (origin === 'other') {
        const originBranch = (options.originBranch ?? '').trim();
        if (originBranch === '') {
          return yield* Effect.fail(
            invalidAuthorArgument(
              workspace,
              '--origin-branch',
              '--origin other requires --origin-branch <branch>.',
              'a non-empty branch name',
              'missing',
              'Pass the freeform origin branch the worktree starts from.',
              composeAuthorRerun(options),
            ),
          );
        }
        values.set('origin_branch', originBranch);
      }
    }

    return yield* loadPrompt(workspace, 'spec-create', Object.fromEntries(values));
  });
