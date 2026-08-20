/**
 * Backend adapter for the workspace web UI.
 *
 * Runs INSIDE the pi process (started by `/montflow ui`). Unlike
 * the old per-folder HTTP server, this adapter connects OUT to a single
 * machine-level router daemon (`router.ts`) and registers this project folder.
 * The router serves the SPA on one port and relays events/commands, so any
 * number of folders share one URL and the UI has a folder picker.
 *
 * - Ensures the router is running (spawns it detached when missing).
 * - Registers with the wire protocol version; a version mismatch is fatal
 *   (two different versions can never coexist behind one router).
 * - Streams pi events + agentic-run streams to the router; forwards
 *   browser commands (`prompt` / `steer` / `followUp` / `command`) into the
 *   live session via `pi.sendUserMessage` / in-process dispatch.
 */

import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { Effect, Option } from 'effect';
import { getCurrentGitBranch } from './git';
import { generateText } from './skill-run';
import { listModelChoices, resolveInitialModel } from './models-client';
import {
  DEFAULT_ROUTER_PORT,
  PROTOCOL_VERSION,
  routerStateFile,
  type BackendToRouter,
  type BrowserCommand,
  type RouterState,
  type RouterToBackend,
} from './ui-protocol.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UiEntry {
  readonly id: string;
  readonly parentId: string | null;
  readonly timestamp: string | number;
  readonly kind: 'user' | 'assistant' | 'toolResult' | 'custom' | 'other';
  readonly text: string;
  readonly toolName?: string;
  readonly toolCallId?: string;
  readonly isError?: boolean;
}

export interface UiServerOptions {
  readonly port?: number;
  /** In-process dispatcher for slash-command text (runs without an agent turn). */
  readonly dispatch?: (text: string) => void;
  /** What user action started this UI (shown in the Sessions dropdown). */
  readonly initiator?: string;
}

export interface UiServerHandle {
  readonly port: number;
  readonly url: string;
  /** Workspace name (the git branch when the marker was auto-created). */
  readonly name: string;
  readonly reused: boolean;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Outbound broadcast (module-level: index.ts calls these)
// ---------------------------------------------------------------------------

let socket: WebSocket | null = null;
let assignedFolder: string | null = null;

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

/** Fire-and-forget notification to connected browsers. */
export const broadcastNotify = (message: string, level: 'info' | 'warning' | 'error' = 'info'): void => {
  if (assignedFolder !== null) {
    sendToRouter({ type: 'notify', folder: assignedFolder, message, level });
  }
};

const sendToRouter = (msg: BackendToRouter): void => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
};

// ---------------------------------------------------------------------------
// Workspace marker: `<cwd>/.agents/@montflow/workspace.json`
// ---------------------------------------------------------------------------

const WORKSPACE_DIR = ['@montflow'] as const;
const WORKSPACE_FILE = ['@montflow', 'workspace.json'] as const;
const WORKSPACE_VERSION = 1 as const;

interface WorkspaceFile {
  readonly version: number;
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
}

const workspaceFilePath = (cwd: string): string => join(cwd, '.agents', ...WORKSPACE_FILE);

/**
 * Names a new workspace after the current git branch — the branch is the
 * montflow workspace identity. Falls back to the directory name when there
 * is no branch (non-git directory, detached HEAD).
 * @param {string} cwd Working directory
 * @returns The workspace name
 */
const workspaceName = async (cwd: string): Promise<string> => {
  const branch = await Effect.runPromise(getCurrentGitBranch(cwd)).catch(() => Option.none<string>());
  return Option.getOrElse(branch, () => basename(cwd));
};

/**
 * Generates a new workspace id: a compact 8-character hex slug (random,
 * URL-safe, no UUID ceremony). Collision odds are negligible for per-machine
 * workspace identities.
 * @returns The 8-character slug
 */
const newWorkspaceId = (): string => randomBytes(4).toString('hex');

/**
 * Ensure the workspace marker exists for `cwd`, then read it.
 * Generates the file (stable random slug id) when missing; validates when present.
 */
