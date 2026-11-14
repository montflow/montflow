import { Config, Effect, Option } from 'effect';
import { NodeChildProcessSpawner } from '@effect/platform-node';
import { SpecStore } from '../../services/index.js';
import {
  type SlashContext,
  type SlashEffect,
  type SlashReport,
  SURFACE_CODES,
  SurfaceError,
  claim,
  csv,
  diagnostic,
  gateExitCode,
  init,
  lockPhase,
  newPhase,
  newTask,
  opencodeSteerPort,
  readRigor,
  recordGate,
  renderClaim,
  renderDiagnostic,
  renderGateRecord,
  renderGateRun,
  renderInit,
  renderLock,
  renderMail,
  renderNewPhase,
  renderNewTask,
  renderWaiver,
  runGate,
  sendMail,
  setWaiver,
  slashFailure,
  slashOutcome,
  stampValue,
} from './cli.apps.module.js';

/** The caller session the authority verbs read, if the host set one. */
const callerSession = Config.option(Config.String('OPENCODE_SESSION_ID')).pipe(
  Effect.orElseSucceed(() => Option.none<string>()),
);

/** The spawner the gate and mail arms need for their one subprocess seam. */
const Spawner = NodeChildProcessSpawner.layer;

/** `/specs init --name <spec> --rigor <rigor> ...`, the v2 rigor tree. */
export const slashInit = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  const name = parsed.name;
  if (name === undefined) {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecInit',
        reason: 'init requires --name <spec> and --rigor <rigor>.',
      }),
    );
  }
  const rigor = parsed.values.rigor;
  return slashOutcome(
    init({
      root: dir,
      name,
      rigor,
      author: parsed.values.author,
      description: parsed.values.description,
      workspaceType: parsed.values['workspace-type'],
      phaseObjectives: parsed.multi.phase,
      taskFlags: parsed.multi.task,
      reviewFlags: parsed.multi.review,
      reasonFlags: parsed.multi['review-reason'],
      reviewerProfiles: parsed.reviewerProfiles,
    }),
    (report): SlashReport => ({ output: renderInit(report), ok: true }),
    {
      path: name,
      rerun: `mf-specs init --name ${name} --rigor ${rigor ?? '<rigor>'}`,
      verbose: parsed.verbose,
    },
  );
};

/** `/specs new-phase`, allocating the next phase directory and record. */
export const slashNewPhase = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  const name = parsed.name;
  if (name === undefined) {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecNewPhase',
        reason: 'new-phase requires --name <spec> and --objective <line>.',
      }),
    );
  }
  const objective = parsed.values.objective;
  const board = parsed.switches.has('no-board')
    ? false
    : parsed.switches.has('board')
      ? true
      : undefined;
  return slashOutcome(
    newPhase({
      root: dir,
      name,
      objective: objective ?? '',
      review: parsed.values.review,
      reviewReason: parsed.values['review-reason'],
      gate: parsed.values.gate,
      gateJudge: parsed.values['gate-judge'],
      board,
    }),
    (report): SlashReport => ({ output: renderNewPhase(report), ok: true }),
    {
      path: name,
      rerun: `mf-specs new-phase --name ${name} --objective <line>`,
      verbose: parsed.verbose,
    },
  );
};

/** `/specs new-task`, allocating the next task id inside a phase. */
export const slashNewTask = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  const name = parsed.name;
  if (name === undefined) {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecNewTask',
        reason: 'new-task requires --name <spec>, --phase <id>, --task <name>, and --type <type>.',
      }),
    );
  }
  return slashOutcome(
    newTask({
      root: dir,
      name,
      phase: parsed.phase ?? '',
      task: parsed.task ?? '',
      type: parsed.values.type ?? '',
      size: parsed.values.size,
      gates: parsed.switches.has('gates'),
      dependsOn: csv(parsed.values['depends-on']),
      relatedTasks: csv(parsed.values['related-tasks']),
      originator: parsed.values.originator,
      findingRef: parsed.values['finding-ref'],
      reviewerProfiles: csv(parsed.values['reviewer-profiles']),
      description: parsed.values.description,
      requirements: parsed.multi.requirement,
    }),
    (report): SlashReport => ({ output: renderNewTask(report), ok: true }),
    {
      path: name,
      rerun: `mf-specs new-task --name ${name} --phase ${parsed.phase ?? '<phase>'} --task <name> --type <type>`,
      verbose: parsed.verbose,
    },
  );
};

/** `/specs stamp [--format instant|date]`, the one clock. */
export const slashStamp = (context: SlashContext): SlashEffect => {
  const { parsed } = context;
  const format = parsed.values.format ?? 'instant';
  if (format !== 'instant' && format !== 'date') {
    return Effect.fail(
      new SurfaceError({
        operation: 'SpecStamp',
        diagnostics: [
          diagnostic({
            code: SURFACE_CODES.invalidArgument,
            path: 'stamp',
            field: '--format',
            problem: `Unknown stamp format '${format}'.`,
            rerun: 'mf-specs stamp',
            expected: 'instant or date',
            actual: format,
            fix: 'Pass --format instant, --format date, or omit the flag.',
          }),
        ],
      }),
    );
  }
  return stampValue(format).pipe(
    Effect.map((output): SlashReport => ({ output, ok: true })),
    Effect.catchCause((cause) =>
      Effect.succeed(
        slashFailure(cause, { path: 'stamp', rerun: 'mf-specs stamp', verbose: false }),
      ),
    ),
  );
};

