import * as Vitest from '@effect/vitest';
import { Reference, Verifier } from '../../index.js';
import type { CloneObservation } from '../../git/index.js';

/** Render a canonical frontmatter block with the given scalar fields. */
const render = (
  fields: Record<string, string>,
  body = '\n# Notes\n',
  extraKeys: ReadonlyArray<string> = [],
): string =>
  [
    '---',
    ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`),
    ...extraKeys,
    '---',
    body,
  ].join('\n');

/** The smallest valid entry. */
const VALID_FIELDS = {
  name: 'alpha',
  url: 'https://github.com/example/alpha',
  purpose: 'Alpha source.',
  added: '2026-07-22',
};

/** Verify one entry with the canonical slug. */
const verify = (markdown: string): Verifier.VerifyResult =>
  Verifier.verifyReferenceFile('alpha', markdown, { root: '/tmp/workspace' });

/** Assert a result holds exactly one issue on `field`. */
const oneIssue = (result: Verifier.VerifyResult, field: string): void => {
  Vitest.expect(result.issues).toHaveLength(1);
  Vitest.expect(result.issues[0]?.field).toBe(field);
};

Vitest.describe('verifyReferenceFile', () => {
  Vitest.it('passes a valid entry', () => {
    const result = verify(render(VALID_FIELDS));
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues).toStrictEqual([]);
  });

  Vitest.it('reports a missing frontmatter block as one issue', () => {
    oneIssue(verify('# Notes\n'), 'frontmatter');
  });

  Vitest.it('reports each missing required field on its own field', () => {
    for (const key of ['name', 'url', 'purpose', 'added'] as const) {
      const fields = Object.fromEntries(
        Object.entries(VALID_FIELDS).filter(([field]) => field !== key),
      );
      const result = verify(render(fields));
      Vitest.expect(result.issues).toHaveLength(1);
      Vitest.expect(result.issues[0]?.field).toBe(key);
      Vitest.expect(result.issues[0]?.message).toBe(
        'Required frontmatter field is missing or empty.',
      );
    }
  });

  Vitest.it('reads an explicitly empty required value as missing', () => {
    for (const key of ['name', 'url', 'purpose', 'added'] as const) {
      const result = verify(render({ ...VALID_FIELDS, [key]: '' }));
      Vitest.expect(result.issues).toHaveLength(1);
      Vitest.expect(result.issues[0]).toMatchObject({
        field: key,
        message: 'Required frontmatter field is missing or empty.',
      });
    }
  });

  Vitest.it('reports a non-slug name and a name/directory mismatch', () => {
    oneIssue(
      Verifier.verifyReferenceFile('Alpha', render({ ...VALID_FIELDS, name: 'Alpha' })),
      'name',
    );

    const mismatch = verify(render({ ...VALID_FIELDS, name: 'beta' }));
    oneIssue(mismatch, 'name');
    Vitest.expect(mismatch.issues[0]?.message).toBe("Must match the directory name 'alpha'.");
  });

  Vitest.it('reports a name over 64 chars', () => {
    const long = 'a'.repeat(65);
    oneIssue(Verifier.verifyReferenceFile(long, render({ ...VALID_FIELDS, name: long })), 'name');
  });

  Vitest.it('reports url scheme and url shape separately', () => {
    oneIssue(verify(render({ ...VALID_FIELDS, url: 'http://github.com/example/alpha' })), 'url');
    Vitest.expect(verify(render({ ...VALID_FIELDS, url: 'http://x/y/z' })).issues[0]?.message).toBe(
      'Must be an https:// URL; ssh and scp-style sources are not stored.',
    );

    const malformedUrl = verify(render({ ...VALID_FIELDS, url: 'https://github.com/example' }));
    oneIssue(malformedUrl, 'url');
    Vitest.expect(malformedUrl.issues[0]?.message).toContain('no credentials, query, or fragment');
  });

  Vitest.it('reports purpose length, scalar, and terminal rules', () => {
    const long = `${'a'.repeat(281)}.`;
    oneIssue(verify(render({ ...VALID_FIELDS, purpose: long })), 'purpose');
    oneIssue(verify(render({ ...VALID_FIELDS, purpose: 'Alpha: source.' })), 'purpose');
    oneIssue(verify(render({ ...VALID_FIELDS, purpose: 'Alpha source' })), 'purpose');
  });

  Vitest.it('reports added dates that are not YYYY-MM-DD', () => {
    oneIssue(verify(render({ ...VALID_FIELDS, added: '2026-7-1' })), 'added');
    oneIssue(verify(render({ ...VALID_FIELDS, added: '22-07-2026' })), 'added');
  });

  Vitest.it('accepts every valid ref shape and reports invalid ones', () => {
    for (const ref of [
      'main',
      'feat/scopes',
      'v2.0.18',
      'cd9a14a',
      'cd9a14a6b688d4021bee381dfd39d2cef9c0f862',
    ]) {
      const result = verify(render({ ...VALID_FIELDS, ref }));
      Vitest.expect(result.valid, ref).toBe(true);
    }
    for (const ref of ['/main', 'feat//x', 'abc', 'main/', 'refs/heads/x.lock']) {
      const result = verify(render({ ...VALID_FIELDS, ref }));
      oneIssue(result, 'ref');
    }
  });

  Vitest.it('warns on an empty ref line instead of failing', () => {
    const result = verify(render(VALID_FIELDS, '\n# Notes\n', ['ref:']));
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues).toHaveLength(1);
    Vitest.expect(result.issues[0]).toMatchObject({ field: 'ref', severity: 'warning' });
  });

  Vitest.it('rejects a forbidden path key and warns on an unknown key', () => {
    const forbidden = verify(
      render(VALID_FIELDS, '\n# Notes\n', ['path: .agents/references/alpha']),
    );
    oneIssue(forbidden, 'path');
    Vitest.expect(forbidden.issues[0]?.message).toContain('.agents/references/alpha');

    const unknown = verify(render(VALID_FIELDS, '\n# Notes\n', ['status: active']));
    Vitest.expect(unknown.valid).toBe(true);
    Vitest.expect(unknown.issues).toHaveLength(1);
    Vitest.expect(unknown.issues[0]).toMatchObject({ field: 'status', severity: 'warning' });
  });

  Vitest.it('reports every body violation', () => {
    oneIssue(verify(render(VALID_FIELDS, '\nNo heading\n')), 'body');
    oneIssue(verify(render(VALID_FIELDS, '\n# Notes\n\n# Setup\n')), 'body');
    oneIssue(
      verify(render(VALID_FIELDS, '\n# Notes\n\nCloned into .agents/references/alpha.\n')),
      'body',
    );
  });
});

Vitest.describe('verifyStore', () => {
  Vitest.it('verifies an existing store without any clone present', () => {
    const result = Verifier.verifyStore({
      present: true,
      entries: [{ slug: 'alpha', raw: render(VALID_FIELDS), extraFiles: [] }],
    });
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.entries).toHaveLength(1);
    Vitest.expect(result.entries[0]?.entry).toBe('.agents/@montflow/references/alpha/REFERENCE.md');
    Vitest.expect(result.entries[0]?.issues).toStrictEqual([]);
  });

  Vitest.it('names the entry and the field for every invalid field', () => {
    const cases: ReadonlyArray<{
      readonly raw: string;
      readonly field: string;
    }> = [
      { raw: render({ ...VALID_FIELDS, name: 'beta' }), field: 'name' },
      { raw: render({ ...VALID_FIELDS, url: 'http://github.com/example/alpha' }), field: 'url' },
      { raw: render({ ...VALID_FIELDS, purpose: 'Alpha source' }), field: 'purpose' },
      { raw: render({ ...VALID_FIELDS, added: '2026-7-1' }), field: 'added' },
      { raw: render({ ...VALID_FIELDS, ref: '/main' }), field: 'ref' },
      { raw: render(VALID_FIELDS, '\nNo heading\n'), field: 'body' },
    ];
    for (const testCase of cases) {
      const result = Verifier.verifyStore({
        present: true,
        entries: [{ slug: 'alpha', raw: testCase.raw }],
      });
      Vitest.expect(result.valid, testCase.field).toBe(false);
      Vitest.expect(result.entries[0]?.entry).toBe(
        '.agents/@montflow/references/alpha/REFERENCE.md',
      );
      Vitest.expect(result.entries[0]?.issues).toHaveLength(1);
      Vitest.expect(result.entries[0]?.issues[0]?.field).toBe(testCase.field);
    }
  });

  Vitest.it('reports an absent store root as exactly one store issue', () => {
    const result = Verifier.verifyStore({ present: false, entries: [] });
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.entries).toHaveLength(1);
    Vitest.expect(result.entries[0]?.entry).toBe(Reference.STORE_DIR);
    Vitest.expect(result.entries[0]?.issues).toHaveLength(1);
    Vitest.expect(result.entries[0]?.issues[0]?.field).toBe('store');
    Vitest.expect(result.entries[0]?.issues[0]?.message).toContain('doctor');
  });

  Vitest.it('passes an existing but empty store with zero entries', () => {
    const result = Verifier.verifyStore({ present: true, entries: [] });
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.entries).toStrictEqual([]);
  });

  Vitest.it('reports an invalid directory slug and a missing entry file', () => {
    const badSlug = Verifier.verifyStore({
      present: true,
      entries: [{ slug: 'Alpha', raw: render({ ...VALID_FIELDS, name: 'Alpha' }) }],
    });
    Vitest.expect(badSlug.entries[0]?.issues.some((found) => found.field === 'entry')).toBe(true);

    const missing = Verifier.verifyStore({
      present: true,
      entries: [{ slug: 'vendor', raw: undefined }],
    });
    Vitest.expect(missing.entries[0]?.issues).toHaveLength(1);
    Vitest.expect(missing.entries[0]?.issues[0]).toMatchObject({
      field: 'entry',
      message: "Directory 'vendor' has no REFERENCE.md.",
    });
  });

  Vitest.it('warns on an unexpected file in an entry directory', () => {
    const result = Verifier.verifyStore({
      present: true,
      entries: [
        {
          slug: 'alpha',
          raw: render(VALID_FIELDS),
          extraFiles: ['NOTES.md'],
        },
      ],
    });
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.entries[0]?.issues).toHaveLength(1);
    Vitest.expect(result.entries[0]?.issues[0]).toMatchObject({
      field: 'entry',
      severity: 'warning',
      message: "Unexpected file 'NOTES.md' in the entry directory.",
    });
  });

  Vitest.it('rejects a duplicate slug naming the first owner', () => {
    const result = Verifier.verifyStore({
      present: true,
      entries: [
        { slug: 'alpha', raw: render(VALID_FIELDS) },
        { slug: 'beta', raw: render(VALID_FIELDS) },
      ],
    });
    const beta = result.entries.find((entry) => entry.entry.includes('/beta/'));
    Vitest.expect(beta?.issues.some((found) => found.field === 'name')).toBe(true);
    Vitest.expect(
      beta?.issues.some((found) =>
        found.message.includes("Duplicate slug; also declared by 'alpha'."),
      ),
    ).toBe(true);
    Vitest.expect(result.valid).toBe(false);
  });

  Vitest.it('rejects a duplicate URL after normalization', () => {
    const result = Verifier.verifyStore({
      present: true,
      entries: [
        {
          slug: 'effect',
          raw: render({
            ...VALID_FIELDS,
            name: 'effect',
            url: 'https://github.com/Effect-TS/effect-smol',
          }),
        },
        {
          slug: 'effect-smol',
          raw: render({
            ...VALID_FIELDS,
            name: 'effect-smol',
            url: 'https://github.com/effect-ts/effect-smol.git',
          }),
        },
      ],
    });
    Vitest.expect(result.valid).toBe(false);
    const second = result.entries.find((entry) => entry.entry.includes('/effect-smol/'));
    Vitest.expect(second?.issues).toHaveLength(1);
    Vitest.expect(second?.issues[0]).toMatchObject({
      field: 'url',
      message: "Duplicate URL after normalization; already registered as 'effect'.",
    });
  });
});

/** Fabricate one clone observation for the pure clone-scope mapping. */
const observation = (overrides: Partial<CloneObservation>): CloneObservation => ({
  path: '/tmp/workspace/.agents/references/alpha',
  state: 'present',
  present: true,
  isDirectory: true,
  gitWorkTree: true,
  dirtyPaths: 0,
  head: '1111111111111111111111111111111111111111',
  currentRef: 'main',
  defaultBranch: 'main',
  matchesOrigin: true,
  matchesRef: true,
  ...overrides,
});

Vitest.describe('verifyClone', () => {
  const reference = Reference.Reference.make(VALID_FIELDS);

  Vitest.it('maps every clone-scope issue class', () => {
    Vitest.expect(
      Verifier.verifyClone(observation({ present: false, state: 'missing' }), reference).issues[0]
        ?.field,
    ).toBe('path');

    const notDirectory = Verifier.verifyClone(
      observation({ isDirectory: false, gitWorkTree: false }),
      reference,
    );
    Vitest.expect(notDirectory.issues[0]).toMatchObject({ field: 'path' });
    Vitest.expect(notDirectory.issues[0]?.message).toContain('not a directory');

    const notGit = Verifier.verifyClone(observation({ gitWorkTree: false }), reference);
    Vitest.expect(notGit.issues[0]).toMatchObject({ field: 'git' });

    const dirty = Verifier.verifyClone(observation({ state: 'dirty', dirtyPaths: 2 }), reference);
    Vitest.expect(dirty.issues[0]).toMatchObject({
      field: 'dirty',
      message: 'Clone has 2 changed paths.',
    });

    const unreadable = Verifier.verifyClone(
      observation({ state: 'dirty', dirtyError: 'fatal: index file smaller than expected' }),
      reference,
    );
    Vitest.expect(unreadable.issues[0]).toMatchObject({ field: 'dirty' });
    Vitest.expect(unreadable.issues[0]?.message).toContain('could not be read');

    const foreign = Verifier.verifyClone(
      observation({
        matchesOrigin: false,
        origin: 'https://example.test/other/alpha.git',
      }),
      reference,
    );
    Vitest.expect(foreign.issues[0]).toMatchObject({ field: 'origin' });

    const unpinned = Reference.Reference.make(VALID_FIELDS);
    const wrongBranch = Verifier.verifyClone(observation({ currentRef: 'other' }), unpinned);
    Vitest.expect(wrongBranch.issues[0]).toMatchObject({ field: 'head' });
    Vitest.expect(wrongBranch.issues[0]?.message).toContain(
      "Clone is on branch 'other', expected 'main'.",
    );

    const detached = Verifier.verifyClone(observation({ currentRef: 'HEAD' }), unpinned);
    Vitest.expect(detached.issues[0]?.message).toContain(
      "Clone HEAD is detached; expected branch 'main'.",
    );

    const noUpstream = Verifier.verifyClone(observation({ defaultBranch: undefined }), unpinned);
    Vitest.expect(noUpstream.issues[0]).toMatchObject({ field: 'head' });
    Vitest.expect(noUpstream.issues[0]?.message).toContain('no origin default branch');

    const pinned = Reference.Reference.make({
      ...VALID_FIELDS,
      ref: 'cd9a14a6b688d4021bee381dfd39d2cef9c0f862',
    });
    const mismatch = Verifier.verifyClone(
      observation({
        state: 'ref-mismatch',
        matchesRef: false,
        refResolved: true,
        resolvedRefHead: '2222222222222222222222222222222222222222',
      }),
      pinned,
    );
    Vitest.expect(mismatch.issues[0]).toMatchObject({ field: 'head' });
    Vitest.expect(mismatch.issues[0]?.message).toContain("does not match ref 'cd9a14a");

    const unresolvable = Verifier.verifyClone(
      observation({
        state: 'ref-mismatch',
        matchesRef: false,
        refResolved: false,
      }),
      Reference.Reference.make({ ...VALID_FIELDS, ref: 'missing-tag' }),
    );
    Vitest.expect(unresolvable.issues[0]).toMatchObject({ field: 'ref' });
  });
});
