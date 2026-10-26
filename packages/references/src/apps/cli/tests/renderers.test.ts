import * as Vitest from '@effect/vitest';
import type * as Git from '../../../modules/git/index.js';
import type * as Engines from '../engines.apps.module.js';
import * as Renderers from '../renderers.apps.module.js';

const row = (slug: string, installed: boolean): Engines.ReferenceRow => ({
  slug,
  purpose: `Purpose for ${slug}.`,
  url: `https://example.test/owner/${slug}.git`,
  installed,
  entryPath: `.agents/@montflow/references/${slug}/REFERENCE.md`,
  path: `.agents/references/${slug}`,
});

const statusRow = (
  fields: Partial<Git.StatusRow> & Pick<Git.StatusRow, 'slug' | 'state' | 'message'>,
): Git.StatusRow => ({
  slug: fields.slug,
  state: fields.state,
  message: fields.message,
  refused: fields.refused ?? false,
  path: fields.path ?? `.agents/references/${fields.slug}`,
  origin: fields.origin,
  head: fields.head,
  upstream: fields.upstream,
  behind: fields.behind,
  ahead: fields.ahead,
  failure: fields.failure,
});

const statusReport = (rows: ReadonlyArray<Git.StatusRow>): Git.StatusReport => ({
  rows,
  summary: 'summary total=2 missing=0 present=2 dirty=0 ref-mismatch=0 foreign=0',
  refused: rows.some((entry) => entry.refused),
});

const update = (kind: 'present' | 'updated' | 'created' | 'refused'): Git.UpdateResult => {
  if (kind === 'refused') {
    return { kind: 'refused', code: 'dirty', message: 'refused: alpha is dirty (1 changed paths)' };
  }
  if (kind === 'created') {
    return {
      kind: 'created',
      slug: 'alpha',
      url: 'https://example.test/owner/alpha.git',
      message: 'created alpha https://example.test/owner/alpha.git',
    };
  }
  if (kind === 'updated') {
    return {
      kind: 'updated',
      slug: 'alpha',
      head: '1234567abcdef',
      message: 'updated alpha head=1234567',
    };
  }
  return { kind: 'present', slug: 'alpha', message: 'present alpha' };
};

const AGENT_GLYPHS = ['✓', '✗', '⚠', '•'];

const assertAgentClean = (text: string): void => {
  for (const glyph of AGENT_GLYPHS) Vitest.expect(text).not.toContain(glyph);
};

