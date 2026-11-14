import { renderCreationSection } from '../creation/index.js';
import { renderTaskMemory } from '../memory/index.js';
import {
  PHASE_FILE,
  PHASE_MEMORY_FILE,
  renderPhaseFile,
  renderPhaseMemory,
} from '../phase/index.js';
import type { PhaseGate, PhaseReview, PhaseStatus } from '../phase/index.js';
import { type Size, isSize } from '../sizing/index.js';
import type { SpecFileEntry } from '../structure/index.js';
import { type TaskType, SLUG_PATTERN, TASK_TYPES, isTaskType, sortKey } from '../task/index.js';
import {
  RIGOR_CONTRACT,
  type Rigor,
  type RigorContract,
  CODES as RIGOR_CODES,
  waiverAllowed,
  writesArtifact,
} from '../rigor/index.js';
import { type Issue, finding } from '../verify/index.js';

/** Stable codes for `init`'s rigor-contract and plan validation. */
export const INIT_CODES = {
  exists: 'init.exists',
  explorationMissing: 'init.exploration-missing',
  explorationForbidden: 'init.exploration-forbidden',
  explorationCount: 'init.exploration-count',
  explorationPlacement: 'init.exploration-placement',
  gateKind: 'init.gate-kind',
  waiverPolicy: 'init.waiver-policy',
  reviewTask: 'init.review-task',
  reviewType: 'init.review-type',
  reviewReason: 'init.review-reason',
  phaseCount: 'init.phase-count',
  taskCeiling: 'init.task-ceiling',
  phaseUnknown: 'init.phase-unknown',
  taskDuplicate: 'init.task-duplicate',
  dependsUnknown: 'init.depends-unknown',
  dependsAmbiguous: 'init.depends-ambiguous',
  taskName: 'init.task-name',
  taskType: 'task.type-invalid',
  taskSize: 'task.size-invalid',
  reviewWaived: 'task.review-waived',
} as const;

/** One work task in an `init` plan, before ids are allocated. */
export interface InitTaskPlan {
  readonly name: string;
  readonly type: TaskType;
  readonly size: Size;
  /** Work-task names this task depends on (`after=`). */
  readonly after: ReadonlyArray<string>;
  /** Declared `write-scope:`; defaults by task type when omitted. */
  readonly writeScope?: string | undefined;
}

/**
 * The scaffold's write scope when the author does not name one. Execution work
 * has no knowable default: `.` would make two independent tasks collide, so the
 * field stays empty and `check` reports `task.write-scope-missing` until the
 * author declares a real scope.
 */
export const defaultWriteScope = (type: TaskType): string =>
  type === 'execution' || type === 'defect' || type === 'interruptor' ? '' : 'none';

/** One phase in an `init` plan, before ids are allocated. */
export interface InitPhasePlan {
  readonly objective: string;
  readonly review: 'required' | 'waived' | 'none';
  readonly reviewReason?: string | undefined;
  readonly tasks: ReadonlyArray<InitTaskPlan>;
}

/** A complete, validated `init` plan. */
export interface InitPlan {
  readonly name: string;
  readonly rigor: Rigor;
  readonly author: string;
  readonly created: string;
  readonly workspaceType: 'in-place' | 'worktree';
  readonly description?: string | undefined;
  readonly requirements?: ReadonlyArray<string> | undefined;
  readonly reviewerProfiles: ReadonlyArray<string>;
  readonly phases: ReadonlyArray<InitPhasePlan>;
}

/** The default waiver reason for a rigor whose review is waived. */
export const waiverReason = (rigor: Rigor): string =>
  `${rigor} rigor default: every task gate is the review evidence.`;

