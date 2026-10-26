import * as Vitest from '@effect/vitest';
import * as Which from '../index.js';

/** Branch source for a named branch. */
const branch = (name: string): Which.BranchSource => ({ kind: 'branch', branch: name });

/** Names deliberately including a bare `spec`-less set plus one exact. */
const names = ['montflow-spec-standard', 'ship-login', 'spec-optimizations'];

/** The miss of a failed resolution, failing the test when it matched. */
const missOf = (resolution: Which.WhichResolution): Which.WhichMiss => {
  if (resolution.ok) throw new Error(`expected a miss, matched '${resolution.match.name}'`);
  return resolution.miss;
};

Vitest.describe('Which.parseBranch runtime', () => {
  Vitest.it('accepts every conventional prefix and normalizes the feature name', () => {
    for (const prefix of Which.PREFIXES) {
      Vitest.expect(Which.parseBranch(`${prefix}/Ship_Login/v2`)).toStrictEqual({
        ok: true,
        feature: 'ship-login-v2',
      });
    }
  });

  Vitest.it('collapses repeated separators without trimming them', () => {
    Vitest.expect(Which.parseBranch('feat/ship__login')).toStrictEqual({
      ok: true,
      feature: 'ship--login',
    });
  });

  Vitest.it('rejects a branch without a conventional prefix', () => {
    const parsed = Which.parseBranch('wip/ship-login');
    Vitest.expect(parsed.ok).toBe(false);
    Vitest.expect(parsed.ok ? '' : parsed.problem).toContain('conventional prefix');
    Vitest.expect(parsed.ok ? '' : parsed.expected).toContain('feat');
  });

  Vitest.it('rejects an uppercase prefix', () => {
    Vitest.expect(Which.parseBranch('Feat/ship-login').ok).toBe(false);
  });

  Vitest.it('rejects a prefix with no feature name', () => {
    Vitest.expect(Which.parseBranch('feat/').ok).toBe(false);
  });
});

Vitest.describe('Which.parseHead runtime', () => {
  Vitest.it('reads a branch ref', () => {
    Vitest.expect(Which.parseHead('ref: refs/heads/feat/ship-login\n')).toStrictEqual({
      kind: 'branch',
      branch: 'feat/ship-login',
    });
  });

  Vitest.it('treats a bare commit as a detached HEAD', () => {
    const read = Which.parseHead('0123456789abcdef0123456789abcdef01234567\n');
    Vitest.expect(read.kind).toBe('none');
    Vitest.expect(read.kind === 'none' ? read.reason : '').toBe('detached');
    Vitest.expect(read.kind === 'none' ? read.detail : '').toContain('detached');
  });

  Vitest.it('treats a tag ref as no branch', () => {
    const read = Which.parseHead('ref: refs/tags/v1.0.0\n');
    Vitest.expect(read.kind === 'none' ? read.reason : '').toBe('detached');
  });

  Vitest.it('reports an empty HEAD as unreadable', () => {
    const read = Which.parseHead('  \n');
    Vitest.expect(read.kind === 'none' ? read.reason : '').toBe('unreadable-head');
  });
});

Vitest.describe('Which.parseGitFile runtime', () => {
  Vitest.it('keeps an absolute gitdir', () => {
    Vitest.expect(
      Which.parseGitFile('gitdir: /home/dev/.bare/worktrees/ship-login\n', '/repo'),
    ).toBe('/home/dev/.bare/worktrees/ship-login');
  });

  Vitest.it('resolves a relative gitdir against the workspace', () => {
    Vitest.expect(Which.parseGitFile('gitdir: ../.bare/worktrees/ship-login\n', '/repo/wt/')).toBe(
      '/repo/wt/../.bare/worktrees/ship-login',
    );
  });

  Vitest.it('reports a file with no gitdir line', () => {
    Vitest.expect(Which.parseGitFile('not a gitdir\n', '/repo')).toBeUndefined();
    Vitest.expect(Which.parseGitFile('gitdir:\n', '/repo')).toBeUndefined();
  });
});

Vitest.describe('Which.matchFeature runtime', () => {
  Vitest.it('prefers an exact name over a longer prefix match', () => {
    Vitest.expect(Which.matchFeature('spec', ['spec', 'spec-optimizations'])).toStrictEqual({
      ok: true,
      name: 'spec',
    });
  });

  Vitest.it('accepts a unique prefix in either direction', () => {
    Vitest.expect(Which.matchFeature('spec', ['spec-optimizations'])).toStrictEqual({
      ok: true,
      name: 'spec-optimizations',
    });
    Vitest.expect(
      Which.matchFeature('spec-optimizations-v2', ['spec-optimizations']),
    ).toStrictEqual({ ok: true, name: 'spec-optimizations' });
  });

  Vitest.it('lists both candidates for an ambiguous prefix', () => {
    Vitest.expect(Which.matchFeature('spec', ['spec-two', 'spec-one', 'other'])).toStrictEqual({
      ok: false,
      code: Which.CODES.ambiguous,
      candidates: ['spec-one', 'spec-two'],
    });
  });

  Vitest.it('lists every candidate when nothing matches', () => {
    Vitest.expect(Which.matchFeature('nope', ['b', 'a'])).toStrictEqual({
      ok: false,
      code: Which.CODES.noMatch,
      candidates: ['a', 'b'],
    });
  });

  Vitest.it('never matches on shared words or edit distance', () => {
    Vitest.expect(Which.matchFeature('spec', ['montflow-spec-standard'])).toStrictEqual({
      ok: false,
      code: Which.CODES.noMatch,
      candidates: ['montflow-spec-standard'],
    });
  });
});

