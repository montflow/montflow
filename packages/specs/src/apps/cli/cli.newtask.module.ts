import { Console, Effect } from 'effect';
import { Command, Flag } from 'effect/cli';

import { defaultWriteScope, gateTemplateFor } from '../../modules/init/index.js';
import {
  PHASE_FILE,
  parsePhaseFile,
  renderPhaseMemory,
  renderPhaseReview,
} from '../../modules/phase/index.js';
import { DEFAULT_SIZE, SIZES, isSize } from '../../modules/sizing/index.js';
import { isValidName, isValidPhase } from '../../modules/spec/index.js';
import {
  FINDING_REF_PATTERN,
  ORIGINATOR_PATTERN,
  type Task,
  TASK_TYPES,
  isTaskType,
  parseTaskFile,
  phaseOf,
  phaseRank,
  sortKey,
} from '../../modules/task/index.js';
import { isScopeList } from '../../modules/scheduler/index.js';
import { waiverAllowed } from '../../modules/tier/index.js';
import type { SpecSnapshot } from '../../modules/structure/index.js';
import { SpecStore } from '../../services/index.js';

import { authoringFailure, csv, phaseIds, readSpec, tasksIn } from './cli.authoring.helpers.js';
import { lockPhase } from './cli.apps.module.js';
import {
  SURFACE_CODES,
  SurfaceError,
  dirFlag,
  nameFlag,
  opt,
  runDiagnosed,
  storeDirOf,
} from './cli.shared.module.js';

/** One repeated string flag. */
const repeated = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.atLeast(0));

// ─── new-task ─────────────────────────────────────────────────────────

/** Options for {@link newTask}. */
export interface NewTaskOptions {
  readonly root: string;
  readonly name: string;
  readonly phase: string;
  readonly task: string;
  readonly type: string;
  readonly size?: string | undefined;
  readonly gates?: boolean | undefined;
  /** Declared `write-scope:`; defaults by task type when omitted. */
  readonly writeScope?: string | undefined;
  readonly dependsOn?: ReadonlyArray<string> | undefined;
  readonly relatedTasks?: ReadonlyArray<string> | undefined;
  readonly originator?: string | undefined;
  readonly findingRef?: string | undefined;
  readonly reviewerProfiles?: ReadonlyArray<string> | undefined;
  readonly description?: string | undefined;
  readonly requirements?: ReadonlyArray<string> | undefined;
}

/** What {@link newTask} wrote. */
export interface NewTaskReport {
  readonly name: string;
  readonly phase: string;
  readonly task: string;
  readonly files: ReadonlyArray<string>;
}

/** Render one new task's TASK.md. */
const renderTaskFile = (
  id: string,
  options: NewTaskOptions,
  dependsOn: ReadonlyArray<string>,
): string => {
  const writeScope =
    options.writeScope ?? defaultWriteScope(isTaskType(options.type) ? options.type : 'execution');
  return [
    '---',
    `id: ${id}`,
    `name: ${options.task}`,
    `type: ${options.type}`,
    `originator: ${options.originator ?? 'user'}`,
    `size: ${options.size ?? DEFAULT_SIZE}`,
    `depends-on: ${dependsOn.join(', ')}`,
    writeScope === '' ? 'write-scope:' : `write-scope: ${writeScope}`,
    `related-tasks: ${(options.relatedTasks ?? []).join(', ')}`,
    ...(options.type === 'review'
      ? [`reviewer-profiles: ${(options.reviewerProfiles ?? []).join(', ')}`]
      : []),
    ...(options.findingRef === undefined ? [] : [`finding-ref: ${options.findingRef}`]),
    'status: pending',
    '---',
    '',
    `# Task ${id}: ${options.task}`,
    '',
    `## Type: ${options.type}`,
    '',
    '## Description',
    '',
    options.description?.trim() || 'TODO: describe this task.',
    '',
    '## Requirements',
    '',
    ...(options.requirements === undefined || options.requirements.length === 0
      ? ['- TODO: list what must hold.']
      : options.requirements.map((item) => `- ${item}`)),
    '',
    '## Completion',
    '',
    '- [ ] Done.',
    '',
  ].join('\n');
};

/** Task types whose tier contract requires a `GATES.md`. */
const GATED_TASK_TYPES = new Set(['execution', 'defect', 'interruptor']);

/**
 * Add one id to a `TASK.md` frontmatter `depends-on:` line, preserving every
 * other byte. Used to keep a phase's review task waiting on work added after
 * it was created.
 * @param markdown - raw TASK.md contents
 * @param id - task id to add
 * @returns the updated contents
 */
