import * as Vitest from '@effect/vitest';
import * as Structure from '../index.js';
import { specMarkdown } from '../../spec/tests/helpers.js';
import { taskMarkdown } from '../../task/tests/helpers.js';
import { dirEntry, entry, memory, snapshot } from './helpers.js';

const validTree = () =>
  snapshot([
    entry('SPEC.md', specMarkdown()),
    entry('A/A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
    entry('A/A001-implement-login/MEMORY.md', memory),
    entry(
      'A/A099-review-phase/TASK.md',
      taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
    ),
    entry('A/A099-review-phase/MEMORY.md', memory),
  ]);

Vitest.describe('Structure.verifySpecTree runtime', () => {
  Vitest.it('accepts a structurally valid spec', () => {
    const result = Structure.verifySpecTree(validTree());
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.valid).toBe(true);
  });

  Vitest.it('accepts a valid spec that also lists its directories', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree(
      snapshot([
        ...tree.files,
        dirEntry('A/A001-implement-login'),
        dirEntry('A/A099-review-phase'),
      ]),
    );
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.valid).toBe(true);
  });

  Vitest.it('flags an unexpected directory at the spec root', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: [...tree.files, dirEntry('stray')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'stray',
      message: 'Unexpected directory at the spec root.',
    });
  });

  Vitest.it('fails when SPEC.md is missing', () => {
    const result = Structure.verifySpecTree(snapshot([entry('A/A001-x/TASK.md', '')]));
    Vitest.expect(result).toStrictEqual({
      valid: false,
      issues: [{ field: 'SPEC.md', message: 'Required file is missing.' }],
    });
  });

  Vitest.it('flags a missing TASK.md in a task directory', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: tree.files.filter((file) => file.path !== 'A/A001-implement-login/TASK.md'),
    });
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toContainEqual({
      field: 'A/A001-implement-login/TASK.md',
      message: 'Required file is missing.',
    });
  });

  Vitest.it('flags a task directory still at the spec root', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: [
        ...tree.files,
        entry('B001-legacy/TASK.md', taskMarkdown({ id: 'B001', name: 'legacy' })),
        entry('B001-legacy/MEMORY.md', memory),
      ],
    });
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'B001-legacy',
        message: "Task directory 'B001-legacy' must live inside a phase directory: B/B001-legacy/.",
        fix: 'Move it to B/B001-legacy/.',
      },
    ]);
  });

  Vitest.it('flags an empty phase directory', () => {
    const result = Structure.verifySpecTree(
      snapshot([entry('SPEC.md', specMarkdown({ rows: [] })), dirEntry('B')]),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toContainEqual({
      field: 'B',
      message: 'Phase directory has no task directories.',
    });
  });

  Vitest.it('flags an unexpected file in a phase directory', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: [...tree.files, entry('A/notes.txt', 'scratch')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'A/notes.txt',
      message: 'Unexpected file in a phase directory; files live in a task directory.',
    });
  });

  Vitest.it('flags an unexpected directory inside a task directory', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: [...tree.files, dirEntry('A/A001-implement-login/scratch')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'A/A001-implement-login/scratch',
      message: 'Unexpected directory inside a task directory.',
    });
  });

  Vitest.it('flags a declared directory two levels inside a task directory', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: [...tree.files, dirEntry('A/A001-implement-login/sub/deep')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'A/A001-implement-login/sub',
      message: 'Unexpected directory inside a task directory.',
    });
  });

  Vitest.it('flags a non-task directory in a phase directory', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: [...tree.files, dirEntry('A/notes')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'A/notes',
      message: 'Unexpected directory in a phase directory; a phase holds task directories only.',
    });
  });

  Vitest.it('flags a task whose id phase disagrees with its phase directory', () => {
    const result = Structure.verifySpecTree(
      snapshot([
        entry(
          'SPEC.md',
          specMarkdown({
            rows: [
              { id: 'B001', name: 'wrong', type: 'execution', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry('A/B001-wrong/TASK.md', taskMarkdown({ id: 'B001', name: 'wrong' })),
        entry('A/B001-wrong/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'A/B001-wrong',
      message: "Task id 'B001' belongs to phase 'B', but lives under 'A/'.",
    });
  });

  Vitest.it('flags a path deeper than a task directory', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: [...tree.files, entry('A/A001-implement-login/sub/TASK.md', '')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'A/A001-implement-login/sub/TASK.md',
      message: 'Path is deeper than <phase>/<task>/<file>.',
    });
  });

  Vitest.it('flags an unexpected file at the spec root', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: [...tree.files, entry('notes.txt', 'scratch')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'notes.txt',
      message: 'Unexpected file at the spec root.',
    });
  });

  Vitest.it('flags a task-table type that disagrees with TASK.md', () => {
    const result = Structure.verifySpecTree(
      snapshot([
        entry(
          'SPEC.md',
          specMarkdown({
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
          'A/A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login' }),
        ),
        entry('A/A001-implement-login/MEMORY.md', memory),
        entry(
          'A/A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
        ),
        entry('A/A099-review-phase/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'SPEC.md',
      message: "Task 'A001' type is 'exploratory' in the table but 'execution' in TASK.md.",
    });
  });

  Vitest.it('flags a Gates column that disagrees with GATES.md', () => {
    const result = Structure.verifySpecTree(
      snapshot([
        entry(
          'SPEC.md',
          specMarkdown({
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
          'A/A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login' }),
        ),
        entry('A/A001-implement-login/MEMORY.md', memory),
        entry(
          'A/A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
        ),
        entry('A/A099-review-phase/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'SPEC.md',
      message: "Task 'A001' Gates column is 'Yes' but GATES.md is missing.",
    });
  });

  Vitest.it('flags a forward-phase dependency', () => {
    const result = Structure.verifySpecTree(
      snapshot([
        entry(
          'SPEC.md',
          specMarkdown({
            rows: [
              { id: 'A001', name: 'first', type: 'execution', status: 'pending', gates: 'No' },
              { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
              { id: 'B001', name: 'second', type: 'execution', status: 'pending', gates: 'No' },
              { id: 'B099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry(
          'A/A001-first/TASK.md',
          taskMarkdown({ id: 'A001', name: 'first', dependsOn: 'B001' }),
        ),
        entry('A/A001-first/MEMORY.md', memory),
        entry(
          'A/A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
        ),
        entry('A/A099-review-phase/MEMORY.md', memory),
        entry('B/B001-second/TASK.md', taskMarkdown({ id: 'B001', name: 'second' })),
        entry('B/B001-second/MEMORY.md', memory),
        entry(
          'B/B099-review-phase/TASK.md',
          taskMarkdown({ id: 'B099', name: 'review-phase', type: 'review' }),
        ),
        entry('B/B099-review-phase/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'task A001',
      message: "depends-on 'B001' points to a later phase.",
    });
  });

  Vitest.it('flags a dependency cycle', () => {
    const result = Structure.verifySpecTree(
      snapshot([
        entry(
          'SPEC.md',
          specMarkdown({
            rows: [
              { id: 'A001', name: 'first', type: 'execution', status: 'pending', gates: 'No' },
              { id: 'A002', name: 'second', type: 'execution', status: 'pending', gates: 'No' },
              { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry(
          'A/A001-first/TASK.md',
          taskMarkdown({ id: 'A001', name: 'first', dependsOn: 'A002' }),
        ),
        entry('A/A001-first/MEMORY.md', memory),
        entry(
          'A/A002-second/TASK.md',
          taskMarkdown({ id: 'A002', name: 'second', dependsOn: 'A001' }),
        ),
        entry('A/A002-second/MEMORY.md', memory),
        entry(
          'A/A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
        ),
        entry('A/A099-review-phase/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues.some((found) => found.field === 'depends-on')).toBe(true);
  });

  Vitest.it('flags a phase without a review task', () => {
    const result = Structure.verifySpecTree(
      snapshot([
        entry(
          'SPEC.md',
          specMarkdown({
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
          'A/A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login' }),
        ),
        entry('A/A001-implement-login/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'phase A',
      message: 'Phase has no `review` task.',
    });
  });

  Vitest.it('flags a locked phase with no phase directory', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: [
        entry('SPEC.md', specMarkdown({ lockedPhases: 'A,B' })),
        ...tree.files.filter((file) => file.path !== 'SPEC.md'),
      ],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'locked-phases',
      message: "Locked phase 'B' has no phase directory.",
    });
  });

  Vitest.it('flags a TASK.md at the spec root with placement guidance', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: [...tree.files, entry('TASK.md', taskMarkdown({ id: 'A050', name: 'stray' }))],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'TASK.md',
      message: 'TASK.md must live inside a task directory: <phase>/A001-<kebab-name>/TASK.md.',
    });
  });

  Vitest.it('flags a task directory missing its kebab name', () => {
    const result = Structure.verifySpecTree(
      snapshot([
        entry(
          'SPEC.md',
          specMarkdown({
            rows: [
              { id: 'A001', name: 'thing', type: 'execution', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry('A/A001/TASK.md', taskMarkdown({ id: 'A001', name: 'thing' })),
      ]),
    );
    Vitest.expect(
      result.issues.some(
        (found) => found.field === 'A/A001' && found.message.includes('missing its kebab name'),
      ),
    ).toBe(true);
  });

  Vitest.it('flags a task-table name that disagrees with TASK.md', () => {
    const result = Structure.verifySpecTree(
      snapshot([
        entry(
          'SPEC.md',
          specMarkdown({
            rows: [
              { id: 'A001', name: 'renamed', type: 'execution', status: 'pending', gates: 'No' },
              { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry(
          'A/A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login' }),
        ),
        entry('A/A001-implement-login/MEMORY.md', memory),
        entry(
          'A/A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
        ),
        entry('A/A099-review-phase/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'SPEC.md',
      message: "Task 'A001' name is 'renamed' in the table but 'implement-login' in TASK.md.",
    });
  });

  Vitest.it('flags invalid GATES.md content', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: [...tree.files, entry('A/A001-implement-login/GATES.md', 'Validate manually.\n')],
    });
    Vitest.expect(
      result.issues.some((found) => found.field === 'A/A001-implement-login/GATES.md: body'),
    ).toBe(true);
  });

  Vitest.it('flags a MEMORY.md missing template sections', () => {
    const tree = validTree();
    const result = Structure.verifySpecTree({
      name: tree.name,
      files: tree.files.map((file) =>
        file.path === 'A/A001-implement-login/MEMORY.md' ? entry(file.path, '# Memory\n') : file,
      ),
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'A/A001-implement-login/MEMORY.md: body',
      message: 'Missing `## Context` section.',
    });
  });

  Vitest.it('flags a complete spec that still has a pending task', () => {
    const result = Structure.verifySpecTree(
      snapshot([
        entry(
          'SPEC.md',
          specMarkdown({
            name: 'ship-spec',
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
          'A/A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login', status: 'pending' }),
        ),
        entry('A/A001-implement-login/MEMORY.md', memory),
        entry(
          'A/A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: 'complete' }),
        ),
        entry('A/A099-review-phase/MEMORY.md', memory),
      ]),
    );
    Vitest.expect(result.issues).toContainEqual({
      field: 'status',
      message: "Spec status is 'complete' but 1 task is not complete: A001 (pending).",
    });
  });

  Vitest.it('accepts a complete review backed by every expected series', () => {
    const tree = snapshot([
      entry(
        'SPEC.md',
        specMarkdown({
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
        'A/A001-implement-login/TASK.md',
        taskMarkdown({ id: 'A001', name: 'implement-login' }),
      ),
      entry('A/A001-implement-login/MEMORY.md', memory),
      entry(
        'A/A099-review-phase/TASK.md',
        taskMarkdown({
          id: 'A099',
          name: 'review-phase',
          type: 'review',
          reviewerProfiles: 'effect-reviewer',
          status: 'complete',
        }),
      ),
      entry('A/A099-review-phase/MEMORY.md', memory),
    ]);
    const result = Structure.verifySpecTree(tree, [
      { name: 'ship-spec', rounds: [{ round: '001', phase: 'A' }] },
      { name: 'ship-spec-effect-reviewer', rounds: [{ round: '001', phase: 'A' }] },
    ]);
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.valid).toBe(true);
  });

  Vitest.it('flags a complete review when a profile series is missing', () => {
    const tree = snapshot([
      entry(
        'SPEC.md',
        specMarkdown({
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
        'A/A001-implement-login/TASK.md',
        taskMarkdown({ id: 'A001', name: 'implement-login' }),
      ),
      entry('A/A001-implement-login/MEMORY.md', memory),
      entry(
        'A/A099-review-phase/TASK.md',
        taskMarkdown({
          id: 'A099',
          name: 'review-phase',
          type: 'review',
          reviewerProfiles: 'effect-reviewer',
          status: 'complete',
        }),
      ),
      entry('A/A099-review-phase/MEMORY.md', memory),
    ]);
    const result = Structure.verifySpecTree(tree, [
      { name: 'ship-spec', rounds: [{ round: '001', phase: 'A' }] },
    ]);
    Vitest.expect(result.issues).toContainEqual({
      field: 'review-series',
      message:
        "Phase 'A' has a review task but review series 'ship-spec-effect-reviewer' does not exist.",
    });
  });
});
