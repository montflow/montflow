/**
 * Shared wire protocol for the workspace web UI.
 *
 * Imported by BOTH the detached router daemon (`router.ts`, runs under plain
 * `node` type-stripping) and the pi-side backend adapter (`ui-server.ts`,
 * loaded by jiti). Keep this file free of non-node dependencies and use only
 * erasable TypeScript syntax.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Wire protocol version. The router daemon, the pi backend, and the SPA it
 * serves must all agree. A backend registering with a different version is
 * rejected (`VERSION_MISMATCH`) so two incompatible versions can never
 * coexist behind one router.
 */
export const PROTOCOL_VERSION = 4;

/** Default single router port for all folders (deliberately uncommon). */
export const DEFAULT_ROUTER_PORT = 24242;

/** How many ports above the default to scan before giving up. */
export const PORT_SCAN_LIMIT = 10;

export interface FolderInfo {
  readonly id: string;
  readonly cwd: string;
  readonly name: string;
  readonly version: number;
  readonly connectedAt: number;
  /** What user action started this session's UI (e.g. `/montflow`). */
  readonly initiator?: string;
  /** The pi session's own id (from its session file name). */
  readonly sessionId?: string;
  /** Workspace this session belongs to (metadata — not its identity). */
  readonly workspaceName?: string;
}

export interface RouterState {
  readonly port: number;
  readonly pid: number;
  readonly startedAt: number;
  readonly version: number;
}

/**
 * One pickable model, as reported by a connected pi backend session. The
 * router unions these across folders so the UI can offer a single model
 * picker for agentic runs.
 */
export interface ModelChoice {
  /** Full `provider/model-id` string (what agent configs store). */
  readonly id: string;
  /** Provider id, e.g. `anthropic`. */
  readonly provider: string;
  /** Model id without the provider prefix, e.g. `claude-sonnet-4-5`. */
  readonly modelId: string;
  /** Human-readable model name. */
  readonly name: string;
  /** True when this is the reporting session's currently active model. */
  readonly isCurrent: boolean;
}

/** Machine-level state dir (survives across pi processes/projects). */
export const routerStateDir = (): string => {
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA ?? homedir(), 'workspace');
  }
  const xdg = process.env.XDG_STATE_HOME;
  return xdg && xdg !== ''
    ? join(xdg, 'workspace')
    : join(homedir(), '.local', 'state', 'workspace');
};

export const routerStateFile = (): string => join(routerStateDir(), 'router.json');

/** Deterministic short hash (fnv-1a) for disambiguating folder slugs. */
export const shortHash = (input: string): string => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 4);
};

// --- Wire messages ---

/** pi backend → router (`/backend` socket). */
export type BackendToRouter =
  | {
      readonly type: 'register';
      readonly folder: string;
      readonly cwd: string;
      readonly name: string;
      readonly version: number;
      /** Stable per-process identity — lets several pi instances share a folder. */
      readonly instanceId: string;
      /** Workspace identity from the generated `@montflow/workspace.json`. */
      readonly workspace: { readonly id: string; readonly name: string };
      /** What user action started this session's UI (e.g. `/montflow`). */
      readonly initiator?: string;
      /** The pi session's own id (from its session file name). */
      readonly sessionId?: string;
      /** Models pickable in this backend's session (scoped set or full catalogue). */
      readonly models?: readonly ModelChoice[];
    }
  | { readonly type: 'hello'; readonly folder: string; readonly hello: unknown }
  | { readonly type: 'event'; readonly folder: string; readonly event: unknown }
  | { readonly type: 'loopState'; readonly folder: string; readonly state: unknown }
  | { readonly type: 'notify'; readonly folder: string; readonly message: string; readonly level: 'info' | 'warning' | 'error' }
  | { readonly type: 'unregister'; readonly folder: string }
  // The backend's session model list changed (e.g. the user ran /model in
  // the pi session) — the router refreshes the union for the model picker.
  | { readonly type: 'modelsChanged'; readonly folder: string; readonly models: readonly ModelChoice[] }
  // The backend replaced its session (e.g. agentic skill creation starts a
  // fresh session) — browsers update the folder's session id and navigate.
  | { readonly type: 'sessionChanged'; readonly folder: string; readonly sessionId: string }
  // Agentic skill runs: live stream chunks + start/completion/error. `entry`
  // indexes into the run's transcript entries (0 = user prompt, then each
  // assistant turn). `snapshot` carries the full transcript for late joiners.
  // `tool` phases stream tool activity (start → running, end/error → done/error);
  // `title` replaces the run's generated title (opencode big-pickle) once ready;
  // `awaiting` marks a finished turn where the agent asked a question and is
  // waiting for the user to answer back.
  | {
      readonly type: 'skillGen';
      readonly folder: string;
      readonly runId: string;
      readonly workspaceId: string;
      readonly phase: 'start' | 'delta' | 'tool' | 'title' | 'done' | 'awaiting' | 'error' | 'snapshot';
      readonly entry: number;
      readonly status: 'running' | 'done' | 'awaiting' | 'interrupted' | 'error';
      readonly text: string;
      /** Short generated title (undefined until big-pickle has replied). */
      readonly title?: string;
      /** Set on `start` and `snapshot` — the full transcript. */
      readonly entries?: readonly { readonly role: 'user' | 'assistant'; readonly text: string }[];
      /** Set on `start` and `snapshot` — tool activity so far (`turn` = assistant entry index). */
      readonly tools?: readonly {
        readonly name: string;
        readonly status: 'running' | 'done' | 'error';
        readonly turn: number;
      }[];
    };

