import { Config, Console, Effect, FileSystem, Option, Path } from 'effect';
import { Command, Flag } from 'effect/cli';

import {
  CLAIMS_FILE,
  ORCHESTRATOR,
  type Claim,
  type TransactionEntry,
  type TransactionOptions,
  ClaimLockError,
  claimsPath,
  commitTransaction,
  holdsOrchestrator,
  readClaims,
  renderClaims,
  renderPhaseStatus,
  renderSpecRow,
  renderSpecStatus,
  renderStatusField,
  withClaimsLock,
} from '../../modules/claim/index.js';
import {
  GATE_CODES,
  GATE_RESULTS_FILE,
  parseGates,
  verifyGateResults,
} from '../../modules/gates/index.js';
import { PHASE_FILE, derivePhaseStatus, phaseEvidence } from '../../modules/phase/index.js';
import { parseMarkdown } from '../../modules/frontmatter/index.js';
import { reviewDecisionPassed } from '../../modules/review-policy/index.js';
import { phaseReviewBudget } from '../../modules/sizing/index.js';
import { parseSpecFile, readSpecVersion } from '../../modules/spec/index.js';
import { stampNow } from '../../modules/stamp/index.js';
import {
  type Task,
  parseTaskDirName,
  parseTaskFile,
  phaseOf,
  sizeOf,
  verifyTaskCompletion,
} from '../../modules/task/index.js';
import type { SpecSnapshot } from '../../modules/structure/index.js';
import { SpecStore } from '../../services/index.js';

import {
  SURFACE_CODES,
  SurfaceError,
  diagnostic,
  dirFlag,
  nameFlag,
  opt,
  runDiagnosed,
  storeDirOf,
  VALIDATION_EXIT_CODE,
} from './cli.shared.module.js';

/** Stable codes for `claim`. */
export const CLAIM_CODES = {
  taken: 'claim.taken',
  notReady: 'claim.not-ready',
  invalidTransition: 'claim.invalid-transition',
  completionUnchecked: 'claim.completion-unchecked',
  gateUnproven: 'claim.gate-unproven',
  reviewNotPassed: 'claim.review-not-passed',
  rowMissing: 'claim.row-missing',
  specComplete: 'claim.spec-complete',
  locked: 'claim.locked',
  sessionMissing: 'claim.session-missing',
  notOrchestrator: 'claim.not-orchestrator',
  orchestratorTaken: 'claim.orchestrator-taken',
  reasonMissing: 'claim.reason-missing',
  forceInvalid: 'claim.force-invalid',
  notOwner: 'claim.not-owner',
  fileMissing: 'claim.file-missing',
  writeFailed: 'claim.write-failed',
} as const;

/** The form a claim invocation requests. */
export type ClaimForm = 'bind' | 'orchestrator' | 'start' | 'block' | 'close' | 'release';

/** Options for {@link claim}. */
export interface ClaimOptions {
  /** Spec store directory. */
  readonly root: string;
  /** Workspace root that owns `.agents/`. */
  readonly workspace: string;
  readonly name: string;
  /** Task id; required for every form except `orchestrator`. */
  readonly task?: string | undefined;
  /** Calling session id. */
  readonly session?: string | undefined;
  readonly orchestrator?: boolean | undefined;
  readonly start?: boolean | undefined;
  readonly block?: boolean | undefined;
  readonly close?: boolean | undefined;
  readonly release?: boolean | undefined;
  readonly force?: boolean | undefined;
  readonly reason?: string | undefined;
  /** Test seam for a forced rename failure. */
  readonly transaction?: TransactionOptions | undefined;
}

/** What a claim run did. */
export interface ClaimReport {
  readonly name: string;
  readonly form: ClaimForm;
  readonly task: string;
  readonly session: string;
  /** Task status after the call. */
  readonly status: string;
  /** True when this call wrote a status transition. */
  readonly transitioned: boolean;
}