/** `/specs rigor <trivial|light|standard|deep|critical>`, the one rigor read path. */
export const slashRigor = (context: SlashContext): SlashEffect => {
  const { parsed, workspace } = context;
  const rigor = parsed.positionals[0] ?? parsed.values.rigor ?? '';
  return readRigor({ rigor, workspace }).pipe(
    Effect.map((output): SlashReport => ({ output, ok: true })),
    Effect.catchTag('@montflow/RigorLoadError', (error) =>
      Effect.succeed({
        output: renderDiagnostic(
          diagnostic({
            code: error.code,
            path: error.path,
            field: 'rigor',
            problem: error.problem,
            rerun: `mf-specs rigor ${rigor}`,
            expected: error.expected,
            actual: error.actual,
            fix: error.fix,
          }),
        ),
        ok: false,
      }),
    ),
    Effect.catchCause((cause) =>
      Effect.succeed(
        slashFailure(cause, { path: rigor, rerun: `mf-specs rigor ${rigor}`, verbose: false }),
      ),
    ),
  );
};

/** `/specs claim`, the session binder and atomic status generator. */
export const slashClaim = (context: SlashContext): SlashEffect => {
  const { parsed, dir, workspace } = context;
  const name = parsed.name;
  if (name === undefined) {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecClaim',
        reason: 'claim requires --name <spec> and --task <id>.',
      }),
    );
  }
  return Effect.gen(function* () {
    const environment = yield* callerSession;
    const session =
      parsed.values.session ?? (Option.isSome(environment) ? environment.value : undefined);
    return yield* slashOutcome(
      claim({
        root: dir,
        workspace,
        name,
        task: parsed.task,
        session,
        orchestrator: parsed.switches.has('orchestrator'),
        start: parsed.switches.has('start'),
        block: parsed.switches.has('block'),
        close: parsed.switches.has('close'),
        release: parsed.switches.has('release'),
        force: parsed.switches.has('force'),
        reason: parsed.values.reason,
      }),
      (report): SlashReport => ({ output: renderClaim(report), ok: true }),
      {
        path: name,
        rerun: `mf-specs claim --name ${name} --task ${parsed.task ?? '<id>'}`,
        verbose: parsed.verbose,
      },
    );
  });
};

/** `/specs lock`, the derived-lock confirmation. */
export const slashLock = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  const name = parsed.name;
  const phase = parsed.phase;
  if (name === undefined || phase === undefined) {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecLock',
        reason: 'lock requires --name <spec> and --phase <id>.',
      }),
    );
  }
  return slashOutcome(
    lockPhase({ root: dir, name, phase }),
    (report): SlashReport => ({ output: renderLock(report), ok: report.locked }),
    {
      path: name,
      rerun: `mf-specs lock --name ${name} --phase ${phase}`,
      verbose: parsed.verbose,
    },
  );
};

/** `/specs waiver`, the `PHASE.md` review decision generator. */
export const slashWaiver = (context: SlashContext): SlashEffect => {
  const { parsed, dir } = context;
  const name = parsed.name;
  const phase = parsed.phase;
  if (name === undefined || phase === undefined) {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecWaiver',
        reason: 'waiver requires --name <spec> and --phase <id>.',
      }),
    );
  }
  const waived = parsed.switches.has('waived');
  const required = parsed.switches.has('required');
  if (waived === required) {
    return Effect.fail(
      new SurfaceError({
        operation: 'SpecWaiver',
        diagnostics: [
          diagnostic({
            code: SURFACE_CODES.invalidArgument,
            path: 'waiver',
            field: '--waived/--required',
            problem: 'Select exactly one of --waived or --required.',
            rerun: `mf-specs waiver --name ${name} --phase ${phase} --waived --reason <line>`,
            expected: '--waived --reason <line>, or --required',
            actual: waived ? 'both' : 'neither',
            fix: 'Pass exactly one decision flag.',
          }),
        ],
      }),
    );
  }
  return slashOutcome(
    setWaiver({
      root: dir,
      name,
      phase,
      waived,
      reason: parsed.values.reason,
    }),
    (report): SlashReport => ({ output: renderWaiver(report), ok: true }),
    {
      path: name,
      rerun: `mf-specs waiver --name ${name} --phase ${phase}`,
      verbose: parsed.verbose,
    },
  );
};