const ensureWorkspace = async (cwd: string): Promise<WorkspaceFile> => {
  const file = workspaceFilePath(cwd);
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WorkspaceFile>;
    if (
      typeof parsed.version !== 'number' ||
      typeof parsed.id !== 'string' ||
      typeof parsed.name !== 'string'
    ) {
      throw new Error('Invalid workspace file shape');
    }
    return parsed as WorkspaceFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const workspace: WorkspaceFile = {
        version: WORKSPACE_VERSION,
        id: newWorkspaceId(),
        name: await workspaceName(cwd),
        createdAt: Date.now(),
      };
      await mkdir(join(cwd, '.agents', ...WORKSPACE_DIR), { recursive: true });
      await writeFile(file, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8');
      return workspace;
    }
    throw new Error(`Invalid .agents/@montflow/workspace.json: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// ---------------------------------------------------------------------------
// Router lifecycle
// ---------------------------------------------------------------------------

const ROUTER_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'router.ts');

const isPidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const healthz = async (port: number): Promise<boolean> => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean; version?: number };
    return body.ok === true && body.version === PROTOCOL_VERSION;
  } catch {
    return false;
  }
};

/** Fetch the full healthz payload; null when the router is unreachable. */
const probeHealth = async (
  port: number,
): Promise<{ ok: boolean; folders: string[] } | null> => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; folders?: string[] };
    return body.ok === true ? { ok: true, folders: body.folders ?? [] } : null;
  } catch {
    return null;
  }
};

export interface RouterStatus {
  readonly running: boolean;
  readonly port?: number;
  readonly pid?: number;
  readonly startedAt?: number;
  readonly version?: number;
  /** Folder ids currently registered with the router. */
  readonly folders?: string[];
}

/**
 * Whether the UI router is running and healthy, with detail for `/montflow
 * status`. Falls back to probing the default port when the state file is
 * stale or missing.
 */
export const getRouterStatus = async (): Promise<RouterStatus> => {
  const state = await readRouterState();
  if (state !== null && isPidAlive(state.pid)) {
    const health = await probeHealth(state.port);
    if (health !== null) {
      return {
        running: true,
        port: state.port,
        pid: state.pid,
        startedAt: state.startedAt,
        version: state.version,
        folders: health.folders,
      };
    }
  }
  const fallback = await probeHealth(DEFAULT_ROUTER_PORT);
  if (fallback !== null) {
    return {
      running: true,
      port: DEFAULT_ROUTER_PORT,
      version: PROTOCOL_VERSION,
      folders: fallback.folders,
    };
  }
  return { running: false };
};

const readRouterState = async (): Promise<RouterState | null> => {
  try {
    const raw = await readFile(routerStateFile(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<RouterState>;
    if (typeof parsed.port !== 'number' || typeof parsed.pid !== 'number') return null;
    return { port: parsed.port, pid: parsed.pid, startedAt: parsed.startedAt ?? Date.now(), version: parsed.version ?? 0 };
  } catch {
    return null;
  }
};

const waitForHealthyRouter = async (portHint?: number, timeoutMs = 8000): Promise<number> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (portHint !== undefined) {
      if (await healthz(portHint)) return portHint;
    } else {
      const state = await readRouterState();
      if (state && isPidAlive(state.pid) && (await healthz(state.port))) return state.port;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Adversarial review UI router did not become healthy in time.');
};

/**
 * The pi session's own id — derived from its session file name (e.g.
 * `2026-08-05T00-30-33-651Z_019fcf54….jsonl` → the name minus extension).
 * Sessions have their own identity; the workspace is just metadata.
 */
const sessionIdOf = (ctx: ExtensionCommandContext): string | undefined => {
  const file = ctx.sessionManager.getSessionFile();
  if (file === null || file === undefined || file === '') return undefined;
  return basename(file).replace(/\.jsonl$/i, '');
};

// ---------------------------------------------------------------------------
// Agentic RUNS (skill/profile/preset/text/prompt) now EXECUTE inside the
// detached router daemon (run-executor.ts) — they survive this pi session.
// The backend only bridges session events + one-shot AI-input text fills.
// ---------------------------------------------------------------------------

/** One-shot AI-input text fill (NOT a run) — shared by textGenerate below. */
const sendTextGen = (
  folder: string,
  runId: string,
  phase: 'start' | 'delta' | 'done' | 'error',
  status: 'running' | 'done' | 'error',
  text: string,
): void => {
  sendToRouter({ type: 'textGen', folder, runId, phase, status, text });
};

/** Ensure the router daemon is running; returns its port. */
const ensureRouter = async (requestedPort?: number): Promise<number> => {
  // An explicit --port is authoritative: reuse a healthy router there or
  // spawn one — never redirect to a different registered port.
  if (requestedPort !== undefined) {
    if (await healthz(requestedPort)) return requestedPort;
    const env = {
      ...process.env,
      WORKSPACE_ROUTER_PORT: String(requestedPort),
    };
    const child = spawn(process.execPath, [ROUTER_SCRIPT], {
      detached: true,
      stdio: 'ignore',
      env,
    });
    child.unref();
    return waitForHealthyRouter(requestedPort);
  }

  const state = await readRouterState();
  if (state && isPidAlive(state.pid) && state.pid !== process.pid) {
    if (await healthz(state.port)) return state.port;
  }

  // State file missing or stale: adopt an already-running healthy router on
  // the default port before spawning a duplicate.
  const probe = DEFAULT_ROUTER_PORT;
  if (await healthz(probe)) return probe;

  const env = {
    ...process.env,
    WORKSPACE_ROUTER_PORT: String(probe),
  };
  const child = spawn(process.execPath, [ROUTER_SCRIPT], {
    detached: true,
    stdio: 'ignore',
    env,
  });
  child.unref();

  return waitForHealthyRouter();
};

// ---------------------------------------------------------------------------
// Session entry snapshot
// ---------------------------------------------------------------------------

const entryKind = (entry: { readonly type: string }): UiEntry['kind'] =>
  entry.type === 'custom' ? 'custom' : 'other';

const snapshotEntries = (ctx: ExtensionCommandContext): UiEntry[] => {
  const toText = (content: unknown): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((block: { readonly type?: string; readonly text?: string }) =>
          block.type === 'text' && typeof block.text === 'string' ? block.text : '',
        )
        .filter((t) => t !== '')
        .join('\n');
    }
    return '';
  };

  return ctx.sessionManager.getEntries().flatMap((entry) => {
    const ts = (value: unknown): string | number =>
      typeof value === 'number' ? value : typeof value === 'string' ? value : Date.now();
    if (entry.type !== 'message') {
      return [
        {
          id: entry.id,
          parentId: entry.parentId ?? null,
          timestamp: ts(entry.timestamp),
          kind: entryKind(entry),
          text: '',
        },
      ];
    }
    const message = entry.message as {
      readonly role?: string;
      readonly content?: unknown;
      readonly toolName?: string;
      readonly toolCallId?: string;
      readonly isError?: boolean;
    };
    const role = message.role;
    const base = {
      id: entry.id,
      parentId: entry.parentId ?? null,
      timestamp: ts(entry.timestamp),
      text: toText(message.content),
    };
    if (role === 'user') return [{ ...base, kind: 'user' as const }];
    if (role === 'assistant') return [{ ...base, kind: 'assistant' as const }];
    if (role === 'toolResult' || role === 'tool') {
      return [
        {
          ...base,
          kind: 'toolResult' as const,
          toolName: message.toolName,
          toolCallId: message.toolCallId,
          isError: message.isError,
        },
      ];
    }
    return [{ ...base, kind: 'other' as const }];
  });
};

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

let activeHandle: UiServerHandle | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let fatalError: string | null = null;

/**
 * Stable per-process identity so the router can tell this pi instance apart
 * from others connected to the same folder (multi-instance support).
 */
let instanceId: string | null = null;
const getInstanceId = (): string => (instanceId ??= `${process.pid}-${randomUUID().slice(0, 6)}`);

/**
 * Connect this pi session to the router as a backend for `ctx.cwd`.
 * Starts the router daemon if it is not already running.
 */
export const startUiServer = async (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  options: UiServerOptions = {},
): Promise<UiServerHandle> => {
  if (activeHandle) return { ...activeHandle, reused: true };
  fatalError = null;

  const cwd = ctx.cwd;
  const workspace = await ensureWorkspace(cwd);
  const port = await ensureRouter(options.port);
  // Workspace page URL: http://127.0.0.1:<port>/w/<workspace-id>/.
  const url = `http://127.0.0.1:${port}/w/${encodeURIComponent(workspace.id)}/`;

  // Never auto-open a browser — just print the URL and let the user decide.

  const closeHandle = (): Promise<void> => {
    if (activeHandle === null) return Promise.resolve();
    activeHandle = null;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    // Runs are owned + persisted by the router daemon now, so there is
    // nothing to flush here — just drop the socket.
    if (assignedFolder) sendToRouter({ type: 'unregister', folder: assignedFolder });
    try {
      socket?.close();
    } catch {
      // ignore
    }
    socket = null;
    assignedFolder = null;
    return Promise.resolve();
  };

  const handle: UiServerHandle = { port, url, name: workspace.name, reused: false, close: closeHandle };
  activeHandle = handle;

  const connect = (attempt: number): void => {
    if (activeHandle === null) return;

    if (fatalError !== null) {
      // Version mismatch etc: do not retry; the user must fix the mismatch.
      return;
    }

    const ws = new WebSocket(`ws://127.0.0.1:${port}/backend`);
    socket = ws;
    let registered = false;

    ws.on('open', () => {
      const payload: BackendToRouter = {
        type: 'register',
        folder: basename(cwd),
        cwd,
        name: basename(cwd),
        version: PROTOCOL_VERSION,
        instanceId: getInstanceId(),
        workspace: { id: workspace.id, name: workspace.name },
        initiator: options.initiator,
        sessionId: sessionIdOf(ctx),
        // The models this session can pick from (scoped set or full
        // catalogue) — the router unions them for the header model picker.
        models: listModelChoices(ctx),
      };
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (data) => {
      let msg: RouterToBackend;
      try {
        msg = JSON.parse(data.toString()) as RouterToBackend;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'ok': {
          registered = true;
          assignedFolder = msg.folder;
          // Runs live in the router daemon (run-executor.ts restores them on
          // register) — nothing to re-broadcast from the backend here.
          // Snapshot for late-joining tabs.
          ws.send(
            JSON.stringify({
              type: 'hello',
              folder: msg.folder,
              hello: {
                entries: snapshotEntries(ctx),
                leafId: ctx.sessionManager.getLeafId(),
                sessionFile: ctx.sessionManager.getSessionFile() ?? null,
              },
            } satisfies BackendToRouter),
          );
          broadcastNotify(`Connected to UI router (folder: ${msg.folder})`, 'info');
          break;
        }

        case 'error': {
          if (msg.code === 'VERSION_MISMATCH') {
            fatalError = msg.message;
            const message =
              `UI router is protocol v${msg.expected}, this extension is v${msg.got}. ` +
              `Restart the router (/montflow --stop, then /montflow) or update the extension.`;
            ctx.ui.notify(message, 'error');
            broadcastNotify(message, 'error');
            ws.close();
            // Release the handle so a re-run of the ui command can retry.
            void closeHandle();
          } else {
            broadcastNotify(`UI router error: ${msg.message}`, 'error');
          }
          break;
        }

        case 'command': {
          handleCommand(msg.command);
          break;
        }

        case 'shutdown': {
          // The router is being killed — close this UI server and do NOT
          // reconnect. The pi session itself keeps running.
          broadcastNotify('UI router shutting down', 'warning');
          void closeHandle();
          break;
        }
      }
    });

    ws.on('close', () => {
      if (socket === ws) socket = null;
      if (activeHandle === null || fatalError !== null) return;
      // Router restarted or dropped us — reconnect with backoff.
      const delay = Math.min(500 * 2 ** attempt, 10000);
      retryTimer = setTimeout(() => connect(attempt + 1), delay);
    });

    ws.on('error', () => {
      // onclose follows; reconnect there.
    });
  };


  const handleCommand = (command: BrowserCommand): void => {
    const text = command.text;
    switch (command.type) {
      // Agentic runs (skillAgentic/profileAgentic/presetAgentic/promptAgentic/
      // textAgentic) and their follow-ups (skillReply/skillSnapshot/
      // skillSetStatus) are handled by the ROUTER, not this backend — the
      // router never forwards them here, so nothing in this switch runs them.

      case 'textGenerate': {
        // One-shot AI-input text fill — explicitly NOT a run: no record, no
        // persistence, no notifications. An ephemeral agent (read-only
        // tools, no session file) answers in a single turn; deltas stream
        // back over the same socket and the SPA inserts the final answer
        // into the field the modal was launched from.
        if (assignedFolder === null) return;
        const folder = assignedFolder;
        const runId = command.runId ?? randomUUID().slice(0, 8);
        sendTextGen(folder, runId, 'start', 'running', '');
        void generateText(ctx.cwd, command.model ?? resolveInitialModel(ctx) ?? '', text, (delta) => {
          sendTextGen(folder, runId, 'delta', 'running', delta);
        }).then((result) => {
          if (result.ok) {
            sendTextGen(folder, runId, 'done', 'done', result.text);
          } else {
            sendTextGen(folder, runId, 'error', 'error', result.error);
          }
        }).catch((cause) => {
          // generateText can reject outright (e.g. no active model throws in
          // createTextAgent) — surface it as a textGen error so the modal
          // unlocks with a real message instead of hanging on "Working…".
          sendTextGen(
            folder,
            runId,
            'error',
            'error',
            cause instanceof Error ? cause.message : String(cause),
          );
        });
        break;
      }

      case 'command':
        if (text.trim() === '' || !options.dispatch) return;
        options.dispatch(text);
        break;
      case 'prompt':
      case 'steer':
      case 'followUp': {
        if (text.trim() === '') return;
        try {
          if (command.type === 'prompt') {
            pi.sendUserMessage(text);
          } else {
            pi.sendUserMessage(text, { deliverAs: command.type });
          }
        } catch (error) {
          broadcastNotify(error instanceof Error ? error.message : String(error), 'error');
        }
        break;
      }
      default:
        break;
    }
  };

  // Forward live pi events to the router.
  const forward = (event: { type: string }): void => {
    if (assignedFolder === null) return;
    sendToRouter({ type: 'event', folder: assignedFolder, event });
  };
  // The session's model changed (e.g. the user ran /model in pi) — refresh
  // the router's model union so the header picker stays accurate.
  pi.on('model_select', () => {
    if (assignedFolder === null) return;
    sendToRouter({
      type: 'modelsChanged',
      folder: assignedFolder,
      models: listModelChoices(ctx),
    });
  });

  pi.on('message_start', forward);
  pi.on('message_update', forward);
  pi.on('message_end', forward);
  pi.on('tool_execution_start', forward);
  pi.on('tool_execution_update', forward);
  pi.on('tool_execution_end', forward);
  pi.on('agent_start', forward);
  pi.on('agent_end', forward);
  pi.on('turn_start', forward);
  pi.on('turn_end', forward);

  // Close the connection when the session tears down (quit, /new, /resume, /reload).
  pi.on('session_shutdown', () => {
    void closeHandle();
  });

  connect(0);
  return handle;
};

/**
 * Stop the machine-level router daemon (used by `/montflow ui
 * --stop`). `kill` additionally ends every registered session first: the
 * router tells each pi backend to close its UI server (no reconnects) and
 * force-terminates all browser connections. Returns true when a router was
 * running and was asked to stop.
 */
export const stopUiServer = async (kill: boolean = false): Promise<boolean> => {
  // A router can be running without a (matching) state file — e.g. one
  // spawned by an older extension before a reload. Probe the state file's
  // port AND the default port so stop always finds every live router.
  const targets: number[] = [];
  const state = await readRouterState();
  if (state !== null && isPidAlive(state.pid)) targets.push(state.port);
  if (!targets.includes(DEFAULT_ROUTER_PORT)) targets.push(DEFAULT_ROUTER_PORT);

  let stopped = false;
  for (const port of targets) {
    const health = await probeHealth(port);
    if (health === null) continue;
    try {
      await fetch(`http://127.0.0.1:${port}${kill ? '/api/kill' : '/api/shutdown'}`, { method: 'POST' });
      stopped = true;
    } catch {
      // keep going — try the next target
    }
  }
  return stopped;
};

/** True while any live router answers healthz on this port. */
const isPortServed = async (port: number): Promise<boolean> =>
  (await probeHealth(port)) !== null;

/**
 * Wait until nothing answers healthz on `port` — the old router has fully
 * exited. `/api/shutdown` returns before the router's ~200ms teardown
 * (terminate sockets, close server, delete the state file) completes, so a
 * restart that starts too early would hand the fresh backend a dying router
 * to connect to. Gives up after the timeout and lets `startUiServer` reuse a
 * router that is still healthy.
 * @param {number} port Router port to watch
 * @param {number} timeoutMs How long to wait before giving up
 * @returns Nothing
 */
const waitForPortFree = async (port: number, timeoutMs = 5000): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isPortServed(port))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

/**
 * Restart the UI server for this workspace (`/montflow restart`): close the
 * local connection (the router forgets this folder), gracefully stop the
 * router daemon, wait for its port to free up, then re-register — spawning a
 * fresh router when none is running. The running router's port is preserved
 * so browsers on a pinned port keep working; other folders' backends
 * reconnect on their own once the fresh router answers.
 * @param {ExtensionAPI} pi Pi extension API
 * @param {ExtensionCommandContext} ctx Command context
 * @param {UiServerOptions} options Same options as {@link startUiServer}
 * @returns The new UI server handle
 */
export const restartUiServer = async (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  options: UiServerOptions = {},
): Promise<UiServerHandle> => {
  // Drop this folder's registration first so the router forgets it, then
  // stop the router daemon itself.
  if (activeHandle !== null) await activeHandle.close();
  const status = await getRouterStatus();
  const runningPort = status.running ? status.port : undefined;
  await stopUiServer();
  if (runningPort !== undefined) await waitForPortFree(runningPort);

  return startUiServer(pi, ctx, { ...options, port: options.port ?? runningPort });
};
