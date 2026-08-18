/**
 * Router daemon for the workspace web UI.
 *
 * A single detached process serving ONE port for ALL project folders. Each pi
 * process runs a backend adapter (`ui-server.ts`) that connects OUT to this
 * router and registers its folder; browsers connect to `/ws` and pick a folder.
 *
 * Run directly: `node router.ts` (Node >= 23.6 type-stripping, or pass
 * `--experimental-strip-types`). Normally spawned detached by the backend.
 *
 * Wire protocol (see ui-protocol.ts):
 * - pi backends connect to `/backend`, register with their protocol version,
 *   stream events + agentic-run streams, receive commands.
 * - Browsers connect to `/ws`, get the folder list + cached per-folder state,
 *   send folder-tagged commands.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { execFileSync } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { Schema } from 'effect';
import { ReviewPresetFromJson, ReviewPresetSchema } from './preset-schema.ts';
import { openRunStore, type RunStore, type StoredRun } from './run-store.ts';
import { parseProfile, parseFrontmatter } from './profiles/model.ts';
import {
  DEFAULT_ROUTER_PORT,
  PORT_SCAN_LIMIT,
  PROTOCOL_VERSION,
  shortHash,
  routerStateDir,
  routerStateFile,
  type BackendToRouter,
  type BrowserToRouter,
  type FolderInfo,
  type ModelChoice,
  type RouterToBackend,
  type RouterToBrowser,
} from './ui-protocol.ts';

const DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), 'ui', 'dist');

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface BackendConn {
  readonly socket: WebSocket;
  readonly instanceId: string;
  readonly info: FolderInfo;
}

const backends = new Map<string, BackendConn>();
const browserSockets = new Set<WebSocket>();
const cachedHello = new Map<string, unknown>();
let currentPort = 0;

// ---------------------------------------------------------------------------
// Agentic-run model picker
// ---------------------------------------------------------------------------

/** Pickable models per folder id, reported by each backend at register time. */
const folderModels = new Map<string, readonly ModelChoice[]>();

/**
 * The pickable models offered to the picker: the union across all connected
 * backends, deduped by `provider/model-id`. `isCurrent` is sticky — a model
 * is flagged current when ANY backend session has it active.
 * @returns The sorted, deduped model choices
 */
