import * as Vitest from '@effect/vitest';
import * as Slash from '../slash.apps.module.js';

/**
 * The slash parser is the one thing the binary shares no code with: a Pi slash
 * command gets a single argument string, not argv. These tests pin the grammar
 * both surfaces promise — a typo here is a command an agent cannot reach.
 */

/** A malformed known command: usage that `run` fails instead of reporting. */
const INVALID = { kind: 'Help', invalid: true };

Vitest.describe('Slash.parseCliArgs', () => {
  Vitest.it('bare and unknown commands fall back to successful help', () => {
    Vitest.expect(Slash.parseCliArgs('')).toStrictEqual({ kind: 'Help' });
    Vitest.expect(Slash.parseCliArgs('wat')).toStrictEqual({ kind: 'Help' });
  });

  Vitest.it('parses doctor and list', () => {
    Vitest.expect(Slash.parseCliArgs('doctor')).toStrictEqual({
      kind: 'Doctor',
      check: false,
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('doctor --check')).toStrictEqual({
      kind: 'Doctor',
      check: true,
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('list --verbose')).toStrictEqual({
      kind: 'List',
      status: undefined,
      verbose: true,
      dir: undefined,
    });
  });

  Vitest.it('accepts the binary booleans, including --verbose on doctor', () => {
    // The binary accepts `doctor --verbose`; the slash renderer may ignore the
    // switch, but the invocation must not be refused.
    Vitest.expect(Slash.parseCliArgs('doctor --verbose')).toStrictEqual({
      kind: 'Doctor',
      check: false,
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('doctor --verbose=false')).toStrictEqual({
      kind: 'Doctor',
      check: false,
      dir: undefined,
    });
  });

  Vitest.it('reads boolean values instead of treating presence as true', () => {
    Vitest.expect(Slash.parseCliArgs('doctor --check=false')).toStrictEqual({
      kind: 'Doctor',
      check: false,
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('list --verbose false')).toStrictEqual({
      kind: 'List',
      status: undefined,
      verbose: false,
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('verify alpha --verbose=no')).toStrictEqual({
      kind: 'Verify',
      name: 'alpha',
      verbose: false,
      dir: undefined,
    });
  });

  Vitest.it('a boolean takes the next token only when it is a literal', () => {
    // `alpha` is not a boolean, so it stays the positional name.
    Vitest.expect(Slash.parseCliArgs('verify --verbose alpha')).toStrictEqual({
      kind: 'Verify',
      name: 'alpha',
      verbose: true,
      dir: undefined,
    });
    // `bogus` would be a stray positional, which `list` does not take.
    Vitest.expect(Slash.parseCliArgs('list --verbose bogus')).toStrictEqual(INVALID);
  });

  Vitest.it('an invalid boolean value is usage', () => {
    Vitest.expect(Slash.parseCliArgs('doctor --check=bogus')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('doctor --check=')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('list --verbose=bogus')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('list --verbose=')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('verify alpha --verbose=bogus')).toStrictEqual(INVALID);
    // No case folding: the binary accepts lowercase literals only.
    Vitest.expect(Slash.parseCliArgs('doctor --check=TRUE')).toStrictEqual(INVALID);
  });

  Vitest.it('parses show, delete, and the --dir override in both forms', () => {
    Vitest.expect(Slash.parseCliArgs('show alpha')).toStrictEqual({
      kind: 'Show',
      name: 'alpha',
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('show --dir /tmp/work alpha')).toStrictEqual({
      kind: 'Show',
      name: 'alpha',
      dir: '/tmp/work',
    });
    Vitest.expect(Slash.parseCliArgs('delete alpha --dir /tmp/work')).toStrictEqual({
      kind: 'Delete',
      name: 'alpha',
      dir: '/tmp/work',
    });
    Vitest.expect(Slash.parseCliArgs('delete alpha --dir=/tmp/work')).toStrictEqual({
      kind: 'Delete',
      name: 'alpha',
      dir: '/tmp/work',
    });
    Vitest.expect(Slash.parseCliArgs('doctor --dir /tmp/work')).toStrictEqual({
      kind: 'Doctor',
      check: false,
      dir: '/tmp/work',
    });
  });

  Vitest.it('a value flag with no value is usage on every command', () => {
    Vitest.expect(Slash.parseCliArgs('list --dir')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('show alpha --dir')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('verify alpha --dir')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('delete alpha --dir')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('create alpha --description x --dir')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('modify alpha --dir')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('doctor --dir')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('sync --from')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('sync --from /tmp/checkout --dir')).toStrictEqual(INVALID);
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
    Vitest.expect(Slash.parseCliArgs('create alpha --description "x" --nope y')).toStrictEqual(
      INVALID,
    );
    Vitest.expect(Slash.parseCliArgs('doctor --nope')).toStrictEqual(INVALID);
  });

  Vitest.it('a stray positional is usage', () => {
    Vitest.expect(Slash.parseCliArgs('show alpha extra')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('verify alpha extra')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('create alpha extra --description "x"')).toStrictEqual(
      INVALID,
    );
    Vitest.expect(Slash.parseCliArgs('list alpha')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('doctor alpha')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('sync alpha')).toStrictEqual(INVALID);
  });

  Vitest.it('a missing name on a name-taking command is usage', () => {
    Vitest.expect(Slash.parseCliArgs('show')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('delete')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('create')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('modify')).toStrictEqual(INVALID);
  });
});

Vitest.describe('Slash lexer parity with effect/cli', () => {
  Vitest.it('treats every dash token except a bare - as a flag', () => {
    // A single-dash token is a flag, so a value flag followed by one is
    // missing (and the token itself is unknown), exactly like the binary.
    Vitest.expect(Slash.parseCliArgs('create alpha --description -x')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('create alpha --description "- bullet"')).toStrictEqual(
      INVALID,
    );
    Vitest.expect(Slash.parseCliArgs('list -x')).toStrictEqual(INVALID);
    Vitest.expect(Slash.parseCliArgs('delete alpha --dir -store')).toStrictEqual(INVALID);
    // A bare `-` is a value, not a flag.
    Vitest.expect(Slash.parseCliArgs('delete -')).toStrictEqual({
      kind: 'Delete',
      name: '-',
      dir: undefined,
    });
  });

  Vitest.it('-- ends flag parsing and leaves the rest positional', () => {
    Vitest.expect(Slash.parseCliArgs('delete -- alpha')).toStrictEqual({
      kind: 'Delete',
      name: 'alpha',
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('delete --dir /tmp/work -- alpha')).toStrictEqual({
      kind: 'Delete',
      name: 'alpha',
      dir: '/tmp/work',
    });
    // After the terminator a flag-shaped token is positional, so it is a
    // stray positional for `list`, not a flag.
    Vitest.expect(Slash.parseCliArgs('list -- --verbose')).toStrictEqual(INVALID);
  });

  Vitest.it('keeps empty quoted tokens as real values', () => {
    Vitest.expect(Slash.tokenize('create alpha --description ""')).toStrictEqual([
      'create',
      'alpha',
      '--description',
      '',
    ]);
    Vitest.expect(Slash.parseCliArgs('create alpha --description ""')).toStrictEqual({
      kind: 'Create',
      name: 'alpha',
      description: '',
      body: undefined,
      author: undefined,
      version: undefined,
      license: undefined,
      groups: undefined,
      dependencies: undefined,
      dir: undefined,
    });
    // Empty is not missing for a text flag, but stays absent for a path flag.
    Vitest.expect(Slash.parseCliArgs('create alpha --description "" --dir ""')).toStrictEqual({
      kind: 'Create',
      name: 'alpha',
      description: '',
      body: undefined,
      author: undefined,
      version: undefined,
      license: undefined,
      groups: undefined,
      dependencies: undefined,
      dir: undefined,
    });
  });

  Vitest.it('keeps the first value of a duplicated flag', () => {
    Vitest.expect(Slash.parseCliArgs('delete alpha --dir /one --dir /two')).toStrictEqual({
      kind: 'Delete',
      name: 'alpha',
      dir: '/one',
    });
    Vitest.expect(
      Slash.parseCliArgs('create alpha --description one --description two'),
    ).toStrictEqual({
      kind: 'Create',
      name: 'alpha',
      description: 'one',
      body: undefined,
      author: undefined,
      version: undefined,
      license: undefined,
      groups: undefined,
      dependencies: undefined,
      dir: undefined,
    });
    Vitest.expect(Slash.parseCliArgs('list --verbose=false --verbose')).toStrictEqual({
      kind: 'List',
      status: undefined,
      verbose: false,
      dir: undefined,
    });
  });
});