const addDependency = (markdown: string, id: string): string => {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(newline);
  const closing =
    (lines[0] ?? '').trim() === '---'
      ? lines.findIndex((line, index) => index > 0 && line.trim() === '---')
      : -1;
  if (closing === -1) return markdown;
  const index = lines.findIndex(
    (line, position) => position > 0 && position < closing && /^depends-on\s*:/.test(line.trim()),
  );
  const ids =
    index === -1
      ? []
      : (lines[index]?.slice((lines[index] ?? '').indexOf(':') + 1) ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value !== '');
  if (ids.includes(id)) return markdown;
  ids.push(id);
  if (index === -1) lines.splice(closing, 0, `depends-on: ${ids.join(', ')}`);
  else lines[index] = `depends-on: ${ids.join(', ')}`;
  return lines.join(newline);
};

/** The directory path of one task's `TASK.md`, from a snapshot. */
const taskDirOf = (snapshot: SpecSnapshot, id: string): string | undefined => {
  for (const entry of snapshot.files) {
    if ((entry.kind ?? 'file') !== 'file' || !entry.path.endsWith('/TASK.md')) continue;
    const dir = entry.path.slice(0, -'/TASK.md'.length);
    const leaf = dir.includes('/') ? dir.slice(dir.lastIndexOf('/') + 1) : dir;
    if (leaf.startsWith(`${id}-`)) return dir;
  }
  return undefined;
};

/** Insert one row into the SPEC.md task table, sorted by sort key. */
const insertSpecRow = (
  specText: string,
  row: {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly gates: boolean;
  },
): string => {
  const newline = specText.includes('\r\n') ? '\r\n' : '\n';
  const lines = specText.split(newline);
  const rendered = `| ${row.id} | ${row.name} | ${row.type} | pending | ${row.gates ? 'Yes' : 'No'} |`;
  const rows = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\|\s*[A-Z]{1,2}\d{3}\s*\|/.test(line.trim()));
  if (rows.length === 0) {
    const table = lines.findIndex((line) => line.trim() === '## Tasks');
    if (table === -1)
      return `${specText}${newline}${newline}## Tasks${newline}${newline}${rendered}${newline}`;
    const header = [
      '| ID | Name | Type | Status | Gates |',
      '| --- | --- | --- | --- | --- |',
      rendered,
    ];
    lines.splice(table + 2, 0, ...header);
    return lines.join(newline);
  }
  const target = rows.find(({ line }) => {
    const id = /^\|\s*([A-Z]{1,2}\d{3})\s*\|/.exec(line.trim())?.[1] ?? '';
    return sortKey(id) > sortKey(row.id);
  });
  if (target === undefined) {
    const last = rows[rows.length - 1];
    lines.splice((last?.index ?? 0) + 1, 0, rendered);
  } else {
    lines.splice(target.index, 0, rendered);
  }
  return lines.join(newline);
};

/** Append a task's stage 0 to a waived phase's review evidence. */
const appendEvidence = (
  phaseText: string,
  id: string,
  reason: string | undefined,
  existing: ReadonlyArray<string>,
): string => {
  const evidence = [...existing.filter((ref) => ref !== `${id}:0`), `${id}:0`];
  return renderPhaseReview(phaseText, { review: 'waived', reason: reason ?? '', evidence });
};

