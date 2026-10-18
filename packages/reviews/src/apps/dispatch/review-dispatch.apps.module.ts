import { Clock, Effect } from 'effect';
import { Session, SessionRunner, Runtime } from '@montflow/pi-sessions';
import * as Review from '../../modules/review/index.js';
import { ReviewStore } from '../../services/index.js';

/**
 * In-session dispatch of an adversarial review session.
 *
 * `mf-reviews create` scaffolds a series; a *spawned* review session is what
 * actually performs the pass. A short-lived CLI process cannot keep an
 * in-process Pi session alive, so the spawn happens here — inside the Pi session,
 * through the session runner host the sessions extension built
 * ({@link Runtime.activeSessionRunnerHost}) — and the reviewer writes the round.
 */

/** Inputs for starting one review session. */
export interface ReviewDispatchInput {
  /** Workspace root that owns `.agents/@montflow/reviews`. */
  readonly root: string;
  /** Review series name (the directory slug). */
  readonly name: string;
  /** What the review targets; defaults to the series name. */
  readonly target?: string | undefined;
  /** Spec this review belongs to (`<spec-slug>`), when bound to one. */
  readonly spec?: string | undefined;
  /** Parent session id (the dispatching orchestrator), when there is one. */
  readonly parent?: string | undefined;
  /** `provider/model-id` pin for the reviewer session. */
  readonly model?: string | undefined;
  /** Thinking level for the reviewer session. */
  readonly thinking?: Session.ThinkingLevel | undefined;
}

/** What {@link startReview} started. */
export interface ReviewDispatchResult {
  readonly sessionId: string;
  readonly series: string;
}

/** The prompt the reviewer session receives. */
export const reviewerPrompt = (input: ReviewDispatchInput): string =>
  [
    `Run one pass of the adversarial review series '${input.name}'.`,
    '',
    'Load and execute the `montflow-adversarial-review` skill for this series. Write the next',
    'round under `.agents/@montflow/reviews/` and update the series ledger — the skill owns the',
    'exact format and the finding lifecycle.',
    '',
    'Context:',
    `- Series: ${input.name}`,
    ...(input.target === undefined ? [] : [`- Target: ${input.target}`]),
    ...(input.spec === undefined ? [] : [`- Spec: ${input.spec}`]),
    `- Workspace root: ${input.root}`,
    '',
    'Do not edit spec state, task status, or locks; the orchestrator owns those.',
  ].join('\n');

/** Reviewer session tools: read the code under review, write the round file. */
const REVIEW_TOOLS = ['read', 'write', 'edit', 'bash'] as const;

/** Ensure the series ledger exists (0 rounds); the reviewer writes the rounds. */
const ensureSeries = (
  input: ReviewDispatchInput,
): Effect.Effect<void, string, ReviewStore.ReviewStore> =>
  Effect.gen(function* () {
    if (!Review.isValidName(input.name)) {
      return yield* Effect.fail(
        `'${input.name}' is not a valid series name — use a kebab-case slug such as 'my-review'.`,
      );
    }
    const store = yield* ReviewStore.ReviewStore;
    const existing = yield* store
      .readSeries(input.root, input.name)
      .pipe(Effect.orElseSucceed(() => undefined));
    if (existing !== undefined) return;
    const now = yield* Clock.currentTimeMillis;
    const created = new Date(now).toISOString().slice(0, 10);
    const ledger = Review.renderSeries({
      name: input.name,
      target: input.target ?? input.name,
      created,
      rounds: [],
      findings: [],
    });
    yield* store
      .saveSeries(input.root, input.name, ledger)
      .pipe(Effect.mapError((error) => error.reason));
  });

/**
 * Ensure the series exists and start the reviewer session through the session's
 * session runner host. Fails with a displayable message when the sessions extension is not
 * loaded (no host) — a missing tooling problem to surface, not to improvise.
 * @param input - series, context, and optional session pins
 * @returns the started session id and its series
 */
export const startReview = (
  input: ReviewDispatchInput,
): Effect.Effect<ReviewDispatchResult, string, ReviewStore.ReviewStore> =>
  Effect.gen(function* () {
    yield* ensureSeries(input);
    const host = Runtime.activeSessionRunnerHost();
    if (host === undefined) {
      return yield* Effect.fail(
        'The sessions extension (mf-sessions) is not loaded in this session; cannot spawn the reviewer session.',
      );
    }
    const runtime = host.runtimeFor(input.root);
    const id = yield* Session.newId(`${input.name}-review`);
    const prompt = reviewerPrompt(input);
    const session = yield* Effect.promise(() =>
      runtime.runPromise(
        Effect.gen(function* () {
          const sessionRunner = yield* SessionRunner;
          return yield* sessionRunner.start({
            root: input.root,
            id,
            name: `Review: ${input.name}`,
            prompt,
            model: input.model,
            thinking: input.thinking,
            parent: input.parent,
            spec: input.spec,
            tools: [...REVIEW_TOOLS],
          });
        }),
      ),
    );
    return { sessionId: session.id, series: input.name };
  });