/** Command shape forwarded verbatim from the browser to the backend. */
export interface BrowserCommand {
  readonly type: 'prompt' | 'steer' | 'followUp' | 'command' | 'skillAgentic' | 'profileAgentic' | 'presetAgentic' | 'skillReply' | 'skillSnapshot';
  readonly text: string;
  /** Client-generated run id (skillAgentic/profileAgentic/presetAgentic) or target run id (skillReply/skillSnapshot). */
  readonly runId?: string;
  /** Existing preset name for presetAgentic modify runs (undefined = create a new one). */
  readonly presetName?: string;
  /** Existing skill id (directory slug) for skillAgentic modify runs (undefined = create a new one). */
  readonly skillName?: string;
  /** Existing profile name for profileAgentic modify runs (undefined = create a new one). */
  readonly profileName?: string;
  /** Include the workspace's authoring-skills skill in the agent's instructions (skill runs). */
  readonly useAuthoringSkill?: boolean;
  /**
   * Model to run agentic tasks on (`provider/model-id`). The dialog can
   * override the header picker per run; when absent the router injects the
   * persisted picker selection. The backend falls back to the session's
   * active model when the id is not pickable there.
   */
  readonly model?: string;
}

/** router → pi backend. */
export type RouterToBackend =
  | { readonly type: 'ok'; readonly folder: string }
  | { readonly type: 'error'; readonly code: string; readonly message: string; readonly expected?: number; readonly got?: number }
  | { readonly type: 'command'; readonly folder: string; readonly command: BrowserCommand }
  | { readonly type: 'shutdown'; readonly folder: string };

/** browser → router (`/ws` socket). */
export interface BrowserToRouter {
  readonly folder: string;
  readonly command: BrowserCommand;
}

/** router → browser. */
export type RouterToBrowser =
  | { readonly type: 'folders'; readonly folders: readonly FolderInfo[]; readonly port: number }
  | { readonly type: 'hello'; readonly folder: string; readonly hello: unknown }
  | { readonly type: 'event'; readonly folder: string; readonly event: unknown }
  | { readonly type: 'loopState'; readonly folder: string; readonly state: unknown }
  | { readonly type: 'notify'; readonly folder: string; readonly message: string; readonly level: 'info' | 'warning' | 'error' }
  | { readonly type: 'folderGone'; readonly folder: string }
  // A skill was created/updated/deleted in a workspace (HTTP API mutations);
  // browsers invalidate their skill queries so every tab stays in sync.
  | {
      readonly type: 'skillChanged';
      readonly folder: string | null;
      readonly workspaceId: string;
      readonly skillId: string;
      readonly kind: 'created' | 'updated' | 'deleted';
    }
  // A profile was created/deleted in a workspace (HTTP API mutations);
  // browsers invalidate their profile queries so every tab stays in sync.
  | {
      readonly type: 'profileChanged';
      readonly folder: string | null;
      readonly workspaceId: string;
      readonly profileName: string;
      readonly kind: 'created' | 'updated' | 'deleted';
    }
  // A review preset was created/updated/deleted in a workspace (HTTP API
  // mutations); browsers invalidate their preset queries so every tab stays
  // in sync.
  | {
      readonly type: 'presetChanged';
      readonly folder: string | null;
      readonly workspaceId: string;
      readonly presetName: string;
      readonly kind: 'created' | 'updated' | 'deleted';
    }
  // The backend replaced its session (e.g. agentic skill creation).
  | { readonly type: 'sessionChanged'; readonly folder: string; readonly sessionId: string }
  // The pickable model set or the persisted selection changed (a tab picked
  // a model, or a backend connected/disconnected/ran /model) — browsers
  // refresh their model query so every tab stays in sync.
  | { readonly type: 'modelsChanged'; readonly models: readonly ModelChoice[]; readonly selected: string | null }
  // Agentic skill run stream (mirrors BackendToRouter).
  | {
      readonly type: 'skillGen';
      readonly folder: string;
      readonly runId: string;
      readonly workspaceId: string;
      readonly phase: 'start' | 'delta' | 'tool' | 'title' | 'done' | 'awaiting' | 'error' | 'snapshot';
      readonly entry: number;
      readonly status: 'running' | 'done' | 'awaiting' | 'interrupted' | 'error';
      readonly text: string;
      /** Short generated title (undefined until big-pickle has replied). */
      readonly title?: string;
      readonly entries?: readonly { readonly role: 'user' | 'assistant'; readonly text: string }[];
      readonly tools?: readonly {
        readonly name: string;
        readonly status: 'running' | 'done' | 'error';
        readonly turn: number;
      }[];
    };
