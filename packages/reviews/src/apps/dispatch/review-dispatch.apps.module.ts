import type { ModelPort, SessionDispatchPort } from '@montflow/opencode';
import { Clock, Effect } from 'effect';
import * as Review from '../../modules/review/index.js';
import { ReviewStore } from '../../services/index.js';

/**
 * In-session dispatch of an adversarial review session.
 *
 * `mf-reviews create` scaffolds a series; a *spawned* review session is what
 * actually performs the pass. The spawn happens here, on a native OpenCode
 * session: create a peer session, prompt it with {@link reviewerPrompt}, and
 * return its id. No montflow runtime owns the session loop.
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
  /** `provider/model-id` pin for the reviewer session. */
  readonly model?: string | undefined;
}

/** What {@link startReview} started. */
export interface ReviewDispatchResult {
  readonly sessionId: string;
  readonly series: string;
}

/** The adapter seams review dispatch reads; `ServerPorts` satisfies this slice. */
export interface ReviewDispatchPorts {
  readonly session: SessionDispatchPort;
  readonly model: ModelPort;
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
 * Ensure the series exists and start the reviewer session on a native session.
 * The session is prompted, not awaited: a review pass outlives the dispatching
 * turn, and its outcome is the session's own durable execution event.
 * @param ports - adapter seams (session dispatch + model resolution)
 * @param input - series, context, and optional model pin
 * @returns the started session id and its series
 */
export const startReview = (
  ports: ReviewDispatchPorts,
  input: ReviewDispatchInput,
): Effect.Effect<ReviewDispatchResult, string, ReviewStore.ReviewStore> =>
  Effect.gen(function* () {
    yield* ensureSeries(input);
    const model =
      input.model === undefined
        ? undefined
        : yield* ports.model.resolve(input.model).pipe(Effect.mapError((error) => error.message));
    const title = `Review: ${input.name}`;
    const sessionId =
      model === undefined
        ? yield* ports.session.create({ title }).pipe(Effect.mapError((error) => error.message))
        : yield* ports.session
            .create({ title, model })
            .pipe(Effect.mapError((error) => error.message));
    yield* ports.session
      .prompt(sessionId, reviewerPrompt(input))
      .pipe(Effect.mapError((error) => error.message));
    return { sessionId, series: input.name };
  });