/** The phase id at a 1-based rank: `1` → `A`, `27` → `AA`. */
export const phaseIdAt = (rank: number): string => {
  let remaining = rank;
  let id = '';
  while (remaining > 0) {
    const digit = (remaining - 1) % 26;
    id = String.fromCharCode(65 + digit) + id;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return id;
};

/** A default plan for a rigor, before any CLI override. */
export const defaultInitPhases = (rigor: Rigor): ReadonlyArray<InitPhasePlan> => {
  if (RIGOR_CONTRACT[rigor].exploration === 'required') {
    return [
      {
        objective: 'Explore the problem and record what the implementation must satisfy.',
        review: 'required',
        tasks: [{ name: 'explore', type: 'exploratory', size: 'medium', after: [] }],
      },
      {
        objective: 'Implement the spec to the explored contract.',
        review: 'required',
        tasks: [{ name: 'implement', type: 'execution', size: 'medium', after: ['explore'] }],
      },
    ];
  }
  const review = RIGOR_CONTRACT[rigor].review;
  const phase: InitPhasePlan = {
    objective: 'Implement the spec.',
    review,
    tasks: [{ name: 'implement', type: 'execution', size: 'medium', after: [] }],
  };
  return [review === 'waived' ? { ...phase, reviewReason: waiverReason(rigor) } : phase];
};

/** One issue with its code, so a caller can render a coded diagnostic. */
interface CodedInput {
  readonly code: string;
  readonly field: string;
  readonly message: string;
  expected?: string;
  actual?: string;
  fix?: string;
}

const coded = (
  code: string,
  field: string,
  message: string,
  expected?: string,
  actual?: string,
  fix?: string,
): Issue => {
  const found: CodedInput = { code, field, message };
  if (expected !== undefined) found.expected = expected;
  if (actual !== undefined) found.actual = actual;
  if (fix !== undefined) found.fix = fix;
  return finding(found);
};

/** The default review decision for a rigor. */
export const defaultReview = (rigor: Rigor): 'required' | 'waived' => RIGOR_CONTRACT[rigor].review;

/** One allocated task in the rendered tree. */
interface AllocatedTask {
  readonly id: string;
  readonly phase: string;
  readonly phaseIndex: number;
  readonly name: string;
  readonly type: TaskType;
  readonly size: Size;
  readonly dependsOn: ReadonlyArray<string>;
  readonly writeScope: string;
  readonly generatedReview: boolean;
}

/** A plan allocated to concrete phase and task ids. */
export interface AllocatedPlan {
  readonly phases: ReadonlyArray<{
    readonly id: string;
    readonly phase: InitPhasePlan;
    readonly tasks: ReadonlyArray<AllocatedTask>;
    readonly gate: 'none' | 'mechanical';
  }>;
}

/** Allocate ids from the plan order. Never caller arithmetic. */
const allocate = (plan: InitPlan): AllocatedPlan => {
  const tasks: Array<AllocatedTask> = [];
  const byName = new Map<string, Array<AllocatedTask>>();
  for (const [index, phase] of plan.phases.entries()) {
    const id = phaseIdAt(index + 1);
    const work = phase.tasks.map((task, taskIndex): AllocatedTask => ({
      id: `${id}${String(taskIndex + 1).padStart(3, '0')}`,
      phase: id,
      phaseIndex: index,
      name: task.name,
      type: task.type,
      size: task.size,
      dependsOn: [],
      writeScope: task.writeScope ?? defaultWriteScope(task.type),
      generatedReview: false,
    }));
    for (const task of work) {
      tasks.push(task);
      const bucket = byName.get(task.name) ?? [];
      bucket.push(task);
      byName.set(task.name, bucket);
    }
    if (phase.review === 'required') {
      const review: AllocatedTask = {
        id: `${id}${String(work.length + 1).padStart(3, '0')}`,
        phase: id,
        phaseIndex: index,
        name: 'review-phase',
        type: 'review',
        size: 'medium',
        dependsOn: work.map((task) => task.id),
        writeScope: 'none',
        generatedReview: true,
      };
      tasks.push(review);
    }
  }
  // Resolve `after=` names once every task id is known.
  const resolved = tasks.map((task) => {
    if (task.generatedReview) return task;
    const declared = plan.phases[task.phaseIndex]?.tasks.find(
      (candidate) => candidate.name === task.name,
    );
    if (declared === undefined) return task;
    const dependsOn: Array<string> = [];
    for (const name of declared.after) {
      const candidates = byName.get(name) ?? [];
      for (const candidate of candidates) {
        if (candidate.id !== task.id) dependsOn.push(candidate.id);
      }
    }
    return { ...task, dependsOn };
  });
  const byPhase = new Map<string, Array<AllocatedTask>>();
  for (const task of resolved) {
    const bucket = byPhase.get(task.phase) ?? [];
    bucket.push(task);
    byPhase.set(task.phase, bucket);
  }
  return {
    phases: plan.phases.map((phase, index) => {
      const id = phaseIdAt(index + 1);
      return {
        id,
        phase,
        tasks: byPhase.get(id) ?? [],
        gate: RIGOR_CONTRACT[plan.rigor].gate === 'phase-and-task' ? 'mechanical' : 'none',
      };
    }),
  };
};

/** One task's identity and dependency edges, for the ladder's reachability rule. */
export interface LadderTask {
  readonly id: string;
  readonly type: TaskType;
  readonly phaseIndex: number;
  readonly dependsOn: ReadonlyArray<string>;
}
/** One phase's id and its tasks, in phase-rank order. */
export interface LadderPhase {
  readonly id: string;
  readonly tasks: ReadonlyArray<LadderTask>;
}
type DependencyNode = Pick<LadderTask, 'id' | 'phaseIndex' | 'dependsOn'>;
const reachesExploration = (
  task: DependencyNode,
  exploration: ReadonlySet<string>,
  byId: ReadonlyMap<string, DependencyNode>,
  seen = new Set<string>(),
): boolean => {
  if (seen.has(task.id)) return false;
  seen.add(task.id);
  for (const dependency of task.dependsOn) {
    const next = byId.get(dependency);
    if (next === undefined) continue;
    if (exploration.has(next.id)) return true;
    if (reachesExploration(next, exploration, byId, seen)) return true;
  }
  return false;
};

/**
 * Every deep/critical phase after `A` reaches the task carrying the
 * exploration. `init`, `new-phase`, `new-task`, and `check` all read it; an
 * empty phase is deferred until its first task arrives.
 * @param rigor - the spec's rigor
 * @param phases - every phase with its tasks, in phase-rank order
 * @returns every finding for a later phase with no dependency path to the exploration task
 */
export const phaseDependencyIssues = (
  rigor: Rigor,
  phases: ReadonlyArray<LadderPhase>,
): ReadonlyArray<Issue> => {
  if (rigor !== 'deep' && rigor !== 'critical') return [];
  const phaseA = phases[0];
  if (phaseA === undefined) return [];
  const exploration = new Set(
    phaseA.tasks.filter((task) => task.type === 'exploratory').map((task) => task.id),
  );
  if (exploration.size === 0) return [];
  const byId = new Map(phases.flatMap((phase) => phase.tasks).map((task) => [task.id, task]));
  const issues: Array<Issue> = [];
  for (const [index, phase] of phases.entries()) {
    if (index === 0 || phase.tasks.length === 0) continue;
    if (phase.tasks.some((task) => reachesExploration(task, exploration, byId))) continue;
    issues.push(
      coded(
        INIT_CODES.explorationMissing,
        `phase ${phase.id}`,
        `Phase '${phase.id}' does not depend on the exploration task in phase A; every later phase must build on that discovery.`,
        'at least one task depending on the phase A exploration task',
        'no dependency path to the phase A exploration task',
        'Add `after=<the phase A exploratory task name>` to a task in this phase.',
      ),
    );
  }
  return issues;
};

/**
 * The exploration and trivial-gate rules for one rigor over the phases'
 * task-type lists. `init` validates a plan with it and `new-task` / `new-phase`
 * reuse it to refuse growth past the same rules.
 * @param rigor - the spec's rigor
 * @param phases - one task-type list per phase, in phase-rank order
 * @returns every exploration finding
 */
export const explorationIssues = (
  rigor: Rigor,
  phases: ReadonlyArray<ReadonlyArray<TaskType>>,
): ReadonlyArray<Issue> => {
  const issues: Array<Issue> = [];
  const exploratory = phases.flatMap((tasks) => tasks.filter((type) => type === 'exploratory'));
  if (rigor === 'trivial') {
    if (exploratory.length > 0) {
      issues.push(
        coded(
          INIT_CODES.explorationForbidden,
          'phases',
          'A trivial plan declares an exploratory task; trivial has no exploration step.',
          'no exploratory task',
          exploratory[0] ?? 'exploratory',
          'Use an execution task, or choose the light rigor.',
        ),
      );
    }
    for (const [index, tasks] of phases.entries()) {
      for (const type of tasks) {
        if (type === 'planning' || type === 'exploratory') {
          issues.push(
            coded(
              INIT_CODES.gateKind,
              `phase ${phaseIdAt(index + 1)}`,
              `Trivial task '${type}' is ${type}: it has no command gate, and every trivial task that changes a file needs one.`,
              'a command gate on every file-changing task',
              type,
              'Make the task execution work, or choose the light rigor.',
            ),
          );
        }
      }
    }
  }
  if (rigor === 'light' || rigor === 'standard') {
    if (exploratory.length > 1) {
      issues.push(
        coded(
          INIT_CODES.explorationCount,
          'phases',
          `A ${rigor} plan declares ${exploratory.length} exploratory tasks; it allows at most one.`,
          'at most one exploratory task',
          String(exploratory.length),
          'Remove the extra exploratory tasks, or re-appraise and split the spec.',
        ),
      );
    }
    for (const [index, tasks] of phases.entries()) {
      if (tasks.some((type) => type === 'exploratory') && index !== 0) {
        issues.push(
          coded(
            INIT_CODES.explorationPlacement,
            `phase ${phaseIdAt(index + 1)}`,
            `A ${rigor} exploratory task must sit in the first phase.`,
            'the exploratory task in phase A',
            `phase ${phaseIdAt(index + 1)}`,
            'Move the exploratory task into the first phase.',
          ),
        );
      }
      if (index !== 0 && tasks.length > 0 && tasks.every((type) => type === 'exploratory')) {
        issues.push(
          coded(
            INIT_CODES.explorationForbidden,
            `phase ${phaseIdAt(index + 1)}`,
            `A ${rigor} plan may not declare an exploration phase of its own.`,
            'at most one exploratory task in the first phase',
            `phase ${phaseIdAt(index + 1)} holds only exploratory tasks`,
            'Fold the exploration into a first-phase task.',
          ),
        );
      }
    }
  }
  if (rigor === 'deep' || rigor === 'critical') {
    const phaseA = phases[0] ?? [];
    const exploreA = phaseA.filter((type) => type === 'exploratory');
    if (exploreA.length === 0) {
      issues.push(
        coded(
          INIT_CODES.explorationMissing,
          'phases',
          `A ${rigor} plan needs an exploration phase A holding an exploratory task.`,
          'phase A with an exploratory task',
          phaseA.length === 0 ? 'no phase A' : 'phase A has no exploratory task',
          'Add an exploratory task to phase A, or choose a smaller rigor.',
        ),
      );
    } else {
      if (rigor === 'deep' && exploreA.length > 1) {
        issues.push(
          coded(
            INIT_CODES.explorationCount,
            'phases',
            `A deep plan declares ${exploreA.length} exploratory tasks in phase A; it allows one.`,
            'one exploratory task in phase A',
            String(exploreA.length),
            'Fold the discovery into one task.',
          ),
        );
      }
      if (
        rigor === 'critical' &&
        phaseA.some((type) => type !== 'exploratory' && type !== 'review')
      ) {
        issues.push(
          coded(
            INIT_CODES.explorationPlacement,
            'phase A',
            'A critical plan needs phase A to be a dedicated exploration phase.',
            'phase A holding only exploratory tasks',
            phaseA.join(', '),
            'Move non-exploratory work out of phase A.',
          ),
        );
      }
    }
    for (const [index, tasks] of phases.entries()) {
      if (index === 0) continue;
      if (tasks.some((type) => type === 'exploratory')) {
        issues.push(
          coded(
            INIT_CODES.explorationPlacement,
            `phase ${phaseIdAt(index + 1)}`,
            `A ${rigor} plan explores only in phase A; later phases build on that discovery.`,
            'the exploratory task in phase A',
            `phase ${phaseIdAt(index + 1)}`,
            'Move the discovery into phase A, then depend on it from this phase.',
          ),
        );
      }
    }
  }
  return issues;
};

/**
 * The phase-count and task ceilings for one rigor. `init` validates a plan with
 * it, and `new-phase` / `new-task` reuse it to refuse growth past the contract.
 * The minimum phase count is `init`'s own rule; this helper reports only a
 * tree that exceeds a maximum.
 * @param rigor - the spec's rigor
 * @param phaseTaskCounts - work-task count (review tasks excluded) per phase
 * @returns every ceiling finding
 */
export const ceilingIssues = (
  rigor: Rigor,
  phaseTaskCounts: ReadonlyArray<number>,
): ReadonlyArray<Issue> => {
  const issues: Array<Issue> = [];
  const contract = RIGOR_CONTRACT[rigor];
  const total = phaseTaskCounts.reduce((sum, count) => sum + count, 0);
  if (phaseTaskCounts.length > contract.maxPhases) {
    issues.push(
      coded(
        INIT_CODES.phaseCount,
        'phases',
        `A ${rigor} plan needs ${contract.minPhases}-${contract.maxPhases} phases; it declares ${phaseTaskCounts.length}.`,
        `${contract.minPhases}-${contract.maxPhases} phases`,
        String(phaseTaskCounts.length),
        'Re-appraise the rigor, or split the spec.',
      ),
    );
  }
  if (total > contract.maxTasks) {
    issues.push(
      coded(
        INIT_CODES.taskCeiling,
        'tasks',
        `A ${rigor} plan allows ${contract.maxTasks} work tasks; it declares ${total}.`,
        `at most ${contract.maxTasks} work tasks`,
        String(total),
        'Re-appraise the rigor, or split the spec.',
      ),
    );
  }
  for (const [index, count] of phaseTaskCounts.entries()) {
    if (count > contract.maxTasksPerPhase) {
      issues.push(
        coded(
          INIT_CODES.taskCeiling,
          `phase ${phaseIdAt(index + 1)}`,
          `A ${rigor} phase allows ${contract.maxTasksPerPhase} work tasks; phase '${phaseIdAt(index + 1)}' declares ${count}.`,
          `at most ${contract.maxTasksPerPhase} work tasks per phase`,
          String(count),
          'Re-appraise the phase plan.',
        ),
      );
    }
  }
  return issues;
};

/**
 * Validate a plan against the rigor contract before any file is written.
 * Exploration placement, the waiver predicate, the review-task rule, phase and
 * task ceilings, dependency resolution, and naming are all checked here.
 * @param plan - the plan to validate
 * @returns every finding, in reporting order
 */
export const validateInitPlan = (plan: InitPlan): ReadonlyArray<Issue> => {
  const issues: Array<Issue> = [];
  const contract: RigorContract = RIGOR_CONTRACT[plan.rigor];
  const phases = plan.phases;

  if (!SLUG_PATTERN.test(plan.name)) {
    issues.push(coded(INIT_CODES.taskName, 'name', `Spec name '${plan.name}' is not a slug.`));
  }
  for (const [index, phase] of phases.entries()) {
    const id = phaseIdAt(index + 1);
    if (phase.tasks.length === 0) {
      issues.push(
        coded(
          INIT_CODES.taskCeiling,
          `phase ${id}`,
          `Phase '${id}' holds no work task; init writes one task per declared phase.`,
          'at least one task',
          'zero',
          'Declare a task for the phase, or remove the phase from the plan.',
        ),
      );
    }
    const names = new Set<string>();
    for (const task of phase.tasks) {
      if (!SLUG_PATTERN.test(task.name) || !isTaskType(task.type)) {
        issues.push(
          coded(
            isTaskType(task.type) ? INIT_CODES.taskName : INIT_CODES.taskType,
            `phase ${id}`,
            isTaskType(task.type)
              ? `Task name '${task.name}' is not a slug.`
              : `Task '${task.name}' has unknown type '${task.type}'.`,
            isTaskType(task.type) ? 'a kebab-case slug' : TASK_TYPES.join(', '),
            isTaskType(task.type) ? task.name : task.type,
          ),
        );
      }
      if (!isSize(task.size)) {
        issues.push(
          coded(INIT_CODES.taskSize, `phase ${id}`, `Task '${task.name}' has unknown size.`),
        );
      }
      if (names.has(task.name)) {
        issues.push(
          coded(
            INIT_CODES.taskDuplicate,
            `phase ${id}`,
            `Task name '${task.name}' is declared more than once in phase '${id}'.`,
            'one task per name per phase',
            task.name,
            'Rename one of the duplicate tasks.',
          ),
        );
      }
      names.add(task.name);
      if (task.type === 'review') {
        if (phase.review === 'waived' || phase.review === 'none') {
          issues.push(
            coded(
              INIT_CODES.reviewWaived,
              `phase ${id}`,
              phase.review === 'none'
                ? `Phase '${id}' has no review, so it cannot hold a review task.`
                : `Phase '${id}' is waived, so it cannot hold a review task; a phase either reviews or waives.`,
              phase.review === 'none'
                ? 'no review-type task in a review-free phase'
                : 'no review-type task in a waived phase',
              'review task requested',
              'Remove the review task, or set the phase review to required.',
            ),
          );
        } else {
          issues.push(
            coded(
              INIT_CODES.reviewType,
              `phase ${id}`,
              '`init` owns review tasks; declare --review and init generates the phase review task.',
              'a non-review task',
              'review',
              'Drop the review task from --task and use --review instead.',
            ),
          );
        }
      }
    }
  }

  // ── Exploration placement ───────────────────────────────────────────
  issues.push(
    ...explorationIssues(
      plan.rigor,
      phases.map((phase) => phase.tasks.map((task) => task.type)),
    ),
  );
  if (plan.rigor === 'deep' || plan.rigor === 'critical') {
    const allocated = allocate(plan);
    issues.push(
      ...phaseDependencyIssues(
        plan.rigor,
        allocated.phases.map((phase, index) => ({
          id: phase.id,
          tasks: phase.tasks.map((task) => ({
            id: task.id,
            type: task.type,
            phaseIndex: index,
            dependsOn: task.dependsOn,
          })),
        })),
      ),
    );
  }

  // ── Phase and task ceilings ─────────────────────────────────────────
  if (phases.length < contract.minPhases) {
    issues.push(
      coded(
        INIT_CODES.phaseCount,
        'phases',
        `A ${plan.rigor} plan needs ${contract.minPhases}-${contract.maxPhases} phases; it declares ${phases.length}.`,
        `${contract.minPhases}-${contract.maxPhases} phases`,
        String(phases.length),
        'Re-appraise the rigor, or split the spec.',
      ),
    );
  }
  issues.push(
    ...ceilingIssues(
      plan.rigor,
      phases.map((phase) => phase.tasks.filter((task) => task.type !== 'review').length),
    ),
  );

  // ── Review decision and waiver policy ───────────────────────────────
  for (const [index, phase] of phases.entries()) {
    const id = phaseIdAt(index + 1);
    if (
      phase.review === 'none' &&
      (contract.review === 'required' || contract.waiver === 'forbidden')
    ) {
      issues.push(
        coded(
          RIGOR_CODES.reviewForbidden,
          `phase ${id}`,
          `A ${plan.rigor} phase cannot declare review: none; ${plan.rigor} requires review and its waiver policy is ${contract.waiver}.`,
          'review: required',
          'review: none',
          'Set the phase review to required; the waiver verb may only prove a permitted waiver.',
        ),
      );
    }
    if (phase.review === 'waived') {
      if (phase.reviewReason === undefined || phase.reviewReason.trim() === '') {
        issues.push(
          coded(
            INIT_CODES.reviewReason,
            `phase ${id}`,
            `A waived phase needs one reason; phase '${id}' declares none.`,
            'a one-line review reason',
            'missing',
            `Pass --review-reason ${id}:<one line>, or set the phase to required.`,
          ),
        );
      }
      if (
        !waiverAllowed(
          plan.rigor,
          phase.tasks.map((task) => task.type),
        )
      ) {
        issues.push(
          coded(
            plan.rigor === 'critical' ? 'rigor.waiver-forbidden' : INIT_CODES.waiverPolicy,
            `phase ${id}`,
            plan.rigor === 'critical'
              ? 'A critical phase never waives review.'
              : `Phase '${id}' holds execution/defect/interruptor work, so it is not records-only.`,
            plan.rigor === 'critical'
              ? 'review: required'
              : 'a phase whose tasks are planning/exploratory/review',
            phase.tasks.map((task) => task.type).join(', '),
            plan.rigor === 'critical'
              ? 'Set the phase review to required.'
              : 'Set the phase review to required, or choose a lighter rigor.',
          ),
        );
      }
    } else if (phase.reviewReason !== undefined && phase.reviewReason.trim() !== '') {
      issues.push(
        coded(
          INIT_CODES.reviewReason,
          `phase ${id}`,
          '`--review-reason` is only valid on a waived phase.',
          'no review reason on a required phase',
          phase.reviewReason,
          'Remove the reason, or waive the phase.',
        ),
      );
    }
  }

  // ── Dependency resolution (`after=`) ────────────────────────────────
  const nameIndex = new Map<string, Array<{ phaseIndex: number; name: string }>>();
  for (const [phaseIndex, phase] of phases.entries()) {
    for (const task of phase.tasks) {
      const bucket = nameIndex.get(task.name) ?? [];
      bucket.push({ phaseIndex, name: task.name });
      nameIndex.set(task.name, bucket);
    }
  }
  for (const [phaseIndex, phase] of phases.entries()) {
    for (const task of phase.tasks) {
      for (const after of task.after) {
        const candidates = nameIndex.get(after) ?? [];
        if (candidates.length === 0) {
          issues.push(
            coded(
              INIT_CODES.dependsUnknown,
              `phase ${phaseIdAt(phaseIndex + 1)}`,
              `Task '${task.name}' depends on unknown task '${after}'.`,
              'a task name declared earlier in this plan',
              after,
              'Name a declared task, or remove the dependency.',
            ),
          );
        } else if (candidates.length > 1) {
          issues.push(
            coded(
              INIT_CODES.dependsAmbiguous,
              `phase ${phaseIdAt(phaseIndex + 1)}`,
              `Task '${task.name}' depends on '${after}', a name declared in more than one phase.`,
              'a name declared once before this task',
              after,
              'Rename one task so the dependency resolves to one id.',
            ),
          );
        } else if ((candidates[0]?.phaseIndex ?? 0) > phaseIndex) {
          issues.push(
            coded(
              INIT_CODES.dependsUnknown,
              `phase ${phaseIdAt(phaseIndex + 1)}`,
              `Task '${task.name}' depends on '${after}' in a later phase.`,
              'a task in the same or an earlier phase',
              after,
              'Move the dependency earlier, or remove it.',
            ),
          );
        } else if (after === task.name) {
          issues.push(
            coded(
              INIT_CODES.dependsUnknown,
              `phase ${phaseIdAt(phaseIndex + 1)}`,
              `Task '${task.name}' cannot depend on itself.`,
              'an earlier task',
              after,
              'Remove the self dependency.',
            ),
          );
        }
      }
    }
  }

  // ── Review tasks generated exactly for non-waived phases ────────────
  for (const [index, phase] of phases.entries()) {
    const id = phaseIdAt(index + 1);
    const declared = phase.tasks.some((task) => task.type === 'review');
    if (phase.review === 'required' && declared) {
      issues.push(
        coded(
          INIT_CODES.reviewTask,
          `phase ${id}`,
          'A required phase must not also request a review task; init generates exactly one.',
          'one generated review task',
          'a declared review task',
          'Remove the review task from --task.',
        ),
      );
    }
    if (phase.review === 'waived' && declared) {
      issues.push(
        coded(
          INIT_CODES.reviewTask,
          `phase ${id}`,
          'A waived phase must not also receive a review task.',
          'no review task',
          'a declared review task',
          'Remove the review task, or set the phase to required.',
        ),
      );
    }
  }

  return issues;
};

/** Render the mechanical gate template every file-changing task starts with. */
export const renderMechanicalGate = (subject: string): string =>
  [
    '## Stage 0: Verification (mechanical)',
    `command: echo 'replace with the command that proves ${subject}'`,
    '',
    `- [ ] Replace the example command with ${subject}'s real verification command.`,
    '',
  ].join('\n');

/** Render the subjective gate template a prose-only task starts with. */
export const renderSubjectiveGate = (subject: string, judge = 'generic-reviewer'): string =>
  [
    '## Stage 0: Review (subjective)',
    `judge: ${judge}`,
    '',
    `- [ ] ${subject} meets its stated requirements and evidence is recorded.`,
    '',
  ].join('\n');

/** The gate template a task type gets at init time. */
export const gateTemplateFor = (type: TaskType, subject: string): string =>
  type === 'execution' || type === 'defect' || type === 'interruptor'
    ? renderMechanicalGate(subject)
    : renderSubjectiveGate(subject);

/** Render one task's `TASK.md`. */
export const renderInitTask = (task: AllocatedTask, description?: string | undefined): string =>
  [
    '---',
    `id: ${task.id}`,
    `name: ${task.name}`,
    `type: ${task.type}`,
    'originator: user',
    `size: ${task.size}`,
    `depends-on: ${task.dependsOn.join(', ')}`,
    task.writeScope === '' ? 'write-scope:' : `write-scope: ${task.writeScope}`,
    'related-tasks:',
    ...(task.type === 'review' ? ['reviewer-profiles:'] : []),
    'status: pending',
    '---',
    '',
    `# Task ${task.id}: ${task.name}`,
    '',
    `## Type: ${task.type}`,
    '',
    '## Description',
    '',
    description?.trim() || 'TODO: describe this task.',
    '',
    '## Requirements',
    '',
    '- TODO: list what must hold.',
    '',
    '## Completion',
    '',
    '- [ ] Done.',
    '',
  ].join('\n');

/** Render the `## Tasks` table rows in sort-key order. */
const renderSpec = (plan: InitPlan, allocated: AllocatedPlan): string => {
  const rows = allocated.phases
    .flatMap((phase) => phase.tasks)
    .toSorted((a, b) => sortKey(a.id) - sortKey(b.id));
  return [
    '---',
    `name: ${plan.name}`,
    'status: in-progress',
    `workspace-type: ${plan.workspaceType}`,
    `author: ${plan.author}`,
    `created: ${plan.created}`,
    'spec-version: 2',
    '---',
    '',
    `# ${plan.name}`,
    '',
    '## Description',
    '',
    plan.description?.trim() || 'TODO: describe this spec.',
    '',
    '## Requirements',
    '',
    ...(plan.requirements === undefined || plan.requirements.length === 0
      ? ['- TODO: list what must hold.']
      : plan.requirements.map((item) => `- ${item}`)),
    '',
    renderCreationSection(plan.rigor),
    '## Tasks',
    '',
    '| ID | Name | Type | Status | Gates |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(
      (task) =>
        `| ${task.id} | ${task.name} | ${task.type} | pending | ${task.generatedReview ? 'No' : 'Yes'} |`,
    ),
    '',
  ].join('\n');
};