/** One coded claim refusal. */
export const claimFailure = (input: {
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
    operation: 'SpecClaim',
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

/** The one form a set of flags requests, or the conflict that stops it. */
export const resolveClaimForm = (
  options: ClaimOptions,
): { readonly form: ClaimForm } | { readonly refusal: SurfaceError } => {
  const selected: Array<ClaimForm> = [];
  if (options.orchestrator === true) selected.push('orchestrator');
  if (options.start === true) selected.push('start');
  if (options.block === true) selected.push('block');
  if (options.close === true) selected.push('close');
  if (options.release === true) selected.push('release');
  if (selected.length === 0) return { form: 'bind' };
  if (selected.length > 1) {
    return {
      refusal: claimFailure({
        code: CLAIM_CODES.invalidTransition,
        path: '--start/--block/--close/--release/--orchestrator',
        field: 'form',
        problem: `Exactly one claim form may be selected; found ${selected.join(', ')}.`,
        rerun: 'mf-specs claim --name <spec> --task <id>',
        expected: 'one of bind, --orchestrator, --start, --block, --close, --release',
        actual: selected.join(', '),
        fix: 'Pass exactly one form flag.',
      }),
    };
  }
  return { form: selected[0] ?? 'bind' };
};

/** A snapshot file's contents. */
const fileAt = (snapshot: SpecSnapshot, path: string): string | undefined =>
  snapshot.files.find((entry) => entry.path === path && (entry.kind ?? 'file') === 'file')?.content;

/** The directory holding one task, from the snapshot. */
export const claimTaskDir = (snapshot: SpecSnapshot, id: string): string | undefined => {
  for (const entry of snapshot.files) {
    if ((entry.kind ?? 'file') !== 'file' || !entry.path.endsWith('/TASK.md')) continue;
    const dir = entry.path.slice(0, -'/TASK.md'.length);
    const leaf = dir.includes('/') ? dir.slice(dir.lastIndexOf('/') + 1) : dir;
    if (parseTaskDirName(leaf)?.id === id) return dir;
  }
  return undefined;
};

/** Every parsed task id and status in a snapshot. */
const taskStatuses = (snapshot: SpecSnapshot): ReadonlyMap<string, Task> => {
  const tasks = new Map<string, Task>();
  for (const entry of snapshot.files) {
    if ((entry.kind ?? 'file') !== 'file' || !entry.path.endsWith('/TASK.md')) continue;
    const task = parseTaskFile(entry.content);
    if (task !== undefined) tasks.set(task.id, task);
  }
  return tasks;
};

/** The absolute path of a spec-relative file. */
const absolute = (root: string, name: string, relative: string): string =>
  `${root.replace(/\/+$/, '')}/${name}/${relative}`;

/** The registry after one change. */
const nextClaims = (
  claims: ReadonlyArray<Claim>,
  change:
    | { readonly kind: 'upsert'; readonly claim: Claim }
    | { readonly kind: 'remove'; readonly spec: string; readonly task: string },
): ReadonlyArray<Claim> => {
  if (change.kind === 'upsert') {
    return [
      ...claims.filter(
        (claim) => !(claim.spec === change.claim.spec && claim.task === change.claim.task),
      ),
      change.claim,
    ];
  }
  return claims.filter((claim) => !(claim.spec === change.spec && claim.task === change.task));
};

/** Render one claim report. */
export const renderClaim = (report: ClaimReport): string => {
  const head =
    report.form === 'orchestrator'
      ? `✓ bound orchestrator to ${report.session} · ${report.name}`
      : report.form === 'bind'
        ? `✓ bound ${report.task} to ${report.session} · ${report.name}`
        : report.form === 'start'
          ? `✓ started ${report.task} · ${report.name} · ${report.status}`
          : report.form === 'block'
            ? `✓ blocked ${report.task} · ${report.name} · ${report.status}`
            : report.form === 'close'
              ? `✓ closed ${report.task} · ${report.name} · ${report.status}`
              : `✓ released ${report.task} · ${report.name} · ${report.status}`;
  return report.transitioned
    ? `${head}\n  wrote TASK.md status, SPEC.md row, PHASE.md mirror · ${report.name}`
    : head;
};

/** Read one spec snapshot and refuse a missing spec. */
const readSnapshot = (
  options: ClaimOptions,
): Effect.Effect<SpecSnapshot, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.exists(options.root, options.name))) {
      return yield* Effect.fail(
        claimFailure({
          code: SURFACE_CODES.unknownSpec,
          path: options.name,
          field: '--name',
          problem: `Spec '${options.name}' does not exist under ${options.root}.`,
          rerun: 'mf-specs list',
          expected: 'a spec directory name',
          actual: options.name,
          fix: 'Run `mf-specs list` and pass an existing spec name.',
        }),
      );
    }
    return yield* store.snapshot(options.root, options.name);
  });