const modelChoices = (): ModelChoice[] => {
  const byId = new Map<string, ModelChoice>();
  for (const list of folderModels.values()) {
    for (const model of list) {
      const existing = byId.get(model.id);
      if (existing === undefined) {
        byId.set(model.id, model);
      } else if (model.isCurrent && !existing.isCurrent) {
        byId.set(model.id, { ...existing, isCurrent: true });
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/** The persisted model selection for agentic runs (null = follow session). */
let selectedModel: string | null = null;
const modelStateFile = (): string => join(routerStateDir(), 'models.json');

const loadModelSelection = async (): Promise<void> => {
  try {
    const raw = await readFile(modelStateFile(), 'utf8');
    const parsed = JSON.parse(raw) as { selected?: unknown };
    selectedModel = typeof parsed.selected === 'string' && parsed.selected !== '' ? parsed.selected : null;
  } catch {
    // first run
  }
};

const persistModelSelection = async (): Promise<void> => {
  await mkdir(routerStateDir(), { recursive: true });
  await writeFile(modelStateFile(), `${JSON.stringify({ selected: selectedModel }, null, 2)}\n`, 'utf8');
};

/** Broadcast the current picker state (models + selection) to every browser. */
const broadcastModels = (): void => {
  broadcastToBrowsers({ type: 'modelsChanged', models: modelChoices(), selected: selectedModel });
};

const folderList = (): FolderInfo[] =>
  [...backends.values()].map((b) => ({
    ...b.info,
    // Re-apply a persisted rename on top of the backend's default name.
    name:
      b.info.sessionId !== undefined
        ? (sessionNames.get(b.info.sessionId) ?? b.info.name)
        : b.info.name,
  }));

const broadcastToBrowsers = (msg: RouterToBrowser): void => {
  const data = JSON.stringify(msg);
  for (const socket of browserSockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  }
};

const broadcastFolders = (): void => {
  broadcastToBrowsers({ type: 'folders', folders: folderList(), port: currentPort });
};

/**
 * Best-effort folder slug for a workspace path: the connected backend's id,
 * or the default slug (basename) when no backend is connected right now.
 */
const folderForCwd = (cwd: string): string | null => {
  for (const [, conn] of backends) {
    if (conn.info.cwd === cwd) return conn.info.id;
  }
  return basename(cwd);
};

/** Tell every browser that a skill changed in a workspace (created/updated/deleted). */
const broadcastSkillChanged = (
  cwd: string,
  workspaceId: string,
  skillId: string,
  kind: 'created' | 'updated' | 'deleted',
): void => {
  broadcastToBrowsers({
    type: 'skillChanged',
    folder: folderForCwd(cwd),
    workspaceId,
    skillId,
    kind,
  });
};

/** Tell every browser that a profile changed in a workspace (created/deleted). */
const broadcastProfileChanged = (
  cwd: string,
  workspaceId: string,
  profileName: string,
  kind: 'created' | 'updated' | 'deleted',
): void => {
  broadcastToBrowsers({
    type: 'profileChanged',
    folder: folderForCwd(cwd),
    workspaceId,
    profileName,
    kind,
  });
};

/** Tell every browser that a review preset changed in a workspace (created/updated/deleted). */
const broadcastPresetChanged = (
  cwd: string,
  workspaceId: string,
  presetName: string,
  kind: 'created' | 'updated' | 'deleted',
): void => {
  broadcastToBrowsers({
    type: 'presetChanged',
    folder: folderForCwd(cwd),
    workspaceId,
    presetName,
    kind,
  });
};

// ---------------------------------------------------------------------------
// Backend (pi) connections
// ---------------------------------------------------------------------------

const handleBackendMessage = async (socket: WebSocket, raw: string): Promise<void> => {
  let msg: BackendToRouter;
  try {
    msg = JSON.parse(raw) as BackendToRouter;
  } catch {
    return;
  }

  switch (msg.type) {
    case 'register': {
      // Version gate: two different protocol versions can never coexist.
      if (msg.version !== PROTOCOL_VERSION) {
        const payload: RouterToBackend = {
          type: 'error',
          code: 'VERSION_MISMATCH',
          message:
            `Router runs UI protocol v${PROTOCOL_VERSION}, this extension speaks v${msg.version}. ` +
            `Restart the router (/montflow --stop, then /montflow) or update the extension.`,
          expected: PROTOCOL_VERSION,
          got: msg.version,
        };
        socket.send(JSON.stringify(payload));
        socket.close();
        return;
      }



      // Folder id: base slug for the first instance in a folder; later
      // instances in the SAME folder get a per-instance suffix so multiple
      // pi sessions can consume the router simultaneously (we never stop one).
      const base = msg.folder;
      const others = [...backends.values()].filter(
        (b) => b.info.cwd === msg.cwd && b.instanceId !== msg.instanceId,
      );
      const id = others.length === 0 ? base : `${base}--${shortHash(msg.instanceId)}`;
      const name = others.length === 0 ? msg.name : `${msg.name} #${others.length + 1}`;

      // Workspace: persist the marker-file identity so the router knows where
      // this workspace lives even after the pi session disconnects.
      const workspace = msg.workspace;
      if (workspace && typeof workspace.id === 'string' && typeof workspace.name === 'string') {
        await upsertWorkspace({
          id: workspace.id,
          name: workspace.name,
          path: msg.cwd,
        });
      }

      // Reconnect of the SAME instance: replace only its own stale socket,
      // never a different live instance.
      for (const [key, conn] of backends) {
        if (conn.info.cwd === msg.cwd && conn.instanceId === msg.instanceId) {
          try {
            conn.socket.close();
          } catch {
            // ignore
          }
          backends.delete(key);
          break;
        }
      }

      backends.set(id, {
        socket,
        instanceId: msg.instanceId,
        info: {
          id,
          cwd: msg.cwd,
          name,
          version: msg.version,
          connectedAt: Date.now(),
          initiator: msg.initiator,
          sessionId: msg.sessionId,
          workspaceName: msg.workspace?.name,
        },
      });

      // Remember the session's pickable models for the header model picker.
      folderModels.set(id, msg.models ?? []);

      const ok: RouterToBackend = { type: 'ok', folder: id };
      socket.send(JSON.stringify(ok));
      broadcastFolders();
      broadcastModels();
      return;
    }

    case 'modelsChanged':
      folderModels.set(msg.folder, msg.models);
      broadcastModels();
      return;

    case 'hello':
      cachedHello.set(msg.folder, msg.hello);
      broadcastToBrowsers({ type: 'hello', folder: msg.folder, hello: msg.hello });
      return;

    case 'event':
      broadcastToBrowsers({ type: 'event', folder: msg.folder, event: msg.event });
      return;

    case 'notify':
      broadcastToBrowsers({
        type: 'notify',
        folder: msg.folder,
        message: msg.message,
        level: msg.level,
      });
      return;

    // One-shot AI-input text fill — forwarded as-is (no run cache, no
    // folder map entry, no persistence).
    case 'textGen':
      broadcastToBrowsers({
        type: 'textGen',
        folder: msg.folder,
        runId: msg.runId,
        phase: msg.phase,
        status: msg.status,
        text: msg.text,
      });
      return;

    case 'sessionChanged':
      broadcastToBrowsers({
        type: 'sessionChanged',
        folder: msg.folder,
        sessionId: msg.sessionId,
      });
      return;

    case 'skillGen': {
      // Remember which folder owns a run so skillReply/skillSnapshot
      // commands can be routed to the right backend by run id alone.
      runFolder.set(msg.runId, msg.folder);
      cacheSkillGen(msg);
      broadcastToBrowsers({
        type: 'skillGen',
        folder: msg.folder,
        runId: msg.runId,
        workspaceId: msg.workspaceId,
        phase: msg.phase,
        entry: msg.entry,
        status: msg.status,
        text: msg.text,
        title: msg.title,
        entries: msg.entries,
        tools: msg.tools,
      });
      return;
    }

    case 'unregister': {
      dropBackend(msg.folder);
      return;
    }
  }
};

const dropBackend = (folder: string): void => {
  const conn = backends.get(folder);
  if (!conn) return;
  backends.delete(folder);
  cachedHello.delete(folder);
  folderModels.delete(folder);
  broadcastToBrowsers({ type: 'folderGone', folder });
  broadcastFolders();
  broadcastModels();
};

const sendCommandToBackend = (folder: string, command: BrowserToRouter['command']): boolean => {
  const conn = backends.get(folder);
  if (!conn || conn.socket.readyState !== WebSocket.OPEN) return false;
  const payload: RouterToBackend = { type: 'command', folder, command };
  conn.socket.send(JSON.stringify(payload));
  return true;
};

/** run id → folder, learned from skillGen broadcasts (for late-join routing). */
const runFolder = new Map<string, string>();

// ---------------------------------------------------------------------------
// Agentic skill runs — cached transcripts so late-joining tabs / page reloads
// can recover even after the owning backend disconnects (mirrors cachedHello,
// which already survives backend disconnects).
// ---------------------------------------------------------------------------

interface CachedRun {
  readonly folder: string;
  readonly workspaceId: string;
  readonly status: 'running' | 'done' | 'awaiting' | 'interrupted' | 'error';
  readonly entries: readonly { readonly role: 'user' | 'assistant'; readonly text: string }[];
  readonly tools: readonly {
    readonly name: string;
    readonly status: 'running' | 'done' | 'error';
    readonly turn: number;
  }[];
  /** Short generated title (opencode big-pickle); undefined until ready. */
  readonly title?: string;
  /** Epoch ms of the last cache merge (also persisted to the store). */
  readonly updatedAt: number;
}

const cachedRuns = new Map<string, CachedRun>();

/** Durable snapshot store (SQLite) — null when node:sqlite is unavailable. */
let runStore: RunStore | null = null;
/** Debounced store upserts per run (deltas are chatty; start/terminal flush). */
const storeTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Persist a cached run to the SQLite store. Deltas are debounced (800ms,
 * same as the backend's run.json writes); start/snapshot and terminal
 * phases flush immediately.
 * @param {string} runId The run id
 * @param {CachedRun} run The current cached state
 * @param {boolean} immediate True to flush now instead of debouncing
 * @returns Nothing
 */
const persistRunToStore = (runId: string, run: CachedRun, immediate: boolean): void => {
  if (runStore === null) return;
  const stored: StoredRun = {
    runId,
    folder: run.folder,
    workspaceId: run.workspaceId,
    status: run.status,
    entries: run.entries,
    tools: run.tools,
    title: run.title,
    updatedAt: run.updatedAt,
  };
  const pending = storeTimers.get(runId);
  if (pending !== undefined) clearTimeout(pending);
  if (immediate) {
    storeTimers.delete(runId);
    runStore.upsert(stored);
    return;
  }
  storeTimers.set(
    runId,
    setTimeout(() => {
      storeTimers.delete(runId);
      runStore?.upsert(stored);
    }, 800),
  );
};

/**
 * Merges one skillGen chunk into the router's run cache. `start`/`snapshot`
 * carry the full transcript; `delta` appends to the assistant entry; `tool`
 * phases append/close tool activity; the terminal phases set the status and
 * fill in an empty assistant entry. Each merged state is mirrored to the
 * SQLite store (immediate on start/terminal, debounced otherwise).
 * @param {Extract<BackendToRouter, { type: 'skillGen' }>} msg The chunk
 * @returns Nothing
 */
const cacheSkillGen = (msg: Extract<BackendToRouter, { type: 'skillGen' }>): void => {
  const prev = cachedRuns.get(msg.runId);
  let next: CachedRun;
  let immediate = false;
  if (msg.phase === 'start' || msg.phase === 'snapshot' || prev === undefined) {
    next = {
      folder: msg.folder,
      workspaceId: msg.workspaceId,
      status: msg.status,
      entries: [...(msg.entries ?? [])],
      tools: [...(msg.tools ?? [])],
      title: msg.title,
      updatedAt: Date.now(),
    };
    immediate = true;
  } else if (msg.phase === 'title') {
    // The generated title arrived — replace it (also flushed to the store).
    next = { ...prev, title: msg.title, updatedAt: Date.now() };
    immediate = true;
  } else if (msg.phase === 'delta') {
    next = {
      ...prev,
      entries: prev.entries.map((entry, index) =>
        index === msg.entry ? { ...entry, text: entry.text + msg.text } : entry,
      ),
      updatedAt: Date.now(),
    };
  } else if (msg.phase === 'tool') {
    const tools = [...prev.tools];
    if (msg.status === 'running') {
      tools.push({ name: msg.text, status: 'running', turn: msg.entry });
    } else {
      const tool = [...tools].reverse().find((t) => t.name === msg.text && t.status === 'running');
      if (tool !== undefined) {
        const idx = tools.indexOf(tool);
        // Tool phases only ever carry running/done/error — never awaiting.
        tools[idx] = { ...tool, status: msg.status === 'error' ? 'error' : 'done' };
      }
    }
    next = { ...prev, tools, updatedAt: Date.now() };
  } else {
    // done / awaiting / error — terminal, flush to the store now.
    next = {
      ...prev,
      status: msg.status,
      entries: prev.entries.map((entry, index) =>
        index === msg.entry && entry.text === '' ? { ...entry, text: msg.text } : entry,
      ),
      updatedAt: Date.now(),
    };
    immediate = true;
  }
  cachedRuns.set(msg.runId, next);
  persistRunToStore(msg.runId, next, immediate);
};

/** Router-generated skillGen payload for a run that cannot be loaded. */
const notFoundRun = (runId: string, folder: string): RouterToBrowser => ({
  type: 'skillGen',
  folder,
  runId,
  workspaceId: '',
  phase: 'error',
  entry: 0,
  status: 'error',
  text: 'Run not found',
  entries: [
    { role: 'user', text: '' },
    {
      role: 'assistant',
      text:
        'This run could not be loaded: no pi session is connected (start /montflow in the project session) and the router has no record of it. ' +
        'Start a new skill run instead.',
    },
  ],
});

// ---------------------------------------------------------------------------
// HTTP + WebSocket servers
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

const sendFile = async (res: ServerResponse, filePath: string): Promise<void> => {
  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
};

/** SPA fallback: real files (assets) are served, everything else gets index.html. */
const sendPage = async (res: ServerResponse, pathname: string): Promise<void> => {
  const candidate = resolveStaticPath(pathname);
  try {
    const content = await readFile(candidate);
    res.writeHead(200, {
      'content-type': MIME[extname(candidate)] ?? 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    });
    res.end(content);
    return;
  } catch {
    // not a real file → SPA route
  }
  try {
    const index = await readFile(join(DIST_DIR, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(index);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('SPA not built');
  }
};

const resolveStaticPath = (pathname: string): string => {
  const decoded = decodeURIComponent(pathname);
  let relative = decoded.replace(/^\/+/, '');
  if (relative === '') relative = 'index.html';
  const candidate = resolve(DIST_DIR, relative);
  if (!candidate.startsWith(resolve(DIST_DIR) + sep) && candidate !== resolve(DIST_DIR)) {
    return join(DIST_DIR, 'index.html');
  }
  return candidate;
};

// ---------------------------------------------------------------------------
// Workspace registry — persisted in the router state dir so the router knows
// where each workspace lives even when no pi session is connected.
// ---------------------------------------------------------------------------

interface WorkspaceRecord {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly lastSeen: number;
}

const workspaces = new Map<string, WorkspaceRecord>();
const workspacesFile = (): string => join(routerStateDir(), 'workspaces.json');

const loadWorkspaces = async (): Promise<void> => {
  try {
    const raw = await readFile(workspacesFile(), 'utf8');
    const list = JSON.parse(raw) as WorkspaceRecord[];
    workspaces.clear();
    for (const w of list) workspaces.set(w.id, w);
  } catch {
    // first run
  }
};

const persistWorkspaces = async (): Promise<void> => {
  await mkdir(routerStateDir(), { recursive: true });
  await writeFile(workspacesFile(), JSON.stringify([...workspaces.values()], null, 2), 'utf8');
};

const upsertWorkspace = async (w: {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}): Promise<void> => {
  const existing = workspaces.get(w.id);
  workspaces.set(w.id, { id: w.id, name: w.name, path: w.path, lastSeen: Date.now() });
  if (existing === undefined || existing.path !== w.path || existing.name !== w.name) {
    await persistWorkspaces();
  }
};

const workspaceList = (): WorkspaceRecord[] =>
  [...workspaces.values()].sort((a, b) => a.name.localeCompare(b.name));

const workspaceConnected = (w: WorkspaceRecord): boolean =>
  [...backends.values()].some((b) => b.info.cwd === w.path);

const workspacePath = (id: string): string | undefined => workspaces.get(id)?.path;

// ---------------------------------------------------------------------------
// Session display names — user renames persist across restarts and apply on
// reconnect (a folder's name resets to its default when its backend
// re-registers, so the override is re-applied in folderList).
// ---------------------------------------------------------------------------

const sessionNames = new Map<string, string>();
const sessionsFile = (): string => join(routerStateDir(), 'sessions.json');

const loadSessionNames = async (): Promise<void> => {
  try {
    const raw = await readFile(sessionsFile(), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, string>;
    sessionNames.clear();
    for (const [id, name] of Object.entries(parsed)) {
      if (typeof id === 'string' && typeof name === 'string') sessionNames.set(id, name);
    }
  } catch {
    // first run
  }
};

const persistSessionNames = async (): Promise<void> => {
  await mkdir(routerStateDir(), { recursive: true });
  await writeFile(sessionsFile(), JSON.stringify(Object.fromEntries(sessionNames), null, 2), 'utf8');
};


// ---------------------------------------------------------------------------
// Workspace git info — folder name, repo name, current branch. Computed per
// request because the branch and remote can change while the router runs.
// ---------------------------------------------------------------------------

/** Runs a git command in `cwd`; null when git fails or the dir is not a repo. */
const gitRun = (cwd: string, args: readonly string[]): string | null => {
  try {
    const out = execFileSync('git', [...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out === '' ? null : out;
  } catch {
    return null;
  }
};

/** Extracts `owner/repo` from a remote URL, e.g. `.../org/repo.git` → `org/repo`. */
const repoNameFromUrl = (url: string): string => {
  const withoutGit = url.trim().replace(/\.git\/?$/, '');
  if (withoutGit === '') return '';
  const parts = withoutGit.split(/[/:]/).filter((part) => part !== '');
  return parts.slice(-2).join('/');
};

// ---------------------------------------------------------------------------
// Profiles — read-only listing of `.agents/@montflow/profiles/<name>/PROFILE.md`.
// ---------------------------------------------------------------------------

const PROFILE_DIR = ['.agents', '@montflow', 'profiles'] as const;
const PROFILE_FILE = 'PROFILE.md';

interface ProfileSummary {
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly skills: readonly string[];
}

interface ProfileDetail extends ProfileSummary {
  readonly instructions: string; // ## Instructions body (markdown)
  readonly checklist: readonly string[]; // ## Review Checklist items
  readonly markdown: string; // raw PROFILE.md (frontmatter + body)
}

const listProfiles = async (cwd: string): Promise<ProfileSummary[]> => {
  const root = join(cwd, ...PROFILE_DIR);
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return []; // directory missing → no profiles yet
  }
  const results: ProfileSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const markdown = await readFile(join(root, entry.name, PROFILE_FILE), 'utf8');
      const profile = parseProfile(markdown, entry.name);
      results.push({
        name: profile.name,
        description: profile.description,
        model: profile.model,
        skills: profile.skills,
      });
    } catch {
      // Unreadable or malformed profile — skip it.
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Reads one profile's full PROFILE.md by its directory name. Returns null
 * when the directory is missing or malformed. The name is validated so it
 * can never escape `.agents/@montflow/profiles/` (no path traversal).
 */
const readProfile = async (cwd: string, profileName: string): Promise<ProfileDetail | null> => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(profileName)) return null;
  let markdown: string;
  try {
    markdown = await readFile(join(cwd, ...PROFILE_DIR, profileName, PROFILE_FILE), 'utf8');
  } catch {
    return null;
  }
  const profile = parseProfile(markdown, profileName);
  return {
    name: profile.name,
    description: profile.description,
    model: profile.model,
    skills: profile.skills,
    instructions: profile.instructions,
    checklist: profile.checklist,
    markdown,
  };
};

// ---------------------------------------------------------------------------
// Skills — read-only listing of `.agents/skills/<name>/SKILL.md` frontmatter.
// ---------------------------------------------------------------------------

const SKILLS_DIR = ['.agents', 'skills'] as const;
const SKILL_FILE = 'SKILL.md';

interface SkillSummary {
  readonly id: string; // directory name (URL-safe slug, unique)
  readonly name: string; // display name (frontmatter name ?? id)
  readonly description: string;
  readonly groups: readonly string[];
  readonly dependencies: readonly string[];
}

interface SkillDetail extends SkillSummary {
  readonly markdown: string; // full SKILL.md body
}

const asStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];

const listSkills = async (cwd: string): Promise<SkillSummary[]> => {
  const root = join(cwd, ...SKILLS_DIR);
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return []; // directory missing → no skills yet
  }
  const results: SkillSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const markdown = await readFile(join(root, entry.name, SKILL_FILE), 'utf8');
      const fields = parseFrontmatter(markdown)?.fields ?? {};
      const name = typeof fields['name'] === 'string' && fields['name'] !== '' ? fields['name'] : entry.name;
      results.push({
        id: entry.name,
        name,
        description: typeof fields['description'] === 'string' ? fields['description'] : '',
        groups: asStringArray(fields['groups']),
        dependencies: asStringArray(fields['dependencies']),
      });
    } catch {
      // Unreadable or malformed skill — skip it.
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Reads one skill's full SKILL.md by directory name. Returns null when the
 * directory is missing or malformed. The id is validated so it can never
 * escape `.agents/skills/` (no path traversal).
 */
const readSkillDir = async (cwd: string, dirName: string): Promise<SkillDetail | null> => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(dirName)) return null;
  let markdown: string;
  try {
    markdown = await readFile(join(cwd, ...SKILLS_DIR, dirName, SKILL_FILE), 'utf8');
  } catch {
    return null;
  }
  const fields = parseFrontmatter(markdown)?.fields ?? {};
  const name = typeof fields['name'] === 'string' && fields['name'] !== '' ? fields['name'] : dirName;
  return {
    id: dirName,
    name,
    description: typeof fields['description'] === 'string' ? fields['description'] : '',
    groups: asStringArray(fields['groups']),
    dependencies: asStringArray(fields['dependencies']),
    markdown,
  };
};

/**
 * Resolves a skill by its directory slug, falling back to a scan for a
 * skill whose frontmatter `name` matches (stale clients may send the
 * display name instead of the directory name). Returns null when no skill
 * matches.
 */
const readSkill = async (cwd: string, skillId: string): Promise<SkillDetail | null> => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(skillId)) return null;
  const direct = await readSkillDir(cwd, skillId);
  if (direct !== null) return direct;
  let entries: Dirent[];
  try {
    entries = await readdir(join(cwd, ...SKILLS_DIR), { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skill = await readSkillDir(cwd, entry.name);
    if (skill !== null && skill.name === skillId) return skill;
  }
  return null;
};

const readJsonBody = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        rejectBody(new Error('Invalid JSON body'));
      }
    });
    req.on('error', rejectBody);
  });

