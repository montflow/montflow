import { Console, Effect } from 'effect';
import { Command, Flag } from 'effect/cli';

import { phaseIdAt, renderSubjectiveGate } from '../../modules/init/index.js';
import {
  PHASE_BOARD_FILE,
  PHASE_FILE,
  PHASE_GATES_FILE,
  PHASE_MEMORY_FILE,
  renderPhaseFile,
  renderPhaseMemory,
} from '../../modules/phase/index.js';
import { PHASE_PATTERN } from '../../modules/spec/index.js';
import { SLUG_PATTERN, phaseRank } from '../../modules/task/index.js';
import { SpecStore } from '../../services/index.js';

import { authoringFailure, phaseIds, readSpec } from './cli.authoring.helpers.js';
import {
  SURFACE_CODES,
  SurfaceError,
  dirFlag,
  nameFlag,
  opt,
  runDiagnosed,
  storeDirOf,
} from './cli.shared.module.js';

// ─── new-phase ────────────────────────────────────────────────────────

/** Options for {@link newPhase}. */
export interface NewPhaseOptions {
  readonly root: string;
  readonly name: string;
  readonly objective: string;
  readonly review?: string | undefined;
  readonly reviewReason?: string | undefined;
  readonly gate?: string | undefined;
  readonly gateJudge?: string | undefined;
  readonly board?: boolean | undefined;
}

/** What {@link newPhase} wrote. */
export interface NewPhaseReport {
  readonly name: string;
  readonly phase: string;
  readonly files: ReadonlyArray<string>;
}

/** A phase record being filled in, so optional fields are added only when present. */
interface MutablePhaseRecord {
  id: string;
  objective: string;
  status: 'pending' | 'in-progress' | 'blocked' | 'complete';
  review: 'required' | 'waived' | 'none';
  gate: 'none' | 'mechanical' | 'subjective';
  reviewReason?: string;
  reviewEvidence?: ReadonlyArray<string>;
  notes: string;
}

