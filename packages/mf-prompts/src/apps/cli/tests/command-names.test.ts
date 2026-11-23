import * as Vitest from '@effect/vitest';
import * as Cli from '../index.js';
import * as Interactive from '../../interactive/index.js';

/**
 * The CLI and the interactive menu are two commands that must never collide.
 *
 * `mf-prompts` is the CLI — as a binary, and inside the host as the slash command of
 * the same name, so one word means one thing in both runtimes. The menu took
 * the plain name first and the CLI got the `-cli` suffix, which put a suffix on
 * the thing people and agents actually reach for. This test exists so that
 * arrangement cannot drift back: swapping the names, or letting them match,
 * would make one of the two commands unreachable.
 */
Vitest.describe('slash command names', () => {
  Vitest.it('gives the CLI the plain name, in the host and as a binary', () => {
    Vitest.expect(Cli.COMMAND_NAME).toBe('mf-prompts');
  });

  Vitest.it('uses one prompts command with picker behavior', () => {
    Vitest.expect(Cli.COMMAND_NAME).toBe('mf-prompts');
    Vitest.expect(Interactive.COMMAND_NAME).toBe('mf-prompts');
  });

  Vitest.it('points commands to picker behavior', () => {
    Vitest.expect(Cli.COMMAND_DESCRIPTION.toLowerCase()).toContain('picker');
    Vitest.expect(Interactive.COMMAND_DESCRIPTION.toLowerCase()).toContain('picker');
  });

  Vitest.it('uses the plain name in usages', () => {
    Vitest.expect(Interactive.USAGE.startsWith(`/${Interactive.COMMAND_NAME} `)).toBe(true);
    Vitest.expect(Cli.USAGE.startsWith(`/${Cli.COMMAND_NAME} `)).toBe(true);
  });
});
