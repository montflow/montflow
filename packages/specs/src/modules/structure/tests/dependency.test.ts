import * as Vitest from '@effect/vitest';
import * as Structure from '../index.js';
import { type Task, parseTaskFile } from '../../task/index.js';
import { type TaskFixture, taskMarkdown } from '../../task/tests/helpers.js';

const taskOf = (fixture: TaskFixture): Task => {
  const parsed = parseTaskFile(taskMarkdown(fixture));
  if (parsed === undefined) throw new Error(`fixture ${fixture.id} did not parse`);
  return parsed;
};

const graph = (...tasks: ReadonlyArray<Task>): ReadonlyMap<string, Task> =>
  new Map(tasks.map((task) => [task.id, task]));

const verify = (...tasks: ReadonlyArray<Task>) => Structure.verifyDependencies(graph(...tasks));

Vitest.describe('Structure.verifyDependencies runtime', () => {
  Vitest.it('accepts a resolved, acyclic graph with a cross-phase relation', () => {
    const result = verify(
      taskOf({ id: 'A001', name: 'first', dependsOn: 'A002', relatedTasks: 'B001' }),
      taskOf({ id: 'A002', name: 'second' }),
      taskOf({ id: 'B001', name: 'third' }),
    );
    Vitest.expect(result).toStrictEqual([]);
  });

  Vitest.it('codes an unknown, a self, and a forward-phase dependency', () => {
    const result = verify(
      taskOf({ id: 'A001', name: 'first', dependsOn: 'A404' }),
      taskOf({ id: 'A002', name: 'second', dependsOn: 'A002' }),
      taskOf({ id: 'A003', name: 'third', dependsOn: 'B001' }),
      taskOf({ id: 'B001', name: 'later' }),
    );
    Vitest.expect(result).toContainEqual(
      Vitest.expect.objectContaining({
        code: 'depends-on.unknown-target',
        field: 'task A001',
        actual: 'A404 not found',
      }),
    );
    Vitest.expect(result).toContainEqual(
      Vitest.expect.objectContaining({
        code: 'depends-on.self-reference',
        field: 'task A002',
        actual: 'A002',
      }),
    );
    Vitest.expect(result).toContainEqual(
      Vitest.expect.objectContaining({
        code: 'depends-on.forward-phase',
        field: 'task A003',
        actual: 'B001 in phase B',
      }),
    );
  });

  Vitest.it('codes a dependency cycle', () => {
    const result = verify(
      taskOf({ id: 'A001', name: 'first', dependsOn: 'A002' }),
      taskOf({ id: 'A002', name: 'second', dependsOn: 'A001' }),
    );
    Vitest.expect(result).toContainEqual(
      Vitest.expect.objectContaining({
        code: 'depends-on.cycle',
        field: 'depends-on',
        actual: 'A001 -> A002 -> A001',
      }),
    );
  });

  Vitest.it('rejects a direct and a chained reach to its own phase review', () => {
    const direct = verify(
      taskOf({ id: 'A001', name: 'work', dependsOn: 'A099' }),
      taskOf({ id: 'A099', name: 'review-phase', type: 'review' }),
    );
    Vitest.expect(direct).toContainEqual(
      Vitest.expect.objectContaining({
        code: 'depends-on.own-phase-review',
        field: 'task A001',
        actual: 'A001 -> A099',
      }),
    );

    const chained = verify(
      taskOf({ id: 'A001', name: 'work', dependsOn: 'A002' }),
      taskOf({ id: 'A002', name: 'middle', dependsOn: 'A099' }),
      taskOf({ id: 'A099', name: 'review-phase', type: 'review' }),
    );
    const found = chained.find(
      (issue) => issue.code === 'depends-on.own-phase-review' && issue.field === 'task A001',
    );
    Vitest.expect(found?.actual).toBe('A001 -> A002 -> A099');
    Vitest.expect(found?.fix).toContain("'A002'");
  });

  Vitest.it('accepts an earlier-phase review and a complete dependency', () => {
    const earlier = verify(
      taskOf({ id: 'A099', name: 'review-phase', type: 'review' }),
      taskOf({ id: 'B001', name: 'work', dependsOn: 'A099' }),
    );
    Vitest.expect(earlier).toStrictEqual([]);

    const complete = verify(
      taskOf({ id: 'A001', name: 'work', status: 'complete', dependsOn: 'A002' }),
      taskOf({ id: 'A002', name: 'earlier', status: 'complete' }),
    );
    Vitest.expect(complete).toStrictEqual([]);
  });

  Vitest.it('rejects a complete task ahead of its target and keeps unknown targets once', () => {
    const ahead = verify(
      taskOf({ id: 'A001', name: 'work', status: 'complete', dependsOn: 'A002' }),
      taskOf({ id: 'A002', name: 'later' }),
    );
    Vitest.expect(ahead).toContainEqual(
      Vitest.expect.objectContaining({
        code: 'depends-on.complete-before-target',
        field: 'task A001',
        actual: 'A002 is pending',
      }),
    );

    const unknown = verify(
      taskOf({ id: 'A001', name: 'work', status: 'complete', dependsOn: 'A404' }),
    );
    Vitest.expect(unknown).toStrictEqual([
      Vitest.expect.objectContaining({
        code: 'depends-on.unknown-target',
        field: 'task A001',
      }),
    ]);
  });

  Vitest.it('rejects an unknown or self related-tasks entry', () => {
    const result = verify(
      taskOf({ id: 'A001', name: 'work', relatedTasks: 'A404' }),
      taskOf({ id: 'A002', name: 'other', relatedTasks: 'A002' }),
    );
    Vitest.expect(result).toContainEqual(
      Vitest.expect.objectContaining({
        code: 'related-tasks.unknown-target',
        field: 'task A001',
        actual: 'A404 not found',
      }),
    );
    Vitest.expect(result).toContainEqual(
      Vitest.expect.objectContaining({
        code: 'related-tasks.self-reference',
        field: 'task A002',
        actual: 'A002',
      }),
    );
  });
});
