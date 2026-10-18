import * as Vitest from '@effect/vitest';
import * as Task from '../index.js';
import { taskMarkdown } from './helpers.js';

Vitest.describe('Task.verifyTaskFile runtime', () => {
  Vitest.it('accepts a standard-shaped file', () => {
    const result = Task.verifyTaskFile(
      'A001-implement-login',
      taskMarkdown({ id: 'A001', name: 'implement-login' }),
    );
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues).toStrictEqual([]);
  });

  Vitest.it('fails without a frontmatter block', () => {
    const result = Task.verifyTaskFile('A001-implement-login', '# Just a body\n');
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'frontmatter', message: 'Missing frontmatter block.' },
    ]);
  });

  Vitest.it('flags an id and name that mismatch the directory', () => {
    const result = Task.verifyTaskFile(
      'A001-implement-login',
      taskMarkdown({ id: 'A002', name: 'other' }),
    );
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'id', message: "Must match the task directory id 'A001'." },
      { field: 'name', message: "Must match the task directory name 'implement-login'." },
    ]);
  });

  Vitest.it('flags an unknown type and status', () => {
    const result = Task.verifyTaskFile(
      'A001-implement-login',
      taskMarkdown({ id: 'A001', name: 'implement-login', type: 'chore', status: 'defect' }),
    );
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'type',
        message: 'Must be one of: exploratory, execution, planning, interruptor, defect, review.',
      },
      { field: 'status', message: 'Must be one of: pending, in-progress, complete, blocked.' },
    ]);
  });

  Vitest.it('flags a malformed originator, dependency, and finding ref', () => {
    const result = Task.verifyTaskFile(
      'A001-implement-login',
      taskMarkdown({
        id: 'A001',
        name: 'implement-login',
        originator: 'robot',
        dependsOn: 'nope',
        findingRef: 'F',
      }),
    );
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'originator',
        message: 'Must be `user`, `defect:<task-id>`, or `planner:<task-id>`.',
      },
      { field: 'depends-on', message: "'nope' is not a task id." },
      { field: 'finding-ref', message: 'Must be a finding id like `F1`.' },
    ]);
  });

  Vitest.it('flags missing body sections', () => {
    const result = Task.verifyTaskFile(
      'A001-implement-login',
      [
        '---',
        'id: A001',
        'name: implement-login',
        'type: execution',
        'originator: user',
        'status: pending',
        '---',
        '',
        'No body.',
        '',
      ].join('\n'),
    );
    Vitest.expect(result.issues.map((found) => found.field)).toStrictEqual([
      'body',
      'body',
      'body',
      'body',
    ]);
  });
});