/** A phase record being filled in, so optional fields are added only when present. */
interface MutableInitPhase {
  id: string;
  objective: string;
  status: PhaseStatus;
  review: PhaseReview;
  gate: PhaseGate;
  reviewReason?: string;
  reviewEvidence?: ReadonlyArray<string>;
  notes: string;
}

/** Non-review task count in one allocated phase. */
const workTaskCount = (phase: AllocatedPlan['phases'][number]): number =>
  phase.tasks.filter((task) => !task.generatedReview).length;

/**
 * Render a complete v2 tree for a validated plan (plan order; ids restart per
 * phase; a generated review task comes last).
 * @param plan - a plan that already passed {@link validateInitPlan}
 * @returns every file, spec-relative
 */
export const renderInitTree = (plan: InitPlan): ReadonlyArray<SpecFileEntry> => {
  const allocated = allocate(plan);
  const files: Array<SpecFileEntry> = [{ path: 'SPEC.md', content: renderSpec(plan, allocated) }];
  const contract = RIGOR_CONTRACT[plan.rigor];
  const writesBoard = (phase: AllocatedPlan['phases'][number]): boolean =>
    writesArtifact(contract, 'BOARD.md', workTaskCount(phase));
  const writesMailbox = (phase: AllocatedPlan['phases'][number]): boolean =>
    writesArtifact(contract, 'MAILBOX.md', workTaskCount(phase));
  for (const phase of allocated.phases) {
    const evidence: Array<string> = [];
    if (phase.gate !== 'none') evidence.push('phase:0');
    for (const task of phase.tasks) {
      if (!task.generatedReview) evidence.push(`${task.id}:0`);
    }
    const phaseRecord: MutableInitPhase = {
      id: phase.id,
      objective: phase.phase.objective,
      status: 'pending',
      review: phase.phase.review,
      gate: phase.gate,
      notes: 'Created by mf-specs init.',
    };
    if (phase.phase.review === 'waived') {
      if (phase.phase.reviewReason !== undefined) {
        phaseRecord.reviewReason = phase.phase.reviewReason;
      }
      phaseRecord.reviewEvidence = evidence;
    }
    files.push({ path: `${phase.id}/${PHASE_FILE}`, content: renderPhaseFile(phaseRecord) });
    files.push({ path: `${phase.id}/${PHASE_MEMORY_FILE}`, content: renderPhaseMemory() });
    if (writesBoard(phase)) {
      files.push({ path: `${phase.id}/BOARD.md`, content: '# Board\n' });
    }
    if (phase.gate === 'mechanical') {
      files.push({
        path: `${phase.id}/GATES.md`,
        content: renderMechanicalGate(`phase ${phase.id}`),
      });
    }
    for (const task of phase.tasks) {
      const dir = `${phase.id}/${task.id}-${task.name}`;
      files.push({ path: `${dir}/TASK.md`, content: renderInitTask(task) });
      files.push({ path: `${dir}/MEMORY.md`, content: renderTaskMemory() });
      if (!task.generatedReview) {
        files.push({ path: `${dir}/GATES.md`, content: gateTemplateFor(task.type, task.name) });
      }
      if (writesMailbox(phase)) files.push({ path: `${dir}/MAILBOX.md`, content: '# Mailbox\n' });
    }
  }
  return files;
};
