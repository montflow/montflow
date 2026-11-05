import { renderTaskMemory } from '../memory/index.js';
import { PHASE_PATTERN, SPEC_STANDARD_VERSION } from '../spec/index.js';
import {
  PHASE_FILE,
  PHASE_MEMORY_FILE,
  renderPhaseFile,
  renderPhaseMemory,
} from '../phase/index.js';
import { DEFAULT_SIZE, type Size, isSize } from '../sizing/index.js';
import type { SpecFileEntry } from '../structure/index.js';

/**
 * Task types a scaffolded phase may contain. A `review` task is requested
 * explicitly like any other task; the scaffold never appends one on its own.
 */
export const SCAFFOLD_TASK_TYPES = [
  'exploratory',
  'execution',
  'planning',
  'review',
  'interruptor',
  'defect',
] as const;

/** Task type accepted by a {@link ScaffoldTask}. */
export type ScaffoldTaskType = (typeof SCAFFOLD_TASK_TYPES)[number];

/** True when `value` is a task type a scaffold may request. */
export const isScaffoldTaskType = (value: string): value is ScaffoldTaskType =>
  SCAFFOLD_TASK_TYPES.some((type) => type === value);

/** One execution-side task a scaffold renders into its phase. */
export interface ScaffoldTask {
  /** Kebab-case task name, also the directory suffix (`A001-<name>`). */
  readonly name: string;
  /** Executor behavior; a `review` task is requested explicitly. */
  readonly type: ScaffoldTaskType;
  /** Emit a per-task `GATES.md` when true. */
  readonly gates?: boolean | undefined;
  /** Declared task size; {@link DEFAULT_SIZE} when omitted. */
  readonly size?: Size | undefined;
  /** Declared `write-scope:`; defaults by task type when omitted. */
  readonly writeScope?: string | undefined;
  /** Task ids this task depends on (`A001`), rendered comma-separated. */
  readonly dependsOn?: ReadonlyArray<string> | undefined;
  /** Replaces the placeholder `## Description` body. */
  readonly description?: string | undefined;
  /** Replaces the placeholder `## Requirements` bullets. */
  readonly requirements?: ReadonlyArray<string> | undefined;
}

/** True when `value` is a size a scaffold may emit. */
export const isScaffoldTaskSize = (value: string): value is Size => isSize(value);

/**
 * The scaffold's write scope when the author does not name one. Execution work
 * has no knowable default: `.` would make two independent tasks collide, so the
 * field stays empty and `check` reports `task.write-scope-missing` until the
 * author declares a real scope.
 */
export const defaultScaffoldWriteScope = (type: ScaffoldTaskType): string =>
  type === 'execution' || type === 'defect' || type === 'interruptor' ? '' : 'none';

/** Inputs for {@link renderSpecScaffold}. */
export interface ScaffoldSpecInput {
  /** Spec slug; must equal the directory name. */
  readonly name: string;
  /** Author stamped into `SPEC.md`. */
  readonly author: string;
  /** ISO creation date (`YYYY-MM-DD`) stamped into `SPEC.md`. */
  readonly created: string;
  readonly description?: string | undefined;
  readonly requirements?: ReadonlyArray<string> | undefined;
  readonly workspaceType?: 'in-place' | 'worktree' | undefined;
  /** Phase letter; defaults to `A`. */
  readonly phase?: string | undefined;
  /** Ordered reviewer profile slugs emitted on each `review` task. */
  readonly reviewerProfiles?: ReadonlyArray<string> | undefined;
  readonly tasks: ReadonlyArray<ScaffoldTask>;
}

/** Rendered spec tree: files to write plus the ids and phase they carry. */
export interface ScaffoldResult {
  /** Files relative to the spec directory, ready for the store to write. */
  readonly files: ReadonlyArray<SpecFileEntry>;
  readonly phase: string;
  /** Number of tasks in the generated tree. */
  readonly taskCount: number;
}

/** `A` + a zero-padded sequence, e.g. `A001`. */
const taskId = (phase: string, index: number): string =>
  `${phase}${String(index).padStart(3, '0')}`;

/** `A001-explore-auth`. */
const dirName = (id: string, name: string): string => `${id}-${name}`;

/** Bullet lines, or the single placeholder bullet when none are supplied. */
const bullets = (items: ReadonlyArray<string> | undefined, fallback: string): Array<string> =>
  items === undefined || items.length === 0 ? [`- ${fallback}`] : items.map((item) => `- ${item}`);

interface TableRow {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly gates: boolean;
}

/**
 * Render `SPEC.md`: frontmatter (never locked, `in-progress`) plus the
 * required body sections and the task table.
 * @param input - scaffold inputs
 * @param rows - table rows, in id order
 * @returns the file contents
 */
const renderSpec = (input: ScaffoldSpecInput, rows: ReadonlyArray<TableRow>): string =>
  [
    '---',
    `name: ${input.name}`,
    'status: in-progress',
    `workspace-type: ${input.workspaceType ?? 'in-place'}`,
    `author: ${input.author}`,
    `created: ${input.created}`,
    `spec-version: ${SPEC_STANDARD_VERSION}`,
    '---',
    '',
    `# ${input.name}`,
    '',
    '## Description',
    '',
    input.description?.trim() || 'TODO: describe this spec.',
    '',
    '## Requirements',
    '',
    ...bullets(input.requirements, 'TODO: list what must hold.'),
    '',
    '## Tasks',
    '',
    '| ID | Name | Type | Status | Gates |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) => `| ${row.id} | ${row.name} | ${row.type} | pending | ${row.gates ? 'Yes' : 'No'} |`,
    ),
    '',
  ].join('\n');

