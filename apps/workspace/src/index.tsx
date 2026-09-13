import { createCliRenderer } from '@opentui/core';
import { render } from '@opentui/solid';
import { QueryClientProvider } from '@tanstack/solid-query';
import { Effect } from 'effect';
import { Dashboard } from './modules/index.js';
// oxlint-disable-next-line montflow/no-node-platform-imports -- composition root owns startup IO: one sync layout.json read before render.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line montflow/no-node-platform-imports -- composition root owns startup IO: path join for the layout file.
import { join } from 'node:path';
import { App } from './app.tsx';
import { MissingPi } from './components/index.js';
import { GitInfo, Pi, Query } from './services/index.js';

/**
 * OpenTUI core logs unconditional `console.warn` lines for benign
 * reconciler no-ops (`... skipping insertBefore`) with no env gate —
 * under `passthrough` output they print over the fullscreen TUI.
 * Swallow exactly those lines; every other warning passes through.
 */
const noisyWarn = console.warn;
console.warn = (...args: Array<unknown>): void => {
  if (String(args[0] ?? '').includes('skipping insertBefore')) return;
  noisyWarn(...args);
};

/**
 * TUI composition root (opencode pattern): explicit renderer with production
 * flags, centralized destroy-then-exit, SIGHUP guard, startup IO (grid
 * layout file plus the pi CLI probe). The app itself never touches process
 * lifetime or the filesystem — `q` just destroys the renderer.
 */
const renderer = await createCliRenderer({
  targetFps: 30,
  exitOnCtrlC: true,
  useKittyKeyboard: {},
  autoFocus: false,
  openConsoleOnError: false,
  useMouse: false,
  consoleMode: 'disabled',
  externalOutputMode: 'passthrough',
  backgroundColor: '#1a1b26',
  // Exit here — not on the `destroy` event, which fires before the native
  // teardown (leave alt-screen, restore cursor) completes and leaves a
  // half-painted terminal behind when process.exit cuts it off.
  onDestroy: () => process.exit(0),
});

/**
 * Load the grid layout for this repo, falling back to the default when
 * the file is missing or unreadable. Read once at launch — edit the file
 * and restart to re-layout.
 * @param root - workspace root (process.cwd at launch)
 * @returns grid layout
 */
const loadLayout = (root: string): Dashboard.Layout => {
  try {
    return Dashboard.decodeLayoutJson(
      readFileSync(join(root, '.agents', '@montflow', 'dashboard', 'layout.json'), 'utf8'),
    );
  } catch {
    return Dashboard.DEFAULT_LAYOUT;
  }
};

process.on('SIGHUP', () => {
  if (!renderer.isDestroyed) renderer.destroy();
});

const piInstalled = await Pi.isInstalled().pipe(Effect.runPromise);
const root = await GitInfo.resolveRoot(process.cwd()).pipe(Effect.runPromise);

/**
 * Query state for the dashboard panels: one client for the process,
 * provided above `App` so every `createQuery`/`useQueryClient` call
 * resolves. The client is cache-first — lists move on explicit
 * invalidate/patch, never behind the user's back.
 */
const queryClient = Query.makeQueryClient();

await render(
  () => (
    <QueryClientProvider client={queryClient}>
      {piInstalled ? <App layout={loadLayout(root)} root={root} /> : <MissingPi />}
    </QueryClientProvider>
  ),
  renderer,
);
