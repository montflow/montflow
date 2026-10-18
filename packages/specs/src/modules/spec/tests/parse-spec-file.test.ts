import * as Vitest from '@effect/vitest';
import * as Spec from '../index.js';
import { specMarkdown } from './helpers.js';

Vitest.describe('Spec.parseSpecFile runtime', () => {
  Vitest.it('parses valid frontmatter into a Spec', () => {
    const spec = Spec.parseSpecFile(specMarkdown());
    Vitest.expect(spec?.name).toBe('ship-spec');
    Vitest.expect(spec?.status).toBe('in-progress');
    Vitest.expect(spec?.workspaceType).toBe('in-place');
    Vitest.expect(spec?.author).toBe('Tester');
    Vitest.expect(spec?.created).toBe('2026-01-01');
    Vitest.expect(spec?.lockedPhases).toStrictEqual([]);
  });

  Vitest.it('splits comma-separated locked phases', () => {
    const spec = Spec.parseSpecFile(specMarkdown({ lockedPhases: 'A,B' }));
    Vitest.expect(spec?.lockedPhases).toStrictEqual(['A', 'B']);
  });

  Vitest.it('returns undefined without a frontmatter block', () => {
    Vitest.expect(Spec.parseSpecFile('# No frontmatter\n')).toBeUndefined();
  });

  Vitest.it('returns undefined on an unknown status', () => {
    Vitest.expect(Spec.parseSpecFile(specMarkdown({ status: 'weird' }))).toBeUndefined();
  });

  Vitest.it('returns undefined on a non-slug name', () => {
    Vitest.expect(Spec.parseSpecFile(specMarkdown({ name: 'Ship Spec' }))).toBeUndefined();
  });
});
