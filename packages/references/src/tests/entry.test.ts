import * as Vitest from '@effect/vitest';
import { Reference } from '../modules/index.js';
import server, { COMMAND_DESCRIPTION, COMMAND_NAME, ID } from '../server.js';

/**
 * The scaffold's contract: the plugin face, the slash command, and the two
 * derived paths. Behaviour is C002-C006's; this test fails if the package stops
 * loading as a plugin or moves the store.
 */
Vitest.describe('@montflow/references entry', () => {
  Vitest.it('exposes the plugin id and loads as a plugin', () => {
    Vitest.expect(ID).toBe('references');
    Vitest.expect(server.id).toBe(ID);
  });

  Vitest.it('registers the slash command name and description', () => {
    Vitest.expect(COMMAND_NAME).toBe('mf-references');
    Vitest.expect(COMMAND_DESCRIPTION).toContain('mf-references');
  });

  Vitest.it('names the committed store and the gitignored clone root', () => {
    Vitest.expect(Reference.STORE_DIR).toBe('.agents/@montflow/references');
    Vitest.expect(Reference.CLONE_DIR).toBe('.agents/references');
    Vitest.expect(Reference.ENTRY_FILE).toBe('REFERENCE.md');
  });
});
