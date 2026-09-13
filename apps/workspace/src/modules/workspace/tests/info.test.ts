import * as Vitest from '@effect/vitest';
import * as Workspace from '../index.js';

const info = () =>
  Workspace.make({
    name: 'main',
    root: '/home/daniel/dev/montflow/main',
    branch: 'main',
    clean: true,
  });

Vitest.describe('Workspace.basename runtime', () => {
  Vitest.it('reads the last path segment', () => {
    Vitest.expect(Workspace.basename('/home/daniel/dev/montflow/main')).toStrictEqual('main');
  });

  Vitest.it('tolerates a trailing slash', () => {
    Vitest.expect(Workspace.basename('/home/daniel/dev/montflow/main/')).toStrictEqual('main');
  });

  Vitest.it('returns segment-free paths unchanged', () => {
    Vitest.expect(Workspace.basename('main')).toStrictEqual('main');
  });
});

Vitest.describe('Workspace.summarize runtime', () => {
  Vitest.it('marks clean workspaces with a check', () => {
    Vitest.expect(Workspace.summarize(info())).toStrictEqual('main @ main ✓');
  });

  Vitest.it('marks dirty workspaces with a cross', () => {
    Vitest.expect(Workspace.summarize({ ...info(), clean: false })).toStrictEqual('main @ main ✗');
  });
});

Vitest.describe('Workspace.title runtime', () => {
  Vitest.it('prefixes the summary with Workspace', () => {
    Vitest.expect(Workspace.title(info())).toStrictEqual('Workspace — main @ main ✓');
  });
});