// ---------------------------------------------------------------------------
// Review presets — `.agents/@montflow/review-presets/<name>.json`
// ---------------------------------------------------------------------------

const PRESET_DIR = ['.agents', '@montflow', 'review-presets'] as const;
const PRESET_EXT = '.json';

const isValidPresetName = (name: string): boolean =>
  /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);

const presetRoot = (cwd: string): string => join(cwd, ...PRESET_DIR);
const presetFilePath = (cwd: string, name: string): string =>
  join(presetRoot(cwd), `${name}${PRESET_EXT}`);

/**
 * Builtin reviewer catalog (id → label) served to the UI for rendering
 * `type: "builtin"` preset references. The catalog is label-only now: the
 * old builtin skill bundles were retired with the review-loop rework, so
 * resolution (models/objectives) lives server-side at run time — profiles
 * are the executable reviewer personas today.
 */
const BUILTIN_REVIEWER_CATALOG: ReadonlyArray<{ readonly id: string; readonly label: string }> = [
  { id: 'generic', label: 'Generic' },
  { id: 'security', label: 'Security' },
  { id: 'quality', label: 'Quality' },
  { id: 'technical', label: 'Technical' },
  { id: 'guidelines', label: 'Guidelines' },
  { id: 'style', label: 'Style' },
  { id: 'linguist', label: 'Linguist' },
];

