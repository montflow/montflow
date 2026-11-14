import { GATE_CODES, isPlaceholderCommand } from '../gates/index.js';
import {
  coversToken,
  isNoneScope,
  normalizeCommand,
  scopeContains,
  scopesOverlap,
} from '../scheduler/index.js';
import { type Task, writeScopeTokens } from '../task/index.js';
import { type Issue, finding } from '../verify/index.js';

export { isNoneScope, scopeContains, scopesOverlap };

/**
 * The parallel-authoring rules: a declared write scope per task, no overlap
 * without a dependency edge, a stated reason for a serial chain, and one gate
 * layer per command. These are the C1/C2/C3 checks `check` reports; the
 * scheduler consumes their declared records (`write-scope:`, `scope:`).
 */

/** Stable code for a pending non-review task with no `write-scope:`. */
export const TASK_WRITE_SCOPE_MISSING_CODE = 'task.write-scope-missing';

/** Stable code for two unfinished tasks whose write scopes overlap with no edge. */
export const PHASE_WRITE_SCOPE_OVERLAP_CODE = 'phase.write-scope-overlap';

/** Stable code for an unexplained serial chain in a v2 phase. */
export const PHASE_SERIAL_CHAIN_UNEXPLAINED_CODE = 'phase.serial-chain-unexplained';

/** One mechanical gate stage, for the cross-gate duplicate-command rule. */
export interface GateStageEntry {
  readonly path: string;
  readonly stage: number;
  readonly command: string;
  readonly scopes: ReadonlyArray<string>;
}

/** A task that still has work to do: its scope and edges are enforceable. */
export const unfinished = (task: Task): boolean => task.status !== 'complete';

/** True when `from` reaches `target` through `depends-on` (transitively). */
const reaches = (tasks: ReadonlyMap<string, Task>, from: string, target: string): boolean => {
  const seen = new Set<string>();
  const queue = [...(tasks.get(from)?.dependsOn ?? [])];
  while (queue.length > 0) {
    const next = queue.pop();
    if (next === undefined || seen.has(next)) continue;
    if (next === target) return true;
    seen.add(next);
    queue.push(...(tasks.get(next)?.dependsOn ?? []));
  }
  return false;
};

/** Input for {@link verifyPhaseParallelism}. */
export interface PhaseParallelismInput {
  /** Phase id, for messages. */
  readonly phase: string;
  /** True when the spec declares v2, so the serial-chain rule applies. */
  readonly v2: boolean;
  /** Every parsed task in the phase. */
  readonly tasks: ReadonlyArray<Task>;
  /** Every parsed task in the spec, for transitive reachability. */
  readonly allTasks: ReadonlyMap<string, Task>;
  /** The phase's declared `serial-reason:`, trimmed, when present. */
  readonly serialReason?: string | undefined;
}

/**
 * Verify one phase's parallel shape: a v2 serial chain must state its reason,
 * and two unfinished tasks with overlapping scopes must be joined by a
 * `depends-on` edge. Pure — the caller supplies the parsed tasks.
 * @param input - phase tasks, spec tasks, v2 flag, and the declared reason
 * @returns the findings
 */