Vitest.describe('renderers agent default', () => {
  Vitest.it('renders every verb with stable tokens and no glyphs', () => {
    const doctor = Renderers.doctor({
      status: 'repaired',
      healthy: true,
      checks: [
        {
          name: 'store-root',
          status: 'repaired',
          detail: 'created .agents/@montflow/references',
        },
        { name: 'registry', status: 'ok', detail: 'issues=0' },
      ],
    });
    Vitest.expect(doctor).toContain('repaired store-root: created .agents/@montflow/references');
    Vitest.expect(doctor).toContain('summary checks=2 failed=0 repaired=1');
    Vitest.expect(doctor).not.toContain('ok registry');
    assertAgentClean(doctor);

    const list = Renderers.list([row('alpha', true), row('beta', false)]);

    Vitest.expect(list).toContain('installed alpha  Purpose for alpha.');
    Vitest.expect(list).toContain('missing beta  Purpose for beta.');
    Vitest.expect(list).toContain('summary total=2 installed=1 missing=1');
    assertAgentClean(list);

    const verify = Renderers.verify({
      entries: [
        {
          path: '.agents/@montflow/references/bad/REFERENCE.md',
          valid: false,
          issues: [{ field: 'url', message: 'Must be an https:// URL.', fix: 'Use https.' }],
        },
      ],
      issueCount: 1,
      warningCount: 0,
      storeMissing: false,
      skills: [],
    });
    Vitest.expect(verify).toContain(
      'error .agents/@montflow/references/bad/REFERENCE.md has 1 issue. Fix each one and run verify again.',
    );
    Vitest.expect(verify).toContain('1. [url] Must be an https:// URL.');
    Vitest.expect(verify).toContain('Fix: Use https.');
    Vitest.expect(verify).toContain('summary entries=1 issues=1 warnings=0');
    assertAgentClean(verify);

    const clean = Renderers.verify({
      entries: [],
      issueCount: 0,
      warningCount: 0,
      storeMissing: false,
      skills: [],
    });
    Vitest.expect(clean).toBe('summary entries=0 issues=0 warnings=0');

    const added = Renderers.added({
      kind: 'created',
      slug: 'alpha',
      url: 'https://example.test/owner/alpha.git',
      message: 'created alpha https://example.test/owner/alpha.git',
    });
    Vitest.expect(added).toBe('created alpha https://example.test/owner/alpha.git');
    assertAgentClean(added);

    const routed = Renderers.added({
      kind: 'routed',
      slug: 'alpha',
      url: 'https://example.test/owner/alpha.git',
      notice:
        'routed add -> update alpha: https://example.test/owner/alpha.git is already registered as alpha',
      update: update('present'),
      message: 'routed',
    });
    Vitest.expect(routed.split('\n')).toEqual([
      'routed add -> update alpha: https://example.test/owner/alpha.git is already registered as alpha',
      'present alpha',
    ]);
    assertAgentClean(routed);

    Vitest.expect(Renderers.updated(update('updated'))).toBe('updated alpha head=1234567');
    Vitest.expect(Renderers.updated(update('present'))).toBe('present alpha');
    Vitest.expect(Renderers.updated(update('refused'))).toContain('refused: alpha is dirty');

    const updatedAll = Renderers.updatedAll({
      entries: [
        { slug: 'alpha', result: update('updated') },
        { slug: 'beta', result: update('refused') },
      ],
      summary: 'summary total=2 present=1 failed=1',
      failed: true,
    });
    Vitest.expect(updatedAll).toContain('updated alpha head=1234567');
    Vitest.expect(updatedAll).toContain('summary total=2 present=1 failed=1');
    assertAgentClean(updatedAll);

    const synced = Renderers.synced({
      entries: [
        {
          kind: 'created',
          slug: 'alpha',
          message: 'created alpha https://example.test/owner/alpha.git',
        },
        { kind: 'skipped', slug: 'beta', message: 'skipped beta dirty' },
      ],
      failed: true,
    });
    Vitest.expect(synced).toContain('summary total=2 created=1 updated=0 ok=0 skipped=1 failed=0');
    assertAgentClean(synced);

    const status = Renderers.status(
      statusReport([
        statusRow({
          slug: 'svelte',
          state: 'ref-mismatch',
          message: 'ref-mismatch svelte ref=v1 expected=cd9a14a remote=7c1f0ab',
        }),
        statusRow({ slug: 'pi', state: 'present', message: 'present pi behind=1 ahead=2' }),
      ]),
    );
    Vitest.expect(status).toContain('ref-mismatch svelte ref=v1 expected=cd9a14a remote=7c1f0ab');
    const mismatch = status.split('\n')[0] ?? '';
    Vitest.expect(mismatch.indexOf('expected=')).toBeLessThan(mismatch.indexOf('remote='));
    const freshness = status.split('\n')[1] ?? '';
    Vitest.expect(freshness.indexOf('behind=')).toBeLessThan(freshness.indexOf('ahead='));
    assertAgentClean(status);

    const removed = Renderers.removed({
      kind: 'removed',
      slug: 'alpha',
      keptClone: true,
      path: '.agents/references/alpha',
      message: 'removed alpha clone=kept',
    });
    Vitest.expect(removed).toBe('removed alpha clone=kept');
    assertAgentClean(removed);
  });

  Vitest.it('—verbose stays additive for every verb', () => {
    const doctor = Renderers.doctor(
      {
        status: 'ok',
        healthy: true,
        checks: [{ name: 'registry', status: 'ok', detail: 'issues=0' }],
      },
      { human: false, verbose: true },
    );
    Vitest.expect(doctor).toContain('ok registry: issues=0');

    const list = Renderers.list([row('alpha', true)], { human: false, verbose: true });
    Vitest.expect(list).toContain('url=https://example.test/owner/alpha.git');
    Vitest.expect(list).toContain('  path: .agents/references/alpha');

    const status = Renderers.status(
      statusReport([
        statusRow({
          slug: 'alpha',
          state: 'present',
          message: 'present alpha',
          origin: 'https://example.test/owner/alpha.git',
          head: '1234567abcdef',
          upstream: 'origin/main',
        }),
      ]),
      { human: false, verbose: true },
    );
    Vitest.expect(status).toContain('present alpha path=.agents/references/alpha');
    Vitest.expect(status).toContain('origin=https://example.test/owner/alpha.git');
    Vitest.expect(status).toContain('head=1234567');
    Vitest.expect(status).toContain('upstream=origin/main');

    Vitest.expect(Renderers.updated(update('updated'), { human: false, verbose: true })).toBe(
      'updated alpha head=1234567 path=.agents/references/alpha',
    );
    Vitest.expect(
      Renderers.synced(
        { entries: [{ kind: 'ok', slug: 'alpha', message: 'ok alpha' }], failed: false },
        { human: false, verbose: true },
      ),
    ).toContain('ok alpha path=.agents/references/alpha');
  });
});

