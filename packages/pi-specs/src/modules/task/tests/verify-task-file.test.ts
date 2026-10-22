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
      { field: 'finding-ref', message: "Must be a finding reference like '<series>/<round>/F1'." },
    ]);
  });

  Vitest.it('accepts a review task with reviewer-profiles', () => {
    const result = Task.verifyTaskFile(
      'A099-review-phase',
      taskMarkdown({
        id: 'A099',
        name: 'review-phase',
        type: 'review',
        reviewerProfiles: 'effect-reviewer, generic-reviewer',
      }),
    );
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues).toStrictEqual([]);
  });

  Vitest.it('accepts an empty reviewer-profiles list on a review task', () => {
    const result = Task.verifyTaskFile(
      'A099-review-phase',
      taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', reviewerProfiles: '' }),
    );
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues).toStrictEqual([]);
  });

  Vitest.it('rejects a malformed reviewer profile slug', () => {
    const result = Task.verifyTaskFile(
      'A099-review-phase',
      taskMarkdown({
        id: 'A099',
        name: 'review-phase',
        type: 'review',
        reviewerProfiles: 'Effect_Reviewer',
      }),
    );
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'reviewer-profiles', message: "'Effect_Reviewer' is not a profile slug." },
    ]);
  });

  Vitest.it('rejects a duplicated reviewer profile', () => {
    const result = Task.verifyTaskFile(
      'A099-review-phase',
      taskMarkdown({
        id: 'A099',
        name: 'review-phase',
        type: 'review',
        reviewerProfiles: 'effect-reviewer,effect-reviewer',
      }),
    );
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'reviewer-profiles', message: "'effect-reviewer' is listed more than once." },
    ]);
  });

  Vitest.it('rejects reviewer-profiles on a non-review task', () => {
    const result = Task.verifyTaskFile(
      'A001-implement-login',
      taskMarkdown({
        id: 'A001',
        name: 'implement-login',
        type: 'execution',
        reviewerProfiles: 'effect-reviewer',
      }),
    );
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'reviewer-profiles', message: "only valid on a 'review' task." },
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