Vitest.describe('Which.resolve runtime', () => {
  Vitest.it('resolves an exact normalized match', () => {
    Vitest.expect(
      Which.resolve({ source: branch('feat/spec-optimizations'), names }),
    ).toStrictEqual({
      ok: true,
      match: {
        name: 'spec-optimizations',
        branch: 'feat/spec-optimizations',
        feature: 'spec-optimizations',
      },
    });
  });

  Vitest.it('normalizes case, `/`, and `_` before matching', () => {
    Vitest.expect(
      Which.resolve({ source: branch('feat/Spec_Optimizations'), names }),
    ).toStrictEqual({
      ok: true,
      match: {
        name: 'spec-optimizations',
        branch: 'feat/Spec_Optimizations',
        feature: 'spec-optimizations',
      },
    });
  });

  Vitest.it('resolves a unique prefix match', () => {
    const resolution = Which.resolve({ source: branch('feat/spec'), names });
    Vitest.expect(resolution.ok ? resolution.match.name : '').toBe('spec-optimizations');
  });

  Vitest.it('fails an ambiguous prefix with both --name values', () => {
    const miss = missOf(
      Which.resolve({
        source: branch('feat/spec'),
        names: ['spec-one', 'spec-two', 'ship-login'],
      }),
    );
    Vitest.expect(miss.code).toBe(Which.CODES.ambiguous);
    Vitest.expect(miss.candidates).toStrictEqual(['spec-one', 'spec-two']);
    Vitest.expect(miss.problem).toContain('matches 2 specs');
    Vitest.expect(miss.actual).toContain('spec-one, spec-two');
  });

  Vitest.it('fails with every candidate when no spec matches', () => {
    const miss = missOf(Which.resolve({ source: branch('feat/nope'), names }));
    Vitest.expect(miss.code).toBe(Which.CODES.noMatch);
    Vitest.expect(miss.candidates).toStrictEqual(names);
    Vitest.expect(miss.problem).toContain("No spec matches feature 'nope'");
    Vitest.expect(miss.expected).toContain('exactly one spec name');
  });

  Vitest.it('fails a branch without a conventional prefix', () => {
    const miss = missOf(Which.resolve({ source: branch('wip/ship-login'), names }));
    Vitest.expect(miss.code).toBe(Which.CODES.noMatch);
    Vitest.expect(miss.problem).toContain('conventional prefix');
    Vitest.expect(miss.branch).toBe('wip/ship-login');
  });

  Vitest.it('fails a detached HEAD as a no-match naming the reason', () => {
    const miss = missOf(
      Which.resolve({
        source: {
          kind: 'none',
          reason: 'detached',
          detail: 'HEAD is detached; no branch is checked out.',
        },
        names,
      }),
    );
    Vitest.expect(miss.code).toBe(Which.CODES.noMatch);
    Vitest.expect(miss.branch).toBe(Which.NO_BRANCH);
    Vitest.expect(miss.actual).toContain('detached');
    Vitest.expect(miss.problem).toContain('detached');
  });

  Vitest.it('fails a missing .git as a no-match naming the reason', () => {
    const miss = missOf(
      Which.resolve({ source: { kind: 'none', reason: 'missing-git', detail: 'No .git.' }, names }),
    );
    Vitest.expect(miss.actual).toContain('missing .git');
    Vitest.expect(miss.candidates).toStrictEqual(names);
  });

  Vitest.it('fails an unreadable HEAD as a no-match naming the reason', () => {
    const miss = missOf(
      Which.resolve({
        source: { kind: 'none', reason: 'unreadable-head', detail: 'Cannot read HEAD.' },
        names,
      }),
    );
    Vitest.expect(miss.actual).toContain('unreadable HEAD');
  });

  Vitest.it('reports an empty candidate list instead of omitting it', () => {
    const miss = missOf(Which.resolve({ source: branch('feat/ship-login'), names: [] }));
    Vitest.expect(miss.candidates).toStrictEqual([]);
    Vitest.expect(miss.actual).toContain('candidates none');
  });
});