Vitest.describe('renderers human mode', () => {
  Vitest.it('renders tables and prose and composes with verbose', () => {
    const doctor = Renderers.doctor(
      {
        status: 'drifted',
        healthy: false,
        checks: [
          { name: 'store-root', status: 'drifted', detail: 'missing .agents/@montflow/references' },
          { name: 'registry', status: 'ok', detail: 'issues=0' },
        ],
      },
      { human: true, verbose: false },
    );
    Vitest.expect(doctor).toContain('MARK');
    Vitest.expect(doctor).toContain('CHECK');
    Vitest.expect(doctor).toContain('✗');
    Vitest.expect(doctor).toContain('failed');

    const list = Renderers.list([row('alpha', true), row('beta', false)], {
      human: true,
      verbose: false,
    });
    Vitest.expect(list).toContain('STATE');
    Vitest.expect(list).toContain('PURPOSE');
    Vitest.expect(list).toContain('✓');
    Vitest.expect(list).toContain('•');

    const listVerbose = Renderers.list([row('alpha', true)], { human: true, verbose: true });
    Vitest.expect(listVerbose).toContain('URL');
    Vitest.expect(listVerbose).toContain('PATH');
    Vitest.expect(listVerbose).toContain('.agents/references/alpha');

    const verify = Renderers.verify(
      {
        entries: [
          {
            path: '.agents/@montflow/references/bad/REFERENCE.md',
            valid: false,
            issues: [
              { field: 'url', message: 'Must be an https:// URL.' },
              { field: 'ref', message: 'Drop the empty ref line.', severity: 'warning' },
            ],
          },
        ],
        issueCount: 1,
        warningCount: 1,
        storeMissing: false,
        skills: [],
      },
      { human: true, verbose: false },
    );
    Vitest.expect(verify).toContain('✗');
    Vitest.expect(verify).toContain('⚠');
    Vitest.expect(verify).toContain('errors 1');
    Vitest.expect(verify).toContain('warnings 1');

    const status = Renderers.status(
      statusReport([
        statusRow({
          slug: 'alpha',
          state: 'present',
          message: 'present alpha',
          origin: 'https://example.test/owner/alpha.git',
          head: '1234567abcdef',
          upstream: 'origin/main',
        }),
        statusRow({ slug: 'beta', state: 'missing', message: 'missing beta' }),
      ]),
      { human: true, verbose: true },
    );
    Vitest.expect(status).toContain('MARK');
    Vitest.expect(status).toContain('UPSTREAM');
    Vitest.expect(status).toContain('✓');
    Vitest.expect(status).toContain('•');
    Vitest.expect(status).toContain('origin/main');

    Vitest.expect(
      Renderers.added(
        {
          kind: 'created',
          slug: 'alpha',
          url: 'https://example.test/owner/alpha.git',
          message: 'created alpha',
        },
        { human: true, verbose: true },
      ),
    ).toContain('Created alpha.');

    Vitest.expect(Renderers.updated(update('updated'), { human: true, verbose: true })).toContain(
      'Updated alpha to 1234567.',
    );

    const updatedAll = Renderers.updatedAll(
      {
        entries: [
          { slug: 'alpha', result: update('updated') },
          { slug: 'beta', result: update('refused') },
        ],
        summary: 'summary total=2 present=1 failed=1',
        failed: true,
      },
      { human: true, verbose: false },
    );
    Vitest.expect(updatedAll).toContain('✓');
    Vitest.expect(updatedAll).toContain('✗');

    const synced = Renderers.synced(
      {
        entries: [
          {
            kind: 'created',
            slug: 'alpha',
            message: 'created alpha https://example.test/owner/alpha.git',
          },
          { kind: 'skipped', slug: 'beta', message: 'skipped beta dirty' },
        ],
        failed: true,
      },
      { human: true, verbose: true },
    );
    Vitest.expect(synced).toContain('KIND');
    Vitest.expect(synced).toContain('PATH');
    Vitest.expect(synced).toContain('✗');

    Vitest.expect(
      Renderers.removed(
        {
          kind: 'removed',
          slug: 'alpha',
          keptClone: true,
          path: '.agents/references/alpha',
          message: 'removed alpha clone=kept',
        },
        { human: true, verbose: true },
      ),
    ).toContain('Removed alpha; clone kept.');
  });
});

