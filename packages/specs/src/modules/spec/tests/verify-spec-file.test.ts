import * as Vitest from '@effect/vitest';
import * as Spec from '../index.js';
import { specMarkdown } from './helpers.js';

Vitest.describe('Spec.verifySpecFile runtime', () => {
  Vitest.it('accepts a standard-shaped file', () => {
    const result = Spec.verifySpecFile('ship-spec', specMarkdown({ version: '2' }));
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues).toStrictEqual([]);
  });

  Vitest.it('fails without a frontmatter block', () => {
    const result = Spec.verifySpecFile('ship-spec', '# Just a body\n');
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'frontmatter', message: 'Missing frontmatter block.' },
    ]);
  });

  Vitest.it('flags a name that mismatches the directory', () => {
    const result = Spec.verifySpecFile('ship-spec', specMarkdown({ name: 'other', version: '2' }));
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'name', message: "Must match the spec directory name 'ship-spec'." },
    ]);
  });

  Vitest.it('flags a malformed created date and ignores a legacy lock list', () => {
    const legacy = ['locked', 'phases'].join('-');
    const markdown = specMarkdown({ created: 'yesterday', version: '2' }).replace(
      'created: yesterday',
      `created: yesterday\n${legacy}: A,1`,
    );
    const result = Spec.verifySpecFile('ship-spec', markdown);
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'created', message: 'Must be an ISO date (YYYY-MM-DD).' },
    ]);
  });

  Vitest.it('flags missing body sections and an empty task table', () => {
    const result = Spec.verifySpecFile(
      'ship-spec',
      [
        '---',
        'name: ship-spec',
        'status: in-progress',
        'spec-version: 2',
        '---',
        '',
        'No body.',
        '',
      ].join('\n'),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues.map((found) => found.field)).toStrictEqual([
      'workspace-type',
      'author',
      'created',
      'body',
      'body',
      'body',
      'tasks',
    ]);
  });

  Vitest.it('warns, without failing, when spec-version is absent or previous', () => {
    for (const version of [null, '1']) {
      const result = Spec.verifySpecFile('ship-spec', specMarkdown({ version }));
      Vitest.expect(result.valid).toBe(true);
      Vitest.expect(result.issues).toStrictEqual([
        Vitest.expect.objectContaining({
          code: Spec.SPEC_VERSION_CODES.outdated,
          severity: 'warning',
          field: 'spec-version',
        }),
      ]);
    }
  });

  Vitest.it('accepts the current standard version', () => {
    const result = Spec.verifySpecFile('ship-spec', specMarkdown({ version: '2' }));
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('errors above the current standard version', () => {
    const result = Spec.verifySpecFile('ship-spec', specMarkdown({ version: '3' }));
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toContainEqual(
      Vitest.expect.objectContaining({ code: Spec.SPEC_VERSION_CODES.future }),
    );
  });

  Vitest.it('errors on an invalid version and reads it as the previous standard', () => {
    for (const version of ['two', '0', '-1', '2.5']) {
      const result = Spec.verifySpecFile('ship-spec', specMarkdown({ version }));
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues).toContainEqual(
        Vitest.expect.objectContaining({ code: Spec.SPEC_VERSION_CODES.invalid }),
      );
    }
  });

  Vitest.it('flags an unknown task type and status in the table', () => {
    const result = Spec.verifySpecFile(
      'ship-spec',
      specMarkdown({
        version: '2',
        rows: [{ id: 'A001', name: 'x', type: 'chore', status: 'defect', gates: 'No' }],
      }),
    );
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'tasks', message: "Task 'A001' has unknown type 'chore'." },
      { field: 'tasks', message: "Task 'A001' has unknown status 'defect'." },
    ]);
  });
});
