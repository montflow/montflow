import { Config, Console, Data, Effect, FileSystem, Option, Stream } from 'effect';
import { Command, Flag } from 'effect/cli';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import {
  BOARD_FILE,
  BROADCAST,
  CHANNEL_CODES,
  MAILBOX_FILE,
  type ChannelKind,
  appendChannelEntry,
  bodyBreaksGrammar,
  parseChannel,
  renderChannelEntry,
  verifyChannel,
} from '../../modules/channel/index.js';
import { ORCHESTRATOR, holdsOrchestrator, readClaims } from '../../modules/claim/index.js';
import { PHASE_PATTERN } from '../../modules/spec/index.js';
import { stampNow } from '../../modules/stamp/index.js';
import {
  TASK_ID_PATTERN,
  type Task,
  parseTaskDirName,
  parseTaskFile,
  phaseRank,
} from '../../modules/task/index.js';
import { type SpecSnapshot } from '../../modules/structure/index.js';
import { renderDiagnostic } from '../../modules/diagnostic/index.js';
import { SpecStore } from '../../services/index.js';

import {
  type SizingDiagnostic,
  SURFACE_CODES,
  SurfaceError,
  diagnostic,
  dirFlag,
  nameFlag,
  opt,
  runDiagnosed,
  storeDirOf,
} from './cli.shared.module.js';

/** The caller's session, from the environment the host sets for every agent. */
const callerSession = Config.option(Config.String('OPENCODE_SESSION_ID'));

/** How long one live steer may take before it is reported as queued. */
export const STEER_TIMEOUT_MS = 30_000;

/** A failed steer: the entry is already durable, so this is never fatal. */
export class SteerFailure extends Data.TaggedError('@montflow/SteerFailure')<{
  readonly message: string;
}> {}

/**
 * The seam that delivers a rendered entry to a bound live session. A host
 * injects its own implementation; the CLI's default posts the entry through
 * the running OpenCode server's `session.prompt` route. A failed steer leaves
 * the durable entry in place, so mail never disappears.
 */
export interface SessionSteerPort {
  readonly steer: (
    session: string,
    text: string,
  ) => Effect.Effect<void, SteerFailure, ChildProcessSpawner.ChildProcessSpawner>;
}

/** Outcome of one host delivery attempt. */
interface SteerOutcome {
  readonly exit: number;
  readonly output: string;
}

/**
 * The CLI's default steer: ask the running OpenCode server to admit the entry
 * as session input. It is deliberately one process call, never a transcript
 * rewrite, so the host owns delivery semantics.
 * @param cwd - workspace root the host runs in
 * @returns the port
 */
export const opencodeSteerArgs = (session: string, text: string): ReadonlyArray<string> => [
  'api',
  'POST',
  `/api/session/${session}/prompt`,
  '--data',
  JSON.stringify({ text }),
];