Vitest.describe('renderers usage', () => {
  Vitest.it('lists the verbs in canonical order', () => {
    const verbs = ['doctor', 'list', 'show', 'verify', 'add', 'update', 'sync', 'status', 'remove'];
    const positions = verbs.map((verb) => Renderers.USAGE.indexOf(`mf-references ${verb}`));
    for (const [index, position] of positions.entries()) {
      Vitest.expect(position).toBeGreaterThan(-1);
      if (index > 0) Vitest.expect(position).toBeGreaterThan(positions[index - 1] ?? -1);
    }
  });
});

Vitest.describe('renderers review regressions', () => {
  Vitest.it('counts errors plus warnings in the verify block header', () => {
    const text = Renderers.verify({
      entries: [
        {
          path: '.agents/@montflow/references/alpha/REFERENCE.md',
          valid: false,
          issues: [
            { field: 'purpose', message: 'Must end with ".".' },
            { field: 'status', message: 'Unknown frontmatter field.', severity: 'warning' },
          ],
        },
      ],
      skills: [],
      issueCount: 1,
      warningCount: 1,
      storeMissing: false,
    });
    Vitest.expect(text).toContain(
      'error .agents/@montflow/references/alpha/REFERENCE.md has 2 issues.',
    );
  });

  Vitest.it('prints the last-known row and then a failure line for status', () => {
    const text = Renderers.status(
      statusReport([
        statusRow({
          slug: 'alpha',
          state: 'present',
          refused: true,
          message: 'present alpha',
          failure: {
            kind: 'failed',
            code: 'fetch-failure',
            slug: 'alpha',
            message: 'failed alpha fetch: Could not resolve host',
          },
        }),
      ]),
    );
    Vitest.expect(text.split('\n').slice(0, 2)).toEqual([
      'present alpha',
      'failed alpha fetch: Could not resolve host',
    ]);
  });

  Vitest.it('carries the B003 §3 verbose fields for add, update, and sync', () => {
    const added = Renderers.added(
      {
        kind: 'created',
        slug: 'alpha',
        url: 'https://example.test/owner/alpha.git',
        head: '1234567abcdef',
        message: 'created alpha https://example.test/owner/alpha.git',
      },
      { human: false, verbose: true },
    );
    Vitest.expect(added).toBe(
      'created alpha https://example.test/owner/alpha.git path=.agents/references/alpha head=1234567',
    );

    const updated = Renderers.updated(
      {
        kind: 'updated',
        slug: 'alpha',
        origin: 'https://example.test/owner/alpha.git',
        upstream: 'origin/main',
        message: 'updated alpha head=1234567',
      },
      { human: false, verbose: true },
    );
    Vitest.expect(updated).toBe(
      'updated alpha head=1234567 origin=https://example.test/owner/alpha.git upstream=origin/main path=.agents/references/alpha',
    );

    const synced = Renderers.synced(
      {
        entries: [
          {
            kind: 'created',
            slug: 'alpha',
            head: '1234567abcdef',
            message: 'created alpha https://example.test/owner/alpha.git',
          },
        ],
        failed: false,
      },
      { human: false, verbose: true },
    );
    Vitest.expect(synced).toContain(
      'created alpha https://example.test/owner/alpha.git path=.agents/references/alpha head=1234567',
    );
  });
});