/**
 * Render one `TASK.md` against the task contract: full frontmatter plus
 * `## Type:`, `## Description`, `## Requirements`, `## Completion`. A `review`
 * task carries the supplied ordered `reviewer-profiles` list.
 * @param id - the task id
 * @param task - the task inputs
 * @param reviewerProfiles - ordered reviewer profile slugs for a review task
 * @returns the file contents
 */
const renderTask = (
  id: string,
  task: ScaffoldTask,
  reviewerProfiles: ReadonlyArray<string>,
): string =>
  [
    '---',
    `id: ${id}`,
    `name: ${task.name}`,
    `type: ${task.type}`,
    'originator: user',
    `size: ${task.size ?? DEFAULT_SIZE}`,
    `depends-on: ${(task.dependsOn ?? []).join(', ')}`,
    (task.writeScope ?? defaultScaffoldWriteScope(task.type)) === ''
      ? 'write-scope:'
      : `write-scope: ${task.writeScope ?? defaultScaffoldWriteScope(task.type)}`,
    'related-tasks:',
    ...(task.type === 'review' ? [`reviewer-profiles: ${reviewerProfiles.join(', ')}`] : []),
    'status: pending',
    '---',
    '',
    `# Task ${id}: ${task.name}`,
    '',
    `## Type: ${task.type}`,
    '',
    '## Description',
    '',
    task.description?.trim() || 'TODO: describe this task.',
    '',
    '## Requirements',
    '',
    ...bullets(task.requirements, 'TODO: list what must hold.'),
    '',
    '## Completion',
    '',
    '- [ ] Done.',
    '',
  ].join('\n');

/** Task types whose rigor contract requires a `GATES.md`. */
const GATED_TASK_TYPES = new Set(['execution', 'defect', 'interruptor']);

/**
 * Render a default `GATES.md` when a task requests gates. The single item is a
 * replacement marker, not a generic suite: a gate proves *this* task, so the
 * author (and the review) replaces it with the task's own commands.
 */
const renderGates = (): string =>
  [
    '## Stage 0: Verification (mechanical)',
    "command: echo 'replace with the command that proves this task'",
    '',
    "- [ ] Replace the example command with this task's real verification command.",
    '',
  ].join('\n');

/**
 * Render a complete, mechanically valid spec tree from a small task list:
 * `SPEC.md` and one `<PHASE>/<PHASE><NNN>-<name>/` per task with `TASK.md` +
 * `MEMORY.md` (+ `GATES.md` when gated). A review task is emitted only when the
 * caller requests `type: review`; nothing is reserved or auto-appended. Pure —
 * the caller owns writing the files and choosing the `created` date. An invalid
 * phase is a programming error and throws.
 * @param input - spec metadata, phase, and tasks
 * @returns the files plus the phase and task ids they carry
 */
export const renderSpecScaffold = (input: ScaffoldSpecInput): ScaffoldResult => {
  const phase = input.phase ?? 'A';
  if (!PHASE_PATTERN.test(phase)) {
    throw new Error(`Invalid scaffold phase '${phase}' — use one or two capital letters.`);
  }
  const reviewerProfiles = input.reviewerProfiles ?? [];
  const numbered = input.tasks.map((task, index) => ({ id: taskId(phase, index + 1), task }));
  const gated = (task: ScaffoldTask): boolean =>
    task.gates === true || GATED_TASK_TYPES.has(task.type);
  const rows: Array<TableRow> = numbered.map(({ id, task }) => ({
    id,
    name: task.name,
    type: task.type,
    gates: gated(task),
  }));

  const files: Array<SpecFileEntry> = [
    { path: 'SPEC.md', content: renderSpec(input, rows) },
    {
      path: `${phase}/${PHASE_FILE}`,
      content: renderPhaseFile({
        id: phase,
        objective: `Deliver the ${phase} phase work described by its tasks.`,
        status: 'pending',
        review: 'required',
        gate: 'none',
      }),
    },
    { path: `${phase}/${PHASE_MEMORY_FILE}`, content: renderPhaseMemory() },
  ];
  const workIds = numbered.filter(({ task }) => task.type !== 'review').map(({ id }) => id);
  for (const { id, task } of numbered) {
    const dir = `${phase}/${dirName(id, task.name)}`;
    // The review waits on every non-review task in the phase.
    const dependsOn =
      task.type === 'review'
        ? [...new Set([...(task.dependsOn ?? []), ...workIds])]
        : task.dependsOn;
    files.push({
      path: `${dir}/TASK.md`,
      content: renderTask(id, { ...task, dependsOn }, reviewerProfiles),
    });
    files.push({ path: `${dir}/MEMORY.md`, content: renderTaskMemory() });
    if (gated(task)) files.push({ path: `${dir}/GATES.md`, content: renderGates() });
  }

  return { files, phase, taskCount: numbered.length };
};
