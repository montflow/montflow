import * as Vitest from '@effect/vitest';
import { Git, Reference } from '../../../index.js';

const FIRST = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SECOND = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TAG_OBJECT = 'cccccccccccccccccccccccccccccccccccccccc';

Vitest.describe('Git ref helpers', () => {
  Vitest.it('reads the peeled row for an annotated tag', () => {
    const rows = [
      { ref: 'refs/tags/v2', sha: TAG_OBJECT },
      { ref: 'refs/tags/v2^{}', sha: SECOND },
    ];
    Vitest.expect(Git.resolveRemoteRef(rows, 'v2')).toBe(SECOND);
  });

  Vitest.it('reads the plain row for a lightweight tag', () => {
    const rows = [{ ref: 'refs/tags/v1', sha: FIRST }];
    Vitest.expect(Git.resolveRemoteRef(rows, 'v1')).toBe(FIRST);
  });

  Vitest.it('returns undefined when the remote no longer reports the tag', () => {
    Vitest.expect(Git.resolveRemoteRef([], 'v1')).toBeUndefined();
  });

  Vitest.it('normalises one tag prefix and classifies tag candidates', () => {
    Vitest.expect(Git.tagName('refs/tags/v1')).toBe('v1');
    Vitest.expect(Git.tagName('v1')).toBe('v1');
    Vitest.expect(Git.isTagCandidate('v1')).toBe(true);
    Vitest.expect(Git.isTagCandidate('refs/tags/v1')).toBe(true);
    Vitest.expect(Git.isTagCandidate('refs/heads/v1')).toBe(false);
    Vitest.expect(Git.isTagCandidate(FIRST)).toBe(false);
    Vitest.expect(Git.branchName('refs/remotes/origin/dev')).toBe('dev');
    Vitest.expect(Git.branchName('refs/heads/dev')).toBe('dev');
    Vitest.expect(Git.branchName('dev')).toBe('dev');
  });

  Vitest.it('treats /, trailing /, and bare spellings as one ignore rule', () => {
    Vitest.expect(Git.hasIgnoreRule('.agents/references\n')).toBe(true);
    Vitest.expect(Git.hasIgnoreRule('/.agents/references\n')).toBe(true);
    Vitest.expect(Git.hasIgnoreRule('.agents/references/\n')).toBe(true);
    Vitest.expect(Git.hasIgnoreRule('node_modules\n')).toBe(false);
    Vitest.expect(Git.appendIgnoreRule('node_modules\n')).toBe(
      'node_modules\n.agents/references\n',
    );
    Vitest.expect(Git.appendIgnoreRule('node_modules')).toBe('node_modules\n.agents/references\n');
  });

  Vitest.it('normalises https, ssh, and scp origins to the same comparison key', () => {
    Vitest.expect(Reference.normalizeOriginUrl('https://github.com/Effect-TS/effect-smol')).toBe(
      'github.com/effect-ts/effect-smol',
    );
    Vitest.expect(Reference.normalizeOriginUrl('https://github.com/sst/opencode.git')).toBe(
      'github.com/sst/opencode',
    );
    Vitest.expect(Reference.normalizeOriginUrl('git@github.com:sst/opencode.git')).toBe(
      'github.com/sst/opencode',
    );
    Vitest.expect(Reference.normalizeOriginUrl('ssh://git@github.com/sst/opencode.git')).toBe(
      'github.com/sst/opencode',
    );
    Vitest.expect(Reference.normalizeOriginUrl('/tmp/opencode')).toBeUndefined();
  });
});
