import { Plugin } from '@opencode/plugin/effect';
import { activate, ID } from './apps/server/index.js';

/**
 * Server entry: the host resolves `./server` and activates `{ id, effect }`.
 * Configuration comes from the `options` block of the matching `plugins` entry.
 */
export default Plugin.define({ id: ID, effect: activate });
