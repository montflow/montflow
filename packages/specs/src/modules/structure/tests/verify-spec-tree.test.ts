import * as Vitest from '@effect/vitest';
import * as Structure from '../index.js';
import { specMarkdown } from '../../spec/tests/helpers.js';
import { taskMarkdown } from '../../task/tests/helpers.js';
import { phaseMarkdown } from '../../phase/tests/helpers.js';
import { dirEntry, entry, memory, snapshot } from './helpers.js';

const validTree = () =>
  snapshot([
    entry('SPEC.md', specMarkdown({ version: '2' })),
    entry('A/PHASE.md', phaseMarkdown()),
    entry('A/MEMORY.md', memory),
    entry('A/A001-implement-login/TASK.md', taskMarkdown({ id: 'A001', name: 'implement-login' })),
    entry('A/A001-implement-login/MEMORY.md', memory),
    entry(
      'A/A099-review-phase/TASK.md',
      taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
    ),
    entry('A/A099-review-phase/MEMORY.md', memory),
  ]);

const verifyTree = (
  tree: Structure.SpecSnapshot,
  review: Structure.ReviewInput = Structure.NO_REVIEW,
) => Structure.verifySpecTree(tree, review);

Vitest.describe('Structure.verifySpecTree runtime', () => {
  Vitest.it('accepts a structurally valid spec', () => {
    const result = verifyTree(validTree());
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.valid).toBe(true);
  });

  Vitest.it('requires a classified gate on an unfinished v2 task, not on a complete one', () => {
    const prose = ['# GATES', '', '## Stage 0: Static', '', '- [ ] Pass.', ''].join('\n');
    const tree = (status: string, mark: string) =>
      snapshot([
        entry(
          'SPEC.md',
          specMarkdown({
            version: '2',
            rows: [
              {
                id: 'A001',
                name: 'implement-login',
                type: 'execution',
                status,
                gates: 'Yes',
              },
              { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
            ],
          }),
        ),
        entry('A/PHASE.md', phaseMarkdown()),
        entry('A/MEMORY.md', memory),
        entry(
          'A/A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login', status }),
        ),
        entry('A/A001-implement-login/MEMORY.md', memory),
        entry('A/A001-implement-login/GATES.md', prose.replace('- [ ] Pass.', mark)),
        entry(
          'A/A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
        ),
        entry('A/A099-review-phase/MEMORY.md', memory),
      ]);

    const pending = verifyTree(tree('pending', '- [ ] Pass.'));
    Vitest.expect(pending.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.no-mechanical-stages' }),
    );

    const complete = verifyTree(tree('complete', '- [x] Pass.'));
    Vitest.expect(complete.issues).not.toContainEqual(
      Vitest.expect.objectContaining({ code: 'gate.no-mechanical-stages' }),
    );
  });

  Vitest.it('accepts a valid spec that also lists its directories', () => {
    const tree = validTree();
    const result = verifyTree(
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
    const result = verifyTree({
      name: tree.name,
      files: [...tree.files, dirEntry('stray')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'stray',
      message: 'Unexpected directory at the spec root.',
    });
  });

  Vitest.it('fails when SPEC.md is missing', () => {
    const result = verifyTree(snapshot([entry('A/A001-x/TASK.md', '')]));
    Vitest.expect(result).toStrictEqual({
      valid: false,
      issues: [{ field: 'SPEC.md', message: 'Required file is missing.' }],
    });
  });

  Vitest.it('flags a missing TASK.md in a task directory', () => {
    const tree = validTree();
    const result = verifyTree({
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
    const result = verifyTree({
      name: tree.name,
      files: [
        ...tree.files,
        entry('B001-legacy/TASK.md', taskMarkdown({ id: 'B001', name: 'legacy' })),
        entry('B001-legacy/MEMORY.md', memory),
      ],
    });
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toContainEqual({
      field: 'B001-legacy',
      message: "Task directory 'B001-legacy' must live inside a phase directory: B/B001-legacy/.",
      fix: 'Move it to B/B001-legacy/.',
    });
  });

  Vitest.it('flags an empty phase directory', () => {
    const result = verifyTree(
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
    const result = verifyTree({
      name: tree.name,
      files: [...tree.files, entry('A/notes.txt', 'scratch')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'A/notes.txt',
      message:
        'Unexpected file in a phase directory; a phase holds PHASE.md, MEMORY.md, GATES.md, GATE-RESULTS.jsonl, and BOARD.md.',
    });
  });

  Vitest.it('flags an unexpected directory inside a task directory', () => {
    const tree = validTree();
    const result = verifyTree({
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
    const result = verifyTree({
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
    const result = verifyTree({
      name: tree.name,
      files: [...tree.files, dirEntry('A/notes')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'A/notes',
      message: 'Unexpected directory in a phase directory; a phase holds task directories only.',
    });
  });

  Vitest.it('flags a task whose id phase disagrees with its phase directory', () => {
    const result = verifyTree(
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
    const result = verifyTree({
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
    const result = verifyTree({
      name: tree.name,
      files: [...tree.files, entry('notes.txt', 'scratch')],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'notes.txt',
      message: 'Unexpected file at the spec root.',
    });
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

  Vitest.it('flags a TASK.md at the spec root with placement guidance', () => {
    const tree = validTree();
    const result = verifyTree({
      name: tree.name,
      files: [...tree.files, entry('TASK.md', taskMarkdown({ id: 'A050', name: 'stray' }))],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'TASK.md',
      message: 'TASK.md must live inside a task directory: <phase>/A001-<kebab-name>/TASK.md.',
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
    const result = verifyTree({
      name: tree.name,
      files: [...tree.files, entry('A/A001-implement-login/GATES.md', 'Validate manually.\n')],
    });
    Vitest.expect(
      result.issues.some((found) => found.field === 'A/A001-implement-login/GATES.md: body'),
    ).toBe(true);
  });

  Vitest.it('flags a MEMORY.md missing template sections', () => {
    const tree = validTree();
    const result = verifyTree({
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
    const result = verifyTree(
      snapshot([
        entry(
          'SPEC.md',
          specMarkdown({
            name: 'ship-spec',
            status: 'complete',
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
          version: '2',
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
      entry('A/PHASE.md', phaseMarkdown({ status: 'in-progress' })),
      entry('A/MEMORY.md', memory),
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
    const result = verifyTree(tree, {
      series: [
        { name: 'ship-spec', rounds: [{ round: '001', phase: 'A', passed: true }] },
        {
          name: 'ship-spec-effect-reviewer',
          rounds: [{ round: '001', phase: 'A', passed: true }],
        },
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
          version: '2',
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
      entry('A/PHASE.md', phaseMarkdown({ status: 'in-progress' })),
      entry('A/MEMORY.md', memory),
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
    const result = verifyTree(tree, {
      series: [{ name: 'ship-spec', rounds: [{ round: '001', phase: 'A' }] }],
      requireRounds: true,
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'review-series',
      message:
        "Phase 'A' has a review task but review series 'ship-spec-effect-reviewer' does not exist.",
    });
  });
});

const reviewTree = () =>
  snapshot([
    entry(
      'SPEC.md',
      specMarkdown({
        version: '2',
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
    entry('A/PHASE.md', phaseMarkdown({ status: 'in-progress' })),
    entry('A/MEMORY.md', memory),
    entry(
      'A/A001-implement-login/TASK.md',
      taskMarkdown({ id: 'A001', name: 'implement-login', size: 'tiny' }),
    ),
    entry('A/A001-implement-login/MEMORY.md', memory),
    entry(
      'A/A099-review-phase/TASK.md',
      taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: 'complete' }),
    ),
    entry('A/A099-review-phase/MEMORY.md', memory),
  ]);

Vitest.describe('Structure.verifySpecTree review overflow and closure', () => {
  Vitest.it('accepts an autonomous-authorized overflow past the budget', () => {
    const result = verifyTree(reviewTree(), {
      series: [
        {
          name: 'ship-spec',
          rounds: [
            { round: '001', phase: 'A', passed: true },
            {
              round: '002',
              phase: 'A',
              passed: true,
              overflow: {
                reason: 'the user asked for one more',
                authorized: 'autonomous',
                rawAuthorized: 'autonomous',
              },
            },
          ],
        },
      ],
      requireRounds: true,
    });
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.valid).toBe(true);
  });

  Vitest.it('still errors a round past the budget with no overflow declaration', () => {
    const result = verifyTree(reviewTree(), {
      series: [
        {
          name: 'ship-spec',
          rounds: [
            { round: '001', phase: 'A' },
            { round: '002', phase: 'A' },
          ],
        },
      ],
      requireRounds: true,
    });
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'review.budget-exceeded' }),
    );
  });

  Vitest.it('errors the second autonomous overflow as exhausted', () => {
    const result = verifyTree(reviewTree(), {
      series: [
        {
          name: 'ship-spec',
          rounds: [
            { round: '001', phase: 'A' },
            {
              round: '002',
              phase: 'A',
              overflow: { reason: 'first', authorized: 'autonomous', rawAuthorized: 'autonomous' },
            },
            {
              round: '003',
              phase: 'A',
              overflow: { reason: 'second', authorized: 'autonomous', rawAuthorized: 'autonomous' },
            },
          ],
        },
      ],
      requireRounds: true,
    });
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'review.overflow-exhausted' }),
    );
  });

  Vitest.it('accepts a minor-deferred closure and refuses a deferred Critical/Major', () => {
    const accepted = verifyTree(reviewTree(), {
      series: [
        {
          name: 'ship-spec',
          rounds: [
            {
              round: '001',
              phase: 'A',
              passed: true,
              deferral: {
                disposition: 'minor-deferred',
                deferred: ['F1'],
                missing: [],
                severities: ['Minor'],
                invalidIds: [],
                severityInvalid: false,
                valid: true,
              },
            },
          ],
        },
      ],
      requireRounds: true,
    });
    Vitest.expect(accepted.issues).toStrictEqual([]);

    const refused = verifyTree(reviewTree(), {
      series: [
        {
          name: 'ship-spec',
          rounds: [
            {
              round: '001',
              phase: 'A',
              passed: false,
              deferral: {
                disposition: 'minor-deferred',
                deferred: ['F1'],
                missing: [],
                severities: ['Major'],
                invalidIds: ['F1'],
                severityInvalid: true,
                valid: false,
              },
            },
          ],
        },
      ],
      requireRounds: true,
    });
    Vitest.expect(refused.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: 'review.deferred-severity' }),
    );
  });
});
