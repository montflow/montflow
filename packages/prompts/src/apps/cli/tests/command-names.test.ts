import * as Vitest from '@effect/vitest';
import * as Cli from '../index.js';
import * as Interactive from '../../interactive/index.js';

/**
 * The CLI and the interactive menu are two commands that must never collide.
 *
 * `mf-prompts` is the CLI — as a binary, and inside Pi as the slash command of
 * the same name, so one word means one thing in both runtimes. The menu took
 * the plain name first and the CLI got the `-cli` suffix, which put a suffix on
 * the thing people and agents actually reach for. This test exists so that
 * arrangement cannot drift back: swapping the names, or letting them match,
 * would make one of the two commands unreachable.
 */
Vitest.describe('slash command names', () => {
  Vitest.it('gives the CLI the plain name, in Pi and as a binary', () => {
    Vitest.expect(Cli.COMMAND_NAME).toBe('mf-prompts');
  });

  Vitest.it('suffixes the interactive menu so the plain name is free', () => {
    Vitest.expect(Interactive.COMMAND_NAME).toBe('mf-prompts-tui');
  });

  Vitest.it('keeps the two distinct, so neither shadows the other', () => {
    Vitest.expect(Cli.COMMAND_NAME).not.toBe(Interactive.COMMAND_NAME);
  });

  Vitest.it('points each command description at the other', () => {
    // A reader who lands on one should learn the other exists, rather than
    // discovering the second command by listing them.
    Vitest.expect(Cli.COMMAND_DESCRIPTION).toContain(`/${Interactive.COMMAND_NAME}`);
    Vitest.expect(Interactive.COMMAND_DESCRIPTION).toContain(`/${Cli.COMMAND_NAME}`);
  });

  Vitest.it('uses the suffix in the menu usage line and the plain name in the CLI one', () => {
    Vitest.expect(Interactive.USAGE.startsWith(`/${Interactive.COMMAND_NAME} `)).toBe(true);
    Vitest.expect(Cli.USAGE.startsWith(`/${Cli.COMMAND_NAME} `)).toBe(true);
  });
});
