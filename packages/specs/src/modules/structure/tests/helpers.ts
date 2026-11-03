import type { SpecFileEntry, SpecSnapshot } from '../index.js';
import { memoryMarkdown } from '../../task/tests/helpers.js';

/** Build one snapshot file entry. */
export const entry = (path: string, content: string): SpecFileEntry => ({ path, content });

/** Build one snapshot directory entry. */
export const dirEntry = (path: string): SpecFileEntry => ({ path, content: '', kind: 'directory' });

/** Wrap file entries in a spec snapshot named `ship-spec` by default. */
export const snapshot = (
  files: ReadonlyArray<SpecFileEntry>,
  name = 'ship-spec',
): SpecSnapshot => ({ name, files });

/** MEMORY.md contents with the template's sections. */
export const memory = memoryMarkdown();

/** MEMORY.md contents that also carry a valid phase execution brief. */
export const briefedMemory = `${memory}\n## Execution Brief\n\n- Read: this brief, TASK.md, GATES.md, and the scoped source.\n- Write scope: this task's directory and the files TASK.md names.\n- Gate: point at GATES.md; the orchestrator runs the task gate once per task, at completion.\n- Record: keep MEMORY.md at or under 80 lines; logs in /tmp.\n- Review: one fixer attempt and one re-review after review decide.\n`;