export const opencodeSteerPort = (cwd: string): SessionSteerPort => ({
  steer: (session, text) => {
    const run = Effect.gen(function* () {
      const handle = yield* ChildProcess.make('opencode', [...opencodeSteerArgs(session, text)], {
        cwd,
        extendEnv: true,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const output = yield* handle.all.pipe(Stream.decodeText(), Stream.mkString);
      const exit = yield* handle.exitCode;
      return { exit: Number(exit), output };
    }).pipe(
      Effect.scoped,
      Effect.catch((cause): Effect.Effect<SteerOutcome> =>
        Effect.succeed({
          exit: 127,
          output: cause instanceof Error ? cause.message : String(cause),
        }),
      ),
      Effect.timeoutOption(STEER_TIMEOUT_MS),
      Effect.map(
        Option.getOrElse((): SteerOutcome => ({
          exit: 124,
          output: `Steering timed out after ${STEER_TIMEOUT_MS} ms.`,
        })),
      ),
    );
    return run.pipe(
      Effect.flatMap((outcome) =>
        outcome.exit === 0
          ? Effect.void
          : Effect.fail(
              new SteerFailure({
                message:
                  outcome.output.trim() === ''
                    ? `Steer exited ${outcome.exit}.`
                    : outcome.output.trim(),
              }),
            ),
      ),
    );
  },
});

/** One resolved destination: which file, which phase, and which task. */
interface Recipient {
  readonly kind: ChannelKind;
  readonly phase: string;
  /** Path relative to the spec directory. */
  readonly path: string;
  /** Addressee task id, or undefined for the board broadcast. */
  readonly task?: string | undefined;
}

/** Options for {@link sendMail}. */
export interface MailOptions {
  /** Spec store directory. */
  readonly root: string;
  /** Workspace root that owns the claim registry. */
  readonly workspace: string;
  /** Spec directory name. */
  readonly name: string;
  /** `all` for the phase board, or a task id for its mailbox. */
  readonly to: string;
  /** Message body; blank is refused. */
  readonly text: string;
  /** Phase that owns the board; derived when omitted. */
  readonly phase?: string | undefined;
  /** Calling session; the orchestrator binding must name it. */
  readonly session?: string | undefined;
  /** Delivery seam; a non-live target needs none. */
  readonly steer?: SessionSteerPort | undefined;
}

/** How one mail call ended. */
export type MailDelivery = 'delivered-live' | 'queued';

/** Result of one `mail` write. */
export interface MailReport {
  /** `all` or the addressee task id. */
  readonly recipient: string;
  /** Phase whose board or mailbox was written. */
  readonly phase: string;
  /** Channel path relative to the spec directory. */
  readonly path: string;
  /** Stamp the entry carries. */
  readonly at: string;
  /** Whether a live session was steered. */
  readonly delivery: MailDelivery;
  /** Steered session, when delivery was live. */
  readonly session?: string | undefined;
  /** `mail.steer-failed` when the entry was written but delivery queued. */
  readonly warning?: SizingDiagnostic | undefined;
}

/** Build one coded mail refusal. */
export const mailFailure = (input: {
  readonly code: string;
  readonly path: string;
  readonly field: string;
  readonly problem: string;
  readonly rerun: string;
  readonly expected?: string | undefined;
  readonly actual?: string | undefined;
  readonly fix?: string | undefined;
}): SurfaceError =>
  new SurfaceError({
    operation: 'SpecMail',
    diagnostics: [
      diagnostic({
        code: input.code,
        path: input.path,
        field: input.field,
        problem: input.problem,
        rerun: input.rerun,
        expected: input.expected,
        actual: input.actual,
        fix: input.fix,
      }),
    ],
  });

/** Every parsed task directory in a snapshot. */
interface TaskDir {
  readonly dir: string;
  readonly id: string;
  readonly phase: string;
  readonly task: Task | undefined;
}

/**
 * Read every task directory from a snapshot once. Channels and phase
 * resolution both judge against this list, so neither guesses an id.
 * @param snapshot - spec directory listing
 * @returns the task directories, in snapshot order
 */
const taskDirsOf = (snapshot: SpecSnapshot): ReadonlyArray<TaskDir> => {
  const dirs: Array<TaskDir> = [];
  for (const file of snapshot.files) {
    if ((file.kind ?? 'file') !== 'file' || !file.path.endsWith('/TASK.md')) continue;
    const segments = file.path.split('/');
    if (segments.length !== 3) continue;
    const parsed = parseTaskDirName(segments[1] ?? '');
    if (parsed === undefined) continue;
    dirs.push({
      dir: `${segments[0]}/${segments[1]}`,
      id: parsed.id,
      phase: parsed.phase,
      task: parseTaskFile(file.content),
    });
  }
  return dirs;
};

/** Every phase directory named by the snapshot, in phase-rank order. */
const phasesOf = (snapshot: SpecSnapshot): ReadonlyArray<string> =>
  [
    ...new Set(
      snapshot.files
        .map((file) => file.path.split('/')[0] ?? '')
        .filter((segment) => PHASE_PATTERN.test(segment)),
    ),
  ].toSorted((left, right) => phaseRank(left) - phaseRank(right));

/**
 * The phase a broadcast belongs to when `--phase` is omitted: the first phase
 * that still holds unfinished work, or the last phase once everything is
 * complete.
 * @param snapshot - spec directory listing
 * @param tasks - parsed task directories
 * @returns the active phase, or undefined when the spec has no phase
 */
export const mailPhaseOf = (
  snapshot: SpecSnapshot,
  tasks: ReadonlyArray<TaskDir>,
): string | undefined => {
  const phases = phasesOf(snapshot);
  const open = phases.find((phase) =>
    tasks.some((candidate) => candidate.phase === phase && candidate.task?.status !== 'complete'),
  );
  return open ?? phases.at(-1);
};

/** Resolve `--to` to the one file this call writes. */
const resolveRecipient = (
  snapshot: SpecSnapshot,
  name: string,
  options: MailOptions,
  tasks: ReadonlyArray<TaskDir>,
): Effect.Effect<Recipient, SurfaceError> => {
  if (options.to === BROADCAST) {
    const phase = options.phase ?? mailPhaseOf(snapshot, tasks);
    if (phase === undefined) {
      return Effect.fail(
        mailFailure({
          code: SURFACE_CODES.unknownPhase,
          path: name,
          field: '--phase',
          problem: `Spec '${name}' has no phase to broadcast to.`,
          rerun: `mf-specs mail --name ${name} --to all --phase <id> --text <text>`,
          expected: 'a phase directory',
          actual: 'no phase',
          fix: 'Create the phase first, or pass `--phase` naming an existing one.',
        }),
      );
    }
    if (!phasesOf(snapshot).includes(phase)) {
      return Effect.fail(
        mailFailure({
          code: SURFACE_CODES.unknownPhase,
          path: `${name}/${phase}`,
          field: '--phase',
          problem: `Phase '${phase}' has no directory in spec '${name}'.`,
          rerun: `mf-specs mail --name ${name} --to all --text <text>`,
          expected: 'a phase id declared in this spec',
          actual: phase,
          fix: 'Use the phase id the derived state reports.',
        }),
      );
    }
    return Effect.succeed({ kind: 'board', phase, path: `${phase}/${BOARD_FILE}` });
  }

  if (!TASK_ID_PATTERN.test(options.to)) {
    return Effect.fail(
      mailFailure({
        code: CHANNEL_CODES.mailUnknownRecipient,
        path: name,
        field: '--to',
        problem: `'${options.to}' is not a task id and is not '${BROADCAST}'.`,
        rerun: `mf-specs mail --name ${name} --to <task-id|all> --text <text>`,
        expected: `'${BROADCAST}' or a task id matching ${TASK_ID_PATTERN.source}`,
        actual: options.to,
        fix: 'Address the task id that owns the mailbox, or `all` for the phase board.',
      }),
    );
  }
  const target = tasks.find((candidate) => candidate.id === options.to);
  if (target === undefined) {
    return Effect.fail(
      mailFailure({
        code: CHANNEL_CODES.mailUnknownRecipient,
        path: name,
        field: '--to',
        problem: `Task '${options.to}' does not exist in spec '${name}'.`,
        rerun: `mf-specs mail --name ${name} --to <task-id|all> --text <text>`,
        expected: 'a task id declared in this spec',
        actual: options.to,
        fix: 'Check the id with `mf-specs state --name <spec>`, then address an existing task.',
      }),
    );
  }
  if (options.phase !== undefined && options.phase !== target.phase) {
    return Effect.fail(
      mailFailure({
        code: CHANNEL_CODES.mailUnknownRecipient,
        path: name,
        field: '--phase',
        problem: `Task '${options.to}' belongs to phase '${target.phase}', not '${options.phase}'.`,
        rerun: `mf-specs mail --name ${name} --to ${options.to} --phase ${target.phase} --text <text>`,
        expected: `phase ${target.phase}`,
        actual: options.phase,
        fix: "Pass the task's own phase, or omit `--phase` for a task target.",
      }),
    );
  }
  return Effect.succeed({
    kind: 'mailbox',
    phase: target.phase,
    path: `${target.dir}/${MAILBOX_FILE}`,
    task: target.id,
  });
};

/** The live binding for one task, if the runtime registry holds one. */
const liveClaim = (
  claims: ReadonlyArray<{ readonly spec: string; readonly task: string; readonly session: string }>,
  spec: string,
  task: string,
): { readonly session: string } | undefined => {
  const found = claims.findLast((claim) => claim.spec === spec && claim.task === task);
  return found === undefined ? undefined : { session: found.session };
};

/**
 * Write one addressed entry and deliver it to a live target. Only a session
 * holding the spec's orchestrator binding may call this, and the sender is
 * derived from that binding: there is no `--from`, so a worker can never send
 * mail or impersonate another task. The entry is written before steering, so a
 * failed delivery queues rather than losing the message.
 * @param options - recipient, text, caller session, and the delivery port
 * @returns the written entry and how it was delivered
 */
export const sendMail = (
  options: MailOptions,
): Effect.Effect<
  MailReport,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const claims = yield* readClaims(options.workspace);
    if (!holdsOrchestrator(claims, options.name, options.session)) {
      return yield* Effect.fail(
        mailFailure({
          code: CHANNEL_CODES.mailNotOrchestrator,
          path: options.name,
          field: 'session',
          problem: `Session ${options.session === undefined || options.session === '' ? '(none)' : `'${options.session}'`} does not hold the orchestrator binding for '${options.name}'.`,
          rerun: `mf-specs claim --name ${options.name} --orchestrator`,
          expected: 'a session bound with `claim --orchestrator`',
          actual: options.session ?? 'no session',
          fix: 'The execution orchestrator binds itself with `mf-specs claim --name <spec> --orchestrator`; a worker may never send mail.',
        }),
      );
    }

    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.exists(options.root, options.name))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation: 'SpecMail',
          reason: `Spec directory '${options.name}' was not found under ${options.root}.`,
          path: `${options.root}/${options.name}`,
        }),
      );
    }
    const snapshot = yield* store.snapshot(options.root, options.name);
    const tasks = taskDirsOf(snapshot);
    const recipient = yield* resolveRecipient(snapshot, options.name, options, tasks);
    const path = `${options.name}/${recipient.path}`;
    const rerun = `mf-specs mail --name ${options.name} --to ${options.to} --text <text>`;

    const text = options.text.trim();
    if (text === '') {
      return yield* Effect.fail(
        mailFailure({
          code: CHANNEL_CODES.mailEmptyEntry,
          path,
          field: recipient.path,
          problem: 'A mail entry needs a non-empty body.',
          rerun,
          expected: 'at least one non-blank line of text',
          actual: 'empty',
          fix: 'Pass `--text <message>`.',
        }),
      );
    }
    if (bodyBreaksGrammar(options.text)) {
      return yield* Effect.fail(
        mailFailure({
          code: CHANNEL_CODES.mailMalformedEntry,
          path,
          field: recipient.path,
          problem:
            'The message body contains a level-2 `## ` heading, which would start another entry.',
          rerun,
          expected: 'a body with no line beginning `## `',
          actual: 'a `## ` line',
          fix: 'Rephrase the heading (for example use `###`), or send it as a separate mail.',
        }),
      );
    }

    const existing = snapshot.files.find(
      (file) => file.path === recipient.path && (file.kind ?? 'file') === 'file',
    )?.content;
    if (existing !== undefined) {
      const taskIds = new Set(tasks.map((task) => task.id));
      const verified = verifyChannel(recipient.kind, existing, {
        taskIds,
        owner: recipient.task,
      });
      const first = verified.issues[0];
      if (first !== undefined) {
        return yield* Effect.fail(
          mailFailure({
            code: first.code ?? CHANNEL_CODES.mailMalformedEntry,
            path,
            field: first.field,
            problem: `${recipient.path} already holds an entry that fails the grammar, so mail refuses to append to it: ${first.message}`,
            rerun: `mf-specs check --name ${options.name}`,
            expected: 'a parseable board or mailbox',
            actual: first.message,
            fix: 'Repair or remove the malformed entry by hand; mail never appends to a corrupt channel.',
          }),
        );
      }
    }

    // The clock is the only source. When it is behind the last entry (a skew or
    // a test clock), keep the last stamped instant so mail can never append an
    // out-of-order entry; the verifier's ordering proxy stays true.
    const clockNow = yield* stampNow;
    const previousAt =
      existing === undefined
        ? undefined
        : parseChannel(recipient.kind, existing).entries.at(-1)?.at;
    const at = previousAt !== undefined && clockNow < previousAt ? previousAt : clockNow;
    const to = recipient.task ?? BROADCAST;
    const content = appendChannelEntry(recipient.kind, existing, {
      at,
      from: ORCHESTRATOR,
      to,
      text,
    });
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(`${options.root}/${options.name}/${recipient.path}`, content).pipe(
      Effect.mapError((cause) =>
        mailFailure({
          code: CHANNEL_CODES.mailWriteFailed,
          path,
          field: recipient.path,
          problem: `Cannot write '${path}'.`,
          rerun,
          expected: 'a writable channel file',
          actual: cause instanceof Error ? cause.message : String(cause),
          fix: 'Check the owner directory is writable, then re-send the mail.',
        }),
      ),
    );

    if (recipient.task === undefined) {
      return {
        recipient: to,
        phase: recipient.phase,
        path: recipient.path,
        at,
        delivery: 'queued' as const,
      };
    }

    const claim = liveClaim(claims, options.name, recipient.task);
    if (claim === undefined) {
      return {
        recipient: to,
        phase: recipient.phase,
        path: recipient.path,
        at,
        delivery: 'queued' as const,
      };
    }

    const delivered =
      options.steer === undefined
        ? {
            failure: new SteerFailure({ message: 'No steer port is available.' }),
          }
        : yield* options.steer
            .steer(claim.session, renderChannelEntry({ at, from: ORCHESTRATOR, to, text }))
            .pipe(Effect.result);
    if (!('failure' in delivered)) {
      return {
        recipient: to,
        phase: recipient.phase,
        path: recipient.path,
        at,
        delivery: 'delivered-live' as const,
        session: claim.session,
      };
    }
    return {
      recipient: to,
      phase: recipient.phase,
      path: recipient.path,
      at,
      delivery: 'queued' as const,
      session: claim.session,
      warning: diagnostic({
        code: CHANNEL_CODES.mailSteerFailed,
        path,
        field: 'session',
        problem: `The entry is written but steering session '${claim.session}' failed: ${delivered.failure.message}`,
        rerun,
        expected: `a live session '${claim.session}' that accepts a prompt`,
        actual: delivered.failure.message,
        fix: 'The entry queues; it is read when the task starts. Re-send once the session is live, or let the worker read its mailbox.',
        warning: true,
      }),
    };
  });

