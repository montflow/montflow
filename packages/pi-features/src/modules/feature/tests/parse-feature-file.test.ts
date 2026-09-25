import * as Vitest from '@effect/vitest';
import * as Feature from '../index.js';
import { featureMarkdown } from './helpers.js';

Vitest.describe('Feature.parseFeatureFile runtime', () => {
  Vitest.it('parses valid frontmatter into a Feature', () => {
    const feature = Feature.parseFeatureFile(featureMarkdown());
    Vitest.expect(feature?.name).toBe('ship-feature');
    Vitest.expect(feature?.status).toBe('in-progress');
    Vitest.expect(feature?.workspaceType).toBe('in-place');
    Vitest.expect(feature?.author).toBe('Tester');
    Vitest.expect(feature?.created).toBe('2026-01-01');
    Vitest.expect(feature?.lockedPhases).toStrictEqual([]);
  });

  Vitest.it('splits comma-separated locked phases', () => {
    const feature = Feature.parseFeatureFile(featureMarkdown({ lockedPhases: 'A,B' }));
    Vitest.expect(feature?.lockedPhases).toStrictEqual(['A', 'B']);
  });

  Vitest.it('returns undefined without a frontmatter block', () => {
    Vitest.expect(Feature.parseFeatureFile('# No frontmatter\n')).toBeUndefined();
  });

  Vitest.it('returns undefined on an unknown status', () => {
    Vitest.expect(Feature.parseFeatureFile(featureMarkdown({ status: 'weird' }))).toBeUndefined();
  });

  Vitest.it('returns undefined on a non-slug name', () => {
    Vitest.expect(
      Feature.parseFeatureFile(featureMarkdown({ name: 'Ship Feature' })),
    ).toBeUndefined();
  });
});
