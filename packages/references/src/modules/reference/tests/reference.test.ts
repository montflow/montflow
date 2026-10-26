import { Schema } from 'effect';
import * as Vitest from '@effect/vitest';
import { Reference } from '../../index.js';

/** A canonical pinned entry, exercising the optional `ref` and body notes. */
const PINNED_ENTRY = [
  '---',
  'name: opencode',
  'url: https://github.com/sst/opencode.git',
  'purpose: OpenCode v2 host the plugins load into — pinned because ten spec files cite it.',
  'added: 2026-09-13',
  'ref: cd9a14a6b688d4021bee381dfd39d2cef9c0f862',
  '---',
  '',
  '# Notes',
  '',
  'Pinned to commit `cd9a14a6b688d4021bee381dfd39d2cef9c0f862`, tag `v2.0.18`.',
  '',
].join('\n');

/** The same entry without a ref line. */
const DEFAULT_BRANCH_ENTRY = [
  '---',
  'name: effect',
  'url: https://github.com/Effect-TS/effect-smol',
  'purpose: Effect v4 source, published upstream as effect-smol.',
  'added: 2026-07-22',
  '---',
  '',
  '# Notes',
  '',
].join('\n');

Vitest.describe('Reference schema and codec', () => {
  Vitest.it('round-trips a pinned entry and preserves body notes', () => {
    const document = Reference.decodeReferenceFile(PINNED_ENTRY);
    Vitest.expect(document).toBeDefined();
    if (document === undefined) return;
    Vitest.expect(document.reference.name).toBe('opencode');
    Vitest.expect(document.reference.ref).toBe('cd9a14a6b688d4021bee381dfd39d2cef9c0f862');
    Vitest.expect(document.body).toContain('tag `v2.0.18`');
    Vitest.expect(Reference.encodeReferenceFile(document)).toBe(PINNED_ENTRY);
  });

  Vitest.it('omits an absent ref when encoding a default-branch entry', () => {
    const document = Reference.decodeReferenceFile(DEFAULT_BRANCH_ENTRY);
    Vitest.expect(document).toBeDefined();
    if (document === undefined) return;
    Vitest.expect(document.reference.ref).toBeUndefined();
    Vitest.expect(Reference.encodeReferenceFile(document)).toBe(DEFAULT_BRANCH_ENTRY);
  });

  Vitest.it('rejects a non-slug name in the schema class', () => {
    Vitest.expect(() =>
      Schema.decodeUnknownSync(Reference.Reference)({
        name: 'SvelteKit',
        url: 'https://github.com/sveltejs/kit.git',
        purpose: 'SvelteKit framework.',
        added: '2026-07-22',
      }),
    ).toThrow();
    Vitest.expect(() =>
      Schema.decodeUnknownSync(Reference.Reference)({
        name: 'a-'.repeat(40),
        url: 'https://github.com/sveltejs/kit.git',
        purpose: 'SvelteKit framework.',
        added: '2026-07-22',
      }),
    ).toThrow();
  });

  Vitest.it('derives the clone path and the store-relative entry path', () => {
    Vitest.expect(Reference.clonePath('/tmp/workspace', 'effect')).toBe(
      '/tmp/workspace/.agents/references/effect',
    );
    Vitest.expect(Reference.clonePath('/tmp/workspace/', 'effect')).toBe(
      '/tmp/workspace/.agents/references/effect',
    );
    Vitest.expect(Reference.clonePath('/', 'effect')).toBe('/.agents/references/effect');
    Vitest.expect(Reference.entryPath('effect')).toBe(
      '.agents/@montflow/references/effect/REFERENCE.md',
    );
  });

  Vitest.it('accepts only https repository URLs', () => {
    const valid = [
      'https://github.com/Effect-TS/effect-smol',
      'https://github.com/sst/opencode.git',
      'https://git.example.com/team/repo',
    ];
    const invalid = [
      'http://github.com/sst/opencode.git',
      'ssh://git@github.com/sst/opencode.git',
      'git@github.com:sst/opencode.git',
      'file:///tmp/opencode',
      '/tmp/opencode',
      'https://github.com/sst',
      'https://github.com/sst/opencode?ref=main',
      'https://github.com/sst/opencode#readme',
      'https://user:pass@github.com/sst/opencode',
      'https://github.com/sst/opencode.git.git',
      'https://localhost/sst/opencode',
    ];
    for (const url of valid) Vitest.expect(Reference.isValidUrl(url), url).toBe(true);
    for (const url of invalid) Vitest.expect(Reference.isValidUrl(url), url).toBe(false);
  });

  Vitest.it('accepts branch, tag, and 7-40 char commit refs only', () => {
    const valid = [
      'main',
      'dev',
      'feat/scopes',
      'v2.0.18',
      'cd9a14a',
      'cd9a14a6b688d4021bee381dfd39d2cef9c0f862',
      'refs/tags/v1',
      'refs/heads/main',
    ];
    const invalid = [
      '/main',
      'feat//x',
      'main/',
      'main.',
      '.hidden',
      '-lead',
      'a..b',
      'refs/heads/x.lock',
      'has space',
      'back\\slash',
      'has~tilde',
      'has^caret',
      'has:colon',
      'has?question',
      'has*star',
      'has[bracket',
      'has@{brace}',
      'abc',
      'abcdef',
      '0123456789abcdef0123456789abcdef012345670',
    ];
    for (const ref of valid) Vitest.expect(Reference.isValidRef(ref), ref).toBe(true);
    for (const ref of invalid) Vitest.expect(Reference.isValidRef(ref), ref).toBe(false);
  });

  Vitest.it('normalizes URLs only for duplicate comparison', () => {
    Vitest.expect(Reference.normalizeUrl(' https://github.com/Effect-TS/effect-smol/ ')).toBe(
      'https://github.com/effect-ts/effect-smol',
    );
    Vitest.expect(Reference.normalizeUrl('https://github.com/sst/opencode.git')).toBe(
      'https://github.com/sst/opencode',
    );
  });

  Vitest.it('matches a find query over name, URL, purpose, and notes', () => {
    const fields = {
      name: 'opencode',
      url: 'https://github.com/sst/opencode.git',
      purpose: 'OpenCode v2 host the plugins load into.',
      notes: 'Pinned to tag v2.0.18.',
    };
    Vitest.expect(Reference.matches(fields, 'OPENCODE')).toBe(true);
    Vitest.expect(Reference.matches(fields, 'sst/opencode')).toBe(true);
    Vitest.expect(Reference.matches(fields, 'plugins load')).toBe(true);
    Vitest.expect(Reference.matches(fields, 'v2.0.18')).toBe(true);
    Vitest.expect(Reference.matches(fields, '  v2.0.18  ')).toBe(true);
    Vitest.expect(Reference.matches({ ...fields, notes: undefined }, 'v2.0.18')).toBe(false);
    Vitest.expect(Reference.matches(fields, '')).toBe(false);
    Vitest.expect(Reference.matches(fields, '   ')).toBe(false);
    Vitest.expect(Reference.matches(fields, 'svelte')).toBe(false);
  });
});