interface PresetSummary {
  readonly name: string;
  /** 'loop' or 'pipeline'; undefined for legacy files (loops) or invalid files. */
  readonly type?: 'loop' | 'pipeline';
  readonly config?: unknown;
  readonly error?: string;
}

const listPresets = async (cwd: string): Promise<PresetSummary[]> => {
  let entries: string[];
  try {
    entries = await readdir(presetRoot(cwd));
  } catch {
    return []; // directory missing → no presets yet
  }
  const results: PresetSummary[] = [];
  for (const entry of entries.filter((e) => e.endsWith(PRESET_EXT))) {
    const name = entry.slice(0, -PRESET_EXT.length);
    try {
      const raw = await readFile(presetFilePath(cwd, name), 'utf8');
      const preset = Schema.decodeSync(ReviewPresetFromJson)(raw);
      // Legacy 'workflow' files are pipelines — normalize so the UI only
      // ever sees 'loop' | 'pipeline'.
      results.push({
        name,
        type: preset.type === 'workflow' ? 'pipeline' : preset.type,
        config: preset.config,
      });
    } catch (error) {
      results.push({ name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
};

const writePresetFile = async (
  cwd: string,
  name: string,
  body: unknown,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> => {
  if (!isValidPresetName(name)) {
    return { ok: false, error: `Invalid preset name: '${name}'` };
  }
  const bodyObj =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  // Legacy clients may still POST 'workflow' — normalize to 'pipeline'.
  const type: 'loop' | 'pipeline' =
    bodyObj.type === 'workflow' || bodyObj.type === 'pipeline' ? 'pipeline' : 'loop';
  const preset = { version: 1 as const, type, name, config: bodyObj.config };
  try {
    Schema.decodeUnknownSync(ReviewPresetSchema)(preset);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  try {
    await mkdir(presetRoot(cwd), { recursive: true });
    await writeFile(presetFilePath(cwd, name), `${JSON.stringify(preset, null, 2)}\n`, 'utf8');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const readPresetFile = async (cwd: string, name: string): Promise<string | null> => {
  try {
    return await readFile(presetFilePath(cwd, name), 'utf8');
  } catch {
    return null;
  }
};

const deletePresetFile = async (cwd: string, name: string): Promise<void> => {
  await rm(presetFilePath(cwd, name), { force: true });
};

const isPortFree = (port: number): Promise<boolean> =>
  new Promise((resolveFree) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(300);
    socket.once('connect', () => {
      socket.destroy();
      resolveFree(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolveFree(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolveFree(true);
    });
  });

const findPort = async (base: number): Promise<number> => {
  for (let i = 0; i < PORT_SCAN_LIMIT; i++) {
    const candidate = base + i;
    if (candidate > 65535) break;
    if (await isPortFree(candidate)) return candidate;
  }
  throw new Error(`No free port near ${base} (scanned ${PORT_SCAN_LIMIT}). Use WORKSPACE_ROUTER_PORT.`);
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const requested = Number(process.env.WORKSPACE_ROUTER_PORT) || DEFAULT_ROUTER_PORT;
  const port = await findPort(requested);
  await loadWorkspaces();
  await loadSessionNames();
  await loadModelSelection();

  // Durable run snapshot store — survives router restarts so a late-joining
  // tab can still recover a run whose backend has disconnected. Falls back
  // to the in-memory cache when node:sqlite is unavailable or the DB cannot
  // be opened. Stored runs are preloaded into the cache so the browser-connect
  // snapshot dump below serves them like any other cached run.
  const dbPath = join(routerStateDir(), 'runs.db');
  runStore = await openRunStore(dbPath);
  if (runStore !== null) {
    for (const run of runStore.list()) {
      cachedRuns.set(run.runId, {
        folder: run.folder,
        workspaceId: run.workspaceId,
        status: run.status,
        entries: run.entries,
        tools: run.tools,
        title: run.title,
        updatedAt: run.updatedAt,
      });
    }
  }

  const httpServer: Server = createServer(async (req, res) => {
    const pathname = (req.url ?? '/').split('?')[0] ?? '/';

    const sendJson = (status: number, body: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    try {
      // Agentic-run model picker: the union of models across connected
      // sessions plus the persisted selection. GET lists; PUT persists a
      // new selection and broadcasts it to every browser (modelsChanged).
      // GET  /api/models
      // PUT  /api/models   { selected: '<provider/model-id>' | null }
      if (pathname === '/api/models' && req.method === 'GET') {
        sendJson(200, { models: modelChoices(), selected: selectedModel });
        return;
      }
      if (pathname === '/api/models' && req.method === 'PUT') {
        const body = await readJsonBody(req).catch(() => undefined);
        if (body === undefined) {
          sendJson(400, { error: 'Invalid JSON body' });
          return;
        }
        const selected = (body as { selected?: unknown }).selected;
        if (selected !== null && (typeof selected !== 'string' || selected.trim() === '')) {
          sendJson(400, { error: 'selected must be a model id string or null' });
          return;
        }
        selectedModel = selected;
        await persistModelSelection();
        broadcastModels();
        sendJson(200, { ok: true, selected: selectedModel, models: modelChoices() });
        return;
      }

      // Builtin reviewer catalog (for rendering `builtin` preset references).
      if (pathname === '/api/reviewers' && req.method === 'GET') {
        sendJson(200, { builtins: BUILTIN_REVIEWER_CATALOG });
        return;
      }

      // Agentic run history — durable snapshots with status/workspace filters.
      // GET /api/runs?workspace=<id>&status=done,running
      if (pathname === '/api/runs' && req.method === 'GET') {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const workspaceFilter = url.searchParams.get('workspace') ?? '';
        const statusFilter = (url.searchParams.get('status') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '');
        // Prefer the durable store; fall back to the live in-memory cache
        // when node:sqlite is unavailable.
        const allRuns: StoredRun[] =
          runStore !== null
            ? runStore.list()
            : [...cachedRuns.entries()].map(([runId, run]) => ({
                runId,
                folder: run.folder,
                workspaceId: run.workspaceId,
                status: run.status,
                entries: run.entries,
                tools: run.tools,
                updatedAt: run.updatedAt,
              }));
        const filtered = allRuns
          .filter((r) => workspaceFilter === '' || r.workspaceId === workspaceFilter)
          .filter((r) => statusFilter.length === 0 || statusFilter.includes(r.status))
          .toSorted((a, b) => b.updatedAt - a.updatedAt);
        sendJson(200, {
          runs: filtered.map((r) => ({
            runId: r.runId,
            folder: r.folder,
            workspaceId: r.workspaceId,
            status: r.status,
            prompt: r.entries.find((e) => e.role === 'user')?.text ?? '',
            title: r.title ?? '',
            entryCount: r.entries.length,
            toolCount: r.tools.length,
            updatedAt: r.updatedAt,
          })),
        });
        return;
      }

      // Workspaces list.
      if (pathname === '/api/workspaces' && req.method === 'GET') {
        sendJson(200, {
          workspaces: workspaceList().map((w) => ({
            id: w.id,
            name: w.name,
            path: w.path,
            connected: workspaceConnected(w),
            lastSeen: w.lastSeen,
          })),
        });
        return;
      }

      // Session rename (persisted across restarts, re-applied on reconnect).
      // PUT /api/sessions/<sessionId>   { name }
      const sessionRename = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionRename) {
        const sessionId = decodeURIComponent(sessionRename[1] ?? '');
        if (sessionId === '') {
          sendJson(400, { error: 'Missing session id' });
          return;
        }
        if (![...backends.values()].some((b) => b.info.sessionId === sessionId)) {
          sendJson(404, { error: `Unknown session '${sessionId}'` });
          return;
        }
        if (req.method !== 'PUT') {
          sendJson(405, { error: 'Method not allowed' });
          return;
        }
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(400, { error: 'Invalid JSON body' });
          return;
        }
        const name = (body as { name?: unknown }).name;
        if (typeof name !== 'string' || name.trim() === '' || name.length > 80) {
          sendJson(400, { error: 'name must be a non-empty string (max 80 chars)' });
          return;
        }
        sessionNames.set(sessionId, name.trim());
        await persistSessionNames();
        broadcastFolders();
        sendJson(200, { ok: true });
        return;
      }

      // Remove a workspace from the home list (not destructive — the
      // workspace re-registers if its project runs /montflow again).
      // DELETE /api/workspaces/<id>
      const workspaceRemove = pathname.match(/^\/api\/workspaces\/([^/]+)$/);
      if (workspaceRemove && req.method === 'DELETE') {
        const wsId = decodeURIComponent(workspaceRemove[1] ?? '');
        if (!workspaces.has(wsId)) {
          sendJson(404, { error: `Unknown workspace '${wsId}'` });
          return;
        }
        workspaces.delete(wsId);
        await persistWorkspaces();
        sendJson(200, { ok: true });
        return;
      }

      // Workspace git info — folder name, repo name, current branch, path.
      // GET /api/workspaces/<id>/info
      const workspaceInfo = pathname.match(/^\/api\/workspaces\/([^/]+)\/info$/);
      if (workspaceInfo) {
        const wsId = decodeURIComponent(workspaceInfo[1] ?? '');
        const cwd = workspacePath(wsId);
        if (cwd === undefined) {
          sendJson(404, { error: `Unknown workspace '${wsId}'` });
          return;
        }
        if (req.method !== 'GET') {
          sendJson(405, { error: 'Method not allowed' });
          return;
        }
        const remote = gitRun(cwd, ['config', '--get', 'remote.origin.url']);
        const branch = gitRun(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
        sendJson(200, {
          id: wsId,
          folder: basename(cwd),
          repo: remote !== null ? repoNameFromUrl(remote) || null : null,
          branch: branch !== null && branch !== 'HEAD' ? branch : null,
          path: cwd,
        });
        return;
      }

      // Profile detail — full parsed PROFILE.md for a single profile; modify/delete.
      // GET    /api/workspaces/<id>/profiles/<name>
      // PUT    /api/workspaces/<id>/profiles/<name>   { markdown }
      // DELETE /api/workspaces/<id>/profiles/<name>
      const profileDetail = pathname.match(/^\/api\/workspaces\/([^/]+)\/profiles\/([^/]+)$/);
      if (profileDetail) {
        const wsId = decodeURIComponent(profileDetail[1] ?? '');
        const profileName = decodeURIComponent(profileDetail[2] ?? '');
        const cwd = workspacePath(wsId);
        if (cwd === undefined) {
          sendJson(404, { error: `Unknown workspace '${wsId}'` });
          return;
        }
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(profileName)) {
          sendJson(400, { error: `Invalid profile name '${profileName}'` });
          return;
        }

        if (req.method === 'DELETE') {
          await rm(join(cwd, ...PROFILE_DIR, profileName), { recursive: true, force: true });
          broadcastProfileChanged(cwd, wsId, profileName, 'deleted');
          sendJson(200, { ok: true });
          return;
        }

        if (req.method === 'PUT') {
          let body: unknown;
          try {
            body = await readJsonBody(req);
          } catch {
            sendJson(400, { error: 'Invalid JSON body' });
            return;
          }
          const markdown = (body as { markdown?: unknown }).markdown;
          if (typeof markdown !== 'string') {
            sendJson(400, { error: 'Missing string field: markdown' });
            return;
          }
          await writeFile(join(cwd, ...PROFILE_DIR, profileName, PROFILE_FILE), markdown, 'utf8');
          broadcastProfileChanged(cwd, wsId, profileName, 'updated');
          sendJson(200, { ok: true });
          return;
        }

        if (req.method !== 'GET') {
          sendJson(405, { error: 'Method not allowed' });
          return;
        }
        const profile = await readProfile(cwd, profileName);
        if (profile === null) {
          sendJson(404, { error: `Unknown profile '${profileName}'` });
          return;
        }
        sendJson(200, { profile });
        return;
      }

      // Profiles — listing + creation of `.agents/@montflow/profiles/<name>/PROFILE.md`.
      // GET  /api/workspaces/<id>/profiles          → list
      // POST /api/workspaces/<id>/profiles          → create { name, markdown }
      const profilesList = pathname.match(/^\/api\/workspaces\/([^/]+)\/profiles$/);
      if (profilesList) {
        const wsId = decodeURIComponent(profilesList[1] ?? '');
        const cwd = workspacePath(wsId);
        if (cwd === undefined) {
          sendJson(404, { error: `Unknown workspace '${wsId}'` });
          return;
        }
        if (req.method === 'POST') {
          let body: unknown;
          try {
            body = await readJsonBody(req);
          } catch {
            sendJson(400, { error: 'Invalid JSON body' });
            return;
          }
          const { name, markdown } = body as { name?: unknown; markdown?: unknown };
          if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
            sendJson(400, { error: 'name must be a kebab-case slug (letters, digits, . _ -)' });
            return;
          }
          if (typeof markdown !== 'string' || markdown.trim() === '') {
            sendJson(400, { error: 'Missing string field: markdown' });
            return;
          }
          const dir = join(cwd, ...PROFILE_DIR, name);
          try {
            await readFile(join(dir, PROFILE_FILE), 'utf8');
            sendJson(409, { error: `Profile '${name}' already exists` });
            return;
          } catch {
            // ENOENT → new profile, proceed.
          }
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, PROFILE_FILE), markdown, 'utf8');
          const profile = await readProfile(cwd, name);
          broadcastProfileChanged(cwd, wsId, name, 'created');
          sendJson(201, { profile });
          return;
        }
        if (req.method !== 'GET') {
          sendJson(405, { error: 'Method not allowed' });
          return;
        }
        sendJson(200, { profiles: await listProfiles(cwd) });
        return;
      }

      // Presets — keyed by workspace id; the router maps workspace → path.
      // GET  /api/workspaces/<id>/presets                  → list
      // GET  /api/workspaces/<id>/presets/<name>.json      → read one
      // POST /api/workspaces/<id>/presets/<name>.json      → create/overwrite
      // DELETE /api/workspaces/<id>/presets/<name>.json    → delete
      const presetList = pathname.match(/^\/api\/workspaces\/([^/]+)\/presets$/);
      const presetFile = pathname.match(/^\/api\/workspaces\/([^/]+)\/presets\/([^/]+)$/);

      if (presetList) {
        const wsId = decodeURIComponent(presetList[1] ?? '');
        const cwd = workspacePath(wsId);
        if (cwd === undefined) {
          sendJson(404, { error: `Unknown workspace '${wsId}'` });
          return;
        }
        if (req.method === 'GET') {
          sendJson(200, { presets: await listPresets(cwd) });
          return;
        }
        sendJson(405, { error: 'Method not allowed' });
        return;
      }

      if (presetFile) {
        const wsId = decodeURIComponent(presetFile[1] ?? '');
        const name = decodeURIComponent(presetFile[2] ?? '').replace(/\.json$/, '');
        const cwd = workspacePath(wsId);
        if (cwd === undefined) {
          sendJson(404, { error: `Unknown workspace '${wsId}'` });
          return;
        }
        if (req.method === 'GET') {
          const raw = await readPresetFile(cwd, name);
          if (raw === null) {
            sendJson(404, { error: 'Preset not found' });
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(raw);
          return;
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req).catch(() => undefined);
          if (body === undefined) {
            sendJson(400, { error: 'Invalid JSON body' });
            return;
          }
          // Distinguish create vs update for the cross-tab broadcast.
          const existed = await readPresetFile(cwd, name).then((raw) => raw !== null).catch(() => false);
          const result = await writePresetFile(cwd, name, body);
          if (result.ok) {
            broadcastPresetChanged(cwd, wsId, name, existed ? 'updated' : 'created');
            sendJson(200, { ok: true, name });
            return;
          }
          sendJson(400, { error: result.error });
          return;
        }
        if (req.method === 'DELETE') {
          const existed = await readPresetFile(cwd, name).then((raw) => raw !== null).catch(() => false);
          await deletePresetFile(cwd, name);
          if (existed) broadcastPresetChanged(cwd, wsId, name, 'deleted');
          sendJson(200, { ok: true });
          return;
        }
        sendJson(405, { error: 'Method not allowed' });
        return;
      }

      // Skills — read-only listing of `.agents/skills/<name>/SKILL.md` frontmatter.
      // GET  /api/workspaces/<id>/skills          → list
      // POST /api/workspaces/<id>/skills          → create { name, markdown }
      const skillsList = pathname.match(/^\/api\/workspaces\/([^/]+)\/skills$/);
      if (skillsList) {
        const wsId = decodeURIComponent(skillsList[1] ?? '');
        const cwd = workspacePath(wsId);
        if (cwd === undefined) {
          sendJson(404, { error: `Unknown workspace '${wsId}'` });
          return;
        }
        if (req.method === 'POST') {
          let body: unknown;
          try {
            body = await readJsonBody(req);
          } catch {
            sendJson(400, { error: 'Invalid JSON body' });
            return;
          }
          const { name, markdown } = body as { name?: unknown; markdown?: unknown };
          if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
            sendJson(400, { error: 'name must be a kebab-case slug (letters, digits, . _ -)' });
            return;
          }
          if (typeof markdown !== 'string' || markdown.trim() === '') {
            sendJson(400, { error: 'Missing string field: markdown' });
            return;
          }
          const dir = join(cwd, ...SKILLS_DIR, name);
          try {
            await readFile(join(dir, SKILL_FILE), 'utf8');
            sendJson(409, { error: `Skill '${name}' already exists` });
            return;
          } catch {
            // ENOENT → new skill, proceed.
          }
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, SKILL_FILE), markdown, 'utf8');
          const skill = await readSkill(cwd, name);
          broadcastSkillChanged(cwd, wsId, name, 'created');
          sendJson(201, { skill });
          return;
        }
        if (req.method !== 'GET') {
          sendJson(405, { error: 'Method not allowed' });
          return;
        }
        sendJson(200, { skills: await listSkills(cwd) });
        return;
      }

      // Skill detail — full SKILL.md for a single skill; modify/delete.
      // GET    /api/workspaces/<id>/skills/<skillId>
      // PUT    /api/workspaces/<id>/skills/<skillId>   { markdown }
      // DELETE /api/workspaces/<id>/skills/<skillId>
      const skillDetail = pathname.match(/^\/api\/workspaces\/([^/]+)\/skills\/([^/]+)$/);
      if (skillDetail) {
        const wsId = decodeURIComponent(skillDetail[1] ?? '');
        const skillId = decodeURIComponent(skillDetail[2] ?? '');
        const cwd = workspacePath(wsId);
        if (cwd === undefined) {
          sendJson(404, { error: `Unknown workspace '${wsId}'` });
          return;
        }
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(skillId)) {
          sendJson(400, { error: `Invalid skill id '${skillId}'` });
          return;
        }

        if (req.method === 'DELETE') {
          await rm(join(cwd, ...SKILLS_DIR, skillId), { recursive: true, force: true });
          broadcastSkillChanged(cwd, wsId, skillId, 'deleted');
          sendJson(200, { ok: true });
          return;
        }

        if (req.method === 'PUT') {
          let body: unknown;
          try {
            body = await readJsonBody(req);
          } catch {
            sendJson(400, { error: 'Invalid JSON body' });
            return;
          }
          const markdown = (body as { markdown?: unknown }).markdown;
          if (typeof markdown !== 'string') {
            sendJson(400, { error: 'Missing string field: markdown' });
            return;
          }
          await writeFile(join(cwd, ...SKILLS_DIR, skillId, SKILL_FILE), markdown, 'utf8');
          broadcastSkillChanged(cwd, wsId, skillId, 'updated');
          sendJson(200, { ok: true });
          return;
        }

        if (req.method !== 'GET') {
          sendJson(405, { error: 'Method not allowed' });
          return;
        }
        const skill = await readSkill(cwd, skillId);
        if (skill === null) {
          sendJson(404, { error: `Unknown skill '${skillId}'` });
          return;
        }
        sendJson(200, { skill });
        return;
      }
    } catch (error) {
      sendJson(500, { error: error instanceof Error ? error.message : String(error) });
      return;
    }

    if (pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          port,
          pid: process.pid,
          version: PROTOCOL_VERSION,
          folders: folderList().map((f) => f.id),
        }),
      );
      return;
    }

    if (pathname === '/api/folders' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ folders: folderList() }));
      return;
    }

    if (pathname === '/api/shutdown' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      shutdownRouter(false);
      return;
    }

    if (pathname === '/api/kill' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      shutdownRouter(true);
      return;
    }

    if (req.method === 'GET') {
      void sendPage(res, pathname);
      return;
    }

    res.writeHead(405, { 'content-type': 'text/plain' });
    res.end('Method not allowed');
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    httpServer.once('error', rejectListen);
    httpServer.listen(port, '127.0.0.1', () => resolveListen());
  });
  currentPort = port;

  const wss = new WebSocketServer({ noServer: true });
  const backendWss = new WebSocketServer({ noServer: true });

  // Defined here (after the servers) because the request handlers below
  // close over it; requests can only arrive once we're listening.
  const shutdownRouter = (kill: boolean): void => {
    console.log(
      `[workspace] router shutting down (${kill ? 'kill: ' : ''}${backends.size} sessions, ${browserSockets.size} browsers)`,
    );
    if (kill) {
      for (const [, conn] of backends) {
        if (conn.socket.readyState === WebSocket.OPEN) {
          conn.socket.send(
            JSON.stringify({ type: 'shutdown', folder: conn.info.id } satisfies RouterToBackend),
          );
        }
      }
    }
    // Give the shutdown message a moment to flush, then force-close
    // everything — a graceful httpServer.close() would wait forever on the
    // open WebSockets and leave a zombie holding the established connections.
    setTimeout(() => {
      for (const socket of browserSockets) {
        try {
          socket.terminate();
        } catch {
          // ignore
        }
      }
      for (const [, conn] of backends) {
        try {
          conn.socket.terminate();
        } catch {
          // ignore
        }
      }
      browserSockets.clear();
      backends.clear();
      try {
        wss.close();
      } catch {
        // ignore
      }
      try {
        backendWss.close();
      } catch {
        // ignore
      }
      httpServer.closeAllConnections?.();
      httpServer.close(() => {
        void rm(routerStateFile(), { force: true }).finally(() => process.exit(0));
      });
    }, 200);
  };

  // Manual upgrade routing: ws's path option does not reliably multiplex two
  // WebSocketServer instances on one HTTP server (400s on the second path).
  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = (req.url ?? '/').split('?')[0] ?? '/';
    const target = pathname === '/backend' ? backendWss : pathname === '/ws' ? wss : null;
    if (target === null) {
      socket.destroy();
      return;
    }
    target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req));
  });

  wss.on('connection', (socket: WebSocket) => {
    browserSockets.add(socket);

    // Fresh tab: full picture of all folders + cached per-folder state.
    socket.send(
      JSON.stringify({ type: 'folders', folders: folderList(), port: currentPort } satisfies RouterToBrowser),
    );
    for (const [folder, hello] of cachedHello) {
      socket.send(JSON.stringify({ type: 'hello', folder, hello } satisfies RouterToBrowser));
    }
    // Agentic skill runs: cached transcripts so a reload / late-joining tab
    // can recover a run even after the owning backend disconnected.
    for (const [runId, run] of cachedRuns) {
      socket.send(
        JSON.stringify({
          type: 'skillGen',
          folder: run.folder,
          runId,
          workspaceId: run.workspaceId,
          phase: 'snapshot',
          entry: 0,
          status: run.status,
          text: '',
          title: run.title,
          entries: run.entries,
          tools: run.tools,
        } satisfies RouterToBrowser),
      );
    }
    // Model picker state (models + persisted selection) — same push model
    // as the cached state above so a fresh tab is never empty.
    socket.send(
      JSON.stringify({
        type: 'modelsChanged',
        models: modelChoices(),
        selected: selectedModel,
      } satisfies RouterToBrowser),
    );

    socket.on('message', (data) => {
      let msg: BrowserToRouter;
      try {
        msg = JSON.parse(data.toString()) as BrowserToRouter;
      } catch {
        return;
      }
      if (typeof msg.folder !== 'string' || !msg.command || typeof msg.command.type !== 'string') {
        return;
      }
      let command = msg.command;

      // Agentic runs use the persisted picker selection unless the dialog
      // sent its own per-run override; the backend falls back to its
      // session's active model when the id is not pickable there.
      if (
        command.type === 'skillAgentic' ||
        command.type === 'profileAgentic' ||
        command.type === 'presetAgentic' ||
        command.type === 'textAgentic' ||
        command.type === 'textGenerate'
      ) {
        command = { ...command, model: command.model ?? selectedModel ?? undefined };
      }

      // Skill-run commands carry only a run id. Route them via the run →
      // folder map (learned from the first skillGen broadcast); when the
      // mapping is not yet known (snapshot raced ahead of the start) fall
      // back to the command's folder, then fan out to every backend so the
      // owning one can answer. If nothing is connected and the router has no
      // cached transcript, reply with an explicit error so the browser never
      // sits on "Loading run…" forever. `skillSetStatus` additionally falls
      // back to the router's own cache/store when no backend is live (a
      // stuck run whose pi session died can still be marked done/error).
      if (
        command.type === 'skillReply' ||
        command.type === 'skillSnapshot' ||
        command.type === 'skillSetStatus'
      ) {
        const runId = typeof command.runId === 'string' ? command.runId : '';
        const known = runFolder.get(runId);
        const target = known ?? (msg.folder !== '' ? msg.folder : undefined);
        if (target !== undefined && sendCommandToBackend(target, command)) return;
        // Fan out — the owning backend answers (others no-op).
        let delivered = false;
        for (const [fid, conn] of backends) {
          if (conn.socket.readyState === WebSocket.OPEN) {
            conn.socket.send(
              JSON.stringify({ type: 'command', folder: fid, command } satisfies RouterToBackend),
            );
            delivered = true;
          }
        }
        if (!delivered) {
          // No live backend: serve the cached transcript (snapshot), apply a
          // manual status override to the cache + store (skillSetStatus), or
          // reply with an explicit error.
          const cached = cachedRuns.get(runId);
          if (cached !== undefined) {
            if (command.type === 'skillSetStatus' && command.status !== undefined) {
              const updated: CachedRun = { ...cached, status: command.status, updatedAt: Date.now() };
              cachedRuns.set(runId, updated);
              persistRunToStore(runId, updated, true);
              // A manual status override affects every tab — broadcast it.
              broadcastToBrowsers({
                type: 'skillGen',
                folder: updated.folder,
                runId,
                workspaceId: updated.workspaceId,
                phase: command.status,
                entry: 0,
                status: updated.status,
                text: '',
                title: updated.title,
                entries: updated.entries,
                tools: updated.tools,
              });
            } else {
              socket.send(
                JSON.stringify({
                  type: 'skillGen',
                  folder: cached.folder,
                  runId,
                  workspaceId: cached.workspaceId,
                  phase: 'snapshot',
                  entry: 0,
                  status: cached.status,
                  text: '',
                  title: cached.title,
                  entries: cached.entries,
                  tools: cached.tools,
                } satisfies RouterToBrowser),
              );
            }
          } else {
            // Not in memory — try the durable store (covers router restarts
            // since the last time this run was cached). Re-seed the memory
            // cache so a second request doesn't hit the DB again.
            const stored = runStore?.load(runId) ?? null;
            if (stored !== null) {
              cachedRuns.set(runId, {
                folder: stored.folder,
                workspaceId: stored.workspaceId,
                status: stored.status,
                entries: stored.entries,
                tools: stored.tools,
                title: stored.title,
                updatedAt: stored.updatedAt,
              });
              if (command.type === 'skillSetStatus' && command.status !== undefined) {
                const updated: CachedRun = {
                  ...cachedRuns.get(runId)!,
                  status: command.status,
                  updatedAt: Date.now(),
                };
                cachedRuns.set(runId, updated);
                persistRunToStore(runId, updated, true);
                // A manual status override affects every tab — broadcast it.
                broadcastToBrowsers({
                  type: 'skillGen',
                  folder: updated.folder,
                  runId,
                  workspaceId: updated.workspaceId,
                  phase: command.status,
                  entry: 0,
                  status: updated.status,
                  text: '',
                  title: updated.title,
                  entries: updated.entries,
                  tools: updated.tools,
                });
              } else {
                socket.send(
                  JSON.stringify({
                    type: 'skillGen',
                    folder: stored.folder,
                    runId,
                    workspaceId: stored.workspaceId,
                    phase: 'snapshot',
                    entry: 0,
                    status: stored.status,
                    text: '',
                    title: stored.title,
                    entries: stored.entries,
                    tools: stored.tools,
                  } satisfies RouterToBrowser),
                );
              }
            } else if (runId !== '') {
              socket.send(JSON.stringify(notFoundRun(runId, msg.folder)));
            }
          }
        }
        return;
      }

      const ok = sendCommandToBackend(msg.folder, command);
      if (!ok) {
        // Agentic creation can't start without a live backend — tell the
        // browser directly (the run page shows this instead of hanging).
        if (
          (command.type === 'skillAgentic' ||
            command.type === 'profileAgentic' ||
            command.type === 'presetAgentic' ||
            command.type === 'textAgentic') &&
          typeof command.runId === 'string'
        ) {
          socket.send(JSON.stringify(notFoundRun(command.runId, msg.folder)));
        } else if (command.type === 'textGenerate' && typeof command.runId === 'string') {
          // No live backend for the one-shot text fill — answer with a
          // textGen error so the modal unlocks instead of hanging.
          socket.send(
            JSON.stringify({
              type: 'textGen',
              folder: msg.folder,
              runId: command.runId,
              phase: 'error',
              status: 'error',
              text: 'No pi session is connected — start /montflow in the project session to use AI generation.',
            } satisfies RouterToBrowser),
          );
        } else {
          socket.send(
            JSON.stringify({
              type: 'notify',
              folder: msg.folder,
              message: 'No live pi session for this folder — run /workspace ui there.',
              level: 'warning',
            } satisfies RouterToBrowser),
          );
        }
      }
    });

    socket.on('close', () => browserSockets.delete(socket));
    socket.on('error', () => browserSockets.delete(socket));
  });

  backendWss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
    const remote = req.socket.remoteAddress ?? 'unknown';
    console.log(`[workspace] backend connected: ${remote}`);

    socket.on('message', (data) => void handleBackendMessage(socket, data.toString()));
    socket.on('close', () => {
      // Find and drop the folder owned by this socket.
      for (const [folder, conn] of backends) {
        if (conn.socket === socket) {
          dropBackend(folder);
          break;
        }
      }
    });
    socket.on('error', () => undefined);
  });

  await mkdir(routerStateDir(), { recursive: true });
  await writeFile(
    routerStateFile(),
    JSON.stringify({ port, pid: process.pid, startedAt: Date.now(), version: PROTOCOL_VERSION }, null, 2),
    'utf8',
  );

  console.log(
    `[workspace] router listening on http://127.0.0.1:${port} (protocol v${PROTOCOL_VERSION})`,
  );

  process.on('SIGTERM', () => {
    void rm(routerStateFile(), { force: true }).finally(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void rm(routerStateFile(), { force: true }).finally(() => process.exit(0));
  });
}

main().catch((error) => {
  console.error('[workspace] router failed:', error);
  process.exit(1);
});
