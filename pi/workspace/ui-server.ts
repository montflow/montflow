/**
 * Backend adapter for the workspace web UI.
 *
 * Runs INSIDE the pi process (started by `/workspace ui`). Unlike
 * the old per-folder HTTP server, this adapter connects OUT to a single
 * machine-level router daemon (`router.ts`) and registers this project folder.
 * The router serves the SPA on one port and relays events/commands, so any
 * number of folders share one URL and the UI has a folder picker.
 *
 * - Ensures the router is running (spawns it detached when missing).
 * - Registers with the wire protocol version; a version mismatch is fatal
 *   (two different versions can never coexist behind one router).
 * - Streams pi events + structured loop state to the router; forwards
 *   browser commands (`prompt` / `steer` / `followUp` / `command`) into the
 *   live session via `pi.sendUserMessage` / in-process dispatch.
 */

import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { LoopWidgetState } from './widget';
import { Effect, Option } from 'effect';
import { getCurrentGitBranch } from './git';
import {
  createSkillAgent,
  createProfileAgent,
  createPresetAgent,
  promptSkillAgent,
  wrapSkillPrompt,
  wrapProfilePrompt,
  wrapPresetPrompt,
  disposeSkillAgent,
  isAwaitingAnswer,
  type SkillRunAgent,
} from './skill-run';
import { listModelChoices } from './models-client';
import { generateRunTitle } from './run-title';
import {
  DEFAULT_ROUTER_PORT,
  PROTOCOL_VERSION,
  routerStateFile,
  shortHash,
  type BackendToRouter,
  type BrowserCommand,
  type RouterState,
  type RouterToBackend,
} from './ui-protocol.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UiLoopState {
  readonly cycle: number;
  readonly maxLoops: number;
  readonly supervisor: string;
  readonly supervisorDetail?: string;
  readonly reviewers: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly status: string;
    readonly findingCount?: number;
  }>;
  readonly reconcile: string;
  readonly reconcileDetail?: string;
  readonly fixer: string;
  readonly summary: { readonly open: number; readonly inReview: number; readonly resolved: number; readonly escalated: number; readonly wontFix: number } | null;
  readonly deadlocks: number;
  readonly phase: string;
}

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
// Outbound broadcast (module-level: graph.ts / index.ts call these)
// ---------------------------------------------------------------------------

let socket: WebSocket | null = null;
let latestLoopState: UiLoopState | null = null;
let assignedFolder: string | null = null;

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

/**
 * Normalize the production LoopWidgetState into the JSON-safe wire shape.
 * Production always uses the supervisor (no reconcile step) and tracks
 * `loop`/`cycle` separately — the UI shows loop number / total loops.
 */
const toUiLoopState = (state: LoopWidgetState): UiLoopState => ({
  cycle: state.loop + 1,
  maxLoops: state.maxLoops,
  supervisor: state.supervisor,
  supervisorDetail: state.supervisorDetail,
  reviewers: state.reviewers.map((r) => ({
    id: r.id,
    label: r.label,
    status: r.status,
    findingCount: r.findingCount,
  })),
  reconcile: 'skipped',
  fixer: state.fixer,
  summary: Option.isSome(state.summary) ? state.summary.value : null,
  deadlocks: state.deadlocks,
  phase: state.phase,
});

/** Publish structured loop state. `null` signals the loop finished. */
export const broadcastLoopState = (state: LoopWidgetState | null): void => {
  latestLoopState = state === null ? null : toUiLoopState(state);
  if (assignedFolder !== null) {
    sendToRouter({ type: 'loopState', folder: assignedFolder, state: latestLoopState });
  }
};

/** Get the most recent loop state (for the hello snapshot). */
export const getLatestLoopState = (): UiLoopState | null => latestLoopState;

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
// Agentic skill runs — isolated agent sessions (never the main pi session).
// ---------------------------------------------------------------------------

interface SkillRunEntry {
  readonly role: 'user' | 'assistant';
  text: string;
}

interface SkillRunTool {
  readonly name: string;
  status: 'running' | 'done' | 'error';
  /** Assistant entry index this tool belongs to (for interleaved rendering). */
  readonly turn: number;
}

