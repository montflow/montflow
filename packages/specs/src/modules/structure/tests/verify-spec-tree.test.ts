import * as Vitest from '@effect/vitest';
import * as Structure from '../index.js';
import { specMarkdown } from '../../spec/tests/helpers.js';
import { taskMarkdown } from '../../task/tests/helpers.js';
import { entry, memory, snapshot } from './helpers.js';

/** Structure-only verification: the tree rules with no review store. */
const verifyTree = (tree: Structure.SpecSnapshot) =>
  Structure.verifySpecTree(tree, Structure.NO_REVIEW);

const validTree = () =>
  snapshot([
    entry('SPEC.md', specMarkdown()),
    entry('A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
    entry('A001-implement-login/MEMORY.md', memory),
    entry(
      'A099-review-phase/TASK.md',
      taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
    ),
    entry('A099-review-phase/MEMORY.md', memory),
  ]);

Vitest.describe('Structure.verifySpecTree runtime', () => {
  Vitest.it('accepts a structurally valid spec', () => {
    const result = verifyTree(validTree());
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.valid).toBe(true);
  });

  Vitest.it('fails when SPEC.md is missing', () => {
    const result = verifyTree(snapshot([entry('A001-x/TASK.md', '')]));
    Vitest.expect(result).toStrictEqual({
      valid: false,
      issues: [{ field: 'SPEC.md', message: 'Required file is missing.' }],
    });
  });

  Vitest.it('flags a missing TASK.md in a task directory', () => {
    const tree = validTree();
    const result = verifyTree({
      name: tree.name,
      files: tree.files.filter((file) => file.path !== 'A001-implement-login/TASK.md'),
    });
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toContainEqual({
      field: 'A001-implement-login/TASK.md',
      message: 'Required file is missing.',
    });
  });

  Vitest.it('flags an unexpected file at the spec root', () => {
    const tree = validTree();
    const result = verifyTree({
      name: tree.name,
      files: [...tree.files, entry('notes.txt', 'scratch')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'notes.txt',
      message: 'Unexpected file at the spec root.',
    });
  });

  Vitest.it('allows a valid sizing.json at the spec root', () => {
    const tree = validTree();
    const result = verifyTree({
      name: tree.name,
      files: [
        ...tree.files,
        entry('sizing.json', '{"sizes":{"tiny":{"model":"fixture/tiny-model"}}}'),
      ],
    });
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.valid).toBe(true);
  });

  Vitest.it('verifies a spec-root sizing.json and nests its findings', () => {
    const tree = validTree();
    const result = verifyTree({
      name: tree.name,
      files: [...tree.files, entry('sizing.json', '{"sizes":{"huge":{"model":"a/b"}}}')],
    });
    Vitest.expect(result.issues).toStrictEqual([
      {
        code: 'sizing.unknown-size',
        field: 'sizing.json: sizes.huge',
        message: "Unknown size 'huge'.",
        expected: 'tiny, small, medium, large',
        actual: 'huge',
        fix: "Rename 'sizes.huge' to one of tiny, small, medium, large, or remove it.",
      },
    ]);
    Vitest.expect(result.valid).toBe(false);
  });

  Vitest.it('codes malformed JSON in a spec-root sizing.json', () => {
    const tree = validTree();
    const result = verifyTree({
      name: tree.name,
      files: [...tree.files, entry('sizing.json', '{ nope')],
    });
    const issue = result.issues[0];
    Vitest.expect(issue).toMatchObject({
      code: 'sizing.malformed-json',
      field: 'sizing.json: root',
      message: 'Config is not valid JSON.',
      expected: 'a JSON object with a "sizes" map',
      actual: 'unparseable JSON',
      fix: 'Rewrite ship-spec/sizing.json as valid JSON.',
    });
    Vitest.expect(issue?.cause).toBeDefined();
  });

  Vitest.it('flags a task-table type that disagrees with TASK.md', () => {
    const result = verifyTree(
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
      field: 'SPEC.md',
      message: "Task 'A001' type is 'exploratory' in the table but 'execution' in TASK.md.",
    });
  });

  Vitest.it('flags a Gates column that disagrees with GATES.md', () => {
    const result = verifyTree(
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
      field: 'SPEC.md',
      message: "Task 'A001' Gates column is 'Yes' but GATES.md is missing.",
    });
  });

  Vitest.it('flags a forward-phase dependency', () => {
    const result = verifyTree(
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
    const result = verifyTree(
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
    const result = verifyTree(
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
    const result = verifyTree({
      name: tree.name,
      files: [
        entry('SPEC.md', specMarkdown({ lockedPhases: 'A,B' })),
        ...tree.files.filter((file) => file.path !== 'SPEC.md'),
      ],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'locked-phases',
      message: "Locked phase 'B' has no tasks.",
    });
  });

  Vitest.it('flags a TASK.md at the spec root with placement guidance', () => {
    const tree = validTree();
    const result = verifyTree({
      name: tree.name,
      files: [...tree.files, entry('TASK.md', taskMarkdown({ id: 'A050', name: 'stray' }))],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'TASK.md',
      message: 'TASK.md must live inside a task directory: A001-<kebab-name>/TASK.md.',
    });
  });

  Vitest.it('flags a task directory missing its kebab name', () => {
    const result = verifyTree(
      snapshot([
        entry(
          'SPEC.md',
          specMarkdown({
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
    const result = verifyTree(
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
      field: 'SPEC.md',
      message: "Task 'A001' name is 'renamed' in the table but 'implement-login' in TASK.md.",
    });
  });

  Vitest.it('flags invalid GATES.md content', () => {
    const tree = validTree();
    const result = verifyTree({
      name: tree.name,
      files: [...tree.files, entry('A001-implement-login/GATES.md', 'Validate manually.\n')],
    });
    Vitest.expect(
      result.issues.some((found) => found.field === 'A001-implement-login/GATES.md: body'),
    ).toBe(true);
  });

  Vitest.it('flags a MEMORY.md missing template sections', () => {
    const tree = validTree();
    const result = verifyTree({
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

  Vitest.it('flags a complete spec that still has a pending task', () => {
    const result = verifyTree(
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
      entry('A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
      entry('A001-implement-login/MEMORY.md', memory),
      entry(
        'A099-review-phase/TASK.md',
        taskMarkdown({
          id: 'A099',
          name: 'review-phase',
          type: 'review',
          reviewerProfiles: 'example-reviewer',
          status: 'complete',
        }),
      ),
      entry('A099-review-phase/MEMORY.md', memory),
    ]);
    const result = Structure.verifySpecTree(tree, {
      series: [
        { name: 'ship-spec', rounds: [{ round: '001', phase: 'A' }] },
        { name: 'ship-spec-example-reviewer', rounds: [{ round: '001', phase: 'A' }] },
      ],
      requireRounds: true,
    });
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
      entry('A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
      entry('A001-implement-login/MEMORY.md', memory),
      entry(
        'A099-review-phase/TASK.md',
        taskMarkdown({
          id: 'A099',
          name: 'review-phase',
          type: 'review',
          reviewerProfiles: 'example-reviewer',
          status: 'complete',
        }),
      ),
      entry('A099-review-phase/MEMORY.md', memory),
    ]);
    const result = Structure.verifySpecTree(tree, {
      series: [{ name: 'ship-spec', rounds: [{ round: '001', phase: 'A' }] }],
      requireRounds: true,
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'review-series',
      message:
        "Phase 'A' has a review task but review series 'ship-spec-example-reviewer' does not exist.",
    });
  });
});
