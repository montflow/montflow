import * as Vitest from '@effect/vitest';
import * as SpecSource from '../index.js';

const entry = (name: string, state: SpecSource.SpecState): SpecSource.SpecEntry => ({
  name,
  state,
});

Vitest.describe('SpecSource.parseState', () => {
  Vitest.it('reads a complete status from frontmatter', () => {
    Vitest.expect(SpecSource.parseState('---\nname: one\nstatus: complete\n---\n')).toBe(
      'complete',
    );
  });

  Vitest.it('reads an in-progress status as pending', () => {
    Vitest.expect(SpecSource.parseState('---\nstatus: in-progress\n---\n')).toBe('pending');
  });

  Vitest.it('treats a missing frontmatter block as pending', () => {
    Vitest.expect(SpecSource.parseState('# no frontmatter')).toBe('pending');
  });

  Vitest.it('treats a missing status as pending', () => {
    Vitest.expect(SpecSource.parseState('---\nname: one\n---\n')).toBe('pending');
  });

  Vitest.it('ignores status text outside the frontmatter block', () => {
    Vitest.expect(SpecSource.parseState('---\nname: one\n---\nstatus: complete\n')).toBe('pending');
  });
});

Vitest.describe('SpecSource.order', () => {
  Vitest.it('puts the current branch guess first', () => {
    const ordered = SpecSource.order(
      [entry('alpha', 'pending'), entry('beta', 'pending'), entry('gamma', 'pending')],
      'gamma',
    );
    Vitest.expect(ordered.map((item) => item.name)).toEqual(['gamma', 'alpha', 'beta']);
  });

  Vitest.it('puts pending specs before complete ones', () => {
    const ordered = SpecSource.order([
      entry('a-complete', 'complete'),
      entry('b-pending', 'pending'),
      entry('c-complete', 'complete'),
      entry('d-pending', 'pending'),
    ]);
    Vitest.expect(ordered.map((item) => item.name)).toEqual([
      'b-pending',
      'd-pending',
      'a-complete',
      'c-complete',
    ]);
  });

  Vitest.it('keeps a complete current spec first', () => {
    const ordered = SpecSource.order(
      [entry('alpha', 'pending'), entry('done', 'complete')],
      'done',
    );
    Vitest.expect(ordered.map((item) => item.name)).toEqual(['done', 'alpha']);
  });

  Vitest.it('does not mutate the input', () => {
    const entries = [entry('beta', 'pending'), entry('alpha', 'pending')];
    SpecSource.order(entries);
    Vitest.expect(entries.map((item) => item.name)).toEqual(['beta', 'alpha']);
  });
});

Vitest.describe('SpecSource.guess', () => {
  const names = ['montflow-spec-standard', 'plugin-host-integration', 'spec-standard'];

  Vitest.it('matches a branch remainder to its exact spec', () => {
    Vitest.expect(
      SpecSource.guess(['plugin-host-integration'], 'feat/plugin-host-integration'),
    ).toBe('plugin-host-integration');
  });

  Vitest.it('prefers an exact match over a suffixed one', () => {
    Vitest.expect(SpecSource.guess(names, 'feat/spec-standard')).toBe('spec-standard');
  });

  Vitest.it('matches a spec that ends with the branch remainder', () => {
    Vitest.expect(SpecSource.guess(['montflow-spec-standard'], 'feat/spec-standard')).toBe(
      'montflow-spec-standard',
    );
  });

  Vitest.it('refuses an ambiguous match', () => {
    Vitest.expect(
      SpecSource.guess(['montflow-spec-standard', 'legacy-spec-standard'], 'feat/spec-standard'),
    ).toBeUndefined();
  });

  Vitest.it('ignores a branch without a conventional prefix', () => {
    Vitest.expect(SpecSource.guess(names, 'spec-standard')).toBeUndefined();
  });
});

Vitest.describe('SpecSource.describe', () => {
  Vitest.it('marks the branch guess', () => {
    Vitest.expect(SpecSource.describe(entry('alpha', 'pending'), 'alpha')).toBe(
      'current branch · pending',
    );
  });

  Vitest.it('explains why a complete spec is dimmed', () => {
    Vitest.expect(SpecSource.describe(entry('alpha', 'complete'))).toBe(
      'complete — nothing left to run',
    );
  });
});
