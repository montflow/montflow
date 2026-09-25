import type { FeatureFileEntry, FeatureSnapshot } from '../index.js';
import { memoryMarkdown } from '../../task/tests/helpers.js';

/** Build one snapshot file entry. */
export const entry = (path: string, content: string): FeatureFileEntry => ({ path, content });

/** Wrap file entries in a feature snapshot named `ship-feature` by default. */
export const snapshot = (
  files: ReadonlyArray<FeatureFileEntry>,
  name = 'ship-feature',
): FeatureSnapshot => ({ name, files });

/** MEMORY.md contents with the template's sections. */
export const memory = memoryMarkdown();
