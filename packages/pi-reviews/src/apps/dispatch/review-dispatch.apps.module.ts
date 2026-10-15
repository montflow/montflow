import { Clock, Effect } from 'effect';
import { Session, SessionRunner, Runtime } from '@montflow/pi-sessions';
import { PiProfiles, ProfileStore } from '@montflow/pi-profiles';
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
  /**
   * Reviewer profile slug. When set, the profile resolves against the profiles
   * store, pins the session model, prepends its skills, and stamps the ledger.
   */
  readonly profile?: string | undefined;
  /** Exact round the review targets (`NNN`); omitted for the next free round. */
  readonly round?: string | undefined;
  /** Spec phase this review belongs to (e.g. `C`); omitted for a standalone review. */
  readonly phase?: string | undefined;
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

/** Reviewer session tools: read the code under review, write the round file. */
const REVIEW_TOOLS = ['read', 'write', 'edit', 'bash'] as const;

/**
 * The prompt the reviewer session receives. The profile's skills are prepended
 * as explicit load instructions, mirroring the `pi-prompts` `executeFor` pattern.
 */
export const reviewerPrompt = (
  input: ReviewDispatchInput,
  skills: ReadonlyArray<string> = [],
): string => {
  const skillLines = skills.map((name) => `Load the '${name}' skill before starting.`);
  return [
    ...skillLines,
    ...(skillLines.length === 0 ? [] : ['']),
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
    ...(input.profile === undefined ? [] : [`- Profile: ${input.profile}`]),
    ...(input.round === undefined ? [] : [`- Round: ${input.round}`]),
    ...(input.phase === undefined ? [] : [`- Phase: ${input.phase}`]),
    `- Workspace root: ${input.root}`,
    '',
    'Do not edit spec state, task status, or locks; the orchestrator owns those.',
  ].join('\n');
};

/** True when a profile's model pin applies (a non-blank `model:`). */
const modelFor = (
  input: ReviewDispatchInput,
  profile: PiProfiles.Profile | undefined,
): string | undefined =>
  profile !== undefined && profile.model.trim() !== '' ? profile.model : input.model;

/**
 * Ensure the series ledger exists. When a profile is dispatched, swap a
 * pre-created ledger to carry it (F4): create it stamped, stamp an unstamped one
 * without clearing its metadata, accept an already-stamped one, and refuse a
 * ledger bound to a different profile or one that is malformed. With no profile
 * the existing ledger is left exactly as it was.
 */
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
    const existingRaw = yield* store
      .readSeries(input.root, input.name)
      .pipe(Effect.orElseSucceed(() => undefined));
    const now = yield* Clock.currentTimeMillis;
    const created = new Date(now).toISOString().slice(0, 10);

    if (existingRaw !== undefined) {
      if (input.profile === undefined) return;
      const parsed = Review.parseSeries(existingRaw);
      if (parsed.issues.length > 0) {
        return yield* Effect.fail(
          `Series '${input.name}' ledger is malformed; run \`mf-reviews verify ${input.name}\` before dispatching a profiled review.`,
        );
      }
      const existingProfile = parsed.metadata['Profile'] ?? '';
      if (existingProfile === input.profile) return;
      if (existingProfile !== '') {
        return yield* Effect.fail(
          `Series '${input.name}' is already bound to profile '${existingProfile}'; refusing to dispatch profile '${input.profile}'.`,
        );
      }
      const merged = Review.renderSeries({
        name: input.name,
        target: parsed.metadata['Target'] ?? input.target ?? input.name,
        status: parsed.metadata['Status'] ?? 'open',
        created: parsed.metadata['Created'] ?? created,
        rounds: parsed.rounds,
        findings: parsed.findings,
        profile: input.profile,
      });
      yield* store
        .saveSeries(input.root, input.name, merged)
        .pipe(Effect.mapError((error) => error.reason));
      return;
    }

    const ledger = Review.renderSeries({
      name: input.name,
      target: input.target ?? input.name,
      created,
      rounds: [],
      findings: [],
      profile: input.profile,
    });
    yield* store
      .saveSeries(input.root, input.name, ledger)
      .pipe(Effect.mapError((error) => error.reason));
  });

/**
 * Resolve a dispatched profile and require the series name to encode it (F13).
 * A profile series is `<spec>-<profile>`; if no spec is supplied the profile is
 * encoded only as the name's `-<profile>` suffix. Fails with a displayable
 * message and starts no session — before {@link ensureSeries} touches disk.
 */
const resolveProfile = (
  input: ReviewDispatchInput,
  profile: string,
): Effect.Effect<PiProfiles.Profile, string, ProfileStore.ProfileStore> =>
  Effect.gen(function* () {
    const store = yield* ProfileStore.ProfileStore;
    const record = yield* store
      .read(input.root, profile)
      .pipe(Effect.orElseSucceed(() => undefined));
    if (record === undefined) {
      return yield* Effect.fail(
        `Cannot dispatch review series '${input.name}': profile '${profile}' was not found under .agents/@montflow/profiles.`,
      );
    }
    if (input.spec !== undefined) {
      const expected = `${input.spec}-${profile}`;
      if (input.name !== expected) {
        return yield* Effect.fail(
          `Cannot dispatch review series '${input.name}': profile '${profile}' belongs to series '${expected}'.`,
        );
      }
    } else if (!input.name.endsWith(`-${profile}`)) {
      return yield* Effect.fail(
        `Cannot dispatch review series '${input.name}': profile '${profile}' is not the series-name suffix.`,
      );
    }
    return record;
  });

/**
 * Ensure the series exists and start the reviewer session through the session's
 * session runner host. Fails with a displayable message when the sessions extension is not
 * loaded (no host) — a missing tooling problem to surface, not to improvise.
 *
 * A dispatched profile is resolved and the series name validated *before*
 * {@link ensureSeries}, so an unknown profile or a mismatched name leaves
 * nothing on disk. The profile's non-blank `model` pin overrides the request's
 * model; thinking is carried through and Pi prefers the resolved model's own
 * thinking level.
 * @param input - series, context, profile, round/phase, and optional session pins
 * @returns the started session id and its series
 */
export const startReview = (
  input: ReviewDispatchInput,
): Effect.Effect<
  ReviewDispatchResult,
  string,
  ReviewStore.ReviewStore | ProfileStore.ProfileStore
> =>
  Effect.gen(function* () {
    let record: PiProfiles.Profile | undefined;
    if (input.profile !== undefined) {
      record = yield* resolveProfile(input, input.profile);
    }
    yield* ensureSeries(input);
    const host = Runtime.activeSessionRunnerHost();
    if (host === undefined) {
      return yield* Effect.fail(
        'The sessions extension (mf-sessions) is not loaded in this session; cannot spawn the reviewer session.',
      );
    }
    const runtime = host.runtimeFor(input.root);
    const id = yield* Session.newId(`${input.name}-review`);
    const prompt = reviewerPrompt(input, record?.skills ?? []);
    const session = yield* Effect.promise(() =>
      runtime.runPromise(
        Effect.gen(function* () {
          const sessionRunner = yield* SessionRunner;
          return yield* sessionRunner.start({
            root: input.root,
            id,
            name: `Review: ${input.name}`,
            prompt,
            model: modelFor(input, record),
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