/**
 * Bind, start, block, close, or release one task. Every precondition is checked
 * before any write; the three status records and the registry are staged as
 * sibling temps and renamed in order, with an explicit rollback when a rename
 * fails.
 * @param options - claim form, identifiers, session, and optional transaction seam
 * @returns what was done, failing with a coded refusal
 */
export const claim = (
  options: ClaimOptions,
): Effect.Effect<
  ClaimReport,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const formResult = resolveClaimForm(options);
    if ('refusal' in formResult) return yield* Effect.fail(formResult.refusal);
    const form = formResult.form;
    const session = options.session?.trim() ?? '';
    if (session === '') {
      return yield* Effect.fail(
        claimFailure({
          code: CLAIM_CODES.sessionMissing,
          path: options.name,
          field: '--session',
          problem: 'No calling session is available; a claim needs one.',
          rerun: `mf-specs claim --name ${options.name} --task <id> --session <session-id>`,
          expected: 'an explicit --session or OPENCODE_SESSION_ID',
          actual: 'missing',
          fix: 'Pass --session, or run inside a host that sets OPENCODE_SESSION_ID.',
        }),
      );
    }
    if (options.force === true && form !== 'release' && form !== 'orchestrator') {
      return yield* Effect.fail(
        claimFailure({
          code: CLAIM_CODES.forceInvalid,
          path: options.name,
          field: '--force',
          problem: '`--force` is only valid with `--release` or `--orchestrator`.',
          rerun: `mf-specs claim --name ${options.name} --task <id> --release --force`,
          expected: '--force with --release or --orchestrator',
          actual: form,
          fix: 'Remove --force, or use it to clear a vanished binding.',
        }),
      );
    }
    const task = form === 'orchestrator' ? ORCHESTRATOR : (options.task?.trim() ?? '');
    if (task === '') {
      return yield* Effect.fail(
        claimFailure({
          code: SURFACE_CODES.invalidArgument,
          path: '--task',
          field: '--task',
          problem: '`claim` requires --task <id> for every form except --orchestrator.',
          rerun: `mf-specs claim --name ${options.name} --task <id>`,
          expected: 'a task id',
          actual: 'missing',
          fix: 'Pass the task id from the ready set.',
        }),
      );
    }

    const snapshot = yield* readSnapshot(options);
    const specText = fileAt(snapshot, 'SPEC.md');
    const spec = specText === undefined ? undefined : parseSpecFile(specText);
    if (specText === undefined || spec === undefined) {
      return yield* Effect.fail(
        claimFailure({
          code: SURFACE_CODES.unknownSpec,
          path: `${options.name}/SPEC.md`,
          field: 'SPEC.md',
          problem: `Spec '${options.name}' has no readable SPEC.md.`,
          rerun: `mf-specs check --name ${options.name}`,
          expected: 'a readable SPEC.md',
          actual: 'missing or invalid',
          fix: 'Repair SPEC.md before claiming a task.',
        }),
      );
    }
    if (spec.status === 'complete' && form !== 'release') {
      return yield* Effect.fail(
        claimFailure({
          code: CLAIM_CODES.specComplete,
          path: options.name,
          field: 'status',
          problem: `Spec '${options.name}' is complete; no task may be bound or transitioned.`,
          rerun: `mf-specs state --name ${options.name}`,
          expected: 'an in-progress spec',
          actual: 'complete',
          fix: 'Complete specs are frozen records; a new spec owns new work.',
        }),
      );
    }

    const claims = yield* readClaims(options.workspace);
    const orchestrator = holdsOrchestrator(claims, options.name, session);
    const restricted = form === 'start' || form === 'block' || form === 'close';
    const resettingRelease = form === 'release' && orchestrator && asksToReset(snapshot, task);
    if (
      (restricted || (form === 'release' && options.force === true) || resettingRelease) &&
      !orchestrator
    ) {
      return yield* Effect.fail(
        claimFailure({
          code: CLAIM_CODES.notOrchestrator,
          path: options.name,
          field: 'session',
          problem: `Session '${session}' does not hold the orchestrator binding for '${options.name}'.`,
          rerun: `mf-specs claim --name ${options.name} --orchestrator`,
          expected: 'a session bound with `claim --orchestrator`',
          actual: session,
          fix: 'Only the execution orchestrator transitions status; a worker binds and releases only itself.',
        }),
      );
    }

    if (form === 'orchestrator') {
      const existing = claims.find(
        (entry) => entry.spec === options.name && entry.task === ORCHESTRATOR,
      );
      if (existing !== undefined && existing.session !== session && options.force !== true) {
        return yield* Effect.fail(
          claimFailure({
            code: CLAIM_CODES.orchestratorTaken,
            path: options.name,
            field: 'session',
            problem: `Spec '${options.name}' already has orchestrator session '${existing.session}'.`,
            rerun: `mf-specs claim --name ${options.name} --orchestrator --force`,
            expected: 'no other orchestrator binding, or --force for a vanished session',
            actual: existing.session,
            fix: 'If that session is gone, re-bind with --force.',
          }),
        );
      }
      const at = yield* stampNow;
      yield* writeRegistry(options, claims, {
        kind: 'upsert',
        claim: { spec: options.name, task: ORCHESTRATOR, session, at },
      });
      return {
        name: options.name,
        form,
        task: ORCHESTRATOR,
        session,
        status: spec.status,
        transitioned: false,
      };
    }

    const tasks = taskStatuses(snapshot);
    const current = tasks.get(task);
    const dir = claimTaskDir(snapshot, task);
    const taskText = dir === undefined ? undefined : fileAt(snapshot, `${dir}/TASK.md`);
    if (current === undefined || dir === undefined || taskText === undefined) {
      return yield* Effect.fail(
        claimFailure({
          code: SURFACE_CODES.unknownTask,
          path: options.name,
          field: '--task',
          problem: `Task '${task}' does not exist in spec '${options.name}'.`,
          rerun: `mf-specs next --name ${options.name}`,
          expected: 'a task id in this spec',
          actual: task,
          fix: 'Use an id from the ready set.',
        }),
      );
    }
    const phase = phaseOf(task);
    const phaseText = fileAt(snapshot, `${phase}/${PHASE_FILE}`);
    if (phaseText === undefined) {
      return yield* Effect.fail(
        claimFailure({
          code: CLAIM_CODES.fileMissing,
          path: `${options.name}/${phase}/${PHASE_FILE}`,
          field: PHASE_FILE,
          problem: `Phase '${phase}' has no ${PHASE_FILE}, so its status mirror cannot be written.`,
          rerun: `mf-specs migrate --name ${options.name}`,
          expected: `a ${PHASE_FILE} in the phase directory`,
          actual: 'missing',
          fix: 'Run mf-specs migrate for this v1 spec, then retry.',
        }),
      );
    }
    if (!parseSpecRowPresent(specText, task)) {
      return yield* Effect.fail(
        claimFailure({
          code: CLAIM_CODES.rowMissing,
          path: `${options.name}/SPEC.md`,
          field: '## Tasks',
          problem: `SPEC.md has no task-table row for '${task}'.`,
          rerun: `mf-specs check --name ${options.name}`,
          expected: `a row whose id is '${task}'`,
          actual: 'missing row',
          fix: 'Repair the task table with new-task or migrate; claim never invents a row.',
        }),
      );
    }

    const blockers = current.dependsOn
      .filter((dependency) => tasks.get(dependency)?.status !== 'complete')
      .map((dependency) => `${dependency} (${tasks.get(dependency)?.status ?? 'unknown'})`);
    // The review is last: its ready set is every non-review task complete,
    // even when the task's depends-on line was written without those edges.
    if (current.type === 'review') {
      for (const [id, candidate] of tasks) {
        if (id === task || candidate.type === 'review') continue;
        if (phaseOf(id) !== phase || candidate.status === 'complete') continue;
        blockers.push(`${id} (${candidate.status})`);
      }
    }
    if ((form === 'bind' || form === 'start') && blockers.length > 0) {
      return yield* Effect.fail(
        claimFailure({
          code: CLAIM_CODES.notReady,
          path: `${options.name}/${task}`,
          field: 'depends-on',
          problem: `Task '${task}' is not ready; ${blockers.join(', ')} not complete.`,
          rerun: `mf-specs next --name ${options.name}`,
          expected: 'every dependency complete',
          actual: blockers.join(', '),
          fix: 'Dispatch the blocking tasks first.',
        }),
      );
    }

    // ── Per-form preconditions and the resulting status ───────────────
    let status = current.status;
    let registryChange:
      | { readonly kind: 'upsert'; readonly claim: Claim }
      | { readonly kind: 'remove'; readonly spec: string; readonly task: string }
      | undefined;
    const at = yield* stampNow;
    if (form === 'bind') {
      const taken = claims.find((entry) => entry.spec === options.name && entry.task === task);
      if (taken !== undefined) {
        return yield* Effect.fail(
          claimFailure({
            code: CLAIM_CODES.taken,
            path: options.name,
            field: '--task',
            problem: `Task '${task}' is already bound to session '${taken.session}'.`,
            rerun: `mf-specs claim --name ${options.name} --task ${task} --release --force`,
            expected: 'an unbound task',
            actual: taken.session,
            fix: 'The orchestrator clears a vanished binding with --release --force.',
          }),
        );
      }
      if (current.status !== 'pending' && current.status !== 'in-progress') {
        return yield* Effect.fail(
          claimFailure({
            code: CLAIM_CODES.invalidTransition,
            path: `${options.name}/${task}`,
            field: 'status',
            problem: `Cannot bind task '${task}' while it is '${current.status}'.`,
            rerun: `mf-specs state --name ${options.name}`,
            expected: 'a pending or in-progress task',
            actual: current.status,
            fix: 'Release the task, then bind it once it is pending.',
          }),
        );
      }
      registryChange = {
        kind: 'upsert',
        claim: { spec: options.name, task, session, at },
      };
    } else if (form === 'start') {
      if (current.status !== 'pending') {
        return yield* Effect.fail(
          commitFailure(
            CLAIM_CODES.invalidTransition,
            options,
            task,
            `Cannot start a '${current.status}' task; --start is pending -> in-progress.`,
            'a pending task',
            current.status,
            'Use --release for a blocked task, or --close for an in-progress one.',
          ),
        );
      }
      status = 'in-progress';
    } else if (form === 'block') {
      if (current.status !== 'pending' && current.status !== 'in-progress') {
        return yield* Effect.fail(
          commitFailure(
            CLAIM_CODES.invalidTransition,
            options,
            task,
            `Cannot block a '${current.status}' task; --block is pending|in-progress -> blocked.`,
            'a pending or in-progress task',
            current.status,
            'Only open work can be blocked.',
          ),
        );
      }
      if (options.reason === undefined || options.reason.trim() === '') {
        return yield* Effect.fail(
          commitFailure(
            CLAIM_CODES.reasonMissing,
            options,
            task,
            '--block needs one reason for the record.',
            '--reason <one line>',
            'missing',
            'State what blocks the task in one line.',
          ),
        );
      }
      status = 'blocked';
      registryChange = { kind: 'remove', spec: options.name, task };
    } else if (form === 'close') {
      if (current.status !== 'in-progress') {
        return yield* Effect.fail(
          commitFailure(
            CLAIM_CODES.invalidTransition,
            options,
            task,
            `Cannot close a '${current.status}' task; --close is in-progress -> complete.`,
            'an in-progress task',
            current.status,
            'Start the task before closing it.',
          ),
        );
      }
      const parsedTask = parseMarkdown(taskText);
      const unchecked =
        parsedTask === null ? [] : verifyTaskCompletion('complete', parsedTask.body);
      if (unchecked.length > 0) {
        return yield* Effect.fail(
          claimFailure({
            code: CLAIM_CODES.completionUnchecked,
            path: `${options.name}/${dir}/TASK.md`,
            field: '## Completion',
            problem: unchecked[0]?.message ?? 'The completion checklist is not fully checked.',
            rerun: `mf-specs claim --name ${options.name} --task ${task} --close`,
            expected: 'every completion item checked',
            actual: 'unchecked items remain',
            fix: 'Check each finished item, or keep the task in progress.',
          }),
        );
      }
      const gatesText = fileAt(snapshot, `${dir}/GATES.md`);
      if (gatesText !== undefined) {
        const classified = parseGates(gatesText).some((stage) => stage.kind !== undefined);
        if (!classified) {
          return yield* Effect.fail(
            claimFailure({
              code: CLAIM_CODES.gateUnproven,
              path: `${options.name}/${dir}/GATES.md`,
              field: GATES_FILE_FIELD,
              problem: `Task '${task}' declares no classified gate stage, so no mechanical proof can be run.`,
              rerun: `mf-specs gate run --name ${options.name} --phase ${phase} --task ${task}`,
              expected: 'at least one `(mechanical)` stage with a `command:` line',
              actual: 'every stage is unclassified',
              fix: 'Classify a stage as mechanical and name its command, then run the gate.',
            }),
          );
        }
        const resultsText = fileAt(snapshot, `${dir}/${GATE_RESULTS_FILE}`);
        const proof = verifyGateResults({
          gates: gatesText,
          results: resultsText,
          complete: true,
          owner: `Task '${task}'`,
        });
        const unproven = proof.issues.find((found) => found.code === GATE_CODES.unproven);
        if (unproven !== undefined) {
          return yield* Effect.fail(
            claimFailure({
              code: CLAIM_CODES.gateUnproven,
              path: `${options.name}/${dir}/GATES.md`,
              field: GATES_FILE_FIELD,
              problem: unproven.message,
              rerun: `mf-specs gate run --name ${options.name} --phase ${phase} --task ${task}`,
              expected: unproven.expected ?? 'a recorded passing mechanical result',
              actual: unproven.actual,
              fix: unproven.fix ?? 'Run the gate, then close the task.',
            }),
          );
        }
      }
      const parsedSpec = parseMarkdown(specText);
      const currentVersion = parsedSpec !== null && readSpecVersion(parsedSpec.fields).version >= 2;
      if (currentVersion && current.type === 'review') {
        const store = yield* SpecStore.SpecStore;
        const series = yield* store.reviewSeries(options.root, options.name);
        const evidence = phaseEvidence(snapshot);
        const phaseTasks = [...tasks.values()].filter(
          (candidate) => phaseOf(candidate.id) === phase,
        );
        const verdict = reviewDecisionPassed(
          options.name,
          {
            phase,
            profiles: current.reviewerProfiles,
            budget: phaseReviewBudget(
              phaseTasks.map((candidate) => ({
                type: candidate.type,
                size: sizeOf(candidate),
              })),
            ),
            waived: evidence.waived.includes(phase),
          },
          series,
        );
        if (!verdict.passed) {
          return yield* Effect.fail(
            claimFailure({
              code: CLAIM_CODES.reviewNotPassed,
              path: `${options.name}/${phase}`,
              field: 'review',
              problem: `Review task '${task}' cannot close: the phase review has not passed (decision '${verdict.decision}', reason '${verdict.reason}').`,
              rerun: `mf-specs review decide --name ${options.name} --phase ${phase} --mode guided`,
              expected: "a 'pass' decision with a passing round in every expected series",
              actual: `decision ${verdict.decision}`,
              fix: 'Follow the decision verb, then close the review task.',
            }),
          );
        }
      }
      status = 'complete';
      registryChange = { kind: 'remove', spec: options.name, task };
    } else {
      // --release: an orchestrator reset, or a worker's own binding removal.
      const own = claims.find((entry) => entry.spec === options.name && entry.task === task);
      if (!orchestrator && (own === undefined || own.session !== session)) {
        return yield* Effect.fail(
          claimFailure({
            code: CLAIM_CODES.notOwner,
            path: options.name,
            field: 'session',
            problem: `Session '${session}' does not hold the binding for task '${task}'.`,
            rerun: `mf-specs claim --name ${options.name} --task ${task} --release`,
            expected: 'the binding this session owns',
            actual: own?.session ?? 'no binding',
            fix: 'A worker releases only its own binding; the orchestrator releases any.',
          }),
        );
      }
      if (orchestrator && (current.status === 'in-progress' || current.status === 'blocked')) {
        status = 'pending';
      }
      registryChange = { kind: 'remove', spec: options.name, task };
    }

    const nextTaskText = renderStatusField(taskText, status);
    const nextSpecRow = renderSpecRow(specText, task, status);
    if (nextSpecRow === undefined) {
      return yield* Effect.fail(
        claimFailure({
          code: CLAIM_CODES.rowMissing,
          path: `${options.name}/SPEC.md`,
          field: '## Tasks',
          problem: `SPEC.md has no task-table row for '${task}'.`,
          rerun: `mf-specs check --name ${options.name}`,
          expected: `a row whose id is '${task}'`,
          actual: 'missing row',
          fix: 'Repair the task table with new-task or migrate.',
        }),
      );
    }
    const statuses = [...tasks.values()].map((entry) =>
      entry.id === task ? status : entry.status,
    );
    const specStatus =
      statuses.length > 0 && statuses.every((entry) => entry === 'complete')
        ? 'complete'
        : 'in-progress';
    const nextSpecText = renderSpecStatus(nextSpecRow, specStatus);
    const inPhase = [...tasks.values()]
      .filter((entry) => phaseOf(entry.id) === phase)
      .map((entry) => (entry.id === task ? status : entry.status));
    const nextPhaseText = renderPhaseStatus(phaseText, derivePhaseStatus(inPhase));

    const changed = status !== current.status;
    const registry =
      registryChange === undefined
        ? yield* readClaims(options.workspace)
        : nextClaims(claims, registryChange);
    const entries: Array<TransactionEntry> = [];
    if (changed) {
      entries.push({
        path: absolute(options.root, options.name, `${dir}/TASK.md`),
        content: nextTaskText,
      });
      entries.push({
        path: absolute(options.root, options.name, 'SPEC.md'),
        content: nextSpecText,
      });
      entries.push({
        path: absolute(options.root, options.name, `${phase}/${PHASE_FILE}`),
        content: nextPhaseText,
      });
    }
    if (registryChange !== undefined || changed) {
      entries.push({ path: claimsPath(options.workspace), content: renderClaims(registry) });
    }
    if (entries.length > 0) {
      yield* commitTransaction(entries, options.transaction).pipe(
        Effect.mapError((error) =>
          claimFailure({
            code: CLAIM_CODES.writeFailed,
            path: error.path,
            field: 'claim',
            problem: `${error.reason} The claim transaction rolled back; no status changed.`,
            rerun: `mf-specs claim --name ${options.name} --task ${task}`,
            expected: 'all four files written atomically',
            actual: error.reason,
            fix: 'Check the spec directory is writable, then retry.',
          }),
        ),
      );
    }
    return {
      name: options.name,
      form,
      task,
      session,
      status,
      transitioned: changed,
    };
  });

