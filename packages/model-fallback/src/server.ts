import type { Plugin } from '@opencode/plugin/effect';
import { activate, ID } from './apps/server/index.js';

/**
 * Server entry: the host resolves `./server` and activates `{ id, effect }`.
 * Configuration lives in `.agents/@montflow/model-fallback/config.json`.
 * `Plugin.define` is imported as a type only: its runtime module evaluates the
 * host schema package, which this package does not need at load time.
 */
export default { id: ID, effect: activate } satisfies Plugin.Plugin;
