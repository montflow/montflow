import { ProfileStore } from '@montflow/profiles/services';
import { PiProfiles } from '@montflow/profiles/modules';
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

/**
 * The prompt the reviewer session receives. The profile's skills are prepended
 * as explicit load instructions, mirroring the `@montflow/prompts` `executeFor` pattern.
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
 * Ensure the series exists and start the reviewer session on a native session.
 * The session is prompted, not awaited: a review pass outlives the dispatching
 * turn, and its outcome is the session's own durable execution event.
 *
 * A dispatched profile is resolved and the series name validated *before*
 * {@link ensureSeries}, so an unknown profile or a mismatched name leaves
 * nothing on disk. The profile's non-blank `model` pin overrides the request's
 * model.
 * @param ports - adapter seams (session dispatch + model resolution)
 * @param input - series, context, profile, round/phase, and optional model pin
 * @returns the started session id and its series
 */
export const startReview = (
  ports: ReviewDispatchPorts,
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
    const label = modelFor(input, record);
    const model =
      label === undefined
        ? undefined
        : yield* ports.model.resolve(label).pipe(Effect.mapError((error) => error.message));
    const title = `Review: ${input.name}`;
    const sessionId =
      model === undefined
        ? yield* ports.session.create({ title }).pipe(Effect.mapError((error) => error.message))
        : yield* ports.session
            .create({ title, model })
            .pipe(Effect.mapError((error) => error.message));
    yield* ports.session
      .prompt(sessionId, reviewerPrompt(input, record?.skills ?? []))
      .pipe(Effect.mapError((error) => error.message));
    return { sessionId, series: input.name };
  });