/** True when a release would reset the task's status (orchestrator path only). */
const asksToReset = (snapshot: SpecSnapshot, task: string): boolean => {
  const current = taskStatuses(snapshot).get(task);
  return current?.status === 'in-progress' || current?.status === 'blocked';
};

/** True when SPEC.md's task table names `id`. */
const parseSpecRowPresent = (markdown: string, id: string): boolean => {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  return markdown
    .split(newline)
    .some((line) => /^\|\s*([A-Z]{1,2}\d{3})\s*\|/.exec(line.trim())?.[1] === id);
};

/** One coded transition refusal that names the task and the repair. */
const commitFailure = (
  code: string,
  options: ClaimOptions,
  task: string,
  problem: string,
  expected: string,
  actual: string,
  fix: string,
): SurfaceError =>
  claimFailure({
    code,
    path: `${options.name}/${task}`,
    field: 'status',
    problem,
    rerun: `mf-specs state --name ${options.name}`,
    expected,
    actual,
    fix,
  });

/** The field a gate refusal reports. */
const GATES_FILE_FIELD = 'GATES.md';

/** Write one registry change under the registry lock. */
const writeRegistry = (
  options: ClaimOptions,
  claims: ReadonlyArray<Claim>,
  change:
    | { readonly kind: 'upsert'; readonly claim: Claim }
    | { readonly kind: 'remove'; readonly spec: string; readonly task: string },
): Effect.Effect<ClaimReport, SurfaceError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const entries: ReadonlyArray<TransactionEntry> = [
      { path: claimsPath(options.workspace), content: renderClaims(nextClaims(claims, change)) },
    ];
    yield* commitTransaction(entries, options.transaction).pipe(
      Effect.mapError((error) =>
        claimFailure({
          code: CLAIM_CODES.writeFailed,
          path: error.path,
          field: 'claim',
          problem: `${error.reason} The registry is unchanged.`,
          rerun: `mf-specs claim --name ${options.name} --task <id>`,
          expected: 'the registry written atomically',
          actual: error.reason,
          fix: 'Check the runtime directory is writable, then retry.',
        }),
      ),
    );
    return {
      name: options.name,
      form: 'orchestrator',
      task: ORCHESTRATOR,
      session: change.kind === 'upsert' ? change.claim.session : '',
      status: 'orchestrator',
      transitioned: false,
    };
  });

