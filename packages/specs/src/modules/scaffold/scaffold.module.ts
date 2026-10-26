import { DEFAULT_SIZE, type Size, isSize } from '../sizing/index.js';
import type { SpecFileEntry } from '../structure/index.js';

/**
 * Task types a scaffolded phase may contain. A `review` task is never
 * requested — {@link renderSpecScaffold} always appends the phase's single
 * review task so the tree verifies.
 */
export const SCAFFOLD_TASK_TYPES = [
  'exploratory',
  'execution',
  'planning',
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
  /** Executor behavior; never `review` (that task is appended). */
  readonly type: ScaffoldTaskType;
  /** Emit a per-task `GATES.md` when true. */
  readonly gates?: boolean | undefined;
  /** Declared task size; {@link DEFAULT_SIZE} when omitted. */
  readonly size?: Size | undefined;
  /** Task ids this task depends on (`A001`), rendered comma-separated. */
  readonly dependsOn?: ReadonlyArray<string> | undefined;
  /** Replaces the placeholder `## Description` body. */
  readonly description?: string | undefined;
  /** Replaces the placeholder `## Requirements` bullets. */
  readonly requirements?: ReadonlyArray<string> | undefined;
}

/** True when `value` is a size a scaffold may emit. */
export const isScaffoldTaskSize = (value: string): value is Size => isSize(value);

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
  /** Ordered reviewer profile slugs emitted on the phase's review task. */
  readonly reviewerProfiles?: ReadonlyArray<string> | undefined;
  readonly tasks: ReadonlyArray<ScaffoldTask>;
}

/** Rendered spec tree: files to write plus the ids and phase they carry. */
export interface ScaffoldResult {
  /** Files relative to the spec directory, ready for the store to write. */
  readonly files: ReadonlyArray<SpecFileEntry>;
  readonly phase: string;
  /** The appended review task's id. */
  readonly reviewId: string;
  /** Number of tasks in the generated table, including the review task. */
  readonly taskCount: number;
}

/** Review task number within a phase; execution tasks are numbered below it. */
const REVIEW_NUMBER = 99;

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
    'locked-phases:',
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
 * `## Type:`, `## Description`, `## Requirements`, `## Completion`.
 * @param id - the task id
 * @param task - the task inputs
 * @returns the file contents
 */
const renderTask = (id: string, task: ScaffoldTask): string =>
  [
    '---',
    `id: ${id}`,
    `name: ${task.name}`,
    `type: ${task.type}`,
    'originator: user',
    `size: ${task.size ?? DEFAULT_SIZE}`,
    `depends-on: ${(task.dependsOn ?? []).join(', ')}`,
    'related-tasks:',
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

/**
 * Render the auto-appended phase review task.
 * @param phase - the phase letter
 * @param id - the review task id
 * @param reviewerProfiles - ordered reviewer profile slugs; empty by default
 * @returns the file contents
 */
const renderReview = (phase: string, id: string, reviewerProfiles: ReadonlyArray<string>): string =>
  [
    '---',
    `id: ${id}`,
    'name: review-phase',
    'type: review',
    'originator: user',
    `size: ${DEFAULT_SIZE}`,
    'depends-on:',
    'related-tasks:',
    reviewerProfiles.length > 0
      ? `reviewer-profiles: ${reviewerProfiles.join(', ')}`
      : 'reviewer-profiles:',
    'status: pending',
    '---',
    '',
    `# Task ${id}: Review phase`,
    '',
    '## Type: review',
    '',
    '## Description',
    '',
    `Run an independent adversarial review over phase ${phase}.`,
    '',
    '## Requirements',
    '',
    '- Findings written to the phase review round.',
    '',
    '## Completion',
    '',
    '- [ ] Findings written and reviewed.',
    '',
  ].join('\n');

/** Render the `MEMORY.md` template every task directory carries. */
const renderMemory = (): string =>
  [
    '# Memory',
    '',
    '## Context',
    '',
    'None yet.',
    '',
    '## Progress',
    '',
    '- pending',
    '',
    '## Open Questions',
    '',
    '- None.',
    '',
    '## Handoff',
    '',
    '- See TASK.md.',
    '',
    '## Deviations',
    '',
    '- None.',
    '',
  ].join('\n');

/** Render a default `GATES.md` when a task requests gates. */
const renderGates = (): string =>
  [
    '## Stage 0: Verification',
    '',
    '- [ ] formatting passes',
    '- [ ] linting passes',
    '- [ ] typecheck passes',
    '- [ ] tests pass',
    '',
  ].join('\n');

/**
 * Render a complete, mechanically valid spec tree from a small task list:
 * `SPEC.md`, one `<PHASE><NNN>-<name>/` per task with `TASK.md` +
 * `MEMORY.md` (+ `GATES.md` when gated), and the phase's single
 * `review` task. Pure — the caller owns writing the files and choosing
 * the `created` date.
 * @param input - spec metadata, phase, and tasks
 * @returns the files plus the phase and task ids they carry
 */
export const renderSpecScaffold = (input: ScaffoldSpecInput): ScaffoldResult => {
  const phase = input.phase ?? 'A';
  const numbered = input.tasks.map((task, index) => ({ id: taskId(phase, index + 1), task }));
  const reviewId = taskId(phase, REVIEW_NUMBER);
  const rows: Array<TableRow> = numbered.map(({ id, task }) => ({
    id,
    name: task.name,
    type: task.type,
    gates: task.gates === true,
  }));
  rows.push({ id: reviewId, name: 'review-phase', type: 'review', gates: false });

  const files: Array<SpecFileEntry> = [{ path: 'SPEC.md', content: renderSpec(input, rows) }];
  for (const { id, task } of numbered) {
    const dir = dirName(id, task.name);
    files.push({ path: `${dir}/TASK.md`, content: renderTask(id, task) });
    files.push({ path: `${dir}/MEMORY.md`, content: renderMemory() });
    if (task.gates === true) files.push({ path: `${dir}/GATES.md`, content: renderGates() });
  }
  const reviewDir = dirName(reviewId, 'review-phase');
  files.push({
    path: `${reviewDir}/TASK.md`,
    content: renderReview(phase, reviewId, input.reviewerProfiles ?? []),
  });
  files.push({ path: `${reviewDir}/MEMORY.md`, content: renderMemory() });

  return { files, phase, reviewId, taskCount: numbered.length + 1 };
};
