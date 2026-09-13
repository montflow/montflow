import * as Vitest from '@effect/vitest';
import * as GitInfo from '../index.js';

Vitest.describe('GitInfo.parseBranch runtime', () => {
  Vitest.it('trims the branch name', () => {
    Vitest.expect(GitInfo.parseBranch('main\n')).toStrictEqual('main');
  });

  Vitest.it('falls back to unknown on empty output', () => {
    Vitest.expect(GitInfo.parseBranch('\n')).toStrictEqual('unknown');
  });
});

Vitest.describe('GitInfo.parseClean runtime', () => {
  Vitest.it('reads empty status as clean', () => {
    Vitest.expect(GitInfo.parseClean('')).toStrictEqual(true);
  });

  Vitest.it('reads porcelain output as dirty', () => {
    Vitest.expect(GitInfo.parseClean(' M src/app.tsx\n')).toStrictEqual(false);
  });
});

Vitest.describe('GitInfo.parseToplevel runtime', () => {
  Vitest.it('trims the toplevel path', () => {
    Vitest.expect(GitInfo.parseToplevel('/home/daniel/dev/montflow/main\n')).toStrictEqual(
      '/home/daniel/dev/montflow/main',
    );
  });

  Vitest.it('reads empty output as empty', () => {
    Vitest.expect(GitInfo.parseToplevel('\n')).toStrictEqual('');
  });
});
