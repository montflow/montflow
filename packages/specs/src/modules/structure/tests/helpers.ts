import type { SpecFileEntry, SpecSnapshot } from '../index.js';
import { memoryMarkdown } from '../../task/tests/helpers.js';

/** Build one snapshot file entry. */
export const entry = (path: string, content: string): SpecFileEntry => ({ path, content });

/** Wrap file entries in a spec snapshot named `ship-spec` by default. */
export const snapshot = (
  files: ReadonlyArray<SpecFileEntry>,
  name = 'ship-spec',
): SpecSnapshot => ({ name, files });

/** MEMORY.md contents with the template's sections. */
export const memory = memoryMarkdown();