/** Write the next task in a phase and append its SPEC.md row. */
export const newTask = (
  options: NewTaskOptions,
): Effect.Effect<NewTaskReport, SurfaceError | SpecStore.StoreError, SpecStore.SpecStore> =>
  Effect.gen(function* () {
    const operation = 'SpecNewTask';
    if (!isValidPhase(options.phase)) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: SURFACE_CODES.invalidArgument,
          path: '--phase',
          field: '--phase',
          problem: `'${options.phase}' is not a phase id.`,
          rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task <name> --type <type>`,
        }),
      );
    }
    if (!isValidName(options.task)) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: SURFACE_CODES.invalidArgument,
          path: '--task',
          field: '--task',
          problem: `'${options.task}' is not a kebab-case task name.`,
          rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task <name> --type <type>`,
        }),
      );
    }
    if (!isTaskType(options.type)) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: SURFACE_CODES.invalidArgument,
          path: '--type',
          field: '--type',
          problem: `Unknown task type '${options.type}'.`,
          rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task <name> --type <type>`,
          expected: TASK_TYPES.join(', '),
          actual: options.type,
        }),
      );
    }
    const size = options.size ?? DEFAULT_SIZE;
    if (size === 'none') {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'task.size-none',
          path: '--size',
          field: '--size',
          problem: '`size: none` is a record opt-out for a complete task only.',
          rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task <name> --type <type>`,
          fix: 'Declare a real size for new work.',
        }),
      );
    }
    if (!isSize(size)) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'task.unknown-size',
          path: '--size',
          field: '--size',
          problem: `Unknown task size '${size}'.`,
          rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task <name> --type <type>`,
          expected: SIZES.join(', '),
          actual: size,
        }),
      );
    }
    if (options.originator !== undefined && !ORIGINATOR_PATTERN.test(options.originator)) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'task.originator-invalid',
          path: '--originator',
          field: '--originator',
          problem: `'${options.originator}' is not an originator.`,
          rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task <name> --type <type>`,
          expected: 'user, defect:<id>, or planner:<id>',
          actual: options.originator,
        }),
      );
    }
    if (options.findingRef !== undefined && !FINDING_REF_PATTERN.test(options.findingRef)) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'task.finding-ref-invalid',
          path: '--finding-ref',
          field: '--finding-ref',
          problem: `'${options.findingRef}' is not a finding reference.`,
          rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task <name> --type <type>`,
          expected: '<series>/<round>/F<n>',
          actual: options.findingRef,
        }),
      );
    }
    if (
      options.writeScope !== undefined &&
      options.writeScope !== 'none' &&
      !isScopeList(options.writeScope)
    ) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'task.write-scope-invalid',
          path: '--write-scope',
          field: '--write-scope',
          problem: `'${options.writeScope}' is not a write scope.`,
          rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task <name> --type <type>`,
          expected: 'comma-separated repo-root-relative paths, `.`, or `none`',
          actual: options.writeScope,
        }),
      );
    }
    const { snapshot, specText, tier } = yield* readSpec(options.root, options.name, operation);
    if (!phaseIds(snapshot).includes(options.phase)) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'spec.phase-not-found',
          path: `${options.name}/${options.phase}`,
          field: '--phase',
          problem: `Phase '${options.phase}' does not exist in spec '${options.name}'.`,
          rerun: `mf-specs state --name ${options.name}`,
        }),
      );
    }
    const phasePath = `${options.phase}/${PHASE_FILE}`;
    const phaseText = snapshot.files.find(
      (entry) => entry.path === phasePath && (entry.kind ?? 'file') === 'file',
    )?.content;
    const phase = phaseText === undefined ? undefined : parsePhaseFile(phaseText);
    if (phaseText === undefined || phase === undefined) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'phase.missing',
          path: `${options.name}/${phasePath}`,
          field: PHASE_FILE,
          problem: `Phase '${options.phase}' has no readable ${PHASE_FILE}.`,
          rerun: `mf-specs migrate --name ${options.name}`,
        }),
      );
    }
    const existing = tasksIn(snapshot, options.phase);
    const lock = yield* lockPhase(
      {
        root: options.root,
        name: options.name,
        phase: options.phase,
      },
      { requireBrief: false },
    );
    if (lock.locked) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'task.phase-locked',
          path: `${options.name}/${options.phase}`,
          field: '--phase',
          problem: `Phase '${options.phase}' is locked; new work belongs in a new phase.`,
          rerun: `mf-specs new-phase --name ${options.name} --objective <line>`,
        }),
      );
    }
    const used = existing
      .map((task) => Number(task.id.slice(options.phase.length)))
      .filter((value) => Number.isInteger(value));
    const next = used.length === 0 ? 1 : Math.max(...used) + 1;
    if (next > 999) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'task.id-exhausted',
          path: `${options.name}/${options.phase}`,
          field: '--task',
          problem: `Phase '${options.phase}' already uses task 999.`,
          rerun: `mf-specs state --name ${options.name}`,
        }),
      );
    }
    if (existing.some((task) => task.name === options.task)) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'task.duplicate-name',
          path: `${options.name}/${options.phase}`,
          field: '--task',
          problem: `Phase '${options.phase}' already holds a task named '${options.task}'.`,
          rerun: `mf-specs next --name ${options.name}`,
        }),
      );
    }
    if (options.type === 'review') {
      if (phase.review === 'waived' || phase.review === 'none') {
        return yield* Effect.fail(
          authoringFailure(operation, {
            code: phase.review === 'none' ? 'task.review-none' : 'task.review-waived',
            path: `${options.name}/${phasePath}`,
            field: 'review',
            problem:
              phase.review === 'none'
                ? `Phase '${options.phase}' has no review, so it cannot hold a review task.`
                : `Phase '${options.phase}' is waived, so it cannot hold a review task.`,
            rerun: `mf-specs waiver --name ${options.name} --phase ${options.phase} --required`,
            fix: 'Set the phase review to required first, or do not add a review task.',
          }),
        );
      }
      if (existing.some((task) => task.type === 'review')) {
        return yield* Effect.fail(
          authoringFailure(operation, {
            code: 'task.review-exists',
            path: `${options.name}/${options.phase}`,
            field: '--type',
            problem: `Phase '${options.phase}' already holds a review task.`,
            rerun: `mf-specs state --name ${options.name}`,
          }),
        );
      }
      if (options.gates === true) {
        return yield* Effect.fail(
          authoringFailure(operation, {
            code: 'task.review-gates',
            path: '--gates',
            field: '--gates',
            problem: 'A review task carries no GATES.md.',
            rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task ${options.task} --type review`,
          }),
        );
      }
    } else if ((options.reviewerProfiles ?? []).length > 0) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'task.reviewer-profiles-forbidden',
          path: '--reviewer-profiles',
          field: '--reviewer-profiles',
          problem: '`reviewer-profiles` is valid only on a review task.',
          rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task ${options.task} --type ${options.type}`,
        }),
      );
    }
    if (phase.review === 'waived' && tier !== undefined && tier === 'standard') {
      const recordWork =
        options.type === 'execution' || options.type === 'defect' || options.type === 'interruptor';
      if (
        recordWork &&
        !waiverAllowed(tier, [...existing.map((task) => task.type), options.type])
      ) {
        return yield* Effect.fail(
          authoringFailure(operation, {
            code: 'task.waiver-policy',
            path: `${options.name}/${phasePath}`,
            field: 'review',
            problem:
              'This waived standard phase is records-only; adding code work makes it non-waivable.',
            rerun: `mf-specs waiver --name ${options.name} --phase ${options.phase} --required`,
            fix: 'Set the phase review to required before adding execution work.',
          }),
        );
      }
    }
    if (options.type === 'exploratory' && tier === 'standard') {
      const exploratory = tasksIn(snapshot, options.phase).filter(
        (task) => task.type === 'exploratory',
      );
      const all = phaseIds(snapshot);
      if (exploratory.length > 0) {
        return yield* Effect.fail(
          authoringFailure(operation, {
            code: 'task.exploration-count',
            path: `${options.name}/${options.phase}`,
            field: '--type',
            problem: 'A standard spec allows at most one exploratory task.',
            rerun: `mf-specs state --name ${options.name}`,
            fix: 'Re-appraise the tier, or split the spec.',
          }),
        );
      }
      if (all[0] !== options.phase) {
        return yield* Effect.fail(
          authoringFailure(operation, {
            code: 'task.exploration-placement',
            path: `${options.name}/${options.phase}`,
            field: '--type',
            problem: 'A standard exploratory task must sit in the first phase.',
            rerun: `mf-specs new-task --name ${options.name} --phase ${all[0] ?? 'A'} --task ${options.task} --type exploratory`,
          }),
        );
      }
    }
    const byId = new Map<string, Task>();
    for (const entry of snapshot.files) {
      if ((entry.kind ?? 'file') !== 'file' || !entry.path.endsWith('/TASK.md')) continue;
      const task = parseTaskFile(entry.content);
      if (task !== undefined) byId.set(task.id, task);
    }
    const dependsOn: Array<string> = [];
    for (const dependency of options.dependsOn ?? []) {
      if (dependsOn.includes(dependency)) {
        return yield* Effect.fail(
          authoringFailure(operation, {
            code: 'task.depends-duplicate',
            path: '--depends-on',
            field: '--depends-on',
            problem: `Dependency '${dependency}' is listed more than once.`,
            rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task ${options.task} --type ${options.type}`,
          }),
        );
      }
      if (dependency === options.task) {
        return yield* Effect.fail(
          authoringFailure(operation, {
            code: 'task.depends-self',
            path: '--depends-on',
            field: '--depends-on',
            problem: 'A task cannot depend on itself.',
            rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task ${options.task} --type ${options.type}`,
          }),
        );
      }
      const target = byId.get(dependency);
      if (target === undefined) {
        return yield* Effect.fail(
          authoringFailure(operation, {
            code: 'task.depends-unknown',
            path: '--depends-on',
            field: '--depends-on',
            problem: `Dependency '${dependency}' does not exist in this spec.`,
            rerun: `mf-specs state --name ${options.name}`,
          }),
        );
      }
      if (phaseRank(phaseOf(dependency)) > phaseRank(options.phase)) {
        return yield* Effect.fail(
          authoringFailure(operation, {
            code: 'task.depends-forward',
            path: '--depends-on',
            field: '--depends-on',
            problem: `Dependency '${dependency}' sits in a later phase.`,
            rerun: `mf-specs new-task --name ${options.name} --phase ${options.phase} --task ${options.task} --type ${options.type}`,
          }),
        );
      }
      dependsOn.push(dependency);
    }
    const id = `${options.phase}${String(next).padStart(3, '0')}`;
    const dir = `${options.phase}/${id}-${options.task}`;
    // A review waits on every non-review task in its phase, so its verdict
    // can never predate the work it reviews.
    if (options.type === 'review') {
      for (const task of existing) {
        if (task.type !== 'review' && !dependsOn.includes(task.id)) dependsOn.push(task.id);
      }
    }
    // A v2 execution/defect/interruptor task always carries its own proof.
    const gated = options.gates === true || GATED_TASK_TYPES.has(options.type);
    const files: Array<{ path: string; content: string }> = [
      { path: `${dir}/TASK.md`, content: renderTaskFile(id, options, dependsOn) },
      { path: `${dir}/MEMORY.md`, content: renderPhaseMemory() },
    ];
    if (gated) {
      files.push({ path: `${dir}/GATES.md`, content: gateTemplateFor(options.type, options.task) });
    }
    // Work added after the phase's review task joins that review's dependencies.
    const reviewTask = existing.find((task) => task.type === 'review');
    if (options.type !== 'review' && reviewTask !== undefined) {
      const reviewDir = taskDirOf(snapshot, reviewTask.id);
      const reviewText =
        reviewDir === undefined
          ? undefined
          : snapshot.files.find((entry) => entry.path === `${reviewDir}/TASK.md`)?.content;
      if (reviewDir !== undefined && reviewText !== undefined) {
        files.push({
          path: `${reviewDir}/TASK.md`,
          content: addDependency(reviewText, id),
        });
      }
    }
    const nextSpec = insertSpecRow(specText, {
      id,
      name: options.task,
      type: options.type,
      gates: gated,
    });
    files.push({ path: 'SPEC.md', content: nextSpec });
    if (phase.review === 'waived' && gated) {
      files.push({
        path: phasePath,
        content: appendEvidence(phaseText, id, phase.reviewReason, phase.reviewEvidence),
      });
    }
    const store = yield* SpecStore.SpecStore;
    yield* store.write(options.root, options.name, files);
    return {
      name: options.name,
      phase: options.phase,
      task: id,
      files: files.map((file) => file.path),
    };
  });

