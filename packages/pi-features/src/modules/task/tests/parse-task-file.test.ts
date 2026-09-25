import * as Vitest from '@effect/vitest';
import * as Task from '../index.js';
import { taskMarkdown } from './helpers.js';

Vitest.describe('Task.parseTaskFile runtime', () => {
  Vitest.it('parses valid frontmatter into a Task', () => {
    const task = Task.parseTaskFile(taskMarkdown({ id: 'A001', name: 'implement-login' }));
    Vitest.expect(task?.id).toBe('A001');
    Vitest.expect(task?.name).toBe('implement-login');
    Vitest.expect(task?.type).toBe('execution');
    Vitest.expect(task?.originator).toBe('user');
    Vitest.expect(task?.status).toBe('pending');
    Vitest.expect(task?.dependsOn).toStrictEqual([]);
    Vitest.expect(task?.findingRef).toBeUndefined();
  });

  Vitest.it('splits comma-separated depends-on and related-tasks', () => {
    const task = Task.parseTaskFile(
      taskMarkdown({
        id: 'A002',
        name: 'wire-login',
        dependsOn: 'A001',
        relatedTasks: 'A001,A099',
      }),
    );
    Vitest.expect(task?.dependsOn).toStrictEqual(['A001']);
    Vitest.expect(task?.relatedTasks).toStrictEqual(['A001', 'A099']);
  });

  Vitest.it('keeps a defect originator and finding ref', () => {
    const task = Task.parseTaskFile(
      taskMarkdown({
        id: 'A003',
        name: 'fix-login',
        type: 'defect',
        originator: 'defect:A001',
        findingRef: 'F2',
      }),
    );
    Vitest.expect(task?.originator).toBe('defect:A001');
    Vitest.expect(task?.findingRef).toBe('F2');
  });

  Vitest.it('returns undefined without a frontmatter block', () => {
    Vitest.expect(Task.parseTaskFile('# No frontmatter\n')).toBeUndefined();
  });

  Vitest.it('returns undefined on an unknown type', () => {
    Vitest.expect(
      Task.parseTaskFile(taskMarkdown({ id: 'A001', name: 'x', type: 'chore' })),
    ).toBeUndefined();
  });

  Vitest.it('returns undefined on a malformed finding ref', () => {
    Vitest.expect(
      Task.parseTaskFile(taskMarkdown({ id: 'A001', name: 'x', findingRef: 'nope' })),
    ).toBeUndefined();
  });
});