interface SkillRunRecord {
  readonly runId: string;
  readonly folder: string;
  readonly workspaceId: string;
  /** Project dir the run belongs to (used for persistence + resume). */
  readonly cwd: string;
  /** Short generated title (opencode big-pickle); falls back to the prompt. */
  title?: string;
  agent: SkillRunAgent | null;
  status: 'running' | 'done' | 'awaiting' | 'interrupted' | 'error';
  entries: SkillRunEntry[];
  /** Tool activity in order of appearance (live + for late-join snapshots). */
  tools: SkillRunTool[];
  /** The run agent's persisted pi session file (for resume after a restart). */
  sessionFile?: string;
  readonly createdAt: number;
  updatedAt: number;
}

const skillRuns = new Map<string, SkillRunRecord>();

const newRunId = (): string => randomUUID().slice(0, 8);

const sendSkillGen = (
  folder: string,
  record: SkillRunRecord,
  phase: 'start' | 'delta' | 'tool' | 'title' | 'done' | 'awaiting' | 'error' | 'snapshot',
  entry: number,
  status: SkillRunRecord['status'],
  text: string,
): void => {
  sendToRouter({
    type: 'skillGen',
    folder,
    runId: record.runId,
    workspaceId: record.workspaceId,
    phase,
    entry,
    status,
    text,
    title: record.title,
    entries: phase === 'start' || phase === 'snapshot' ? record.entries : undefined,
    tools: phase === 'start' || phase === 'snapshot' ? record.tools : undefined,
  });
};

// ---------------------------------------------------------------------------
// Persistent run store. Runs (and their agent-session transcripts) live under
// the pi agent dir — `~/.pi/agent/runs/<cwd-slug>/<runId>/` — the same place
// pi keeps the user's own sessions, so runs survive pi and router restarts and
// can be resumed.
// ---------------------------------------------------------------------------

