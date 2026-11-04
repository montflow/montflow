import { Data, Effect } from 'effect';
import { Command, Flag } from 'effect/cli';

import { parsePhaseFile, phaseEvidence } from '../../modules/phase/index.js';
import {
  DEFAULT_REVIEW_MODE,
  type ReviewDecisionReport,
  type ReviewMode,
  decide,
  isReviewMode,
  renderDecision,
  renderDecisionJson,
} from '../../modules/review-policy/index.js';
import { phaseReviewBudget } from '../../modules/sizing/index.js';
import { isValidPhase } from '../../modules/spec/index.js';
import { parseTaskFile, sizeOf } from '../../modules/task/index.js';
import { SpecStore } from '../../services/index.js';

import {
  SURFACE_CODES,
  type SizingDiagnostic,
  diagnostic,
  dirFlag,
  finish,
  opt,
  renderDiagnostic,
  runDiagnosed,
  storeDirOf,
} from './cli.shared.module.js';

/** The exit code the `review decide` verb uses for an invalid invocation. */
export const USAGE_EXIT_CODE = 2;

/** A `review decide` invocation the caller must correct before it can run. */
export class DecideUsageError extends Data.TaggedError('@montflow/DecideUsageError')<{
  readonly diagnostic: SizingDiagnostic;
}> {}

/** Build one usage refusal. */
const usage = (input: {
  readonly field: string;
  readonly problem: string;
  readonly expected: string;
  readonly actual: string;
  readonly fix: string;
  readonly rerun: string;
}): DecideUsageError =>
  new DecideUsageError({
    diagnostic: diagnostic({
      code: SURFACE_CODES.invalidArgument,
      path: input.field,
      field: input.field,
      problem: input.problem,
      rerun: input.rerun,
      expected: input.expected,
      actual: input.actual,
      fix: input.fix,
    }),
  });

/** What a `review decide` run reads. */
export interface DecideOptions {
  /** Spec directory name, from `--name`. */
  readonly name: string | undefined;
  /** Phase id, from `--phase`. */
  readonly phase: string | undefined;
  /** Interaction mode, from `--mode`; omitted uses the conservative guided branch. */
  readonly mode: string | undefined;
  /** Spec store root. */
  readonly root: string;
}

/**
 * Decide one phase's review cycle without writing anything.
 *
 * The verb reads the phase's derived budget, its effective waiver, the reviewer
 * profiles declared on its review task, and every review series the store
 * reports. It never writes state, never marks a verdict, and never reads a mode
 * from anywhere except the caller: an omitted `--mode` takes the conservative
 * `guided` branch, which escalates at the cap instead of granting an overflow.
 * @param options - spec, phase, mode, and store root
 * @returns the decision plus its per-series breakdown
 */
export const reviewDecide = (
  options: DecideOptions,
): Effect.Effect<
  ReviewDecisionReport,
  DecideUsageError | SpecStore.StoreError,
  SpecStore.SpecStore
