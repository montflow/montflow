/* oxlint-disable montflow/no-node-platform-imports -- the single platform boundary for the telemetry plugin: the spec mandates a bare node:fs write path and the plugin has no Effect platform layer. Every other module imports this file, so suppressions stay in one place. */
import * as Fs from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/* oxlint-enable montflow/no-node-platform-imports */

export { createHash, dirname, fileURLToPath, Fs, homedir };
