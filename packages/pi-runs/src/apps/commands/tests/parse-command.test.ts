import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { parseArgv, parseCommand, tokenize } from '../index.js';

Vitest.describe('parseCommand runtime', () => {
  Vitest.it.effect('parses list and help', () =>
    Effect.sync(() => {
      Vitest.expect(parseCommand('list')).toStrictEqual({ kind: 'List', status: undefined });
      Vitest.expect(parseCommand('list --status running')).toStrictEqual({
        kind: 'List',
        status: 'running',
      });
      Vitest.expect(parseCommand('list --status=running,done')).toStrictEqual({
        kind: 'List',
        status: 'running,done',
      });
      Vitest.expect(parseCommand('')).toStrictEqual({ kind: 'Help' });
      Vitest.expect(parseCommand('nope')).toStrictEqual({ kind: 'Help' });
      Vitest.expect(parseCommand('list --bogus x')).toStrictEqual({ kind: 'Help' });
    }),
  );

  Vitest.it.effect('parses doctor', () =>
    Effect.sync(() => {
      Vitest.expect(parseCommand('doctor')).toStrictEqual({ kind: 'Doctor' });
      Vitest.expect(parseCommand('doctor extra')).toStrictEqual({ kind: 'Help' });
    }),
  );

  Vitest.it.effect('parses status and verify', () =>
    Effect.sync(() => {
      Vitest.expect(parseCommand('status run-1')).toStrictEqual({ kind: 'Status', id: 'run-1' });
      Vitest.expect(parseCommand('verify run-1')).toStrictEqual({ kind: 'Verify', id: 'run-1' });
      Vitest.expect(parseCommand('status')).toStrictEqual({ kind: 'Help' });
      Vitest.expect(parseCommand('status run-1 extra')).toStrictEqual({ kind: 'Help' });
    }),
  );

  Vitest.it.effect('parses resume and interrupt', () =>
    Effect.sync(() => {
      Vitest.expect(parseCommand('resume run-1')).toStrictEqual({
        kind: 'Resume',
        id: 'run-1',
        prompt: undefined,
      });
      Vitest.expect(parseCommand('resume run-1 --prompt "keep going"')).toStrictEqual({
        kind: 'Resume',
        id: 'run-1',
        prompt: 'keep going',
      });
      Vitest.expect(parseCommand('interrupt run-1')).toStrictEqual({
        kind: 'Interrupt',
        id: 'run-1',
      });
      Vitest.expect(parseCommand('interrupt')).toStrictEqual({ kind: 'Help' });
    }),
  );

  Vitest.it.effect('parses steer and answer with quoted text', () =>
    Effect.sync(() => {
      Vitest.expect(parseCommand('steer run-1 "change the plan"')).toStrictEqual({
        kind: 'Steer',
        id: 'run-1',
        text: 'change the plan',
      });
      Vitest.expect(parseCommand('answer run-1 yes')).toStrictEqual({
        kind: 'Answer',
        id: 'run-1',
        text: 'yes',
      });
      Vitest.expect(parseCommand('steer run-1')).toStrictEqual({ kind: 'Help' });
    }),
  );

  Vitest.it.effect('parses start flags', () =>
    Effect.sync(() => {
      Vitest.expect(
        parseCommand(
          'start --id run-9 --prompt "fix it" --name "Fix" --parent parent-1 --related a,b --tools read,edit',
        ),
      ).toStrictEqual({
        kind: 'Start',
        id: 'run-9',
        prompt: 'fix it',
        name: 'Fix',
        model: undefined,
        thinking: undefined,
        parent: 'parent-1',
        related: ['a', 'b'],
        tools: ['read', 'edit'],
      });
      Vitest.expect(parseCommand('start --id run-9')).toStrictEqual({ kind: 'Help' });
      Vitest.expect(parseCommand('start --id run-9 --prompt p --nope y')).toStrictEqual({
        kind: 'Help',
      });
    }),
  );

  Vitest.it.effect('keeps a --prefixed flag value', () =>
    Effect.sync(() => {
      Vitest.expect(parseArgv(['start', '--id', 'r', '--prompt', '--dash leading'])).toStrictEqual({
        kind: 'Start',
        id: 'r',
        prompt: '--dash leading',
        name: undefined,
        model: undefined,
        thinking: undefined,
        parent: undefined,
        related: undefined,
        tools: undefined,
      });
    }),
  );

  Vitest.it.effect('parses already-split argv without re-tokenizing', () =>
    Effect.sync(() => {
      Vitest.expect(
        parseArgv(['start', '--id', 'r', '--prompt', 'fix the bug', '--name', 'My Run']),
      ).toStrictEqual({
        kind: 'Start',
        id: 'r',
        prompt: 'fix the bug',
        name: 'My Run',
        model: undefined,
        thinking: undefined,
        parent: undefined,
        related: undefined,
        tools: undefined,
      });
    }),
  );

  Vitest.it.effect('tokenizes quotes, apostrophes, escapes, and rejects unterminated quotes', () =>
    Effect.sync(() => {
      Vitest.expect(tokenize(`a "b c" 'd'`)).toStrictEqual(['a', 'b c', 'd']);
      Vitest.expect(tokenize(`steer run-1 don't`)).toStrictEqual(['steer', 'run-1', "don't"]);
      Vitest.expect(tokenize(`a "b\\"c"`)).toStrictEqual(['a', 'b"c']);
      Vitest.expect(tokenize(`steer run-1 "unterminated`)).toBeUndefined();
    }),
  );
});
