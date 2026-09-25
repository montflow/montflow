import * as Vitest from '@effect/vitest';
import * as Structure from '../index.js';
import { featureMarkdown } from '../../feature/tests/helpers.js';
import { taskMarkdown } from '../../task/tests/helpers.js';
import { entry, memory, snapshot } from './helpers.js';

const validTree = () =>
  snapshot([
    entry('FEATURE.md', featureMarkdown()),
    entry('A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
    entry('A001-implement-login/MEMORY.md', memory),
    entry(
      'A099-review-phase/TASK.md',
      taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
    ),
    entry('A099-review-phase/MEMORY.md', memory),
  ]);

Vitest.describe('Structure.verifyFeatureTree runtime', () => {
  Vitest.it('accepts a structurally valid feature', () => {
    const result = Structure.verifyFeatureTree(validTree());
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.valid).toBe(true);
  });

  Vitest.it('fails when FEATURE.md is missing', () => {
    const result = Structure.verifyFeatureTree(snapshot([entry('A001-x/TASK.md', '')]));
    Vitest.expect(result).toStrictEqual({
      valid: false,
      issues: [{ field: 'FEATURE.md', message: 'Required file is missing.' }],
    });
  });

  Vitest.it('flags a missing TASK.md in a task directory', () => {
    const tree = validTree();
    const result = Structure.verifyFeatureTree({
      name: tree.name,
      files: tree.files.filter((file) => file.path !== 'A001-implement-login/TASK.md'),
    });
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toContainEqual({
      field: 'A001-implement-login/TASK.md',
      message: 'Required file is missing.',
    });
  });

  Vitest.it('flags an unexpected file at the feature root', () => {
    const tree = validTree();
    const result = Structure.verifyFeatureTree({
      name: tree.name,
      files: [...tree.files, entry('notes.txt', 'scratch')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'notes.txt',
      message: 'Unexpected file at the feature root.',
    });
  });

  Vitest.it('flags a task-table type that disagrees with TASK.md', () => {
    const result = Structure.verifyFeatureTree(
      snapshot([
        entry(
          'FEATURE.md',
          featureMarkdown({
            rows: [
              {
                id: 'A001',
                name: 'implement-login',
                type: 'exploratory',
                status: 'pending',
                gates: 'No',
              },
              { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry(
          'A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login' }),
        ),
        entry('A001-implement-login/MEMORY.md', memory),
        entry(
          'A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
        ),
        entry('A099-review-phase/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'FEATURE.md',
      message: "Task 'A001' type is 'exploratory' in the table but 'execution' in TASK.md.",
    });
  });

  Vitest.it('flags a Gates column that disagrees with GATES.md', () => {
    const result = Structure.verifyFeatureTree(
      snapshot([
        entry(
          'FEATURE.md',
          featureMarkdown({
            rows: [
              {
                id: 'A001',
                name: 'implement-login',
                type: 'execution',
                status: 'pending',
                gates: 'Yes',
              },
              { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry(
          'A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login' }),
        ),
        entry('A001-implement-login/MEMORY.md', memory),
        entry(
          'A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
        ),
        entry('A099-review-phase/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'FEATURE.md',
      message: "Task 'A001' Gates column is 'Yes' but GATES.md is missing.",
    });
  });

  Vitest.it('flags a forward-phase dependency', () => {
    const result = Structure.verifyFeatureTree(
      snapshot([
        entry(
          'FEATURE.md',
          featureMarkdown({
            rows: [
              { id: 'A001', name: 'first', type: 'execution', status: 'pending', gates: 'No' },
              { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
              { id: 'B001', name: 'second', type: 'execution', status: 'pending', gates: 'No' },
              { id: 'B099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry('A001-first/TASK.md', taskMarkdown({ id: 'A001', name: 'first', dependsOn: 'B001' })),
        entry('A001-first/MEMORY.md', memory),
        entry(
          'A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
        ),
        entry('A099-review-phase/MEMORY.md', memory),
        entry('B001-second/TASK.md', taskMarkdown({ id: 'B001', name: 'second' })),
        entry('B001-second/MEMORY.md', memory),
        entry(
          'B099-review-phase/TASK.md',
          taskMarkdown({ id: 'B099', name: 'review-phase', type: 'review' }),
        ),
        entry('B099-review-phase/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'task A001',
      message: "depends-on 'B001' points to a later phase.",
    });
  });

  Vitest.it('flags a dependency cycle', () => {
    const result = Structure.verifyFeatureTree(
      snapshot([
        entry(
          'FEATURE.md',
          featureMarkdown({
            rows: [
              { id: 'A001', name: 'first', type: 'execution', status: 'pending', gates: 'No' },
              { id: 'A002', name: 'second', type: 'execution', status: 'pending', gates: 'No' },
              { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry('A001-first/TASK.md', taskMarkdown({ id: 'A001', name: 'first', dependsOn: 'A002' })),
        entry('A001-first/MEMORY.md', memory),
        entry(
          'A002-second/TASK.md',
          taskMarkdown({ id: 'A002', name: 'second', dependsOn: 'A001' }),
        ),
        entry('A002-second/MEMORY.md', memory),
        entry(
          'A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
        ),
        entry('A099-review-phase/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues.some((found) => found.field === 'depends-on')).toBe(true);
  });

  Vitest.it('flags a phase without a review task', () => {
    const result = Structure.verifyFeatureTree(
      snapshot([
        entry(
          'FEATURE.md',
          featureMarkdown({
            rows: [
              {
                id: 'A001',
                name: 'implement-login',
                type: 'execution',
                status: 'pending',
                gates: 'No',
              },
            ],
          }),
        ),
        entry(
          'A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login' }),
        ),
        entry('A001-implement-login/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'phase A',
      message: 'Phase has no `review` task.',
    });
  });

  Vitest.it('flags a locked phase with no tasks', () => {
    const tree = validTree();
    const result = Structure.verifyFeatureTree({
      name: tree.name,
      files: [
        entry('FEATURE.md', featureMarkdown({ lockedPhases: 'A,B' })),
        ...tree.files.filter((file) => file.path !== 'FEATURE.md'),
      ],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'locked-phases',
      message: "Locked phase 'B' has no tasks.",
    });
  });

  Vitest.it('flags a TASK.md at the feature root with placement guidance', () => {
    const tree = validTree();
    const result = Structure.verifyFeatureTree({
      name: tree.name,
      files: [...tree.files, entry('TASK.md', taskMarkdown({ id: 'A050', name: 'stray' }))],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'TASK.md',
      message: 'TASK.md must live inside a task directory: A001-<kebab-name>/TASK.md.',
    });
  });

  Vitest.it('flags a task directory missing its kebab name', () => {
    const result = Structure.verifyFeatureTree(
      snapshot([
        entry(
          'FEATURE.md',
          featureMarkdown({
            rows: [
              { id: 'A001', name: 'thing', type: 'execution', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry('A001/TASK.md', taskMarkdown({ id: 'A001', name: 'thing' })),
      ]),
    );
    Vitest.expect(
      result.issues.some(
        (found) => found.field === 'A001' && found.message.includes('missing its kebab name'),
      ),
    ).toBe(true);
  });

  Vitest.it('flags a task-table name that disagrees with TASK.md', () => {
    const result = Structure.verifyFeatureTree(
      snapshot([
        entry(
          'FEATURE.md',
          featureMarkdown({
            rows: [
              { id: 'A001', name: 'renamed', type: 'execution', status: 'pending', gates: 'No' },
              { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry(
          'A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login' }),
        ),
        entry('A001-implement-login/MEMORY.md', memory),
        entry(
          'A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
        ),
        entry('A099-review-phase/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'FEATURE.md',
      message: "Task 'A001' name is 'renamed' in the table but 'implement-login' in TASK.md.",
    });
  });

  Vitest.it('flags invalid GATES.md content', () => {
    const tree = validTree();
    const result = Structure.verifyFeatureTree({
      name: tree.name,
      files: [...tree.files, entry('A001-implement-login/GATES.md', 'Validate manually.\n')],
    });
    Vitest.expect(
      result.issues.some((found) => found.field === 'A001-implement-login/GATES.md: body'),
    ).toBe(true);
  });

  Vitest.it('flags a MEMORY.md missing template sections', () => {
    const tree = validTree();
    const result = Structure.verifyFeatureTree({
      name: tree.name,
      files: tree.files.map((file) =>
        file.path === 'A001-implement-login/MEMORY.md' ? entry(file.path, '# Memory\n') : file,
      ),
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'A001-implement-login/MEMORY.md: body',
      message: 'Missing `## Context` section.',
    });
  });

  Vitest.it('flags a complete feature that still has a pending task', () => {
    const result = Structure.verifyFeatureTree(
      snapshot([
        entry(
          'FEATURE.md',
          featureMarkdown({
            name: 'ship-feature',
            status: 'complete',
            lockedPhases: 'A',
            rows: [
              {
                id: 'A001',
                name: 'implement-login',
                type: 'execution',
                status: 'pending',
                gates: 'No',
              },
              { id: 'A099', name: 'review-phase', type: 'review', status: 'complete', gates: 'No' },
            ],
          }),
        ),
        entry(
          'A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login', status: 'pending' }),
        ),
        entry('A001-implement-login/MEMORY.md', memory),
        entry(
          'A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: 'complete' }),
        ),
        entry('A099-review-phase/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'status',
      message: "Feature status is 'complete' but 1 task is not complete: A001 (pending).",
    });
  });
});
