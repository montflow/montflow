import * as Vitest from '@effect/vitest';
import * as Slash from '../slash.apps.module.js';

/**
 * The slash parser is the one thing the binary shares no code with: a Pi slash
 * command gets a single argument string, not argv. These tests pin the grammar
 * both surfaces promise — a typo here is a command an agent cannot reach.
 */

Vitest.describe('Slash.parseCliArgs', () => {
  Vitest.it('bare and unknown commands fall back to help', () => {
    Vitest.expect(Slash.parseCliArgs('')).toStrictEqual({ kind: 'Help' });
    Vitest.expect(Slash.parseCliArgs('wat')).toStrictEqual({ kind: 'Help' });
  });

  Vitest.it('parses doctor and list', () => {
    Vitest.expect(Slash.parseCliArgs('doctor')).toStrictEqual({ kind: 'Doctor', check: false });
    Vitest.expect(Slash.parseCliArgs('doctor --check')).toStrictEqual({
      kind: 'Doctor',
      check: true,
    });
    Vitest.expect(Slash.parseCliArgs('list --verbose')).toStrictEqual({
      kind: 'List',
      verbose: true,
      dir: undefined,
    });
  });

  Vitest.it('parses show, delete, and the --dir override', () => {
    Vitest.expect(Slash.parseCliArgs('show alpha')).toStrictEqual({
      kind: 'Show',
      name: 'alpha',
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('delete alpha --dir /tmp/work')).toStrictEqual({
      kind: 'Delete',
      name: 'alpha',
      dir: '/tmp/work',
    });
  });

  Vitest.it('parses verify with and without a name', () => {
    Vitest.expect(Slash.parseCliArgs('verify')).toStrictEqual({
      kind: 'Verify',
      name: undefined,
      verbose: false,
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('verify alpha --verbose')).toStrictEqual({
      kind: 'Verify',
      name: 'alpha',
      verbose: true,
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('verify --verbose')).toStrictEqual({
      kind: 'Verify',
      name: undefined,
      verbose: true,
      dir: undefined,
    });
  });

  Vitest.it('parses create with quoted text and comma lists', () => {
    Vitest.expect(
      Slash.parseCliArgs(
        'create alpha --description "a demo" --body "x" --groups a,b --dependencies c,d --author me --version 1.2.3 --license MIT',
      ),
    ).toStrictEqual({
      kind: 'Create',
      name: 'alpha',
      description: 'a demo',
      body: 'x',
      author: 'me',
      version: '1.2.3',
      license: 'MIT',
      groups: ['a', 'b'],
      dependencies: ['c', 'd'],
      dir: undefined,
    });
  });

  Vitest.it('parses modify with absent fields as undefined', () => {
    Vitest.expect(Slash.parseCliArgs('modify alpha --description "new"')).toStrictEqual({
      kind: 'Modify',
      name: 'alpha',
      description: 'new',
      body: undefined,
      author: undefined,
      version: undefined,
      license: undefined,
      groups: undefined,
      dependencies: undefined,
      dir: undefined,
    });
  });

  Vitest.it('an unknown flag is usage', () => {
    Vitest.expect(Slash.parseCliArgs('create alpha --description "x" --nope y')).toStrictEqual({
      kind: 'Help',
    });
    Vitest.expect(Slash.parseCliArgs('doctor --nope')).toStrictEqual({ kind: 'Help' });
  });

  Vitest.it('a missing name on a name-taking command is usage', () => {
    Vitest.expect(Slash.parseCliArgs('show')).toStrictEqual({ kind: 'Help' });
    Vitest.expect(Slash.parseCliArgs('delete')).toStrictEqual({ kind: 'Help' });
    Vitest.expect(Slash.parseCliArgs('create')).toStrictEqual({ kind: 'Help' });
  });
});