/** The host session environment variable. */
const callerSession = Config.option(Config.String('OPENCODE_SESSION_ID'));

/** Run one claim under the registry lock and map a lock timeout to its code. */
const runLocked = (
  options: ClaimOptions,
): Effect.Effect<
  ClaimReport,
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore | FileSystem.FileSystem | Path.Path
> =>
  withClaimsLock(options.workspace, claim(options)).pipe(
    Effect.catchIf(
      (error): error is ClaimLockError => error instanceof ClaimLockError,
      (error) =>
        Effect.fail(
          claimFailure({
            code: CLAIM_CODES.locked,
            path: error.path,
            field: 'claims',
            problem:
              'The claim registry stayed locked for 5 seconds; another claim is still running.',
            rerun: `mf-specs claim --name ${options.name} --task <id>`,
            expected: 'the registry lock to be free',
            actual: 'held',
            fix: 'Wait for the other claim to finish, or remove a stale claims.lock if its writer died.',
          }),
        ),
    ),
  );

/** The workspace root a claim's registry lives under. */
const workspaceOfDir = (dir: string): string => (dir === '.' ? process.cwd() : dir);

/** `claim`: bind a session, or transition a task's status atomically. */
export const claimCommand = Command.make(
  'claim',
  {
    dir: dirFlag,
    name: nameFlag,
    task: Flag.optional(Flag.String('task')),
    session: Flag.optional(Flag.String('session')),
    orchestrator: Flag.Boolean('orchestrator').pipe(
      Flag.withDescription('Bind this session as the spec orchestrator.'),
      Flag.withDefault(false),
    ),
    start: Flag.Boolean('start').pipe(Flag.withDefault(false)),
    block: Flag.Boolean('block').pipe(Flag.withDefault(false)),
    close: Flag.Boolean('close').pipe(Flag.withDefault(false)),
    release: Flag.Boolean('release').pipe(Flag.withDefault(false)),
    force: Flag.Boolean('force').pipe(
      Flag.withDescription('Clear a binding owned by a vanished session (or reset a task).'),
      Flag.withDefault(false),
    ),
    reason: Flag.optional(Flag.String('reason')),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const environment = yield* callerSession;
        const session =
          opt(config.session) ?? (Option.isSome(environment) ? environment.value : undefined);
        const workspace = workspaceOfDir(config.dir);
        const report = yield* runLocked({
          root: storeDirOf(config.dir),
          workspace,
          name: config.name,
          task: opt(config.task),
          session,
          orchestrator: config.orchestrator,
          start: config.start,
          block: config.block,
          close: config.close,
          release: config.release,
          force: config.force,
          reason: opt(config.reason),
        });
        yield* Console.log(renderClaim(report));
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs claim --name ${config.name} --task <id>`,
        verbose: false,
      }),
    ),
).pipe(
  Command.withDescription('Bind a session or transition a task status atomically.'),
  Command.provide(SpecStore.Default),
);

/** Re-exported for tests that assert the claim refusal codes. */
export { CLAIMS_FILE, VALIDATION_EXIT_CODE };