/** Render a new-task report. */
export const renderNewTask = (report: NewTaskReport): string =>
  [
    `✓ added ${report.task} in phase ${report.phase} · ${report.name}`,
    ...report.files.map((file) => `  ${file}`),
  ].join('\n');
export const newTaskCommand = Command.make(
  'new-task',
  {
    dir: dirFlag,
    name: nameFlag,
    phase: Flag.String('phase'),
    task: Flag.String('task'),
    type: Flag.String('type'),
    size: Flag.optional(Flag.String('size')),
    gates: Flag.Boolean('gates').pipe(Flag.withDefault(false)),
    writeScope: Flag.optional(Flag.String('write-scope')),
    dependsOn: Flag.optional(Flag.String('depends-on')),
    relatedTasks: Flag.optional(Flag.String('related-tasks')),
    originator: Flag.optional(Flag.String('originator')),
    findingRef: Flag.optional(Flag.String('finding-ref')),
    reviewerProfiles: Flag.optional(Flag.String('reviewer-profiles')),
    description: Flag.optional(Flag.String('description')),
    requirement: repeated('requirement', 'One requirement bullet. Repeat for more.'),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const report = yield* newTask({
          root: storeDirOf(config.dir),
          name: config.name,
          phase: config.phase,
          task: config.task,
          type: config.type,
          size: opt(config.size),
          gates: config.gates,
          writeScope: opt(config.writeScope),
          dependsOn: csv(opt(config.dependsOn)),
          relatedTasks: csv(opt(config.relatedTasks)),
          originator: opt(config.originator),
          findingRef: opt(config.findingRef),
          reviewerProfiles: csv(opt(config.reviewerProfiles)),
          description: opt(config.description),
          requirements: config.requirement,
        });
        yield* Console.log(renderNewTask(report));
      }),
      () => ({
        path: config.name,
        rerun: `mf-specs new-task --name ${config.name} --phase ${config.phase} --task <name> --type <type>`,
        verbose: false,
      }),
    ),
).pipe(
  Command.withDescription('Allocate the next task number in a phase and append its SPEC.md row.'),
  Command.provide(SpecStore.Default),
);