/** Write the next phase's record and its files. */
export const newPhase = (
  options: NewPhaseOptions,
): Effect.Effect<NewPhaseReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const operation = 'SpecNewPhase';
    const { snapshot } = yield* readSpec(options.root, options.name, operation);
    const ids = phaseIds(snapshot).filter((id) => PHASE_PATTERN.test(id));
    const nextRank = ids.length === 0 ? 1 : Math.max(...ids.map(phaseRank)) + 1;
    if (nextRank > 26 + 26 * 26) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'phase.id-exhausted',
          path: options.name,
          field: 'phase',
          problem: 'The spec already uses the last phase id (ZZ).',
          rerun: 'mf-specs state --name <spec>',
          fix: 'Split the spec into a new spec instead of adding another phase.',
        }),
      );
    }
    const id = phaseIdAt(nextRank);
    const review = options.review ?? 'required';
    if (review !== 'required' && review !== 'waived' && review !== 'none') {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: SURFACE_CODES.invalidArgument,
          path: '--review',
          field: '--review',
          problem: `Unknown review decision '${review}'.`,
          rerun: `mf-specs new-phase --name ${options.name} --objective <line>`,
          expected: 'required, waived, or none',
          actual: review,
        }),
      );
    }
    if (review === 'waived' && (options.reviewReason ?? '').trim() === '') {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'phase.reason-missing',
          path: '--review-reason',
          field: '--review-reason',
          problem: 'A waived phase needs one reason.',
          rerun: `mf-specs new-phase --name ${options.name} --objective <line>`,
          fix: 'Pass --review-reason <one line>, or keep the phase required.',
        }),
      );
    }
    if (review !== 'waived' && (options.reviewReason ?? '').trim() !== '') {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'phase.reason-unexpected',
          path: '--review-reason',
          field: '--review-reason',
          problem: 'Only a waived phase takes a review reason.',
          rerun: `mf-specs new-phase --name ${options.name} --objective <line>`,
        }),
      );
    }
    const gate = options.gate ?? 'none';
    if (gate !== 'none' && gate !== 'mechanical' && gate !== 'subjective') {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'phase.gate-invalid',
          path: '--gate',
          field: '--gate',
          problem: `Unknown gate kind '${gate}'.`,
          rerun: `mf-specs new-phase --name ${options.name} --objective <line>`,
          expected: 'none, mechanical, or subjective',
          actual: gate,
        }),
      );
    }
    const judge = options.gateJudge ?? 'generic-reviewer';
    if (gate === 'subjective' && !SLUG_PATTERN.test(judge)) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'phase.gate-invalid',
          path: '--gate-judge',
          field: '--gate-judge',
          problem: `'${judge}' is not a profile slug.`,
          rerun: `mf-specs new-phase --name ${options.name} --objective <line>`,
          fix: 'Pass a lowercase kebab-case profile slug.',
        }),
      );
    }
    const store = yield* SpecStore.SpecStore;
    const mutablePhase: MutablePhaseRecord = {
      id,
      objective: options.objective,
      status: 'pending',
      review,
      gate,
      notes: 'Created by mf-specs new-phase.',
    };
    if (review === 'waived') {
      if (options.reviewReason !== undefined) mutablePhase.reviewReason = options.reviewReason;
      if (gate !== 'none') mutablePhase.reviewEvidence = ['phase:0'];
    }
    const phaseText = renderPhaseFile(mutablePhase);
    const files: Array<{ path: string; content: string }> = [
      { path: `${id}/${PHASE_FILE}`, content: phaseText },
      { path: `${id}/${PHASE_MEMORY_FILE}`, content: renderPhaseMemory() },
    ];
    if (gate === 'mechanical') {
      files.push({
        path: `${id}/${PHASE_GATES_FILE}`,
        content: [
          '## Stage 0: Phase verification (mechanical)',
          "command: TODO: replace with the phase's verification command",
          '',
          "- [ ] Replace with the command that proves this phase's suite.",
          '',
        ].join('\n'),
      });
    } else if (gate === 'subjective') {
      files.push({
        path: `${id}/${PHASE_GATES_FILE}`,
        content: renderSubjectiveGate(`phase ${id}`, judge),
      });
    }
    if (options.board !== false) {
      files.push({ path: `${id}/${PHASE_BOARD_FILE}`, content: '# Board\n' });
    }
    yield* store.write(options.root, options.name, files);
    return { name: options.name, phase: id, files: files.map((file) => file.path) };
  });

/** Render a new-phase report. */
export const renderNewPhase = (report: NewPhaseReport): string =>
  [
    `✓ added phase ${report.phase} · ${report.name}`,
    ...report.files.map((file) => `  ${file}`),
  ].join('\n');
export const newPhaseCommand = Command.make(
  'new-phase',
  {
    dir: dirFlag,
    name: nameFlag,
    objective: Flag.String('objective'),
    review: Flag.optional(Flag.String('review')),
    reviewReason: Flag.optional(Flag.String('review-reason')),
    gate: Flag.optional(Flag.String('gate')),
    gateJudge: Flag.optional(Flag.String('gate-judge')),
    board: Flag.Boolean('board').pipe(Flag.withDefault(false)),
    noBoard: Flag.Boolean('no-board').pipe(Flag.withDefault(false)),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const board = config.noBoard ? false : config.board ? true : undefined;
        const report = yield* newPhase({
          root: storeDirOf(config.dir),
          name: config.name,
          objective: config.objective,
          review: opt(config.review),
          reviewReason: opt(config.reviewReason),
          gate: opt(config.gate),
          gateJudge: opt(config.gateJudge),
          board,
        });
        yield* Console.log(renderNewPhase(report));
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs new-phase --name ${config.name} --objective <line>`,
        verbose: false,
      }),
    ),
).pipe(
  Command.withDescription('Allocate the next phase id and write its record files.'),
  Command.provide(SpecStore.Default),
);

/** `new-task`: allocate the next task number in a phase. */