interface PersistedRun {
  readonly runId: string;
  readonly folder: string;
  readonly workspaceId: string;
  readonly cwd: string;
  readonly status: SkillRunRecord['status'];
  readonly entries: SkillRunEntry[];
  readonly tools: SkillRunTool[];
  readonly title?: string;
  readonly sessionFile?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const runsRoot = (cwd: string): string =>
  join(getAgentDir(), 'runs', `${basename(cwd)}--${shortHash(cwd)}`);
const runDir = (cwd: string, runId: string): string => join(runsRoot(cwd), runId);
const runMetaPath = (cwd: string, runId: string): string => join(runDir(cwd, runId), 'run.json');

/** Debounced persistence timers per run (deltas are chatty; terminals flush). */
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

const toPersisted = (record: SkillRunRecord): PersistedRun => ({
  runId: record.runId,
  folder: record.folder,
  workspaceId: record.workspaceId,
  cwd: record.cwd,
  status: record.status,
  entries: record.entries,
  tools: record.tools,
  title: record.title,
  sessionFile: record.sessionFile,
  createdAt: record.createdAt,
  updatedAt: Date.now(),
});

/**
 * Writes a run's metadata to disk, creating the run dir as needed. Failures
 * are swallowed — the in-memory record and the agent's session file remain
 * the source of truth.
 * @param {SkillRunRecord} record The run to write
 * @returns A promise that resolves when the write settles
 */
const writeRunMeta = async (record: SkillRunRecord): Promise<void> => {
  record.updatedAt = Date.now();
  try {
    await mkdir(runDir(record.cwd, record.runId), { recursive: true });
    await writeFile(
      runMetaPath(record.cwd, record.runId),
      `${JSON.stringify(toPersisted(record), null, 2)}\n`,
      'utf8',
    );
  } catch {
    // ignore — transient write failures are non-fatal
  }
};

/**
 * Persists a run's metadata. Terminal phases and run start flush immediately;
 * delta-heavy updates are debounced.
 * @param {SkillRunRecord} record The run to persist
 * @param {boolean} [immediate] True to flush now instead of debouncing
 * @returns Nothing
 */
const persistRun = (record: SkillRunRecord, immediate = false): void => {
  const pending = persistTimers.get(record.runId);
  if (pending !== undefined) clearTimeout(pending);
  if (immediate) {
    persistTimers.delete(record.runId);
    void writeRunMeta(record);
    return;
  }
  persistTimers.set(
    record.runId,
    setTimeout(() => {
      persistTimers.delete(record.runId);
      void writeRunMeta(record);
    }, 800),
  );
};

/**
 * Loads every persisted run for a project into the in-memory store so runs
 * survive pi restarts. Runs that were mid-turn when the process died keep
 * their transcript but are marked `interrupted` (no live agent; answering
 * resumes them from their session file).
 * @param {string} cwd The project directory
 * @returns Nothing
 */
const restoreRuns = async (cwd: string): Promise<void> => {
  const root = runsRoot(cwd);
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return; // nothing persisted yet
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runId = entry.name;
    try {
      const raw = await readFile(runMetaPath(cwd, runId), 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedRun>;
      if (typeof parsed.runId !== 'string' || parsed.runId === '') continue;
      skillRuns.set(parsed.runId, {
        runId: parsed.runId,
        folder: typeof parsed.folder === 'string' ? parsed.folder : basename(cwd),
        workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : '',
        cwd,
        title: typeof parsed.title === 'string' ? parsed.title : undefined,
        agent: null,
        status:
          parsed.status === 'running' ? 'interrupted' : (parsed.status ?? 'interrupted'),
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        tools: Array.isArray(parsed.tools) ? parsed.tools : [],
        sessionFile:
          typeof parsed.sessionFile === 'string' ? parsed.sessionFile : undefined,
        createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      });
    } catch {
      // Corrupt or unreadable run — skip it.
    }
  }
};

/** Creates the initial record for a new agentic run (skill or profile). */
const makeRunRecord = (
  runId: string,
  folder: string,
  workspaceId: string,
  cwd: string,
  text: string,
): SkillRunRecord => ({
  runId,
  folder,
  workspaceId,
  cwd,
  agent: null,
  status: 'running',
  entries: [
    { role: 'user', text },
    { role: 'assistant', text: '' },
  ],
  tools: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

/**
 * Runs one agent turn for an agentic run (skill or profile). Creates the
 * agent on the first turn (with a per-run model override and session dir),
 * streams deltas + tool activity to the browser, and marks the run
 * done/awaiting/error. Follow-up replies (skillReply) reuse the existing
 * agent or resume it from its persisted session file.
 * @param {SkillRunRecord} record The run record (entries already set up)
 * @param {string} folder The assigned folder id
 * @param {string} prompt The wrapped prompt to send
 * @param {(model?: string) => Promise<SkillRunAgent>} makeAgent Creates/resumes the agent when the run has none
 * @param {string | undefined} model Per-run model override (`provider/model-id`)
 * @returns Nothing
 */
const runAgentTurn = (
  record: SkillRunRecord,
  folder: string,
  prompt: string,
  makeAgent: (model?: string) => Promise<SkillRunAgent>,
  model?: string,
): void => {
  void (async () => {
    const assistantIdx = record.entries.length - 1;
    if (record.agent === null) {
      try {
        record.agent = await makeAgent(model);
        record.sessionFile = record.agent.sessionFile;
        persistRun(record, true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        record.status = 'error';
        record.entries[assistantIdx]!.text = message;
        persistRun(record, true);
        sendSkillGen(folder, record, 'error', assistantIdx, 'error', message);
        return;
      }
    }
    const result = await promptSkillAgent(
      record.agent,
      prompt,
      (delta) => {
        record.entries[assistantIdx]!.text += delta;
        persistRun(record);
        sendSkillGen(folder, record, 'delta', assistantIdx, 'running', delta);
      },
      (activity) => {
        if (activity.kind === 'start') {
          record.tools.push({ name: activity.tool, status: 'running', turn: assistantIdx });
          persistRun(record);
          sendSkillGen(folder, record, 'tool', assistantIdx, 'running', activity.tool);
        } else {
          const tool = [...record.tools].reverse().find((t) => t.name === activity.tool && t.status === 'running');
          if (tool !== undefined) tool.status = activity.kind === 'error' ? 'error' : 'done';
          persistRun(record);
          sendSkillGen(folder, record, 'tool', assistantIdx, activity.kind === 'error' ? 'error' : 'done', activity.tool);
        }
      },
    );
    record.status = result.ok
      ? isAwaitingAnswer(record.entries[assistantIdx]!.text)
        ? 'awaiting'
        : 'done'
      : 'error';
    if (!result.ok && record.entries[assistantIdx]!.text === '') {
      record.entries[assistantIdx]!.text = result.error;
    }
    persistRun(record, true);
    sendSkillGen(folder, record, record.status, assistantIdx, record.status, record.entries[assistantIdx]!.text);
  })();
};

/**
 * Loads the workspace's authoring-skills SKILL.md when present (used when the
 * user toggles "include authoring skill"). Returns undefined when missing.
 * @param {string} cwd The workspace directory
 * @returns The skill's SKILL.md content, or undefined
 */
const loadAuthoringSkill = async (cwd: string): Promise<string | undefined> => {
  try {
    return await readFile(join(cwd, '.agents', 'skills', 'authoring-skills', 'SKILL.md'), 'utf8');
  } catch {
    return undefined; // skill does not exist — toggle is harmless
  }
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
  // Restore persisted runs (survive pi restarts).
  await restoreRuns(cwd);
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
    // Flush pending run persistence, then release isolated skill-run agent
    // sessions owned by this folder. Runs stay on disk and are restored on
    // the next start.
    const flushes: Promise<void>[] = [];
    for (const [runId, record] of skillRuns) {
      flushes.push(writeRunMeta(record));
      if (record.agent !== null) void disposeSkillAgent(record.agent);
      skillRuns.delete(runId);
    }
    for (const timer of persistTimers.values()) clearTimeout(timer);
    persistTimers.clear();
    if (assignedFolder) sendToRouter({ type: 'unregister', folder: assignedFolder });
    try {
      socket?.close();
    } catch {
      // ignore
    }
    socket = null;
    assignedFolder = null;
    return Promise.all(flushes).then(() => undefined);
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
          // Re-broadcast every known run (including ones restored from disk)
          // so browsers and the router's cache see them after a reconnect /
          // router restart — without the user having to open each run.
          for (const [, record] of skillRuns) {
            sendSkillGen(msg.folder, record, 'snapshot', 0, record.status, '');
          }
          // Snapshot for late-joining tabs.
          ws.send(
            JSON.stringify({
              type: 'hello',
              folder: msg.folder,
              hello: {
                entries: snapshotEntries(ctx),
                leafId: ctx.sessionManager.getLeafId(),
                sessionFile: ctx.sessionManager.getSessionFile() ?? null,
                loopState: getLatestLoopState(),
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

  /** Kinds of agentic runs the UI can start. */
  type AgenticRunKind = 'skill' | 'profile' | 'preset';

  /** Options for {@link startAgenticRun}. */
  interface StartAgenticRunOptions {
    /** Client-generated run id; a short id is generated when omitted. */
    runId?: string;
    /** The user's raw request text (stored as the first transcript entry). */
    text: string;
    /** Existing preset name for preset runs that modify in place. */
    presetName?: string;
    /** Existing skill id (directory slug) for skill runs that modify in place. */
    skillName?: string;
    /** Existing profile name for profile runs that modify in place. */
    profileName?: string;
    /** Include the workspace's authoring-skills skill (skill runs). */
    useAuthoringSkill?: boolean;
    /** Per-run model override (`provider/model-id`). */
    model?: string;
    /**
     * Prefix for the generated title (e.g. `[skill-create]`). When omitted a
     * per-kind default is used; pass `''` to disable the prefix entirely.
     */
    titlePrefix?: string;
  }

  /**
   * Creates and starts an agentic run — the SINGLE entry point every
   * agentic creation/modification flow funnels through (skill, profile,
   * preset). The run gets its own isolated, resumable agent session under
   * `~/.pi/agent/runs/<cwd-slug>/<runId>/`; the start is broadcast, then
   * live deltas and tool activity are streamed to the browser.
   * @param {AgenticRunKind} kind Which authoring agent to run
   * @param {StartAgenticRunOptions} opts Run identity, request, prompt hooks
   * @returns Nothing
   */
  const startAgenticRun = (kind: AgenticRunKind, opts: StartAgenticRunOptions): void => {
    if (opts.text.trim() === '' || assignedFolder === null) return;
    const folder = assignedFolder;
    const runId = opts.runId ?? newRunId();
    const record = makeRunRecord(runId, folder, workspace.id, cwd, opts.text);
    skillRuns.set(runId, record);
    persistRun(record, true);
    sendSkillGen(folder, record, 'start', 0, 'running', opts.text);
    // Title prefix: per-kind default unless the caller overrides (or passes
    // '' to disable). e.g. `[skill-create] Audit PRs`.
    const titlePrefix =
      opts.titlePrefix ??
      (kind === 'skill'
        ? '[skill-create]'
        : kind === 'profile'
          ? '[profile-create]'
          : opts.presetName !== undefined
            ? '[preset-edit]'
            : '[preset-create]');
    // Generate a short title from the prompt via opencode's big-pickle
    // model. Fire-and-forget: any failure falls back to the prompt itself,
    // which is exactly what the UI showed before titles existed.
    void generateRunTitle(opts.text, { prefix: titlePrefix }).then((title) => {
      if (title === null || title === '') return;
      record.title = title;
      persistRun(record, true);
      sendSkillGen(folder, record, 'title', 0, record.status, title);
    });
    void (async () => {
      const authoringSkill =
        kind === 'skill' && opts.useAuthoringSkill === true
          ? await loadAuthoringSkill(cwd)
          : undefined;
      const prompt =
        kind === 'skill'
          ? wrapSkillPrompt(opts.text, authoringSkill, opts.skillName)
          : kind === 'profile'
            ? wrapProfilePrompt(opts.text, opts.profileName)
            : wrapPresetPrompt(opts.text, opts.presetName);
      const makeAgent = (model?: string): Promise<SkillRunAgent> =>
        kind === 'skill'
          ? createSkillAgent(ctx, model, { sessionDir: runDir(cwd, runId) })
          : kind === 'profile'
            ? createProfileAgent(ctx, model, { sessionDir: runDir(cwd, runId) })
            : createPresetAgent(ctx, model, { sessionDir: runDir(cwd, runId) });
      runAgentTurn(record, folder, prompt, makeAgent, opts.model);
    })();
  };

  const handleCommand = (command: BrowserCommand): void => {
    const text = command.text;
    switch (command.type) {
      case 'skillAgentic': {
        // Agentic skill creation runs in its OWN isolated agent session
        // (never touches the user's main pi session). The conversation is
        // persisted to a pi session file so the run survives restarts and can
        // be resumed. Streams live deltas and tool activity to the browser;
        // the user can reply on the run page (skillReply).
        startAgenticRun('skill', {
          runId: command.runId,
          text,
          useAuthoringSkill: command.useAuthoringSkill,
          skillName: command.skillName,
          model: command.model,
        });
        break;
      }

      case 'profileAgentic': {
        // Agentic profile creation/modification — same isolated, persistent
        // run machinery as skills, but the agent authors (or edits in place)
        // a `.agents/@montflow/profiles/<name>/PROFILE.md`. `profileName`
        // (when present) targets an existing profile so the run modifies it
        // instead of creating a duplicate.
        startAgenticRun('profile', {
          runId: command.runId,
          text,
          profileName: command.profileName,
          model: command.model,
        });
        break;
      }

      case 'presetAgentic': {
        // Agentic preset creation/modification — same isolated, persistent
        // run machinery as skills/profiles, but the agent authors (or edits
        // in place) a `.agents/@montflow/review-presets/<name>.json` config.
        // `presetName` (when present) targets an existing preset so the run
        // modifies it instead of creating a duplicate.
        startAgenticRun('preset', {
          runId: command.runId,
          text,
          presetName: command.presetName,
          model: command.model,
        });
        break;
      }

      case 'skillReply': {
        // A follow-up answer from the user — the agent session keeps its
        // context and continues. When the agent is gone (process restarted),
        // it is recreated from the run's persisted session file so the
        // conversation picks up where it left off.
        if (text.trim() === '' || assignedFolder === null) return;
        const runId = command.runId ?? '';
        const record = skillRuns.get(runId);
        if (record === undefined || record.status === 'running') return;
        const folder = assignedFolder;
        record.entries.push({ role: 'user', text });
        record.entries.push({ role: 'assistant', text: '' });
        record.status = 'running';
        persistRun(record, true);
        const userIdx = record.entries.length - 2;
        sendSkillGen(folder, record, 'start', userIdx, 'running', text);
        runAgentTurn(
          record,
          folder,
          text,
          (model) => {
            if (record.sessionFile === undefined) {
              return Promise.reject(new Error('Agent no longer available — start a new run.'));
            }
            return createSkillAgent(ctx, model, {
              sessionDir: runDir(record.cwd, runId),
              resumeSessionFile: record.sessionFile,
            });
          },
          command.model,
        );
        break;
      }

      case 'skillSnapshot': {
        // Full transcript for a late-joining tab / page reload.
        const runId = command.runId ?? '';
        const record = skillRuns.get(runId);
        if (record === undefined) return;
        const folder = assignedFolder ?? record.folder;
        sendSkillGen(folder, record, 'snapshot', 0, record.status, '');
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
 * Stop the machine-level router daemon (used by `/workspace ui
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
