import * as Vitest from '@effect/vitest';
import * as Feature from '../index.js';
import { featureMarkdown } from './helpers.js';

Vitest.describe('Feature.verifyFeatureFile runtime', () => {
  Vitest.it('accepts a standard-shaped file', () => {
    const result = Feature.verifyFeatureFile('ship-feature', featureMarkdown());
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues).toStrictEqual([]);
  });

  Vitest.it('fails without a frontmatter block', () => {
    const result = Feature.verifyFeatureFile('ship-feature', '# Just a body\n');
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'frontmatter', message: 'Missing frontmatter block.' },
    ]);
  });

  Vitest.it('flags a name that mismatches the directory', () => {
    const result = Feature.verifyFeatureFile('ship-feature', featureMarkdown({ name: 'other' }));
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'name', message: "Must match the feature directory name 'ship-feature'." },
    ]);
  });

  Vitest.it('flags a malformed created date and locked phase', () => {
    const result = Feature.verifyFeatureFile(
      'ship-feature',
      featureMarkdown({ created: 'yesterday', lockedPhases: 'A,1' }),
    );
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'created', message: 'Must be an ISO date (YYYY-MM-DD).' },
      { field: 'locked-phases', message: "'1' is not a phase id." },
    ]);
  });

  Vitest.it('flags missing body sections and an empty task table', () => {
    const result = Feature.verifyFeatureFile(
      'ship-feature',
      ['---', 'name: ship-feature', 'status: in-progress', '---', '', 'No body.', ''].join('\n'),
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

  Vitest.it('flags an unknown task type and status in the table', () => {
    const result = Feature.verifyFeatureFile(
      'ship-feature',
      featureMarkdown({
        rows: [{ id: 'A001', name: 'x', type: 'chore', status: 'defect', gates: 'No' }],
      }),
    );
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'tasks', message: "Task 'A001' has unknown type 'chore'." },
      { field: 'tasks', message: "Task 'A001' has unknown status 'defect'." },
    ]);
  });
});
