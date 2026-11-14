import { Clock, Effect, FileSystem } from 'effect';

import { holdsOrchestrator, readClaims } from '../../modules/claim/index.js';
import {
  GATE_CODES,
  GATE_RESULTS_FILE,
  type GateVerdict,
  instant,
  parseGates,
} from '../../modules/gates/index.js';
import { SLUG_PATTERN } from '../../modules/task/index.js';
import { SpecStore } from '../../services/index.js';

import { SurfaceError } from './cli.shared.module.js';
import { type GateOwner, gateFailure, gateFilePath } from './cli.gate.stage.module.js';
import {
  type GateSelector,
  appendResult,
  existingResults,
  fileAt,
  readOwner,
} from './cli.gate.run.module.js';

/** Options for `gate record`. */
export interface GateRecordOptions extends GateSelector {
  readonly stage: number;
  readonly judge: string;
  readonly verdict: GateVerdict;
  readonly note: string;
  readonly session?: string | undefined;
}

/** One recorded subjective verdict. */
export interface GateRecordReport {
  readonly owner: GateOwner;
  readonly resultsPath: string;
  readonly stage: number;
  readonly judge: string;
  readonly verdict: GateVerdict;
  readonly at: string;
}

export const recordGate = (
  options: GateRecordOptions,
): Effect.Effect<
  GateRecordReport,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const claims = yield* readClaims(options.workspace);
    if (!holdsOrchestrator(claims, options.name, options.session)) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.notOrchestrator,
          path: options.name,
          field: 'session',
          problem: `Session ${options.session === undefined || options.session === '' ? '(none)' : `'${options.session}'`} does not hold the orchestrator binding for '${options.name}'.`,
          rerun: `mf-specs claim --name ${options.name} --orchestrator`,
          expected: 'a session bound with `claim --orchestrator`',
          actual: options.session ?? 'no session',
          fix: 'The execution orchestrator binds itself with `mf-specs claim --name <spec> --orchestrator`; a worker may never record a verdict.',
        }),
      );
    }
    if (!SLUG_PATTERN.test(options.judge)) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.malformedMetadata,
          path: '--judge',
          field: '--judge',
          problem: `Judge '${options.judge}' is not a profile slug.`,
          rerun: `mf-specs gate record --name ${options.name} --phase ${options.phase} --stage ${options.stage} --judge <slug> --verdict pass|fail --note <text>`,
          expected: 'a lowercase kebab-case profile slug',
          actual: options.judge,
          fix: 'Name the reviewer profile exactly as the stage `judge:` line names it.',
        }),
      );
    }
    if (options.note.trim() === '') {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.malformedMetadata,
          path: '--note',
          field: '--note',
          problem: 'A subjective verdict needs a non-empty note.',
          rerun: `mf-specs gate record --name ${options.name} --phase ${options.phase} --stage ${options.stage} --judge ${options.judge} --verdict ${options.verdict} --note <text>`,
          expected: 'the judge’s reason for the verdict',
          actual: 'empty',
          fix: 'Pass `--note` with what the reviewer judged and why.',
        }),
      );
    }
    const { owner, snapshot } = yield* readOwner(options);
    const gatesPath = gateFilePath(owner, 'GATES.md');
    const gates = fileAt(snapshot, gatesPath);
    if (gates === undefined) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.fileMissing,
          path: gatesPath,
          field: 'GATES.md',
          problem: `${owner.label} has no GATES.md.`,
          rerun: `mf-specs check --name ${options.name}`,
          expected: gatesPath,
          actual: 'missing',
          fix: 'Add the gate file, or select an owner that has one.',
        }),
      );
    }
    const stage = parseGates(gates).find((candidate) => candidate.stage === options.stage);
    if (stage === undefined) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.stageUnknown,
          path: gatesPath,
          field: '--stage',
          problem: `${owner.label} has no stage ${options.stage}.`,
          rerun: `mf-specs check --name ${options.name}`,
          expected: 'a stage number declared in GATES.md',
          actual: String(options.stage),
          fix: 'Pick a stage number this GATES.md declares.',
        }),
      );
    }
    if (stage.kind !== 'subjective') {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.notSubjective,
          path: gatesPath,
          field: '--stage',
          problem: `Stage ${options.stage} is ${stage.kind === 'mechanical' ? 'mechanical' : 'unclassified'}; only a subjective stage is recorded by a judge.`,
          rerun: `mf-specs gate run --name ${options.name} --phase ${options.phase} --stage ${options.stage}`,
          expected: 'a subjective stage for `gate record`',
          actual: stage.heading,
          fix: 'Run a mechanical stage with `gate run`; record only a subjective verdict here.',
        }),
      );
    }
    if (stage.judge !== options.judge) {
      return yield* Effect.fail(
        gateFailure({
          code: GATE_CODES.judgeMismatch,
          path: gatesPath,
          field: '--judge',
          problem: `Stage ${options.stage} names judge '${stage.judge ?? '(none)'}' but '${options.judge}' tried to record it.`,
          rerun: `mf-specs gate record --name ${options.name} --phase ${options.phase} --stage ${options.stage} --judge ${stage.judge ?? '<slug>'} --verdict ${options.verdict} --note <text>`,
          expected: `the stage's declared judge '${stage.judge ?? '(none)'}'`,
          actual: options.judge,
          fix: 'Record the verdict under the reviewer profile the stage declares.',
        }),
      );
    }
    const resultsPath = gateFilePath(owner, GATE_RESULTS_FILE);
    yield* existingResults(fileAt(snapshot, resultsPath), owner, options.name);
    const at = instant(yield* Clock.currentTimeMillis);
    const record = {
      stage: options.stage,
      title: stage.title,
      kind: 'subjective' as const,
      judge: options.judge,
      verdict: options.verdict,
      at,
      note: options.note,
    };
    yield* appendResult(`${options.root}/${options.name}/${resultsPath}`, JSON.stringify(record));
    return {
      owner,
      resultsPath,
      stage: options.stage,
      judge: options.judge,
      verdict: options.verdict,
      at,
    };
  });

/** Render a recorded subjective verdict. */
export const renderGateRecord = (report: GateRecordReport): string =>
  `\u2713 recorded ${report.verdict} for stage ${report.stage} from ${report.judge} \u00b7 ${report.resultsPath}`;

/** Shared handler: resolve the workspace root a `--dir` names. */
