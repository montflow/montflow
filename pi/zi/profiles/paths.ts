import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Package root — resolved from this module's own location (works under jiti and node). */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

/** Absolute path to the bundled TEMPLATE.md. */
export const TEMPLATE_FILE = path.join(PACKAGE_ROOT, 'TEMPLATE.md');

/** Reads the bundled TEMPLATE.md synchronously. */
export const readTemplateSync = (): string => readFileSync(TEMPLATE_FILE, 'utf8');