/** Render one mail outcome. */
export const renderMail = (report: MailReport): string => {
  const head =
    report.delivery === 'delivered-live' && report.session !== undefined
      ? `\u2713 delivered live ${report.session} \u00b7 ${report.path}`
      : `\u2713 queued \u00b7 ${report.path}`;
  if (report.warning !== undefined) {
    return `${head}\n\n${renderDiagnostic(report.warning)}`;
  }
  if (report.recipient === BROADCAST) {
    return `${head}\nEvery worker reads the board at task start.`;
  }
  return report.delivery === 'delivered-live'
    ? head
    : `${head}\nThe target is not live; it reads this entry at task start.`;
};

/** Shared handler: resolve the workspace root a `--dir` names. */
const workspaceOfDir = (dir: string): string => (dir === '.' ? process.cwd() : dir);

/** `mail`: append one addressed entry and steer a live target. */
export const mailCommand = Command.make(
  'mail',
  {
    dir: dirFlag,
    name: nameFlag,
    to: Flag.String('to').pipe(
      Flag.withDescription('`all` for the phase board, or the task id whose mailbox receives it.'),
    ),
    text: Flag.String('text').pipe(
      Flag.withDescription('Message body; never includes a timestamp.'),
    ),
    phase: Flag.optional(
      Flag.String('phase').pipe(
        Flag.withDescription('Phase that owns a board broadcast; derived when omitted.'),
      ),
    ),
    session: Flag.optional(
      Flag.String('session').pipe(
        Flag.withDescription('Caller session; defaults to OPENCODE_SESSION_ID.'),
      ),
    ),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const workspace = workspaceOfDir(config.dir);
        const envSession = Option.getOrUndefined(yield* callerSession);
        const report = yield* sendMail({
          root: storeDirOf(config.dir),
          workspace,
          name: config.name,
          to: config.to,
          text: config.text,
          phase: opt(config.phase),
          session: opt(config.session) ?? envSession,
          steer: opencodeSteerPort(workspace),
        });
        yield* Console.log(renderMail(report));
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs mail --name ${config.name} --to ${config.to} --text <text>`,
        verbose: false,
      }),
    ),
).pipe(
  Command.withDescription('Append one addressed board or mailbox entry and steer a live target.'),
  Command.provide(SpecStore.Default),
);