/** `/specs gate run|record`, the mechanical runner and subjective recorder. */
export const slashGate = (context: SlashContext): SlashEffect => {
  const { parsed, dir, workspace } = context;
  const verb = parsed.positionals[0];
  const name = parsed.name;
  const phase = parsed.phase;
  if ((verb !== 'run' && verb !== 'record') || name === undefined || phase === undefined) {
    return Effect.fail(
      new SurfaceError({
        operation: 'SpecGate',
        diagnostics: [
          diagnostic({
            code: SURFACE_CODES.invalidArgument,
            path: 'gate',
            field: 'gate',
            problem: 'gate requires `run` or `record` plus --name <spec> and --phase <id>.',
            rerun: 'mf-specs gate run --name <spec> --phase <id>',
            expected: 'gate run|record --name <spec> --phase <id>',
            actual: verb ?? 'missing',
            fix: 'Write `/specs gate run --name <spec> --phase <id>` or `/specs gate record ...`.',
          }),
        ],
      }),
    );
  }
  return Effect.gen(function* () {
    const environment = yield* callerSession;
    const session = Option.isSome(environment) ? environment.value : undefined;
    if (verb === 'run') {
      const stageText = parsed.values.stage;
      const stage = stageText === undefined ? undefined : Number(stageText);
      const timeoutText = parsed.values.timeout;
      return yield* slashOutcome(
        runGate({
          root: dir,
          workspace,
          name,
          phase,
          task: parsed.task,
          stage,
          all: parsed.all,
          timeoutSeconds: timeoutText === undefined ? undefined : Number(timeoutText),
          session,
        }).pipe(Effect.provide(Spawner)),
        (report): SlashReport => ({
          output: renderGateRun(report),
          ok: gateExitCode(report) === 0,
        }),
        {
          path: `${name}/${phase}`,
          rerun: `mf-specs gate run --name ${name} --phase ${phase}`,
          verbose: parsed.verbose,
        },
      );
    }
    const stageText = parsed.values.stage;
    if (stageText === undefined) {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecGate',
          diagnostics: [
            diagnostic({
              code: SURFACE_CODES.invalidArgument,
              path: '--stage',
              field: '--stage',
              problem: 'gate record requires --stage <n>.',
              rerun: `mf-specs gate record --name ${name} --phase ${phase} --stage <n> --judge <slug> --verdict pass|fail --note <text>`,
              expected: 'a stage number declared in GATES.md',
              actual: 'missing',
              fix: 'Pass the subjective stage number to record.',
            }),
          ],
        }),
      );
    }
    const stage = Number(stageText);
    const verdict = parsed.values.verdict;
    if (verdict !== 'pass' && verdict !== 'fail') {
      return yield* Effect.fail(
        new SurfaceError({
          operation: 'SpecGate',
          diagnostics: [
            diagnostic({
              code: SURFACE_CODES.invalidArgument,
              path: '--verdict',
              field: '--verdict',
              problem: `Verdict '${verdict ?? ''}' is not 'pass' or 'fail'.`,
              rerun: `mf-specs gate record --name ${name} --phase ${phase} --stage ${stage} --judge <slug> --verdict pass|fail --note <text>`,
              expected: 'pass or fail',
              actual: verdict ?? 'missing',
              fix: 'Use `--verdict pass` or `--verdict fail`.',
            }),
          ],
        }),
      );
    }
    return yield* slashOutcome(
      recordGate({
        root: dir,
        workspace,
        name,
        phase,
        task: parsed.task,
        stage,
        judge: parsed.values.judge ?? '',
        verdict,
        note: parsed.values.note ?? '',
        session,
      }).pipe(Effect.provide(Spawner)),
      (report): SlashReport => ({ output: renderGateRecord(report), ok: true }),
      {
        path: `${name}/${phase}`,
        rerun: `mf-specs gate record --name ${name} --phase ${phase}`,
        verbose: parsed.verbose,
      },
    );
  });
};

/** `/specs mail`, the only board/mailbox writer. */
export const slashMail = (context: SlashContext): SlashEffect => {
  const { parsed, dir, workspace } = context;
  const name = parsed.name;
  if (name === undefined || parsed.values.to === undefined) {
    return Effect.fail(
      new SpecStore.StoreError({
        operation: 'SpecMail',
        reason: 'mail requires --name <spec>, --to <task-id|all>, and --text <text>.',
      }),
    );
  }
  return Effect.gen(function* () {
    const environment = yield* callerSession;
    const session =
      parsed.values.session ?? (Option.isSome(environment) ? environment.value : undefined);
    return yield* slashOutcome(
      sendMail({
        root: dir,
        workspace,
        name,
        to: parsed.values.to ?? '',
        text: parsed.values.text ?? '',
        phase: parsed.phase,
        session,
        steer: opencodeSteerPort(workspace),
      }).pipe(Effect.provide(Spawner)),
      (report): SlashReport => ({ output: renderMail(report), ok: true }),
      {
        path: name,
        rerun: `mf-specs mail --name ${name} --to ${parsed.values.to ?? '<task-id|all>'} --text <text>`,
        verbose: parsed.verbose,
      },
    );
  });
};
