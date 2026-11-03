import * as Vitest from '@effect/vitest';
import { NO_REVIEW, verifySpecTree } from '../../structure/index.js';
import { renderSpecScaffold } from '../index.js';

/** Base inputs; individual tests override `tasks`/metadata. */
const base = {
  name: 'ship-login',
  author: 'Tester',
  created: '2026-01-01',
} as const;

Vitest.describe('renderSpecScaffold', () => {
  Vitest.it('renders a valid single-task tree without a reserved review task', () => {
    const result = renderSpecScaffold({
      ...base,
      tasks: [{ name: 'implement', type: 'execution' }],
    });
    Vitest.expect(result.phase).toBe('A');
    Vitest.expect(result.taskCount).toBe(1);
    Vitest.expect(result.files.map((file) => file.path).toSorted()).toStrictEqual([
      'A/A001-implement/GATES.md',
      'A/A001-implement/MEMORY.md',
      'A/A001-implement/TASK.md',
      'A/MEMORY.md',
      'A/PHASE.md',
      'SPEC.md',
    ]);
    const verify = verifySpecTree({ name: base.name, files: result.files }, NO_REVIEW);
    Vitest.expect(verify.valid).toBe(true);
    Vitest.expect(verify.issues.map((found) => found.code)).toStrictEqual([
      'phase.review-task-missing',
    ]);
  });

  Vitest.it('appends no review task unless the caller requests one', () => {
    const without = renderSpecScaffold({
      ...base,
      tasks: [{ name: 'implement', type: 'execution' }],
    });
    Vitest.expect(without.files.some((file) => file.path.includes('review'))).toBe(false);
    const withReview = renderSpecScaffold({
      ...base,
      tasks: [
        { name: 'implement', type: 'execution' },
        { name: 'review-phase', type: 'review' },
      ],
    });
    Vitest.expect(withReview.files.map((file) => file.path)).toContain(
      'A/A002-review-phase/TASK.md',
    );
    Vitest.expect(withReview.taskCount).toBe(2);
    Vitest.expect(
      verifySpecTree({ name: base.name, files: withReview.files }, NO_REVIEW).valid,
    ).toBe(true);
  });

  Vitest.it('emits GATES.md only for gated tasks', () => {
    const result = renderSpecScaffold({
      ...base,
      tasks: [
        { name: 'build', type: 'execution', gates: true },
        { name: 'explore', type: 'exploratory' },
      ],
    });
    Vitest.expect(result.files.map((file) => file.path)).toContain('A/A001-build/GATES.md');
    Vitest.expect(result.files.map((file) => file.path)).not.toContain('A/A002-explore/GATES.md');
    Vitest.expect(verifySpecTree({ name: base.name, files: result.files }, NO_REVIEW).valid).toBe(
      true,
    );
  });

  Vitest.it("marks the gate stub for replacement with the task's own commands", () => {
    const result = renderSpecScaffold({
      ...base,
      tasks: [{ name: 'build', type: 'execution', gates: true }],
    });
    const gates = result.files.find((file) => file.path === 'A/A001-build/GATES.md');
    Vitest.expect(gates?.content).toContain(
      "Replace the example command with this task's real verification command.",
    );
    Vitest.expect(gates?.content).toContain('(mechanical)');
    Vitest.expect(gates?.content).not.toContain('formatting passes');
    Vitest.expect(verifySpecTree({ name: base.name, files: result.files }, NO_REVIEW).valid).toBe(
      true,
    );
  });

  Vitest.it('wires task ids, depends-on, and the task table', () => {
    const result = renderSpecScaffold({
      ...base,
      tasks: [
        { name: 'build', type: 'execution' },
        { name: 'verify', type: 'execution', dependsOn: ['A001'] },
      ],
    });
    const table = result.files.find((file) => file.path === 'SPEC.md')?.content ?? '';
    Vitest.expect(table).toContain('| A001 | build | execution | pending | Yes |');
    Vitest.expect(table).toContain('| A002 | verify | execution | pending | Yes |');
    Vitest.expect(table).not.toContain('| A099 |');
    const task = result.files.find((file) => file.path === 'A/A002-verify/TASK.md')?.content ?? '';
    Vitest.expect(task).toContain('depends-on: A001');
    Vitest.expect(verifySpecTree({ name: base.name, files: result.files }, NO_REVIEW).valid).toBe(
      true,
    );
  });

  Vitest.it('emits a size on every task, defaulting to medium', () => {
    const result = renderSpecScaffold({
      ...base,
      tasks: [
        { name: 'build', type: 'execution', size: 'large' },
        { name: 'explore', type: 'exploratory' },
      ],
    });
    const build = result.files.find((file) => file.path === 'A/A001-build/TASK.md')?.content ?? '';
    Vitest.expect(build).toContain('size: large');
    const explore =
      result.files.find((file) => file.path === 'A/A002-explore/TASK.md')?.content ?? '';
    Vitest.expect(explore).toContain('size: medium');
    Vitest.expect(verifySpecTree({ name: base.name, files: result.files }, NO_REVIEW).valid).toBe(
      true,
    );
  });

  Vitest.it('emits reviewer-profiles on a requested review task', () => {
    const result = renderSpecScaffold({
      ...base,
      reviewerProfiles: ['example-reviewer', 'generic-reviewer'],
      tasks: [
        { name: 'implement', type: 'execution' },
        { name: 'review-phase', type: 'review' },
      ],
    });
    const review =
      result.files.find((file) => file.path === 'A/A002-review-phase/TASK.md')?.content ?? '';
    Vitest.expect(review).toContain('reviewer-profiles: example-reviewer, generic-reviewer');
    Vitest.expect(verifySpecTree({ name: base.name, files: result.files }, NO_REVIEW).valid).toBe(
      true,
    );
  });

  Vitest.it('emits an empty reviewer-profiles line by default on a review task', () => {
    const result = renderSpecScaffold({
      ...base,
      tasks: [
        { name: 'implement', type: 'execution' },
        { name: 'review-phase', type: 'review' },
      ],
    });
    const review =
      result.files.find((file) => file.path === 'A/A002-review-phase/TASK.md')?.content ?? '';
    Vitest.expect(review).toContain('reviewer-profiles:');
    Vitest.expect(review).not.toContain('reviewer-profiles: example-reviewer');
    Vitest.expect(verifySpecTree({ name: base.name, files: result.files }, NO_REVIEW).valid).toBe(
      true,
    );
  });

  Vitest.it('honors a custom phase letter', () => {
    const result = renderSpecScaffold({
      ...base,
      phase: 'B',
      tasks: [{ name: 'implement', type: 'execution' }],
    });
    Vitest.expect(result.files.map((file) => file.path)).toContain('B/B001-implement/TASK.md');
  });

  Vitest.it('writes no stored lock list', () => {
    const result = renderSpecScaffold({
      ...base,
      tasks: [{ name: 'implement', type: 'execution' }],
    });
    const spec = result.files.find((file) => file.path === 'SPEC.md')?.content ?? '';
    Vitest.expect(spec).not.toContain(['locked', 'phases'].join('-'));
  });

  Vitest.it('rejects a phase that is not a phase id', () => {
    Vitest.expect(() =>
      renderSpecScaffold({
        ...base,
        phase: 'ab',
        tasks: [{ name: 'implement', type: 'execution' }],
      }),
    ).toThrow(/Invalid scaffold phase/);
  });
});
