import * as Vitest from '@effect/vitest';
import { verifySpecTree } from '../../structure/index.js';
import { renderSpecScaffold } from '../index.js';

/** Base inputs; individual tests override `tasks`/metadata. */
const base = {
  name: 'ship-login',
  author: 'Tester',
  created: '2026-01-01',
} as const;

Vitest.describe('renderSpecScaffold', () => {
  Vitest.it('renders a valid single-task tree with the phase review', () => {
    const result = renderSpecScaffold({
      ...base,
      tasks: [{ name: 'implement', type: 'execution' }],
    });
    Vitest.expect(result.phase).toBe('A');
    Vitest.expect(result.reviewId).toBe('A099');
    Vitest.expect(result.taskCount).toBe(2);
    Vitest.expect(result.files.map((file) => file.path).toSorted()).toStrictEqual([
      'A001-implement/MEMORY.md',
      'A001-implement/TASK.md',
      'A099-review-phase/MEMORY.md',
      'A099-review-phase/TASK.md',
      'SPEC.md',
    ]);
    const verify = verifySpecTree({ name: base.name, files: result.files });
    Vitest.expect(verify.issues).toStrictEqual([]);
    Vitest.expect(verify.valid).toBe(true);
  });

  Vitest.it('emits GATES.md only for gated tasks', () => {
    const result = renderSpecScaffold({
      ...base,
      tasks: [
        { name: 'build', type: 'execution', gates: true },
        { name: 'explore', type: 'exploratory' },
      ],
    });
    Vitest.expect(result.files.map((file) => file.path)).toContain('A001-build/GATES.md');
    Vitest.expect(result.files.map((file) => file.path)).not.toContain('A002-explore/GATES.md');
    Vitest.expect(verifySpecTree({ name: base.name, files: result.files }).valid).toBe(true);
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
    Vitest.expect(table).toContain('| A001 | build | execution | pending | No |');
    Vitest.expect(table).toContain('| A002 | verify | execution | pending | No |');
    Vitest.expect(table).toContain('| A099 | review-phase | review | pending | No |');
    const task = result.files.find((file) => file.path === 'A002-verify/TASK.md')?.content ?? '';
    Vitest.expect(task).toContain('depends-on: A001');
    Vitest.expect(verifySpecTree({ name: base.name, files: result.files }).valid).toBe(true);
  });

  Vitest.it('emits a size on every task, defaulting to medium', () => {
    const result = renderSpecScaffold({
      ...base,
      tasks: [
        { name: 'build', type: 'execution', size: 'large' },
        { name: 'explore', type: 'exploratory' },
      ],
    });
    const build = result.files.find((file) => file.path === 'A001-build/TASK.md')?.content ?? '';
    Vitest.expect(build).toContain('size: large');
    const explore =
      result.files.find((file) => file.path === 'A002-explore/TASK.md')?.content ?? '';
    Vitest.expect(explore).toContain('size: medium');
    const review =
      result.files.find((file) => file.path === 'A099-review-phase/TASK.md')?.content ?? '';
    Vitest.expect(review).toContain('size: medium');
    Vitest.expect(verifySpecTree({ name: base.name, files: result.files }).valid).toBe(true);
  });

  Vitest.it('emits an empty reviewer-profiles line on the review task by default', () => {
    const result = renderSpecScaffold({
      ...base,
      tasks: [{ name: 'implement', type: 'execution' }],
    });
    const review =
      result.files.find((file) => file.path === 'A099-review-phase/TASK.md')?.content ?? '';
    Vitest.expect(review).toContain('reviewer-profiles:');
    Vitest.expect(review).not.toContain('reviewer-profiles: effect-reviewer');
    Vitest.expect(verifySpecTree({ name: base.name, files: result.files }).valid).toBe(true);
  });

  Vitest.it('emits supplied reviewer-profiles on the review task', () => {
    const result = renderSpecScaffold({
      ...base,
      reviewerProfiles: ['effect-reviewer', 'generic-reviewer'],
      tasks: [{ name: 'implement', type: 'execution' }],
    });
    const review =
      result.files.find((file) => file.path === 'A099-review-phase/TASK.md')?.content ?? '';
    Vitest.expect(review).toContain('reviewer-profiles: effect-reviewer, generic-reviewer');
    Vitest.expect(verifySpecTree({ name: base.name, files: result.files }).valid).toBe(true);
  });

  Vitest.it('honors a custom phase letter', () => {
    const result = renderSpecScaffold({
      ...base,
      phase: 'B',
      tasks: [{ name: 'implement', type: 'execution' }],
    });
    Vitest.expect(result.reviewId).toBe('B099');
    Vitest.expect(result.files.map((file) => file.path)).toContain('B001-implement/TASK.md');
  });
});