export const verifyPhaseParallelism = (input: PhaseParallelismInput): ReadonlyArray<Issue> => {
  const issues: Array<Issue> = [];
  if (input.v2) {
    const work = input.tasks
      .filter((task) => task.type !== 'review')
      .toSorted((left, right) => left.id.localeCompare(right.id));
    const serial =
      work.length >= 3 &&
      work[0]?.dependsOn.length === 0 &&
      work.every(
        (task, index) =>
          index === 0 || (task.dependsOn.length === 1 && task.dependsOn[0] === work[index - 1]?.id),
      );
    if (serial && (input.serialReason ?? '') === '') {
      issues.push(
        finding({
          code: PHASE_SERIAL_CHAIN_UNEXPLAINED_CODE,
          severity: 'warning',
          field: input.phase,
          message: `Phase '${input.phase}' chains all ${work.length} non-review tasks serially with no stated reason.`,
          expected: 'independent tasks, or `serial-reason: <one line>`',
          actual: 'serial chain',
          fix: 'Remove the false `depends-on` edges, split the phase, or state `serial-reason: <one line>` in PHASE.md.',
        }),
      );
    }
  }
  const overlapping = input.tasks.filter(unfinished);
  for (const [index, left] of overlapping.entries()) {
    const leftScope = writeScopeTokens(left);
    if (leftScope === undefined || isNoneScope(leftScope)) continue;
    for (const right of overlapping.slice(index + 1)) {
      const rightScope = writeScopeTokens(right);
      if (rightScope === undefined || isNoneScope(rightScope)) continue;
      if (!scopesOverlap(leftScope, rightScope)) continue;
      if (
        reaches(input.allTasks, left.id, right.id) ||
        reaches(input.allTasks, right.id, left.id)
      ) {
        continue;
      }
      const shared = leftScope.filter((token) =>
        rightScope.some((other) => coversToken(token, other) || coversToken(other, token)),
      );
      issues.push(
        finding({
          code: PHASE_WRITE_SCOPE_OVERLAP_CODE,
          field: `task ${left.id}`,
          message: `Tasks '${left.id}' and '${right.id}' both write '${shared.join(',')}' with no \`depends-on\` edge between them.`,
          expected: 'disjoint write scopes, or a real `depends-on` edge / a split phase',
          actual: `overlap ${leftScope.join(',')} / ${rightScope.join(',')}`,
          fix: 'Add the real dependency edge, narrow a scope, or split the tasks into different phases.',
        }),
      );
    }
  }
  return issues;
};

/**
 * Verify that every pending non-review task declares a write scope.
 * @param tasks - every parsed task in the spec
 * @returns the warnings
 */
export const verifyTaskWriteScopes = (tasks: Iterable<Task>): ReadonlyArray<Issue> => {
  const issues: Array<Issue> = [];
  for (const task of tasks) {
    if (task.status !== 'pending' || task.type === 'review') continue;
    if (writeScopeTokens(task) !== undefined) continue;
    issues.push(
      finding({
        code: TASK_WRITE_SCOPE_MISSING_CODE,
        severity: 'warning',
        field: `task ${task.id}`,
        message: `Pending task '${task.id}' declares no \`write-scope:\`.`,
        expected: 'comma-separated repo-root-relative paths, `.`, or `none`',
        actual: 'missing',
        fix: 'Add `write-scope:` to TASK.md, or set `none` when the task writes no repo files.',
      }),
    );
  }
  return issues;
};

/**
 * Verify that the same command with overlapping scope is not named in two gate
 * files of one spec.
 * @param stages - every mechanical stage across the spec's gates
 * @returns the findings
 */
export const verifyGateStageDuplicates = (
  stages: ReadonlyArray<GateStageEntry>,
): ReadonlyArray<Issue> => {
  const issues: Array<Issue> = [];
  for (const [index, left] of stages.entries()) {
    for (const right of stages.slice(index + 1)) {
      if (left.path === right.path) continue;
      if (normalizeCommand(left.command) !== normalizeCommand(right.command)) continue;
      // A generated `echo 'replace with…'` template is not a shared check.
      if (isPlaceholderCommand(left.command)) continue;
      if (!scopesOverlap(left.scopes, right.scopes)) continue;
      issues.push(
        finding({
          code: GATE_CODES.duplicateCommand,
          field: right.path,
          message: `Command '${normalizeCommand(left.command)}' appears in ${left.path} stage ${left.stage} and ${right.path} stage ${right.stage} with overlapping scope; a shared check belongs in the phase gate once.`,
          expected: 'each command named once, with one scope',
          actual: `${left.path} and ${right.path}`,
          fix: 'Keep the command in the phase GATES.md, or give the two stages disjoint scopes.',
        }),
      );
    }
  }
  return issues;
};