> =>
  Effect.gen(function* () {
    const rerun =
      'mf-specs review decide --name <spec> --phase <phase> [--mode guided|autonomous] [--json]';
    const name = options.name?.trim();
    if (name === undefined || name === '')
      return yield* Effect.fail(
        usage({
          field: '--name',
          problem: 'review decide requires --name <spec>.',
          expected: 'a spec directory name',
          actual: 'missing',
          fix: 'Pass --name with the spec to decide.',
          rerun,
        }),
      );
    const phase = options.phase?.trim();
    if (phase === undefined || phase === '')
      return yield* Effect.fail(
        usage({
          field: '--phase',
          problem: 'review decide requires --phase <phase>.',
          expected: 'a phase id such as A',
          actual: 'missing',
          fix: 'Pass --phase with the phase whose review cycle to decide.',
          rerun,
        }),
      );
    if (!isValidPhase(phase))
      return yield* Effect.fail(
        usage({
          field: '--phase',
          problem: `'${phase}' is not a phase id.`,
          expected: 'one or two uppercase letters, such as A or AA',
          actual: phase,
          fix: 'Pass the phase id exactly as PHASE.md records it.',
          rerun,
        }),
      );
    const requestedMode = options.mode;
    if (requestedMode !== undefined && !isReviewMode(requestedMode))
      return yield* Effect.fail(
        usage({
          field: '--mode',
          problem: `'${requestedMode}' is not a review mode.`,
          expected: 'guided or autonomous',
          actual: requestedMode,
          fix: 'Pass --mode guided or --mode autonomous; omission uses guided.',
          rerun,
        }),
      );
    // The mode is only ever the caller's flag. `guided` is the safe default
    // because it escalates at the cap instead of granting an overflow.
    const mode: ReviewMode = requestedMode ?? DEFAULT_REVIEW_MODE;

    const store = yield* SpecStore.SpecStore;
    const exists = yield* store.exists(options.root, name);
    if (!exists)
      return yield* Effect.fail(
        usage({
          field: '--name',
          problem: `Spec '${name}' does not exist.`,
          expected: 'a spec directory under the store',
          actual: name,
          fix: 'Run mf-specs list to see the available specs.',
          rerun: `mf-specs review decide --name ${name} --phase ${phase}`,
        }),
      );

    const snapshot = yield* store.snapshot(options.root, name);
    const phaseFiles = snapshot.files.filter(
      (entry) => (entry.kind ?? 'file') === 'file' && entry.path.startsWith(`${phase}/`),
    );
    if (phaseFiles.length === 0)
      return yield* Effect.fail(
        usage({
          field: '--phase',
          problem: `Phase '${phase}' does not exist in spec '${name}'.`,
          expected: 'a phase directory with at least one record',
          actual: phase,
          fix: 'Run mf-specs state --name <spec> to see the spec phases.',
          rerun,
        }),
      );

    const tasks = phaseFiles
      .filter((entry) => entry.path.endsWith('/TASK.md'))
      .flatMap((entry) => {
        const task = parseTaskFile(entry.content);
        return task === undefined ? [] : [task];
      });
    const budget = phaseReviewBudget(
      tasks.map((task) => ({ type: task.type, size: sizeOf(task) })),
    );
    const profiles = [
      ...new Set(
        tasks.filter((task) => task.type === 'review').flatMap((task) => task.reviewerProfiles),
      ),
    ];
    const series = yield* store.reviewSeries(options.root, name);
    const evidence = phaseEvidence(snapshot);
    const waived = evidence.waived.includes(phase);
    const phaseText = phaseFiles.find((entry) => entry.path.endsWith('/PHASE.md'))?.content;
    const record = phaseText === undefined ? undefined : parsePhaseFile(phaseText);
    if (record?.review === 'none' || evidence.none.includes(phase)) {
      return yield* Effect.fail(
        usage({
          field: '--phase',
          problem: `Phase '${phase}' declares \`review: none\`, so it has no review cycle to decide.`,
          expected: 'a phase with a review task or a waiver',
          actual: 'review: none',
          fix: 'Set `review: required` and add a review task, or leave the phase review-free.',
          rerun,
        }),
      );
    }

    return decide({
      name,
      phase,
      mode,
      budget,
      waived,
      profiles,
      series,
    });
  });

/** One rendered run plus the exit code its command body would set. */
export interface DecideRun {
  /** The text or JSON report; empty only for a diagnosed failure. */
  readonly output: string;
  /** `0` for a decision, `2` for an invalid invocation. */
  readonly exitCode: number;
}

/**
 * Run `review decide` and render its outcome without touching the process. The
 * command body is the only caller that sets `process.exitCode`, so a test can
 * assert the same decision and exit code without side effects.
 * @param options - spec, phase, mode, store root, and output format
 * @returns the rendered output and the exit code it implies
 */
export const decideRun = (
  options: DecideOptions & { readonly json: boolean },
): Effect.Effect<DecideRun, SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const outcome = yield* Effect.result(reviewDecide(options));
    if ('failure' in outcome) {
      if (outcome.failure instanceof DecideUsageError) {
        return { output: renderDiagnostic(outcome.failure.diagnostic), exitCode: USAGE_EXIT_CODE };
      }
      return yield* Effect.fail(outcome.failure);
    }
    return {
      output: options.json ? renderDecisionJson(outcome.success) : renderDecision(outcome.success),
      exitCode: 0,
    };
  });

/** `review decide --name <spec> --phase <id> [--mode ...] [--json]`. */
export const decideCommand = Command.make(
  'decide',
  {
    dir: dirFlag,
    name: Flag.optional(Flag.String('name')),
    phase: Flag.optional(Flag.String('phase')),
    mode: Flag.optional(Flag.String('mode')),
    json: Flag.Boolean('json').pipe(Flag.withDefault(false)),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const outcome = yield* decideRun({
          name: opt(config.name),
          phase: opt(config.phase),
          mode: opt(config.mode),
          root: storeDirOf(config.dir),
          json: config.json,
        });
        yield* finish(outcome.output, outcome.exitCode);
      }).pipe(Effect.provide(SpecStore.Default)),
      () => ({
        path: opt(config.name) ?? 'review',
        rerun: `mf-specs review decide --name ${opt(config.name) ?? '<spec>'} --phase ${opt(config.phase) ?? '<phase>'}`,
        verbose: false,
      }),
    ),
).pipe(
  Command.withDescription(
    'Decide the next review-cycle action for a phase without writing anything.',
  ),
);

/** `review`: the review-cycle policy command group. */
export const reviewCommand = Command.make('review').pipe(
  Command.withDescription('Decide review-cycle actions from the stored review series.'),
  Command.withSubcommands([decideCommand]),
);
