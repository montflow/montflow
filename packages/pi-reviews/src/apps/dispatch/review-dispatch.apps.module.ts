import { Clock, Effect } from 'effect';
import { Run, Runner, Runtime } from '@montflow/pi-runs';
import * as Review from '../../modules/review/index.js';
import { ReviewStore } from '../../services/index.js';

/**
 * In-session dispatch of an adversarial review run.
 *
 * `mf-reviews create` scaffolds a series; a *spawned* review run is what
 * actually performs the pass. A short-lived CLI process cannot keep an
 * in-process Pi run alive, so the spawn happens here — inside the Pi session,
 * through the runner host the runs extension built
 * ({@link Runtime.activeRunnerHost}) — and the reviewer writes the round.
 */

/** Inputs for starting one review run. */
export interface ReviewDispatchInput {
  /** Workspace root that owns `.agents/@montflow/reviews`. */
  readonly root: string;
  /** Review series name (the directory slug). */
  readonly name: string;
  /** What the review targets; defaults to the series name. */
  readonly target?: string | undefined;
  /** Spec this review belongs to (`<spec-slug>`), when bound to one. */
  readonly spec?: string | undefined;
  /** Parent run id (the dispatching orchestrator), when there is one. */
  readonly parent?: string | undefined;
  /** `provider/model-id` pin for the reviewer run. */
  readonly model?: string | undefined;
  /** Thinking level for the reviewer run. */
  readonly thinking?: Run.ThinkingLevel | undefined;
}

/** What {@link startReview} started. */
export interface ReviewDispatchResult {
  readonly runId: string;
  readonly series: string;
}

/** The prompt the reviewer run receives. */
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

/** Reviewer run tools: read the code under review, write the round file. */
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
 * Ensure the series exists and start the reviewer run through the session's
 * runner host. Fails with a displayable message when the runs extension is not
 * loaded (no host) — a missing tooling problem to surface, not to improvise.
 * @param input - series, context, and optional run pins
 * @returns the started run id and its series
 */
export const startReview = (
  input: ReviewDispatchInput,
): Effect.Effect<ReviewDispatchResult, string, ReviewStore.ReviewStore> =>
  Effect.gen(function* () {
    yield* ensureSeries(input);
    const host = Runtime.activeRunnerHost();
    if (host === undefined) {
      return yield* Effect.fail(
        'The runs extension (mf-runs) is not loaded in this session; cannot spawn the reviewer run.',
      );
    }
    const runtime = host.runtimeFor(input.root);
    const id = yield* Run.newId(`${input.name}-review`);
    const prompt = reviewerPrompt(input);
    const run = yield* Effect.promise(() =>
      runtime.runPromise(
        Effect.gen(function* () {
          const runner = yield* Runner;
          return yield* runner.start({
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
    return { runId: run.id, series: input.name };
  });
