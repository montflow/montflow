/**
 * Router-side run executor — the detached daemon OWNS agentic runs.
 *
 * Previously agentic runs (skill/profile/preset/text/prompt + AI-input)
 * executed INSIDE the pi session that launched `/montflow`: the backend
 * adapter created an isolated agent and streamed it back through the router.
 * The consequence: a run's live agent died the moment that pi session did.
 *
 * This module moves run execution into the router daemon itself (a detached,
 * machine-level node process). Each run still gets its own isolated agent
 * session via the pi SDK (never the user's session), but it now lives in the
 * router — so a run survives the launching pi session, browser tabs, and
 * router restarts. Persistence (transcript + resumable session file) and
 * resume are unchanged, and a small concurrency pool bounds simultaneous
 * agent turns so a loop's reviewer fan-out can't stampede the provider.
 *
 * Erasable TypeScript only (the router daemon is plain node).
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { basename, join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import {
  createProfileAgent,
  createPromptAgent,
  createPresetAgent,
  createSkillAgent,
  createTextAgent,
  disposeSkillAgent,
  isAwaitingAnswer,
  loadPromptSkills,
  promptSkillAgent,
  wrapPresetPrompt,
  wrapProfilePrompt,
  wrapPromptPrompt,
  wrapSkillPrompt,
  wrapTextPrompt,
  type SkillRunAgent,
  type SkillRunResult,
} from './skill-run.ts';
import { generateRunTitle } from './run-title.ts';

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

/** Skill-run lifecycle as seen by the browser (mirrors the router skillGen). */
export interface ExecutorSkillGen {
  readonly folder: string;
  readonly runId: string;
  readonly workspaceId: string;
  readonly phase:
    | 'start'
    | 'delta'
    | 'tool'
    | 'title'
    | 'done'
    | 'awaiting'
    | 'interrupted'
    | 'error'
    | 'snapshot';
  readonly entry: number;
  readonly status: 'running' | 'done' | 'awaiting' | 'interrupted' | 'error';
  readonly text: string;
  readonly title?: string;
  readonly entries?: readonly { readonly role: 'user' | 'assistant'; readonly text: string }[];
  readonly tools?: readonly {
    readonly name: string;
    readonly status: 'running' | 'done' | 'error';
    readonly turn: number;
    /** Tool-call arguments (absent for pre-args runs / legacy snapshots). */
    readonly args?: unknown;
  }[];
  /** Tool-call arguments carried by a `tool` phase start (running only). */
  readonly toolArgs?: unknown;
  /** Model the run's agent runs on (set on `start`/`snapshot`). */
  readonly model?: string;
}

/** A run kind — which authoring agent (system prompt + tools) to spin up. */
export type RunKind = 'skill' | 'profile' | 'preset' | 'text' | 'prompt';

/** Inputs a new run needs to start. */
export interface StartRunOptions {
  readonly runId?: string;
  readonly folder: string;
  readonly workspaceId: string;
  readonly cwd: string;
  readonly text: string;
  /** Resolved model (`provider/model-id`) for the run's agent. */
  readonly model: string;
  readonly useAuthoringSkill?: boolean;
  readonly skillName?: string;
  readonly profileName?: string;
  readonly presetName?: string;
  readonly promptName?: string;
  readonly skills?: readonly string[];
  /** Title prefix, e.g. `[skill-create]` (per-kind default when omitted). */
  readonly titlePrefix?: string;
}

// ---------------------------------------------------------------------------
// Run record + persistence (mirrors the old backend adapters' store, but now
// lives in the router process so runs survive the pi session that started them)
// ---------------------------------------------------------------------------

interface RunRecord {
  readonly runId: string;
  readonly folder: string;
  readonly workspaceId: string;
  readonly cwd: string;
  readonly kind: RunKind;
  /** Resolved model (`provider/model-id`) this run's agent runs on. */
  model: string;
  title?: string;
  agent: SkillRunAgent | null;
  status: 'running' | 'done' | 'awaiting' | 'interrupted' | 'error';
  entries: Array<{ role: 'user' | 'assistant'; text: string }>;
  tools: Array<{
    name: string;
    status: 'running' | 'done' | 'error';
    turn: number;
    args?: unknown;
  }>;
  sessionFile?: string;
  stopped?: boolean;
  readonly createdAt: number;
  updatedAt: number;
}

interface PersistedRun {
  readonly runId: string;
  readonly folder: string;
  readonly workspaceId: string;
  readonly cwd: string;
  readonly kind: RunKind;
  readonly model?: string;
  readonly status: RunRecord['status'];
  readonly entries: RunRecord['entries'];
  readonly tools: RunRecord['tools'];
  readonly title?: string;
  readonly sessionFile?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const runsRoot = (cwd: string): string =>
  join(getAgentDir(), 'runs', `${basename(cwd)}--${shortHash(cwd)}`);
const runDir = (cwd: string, runId: string): string => join(runsRoot(cwd), runId);
const runMetaPath = (cwd: string, runId: string): string => join(runDir(cwd, runId), 'run.json');

const shortHash = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
};

// ---------------------------------------------------------------------------
// Concurrency pool — bounds simultaneous agent turns so a loop's reviewer
// fan-out (or several open runs) can't fire unbounded provider requests.
// ---------------------------------------------------------------------------

/** A tiny semaphore: at most `max` concurrent critical sections. (Erasable TS.) */
class TurnPool {
  private readonly max: number;
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(max: number) {
    this.max = max;
  }

  async use<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export interface RunExecutorOptions {
  /** Broadcast one skillGen message to every interested browser (+ cache). */
  emit: (msg: ExecutorSkillGen) => void;
  /** Resolve a folder id (or run owner) to its workspace directory. */
  getCwd: (folder: string | undefined) => string | undefined;
  /** Max simultaneous agent turns (default 6). */
  maxConcurrent?: number;
}

export interface RunExecutor {
  start(kind: RunKind, opts: StartRunOptions): void;
  /** True when this executor currently holds a record for the run id. */
  has(runId: string): boolean;
  /**
   * Follow-up answer to a run's agent. `model` is an optional per-run
   * override — when the agent must be (re)created (interrupted/error
   * runs), it is created on that model instead.
   */
  reply(runId: string, text: string, model?: string): void;
  /**
   * Re-run the last user prompt as a fresh turn (retry after an error or
   * no-response, or regenerate a finished answer). The current agent is
   * disposed and recreated WITHOUT resuming its session file, so the
   * re-prompt starts from a clean conversation. `model` switches the model.
   */
  retry(runId: string, model?: string): void;
  snapshot(runId: string): void;
  setStatus(runId: string, status: 'done' | 'error' | 'interrupted'): void;
  /** Rebuild in-memory records for a cwd from its persisted run.json files. */
  restore(cwd: string): Promise<void>;
}

const titlePrefixFor = (kind: RunKind, opts: StartRunOptions): string => {
  if (opts.titlePrefix !== undefined) return opts.titlePrefix;
  switch (kind) {
    case 'skill':
      return '[skill-create]';
    case 'profile':
      return '[profile-create]';
    case 'preset':
      return opts.presetName !== undefined ? '[preset-edit]' : '[preset-create]';
    case 'prompt':
      return '[prompt]';
    case 'text':
      return '[ai-input]';
  }
};

/** Build the full agentic prompt (mirrors the old backend's startAgenticRun). */
const buildPrompt = async (kind: RunKind, opts: StartRunOptions): Promise<string> => {
  const cwd = opts.cwd;
  switch (kind) {
    case 'skill': {
      const authoringSkill =
        opts.useAuthoringSkill === true
          ? await readSkillMarkdown(cwd, 'authoring-skills')
          : undefined;
      return wrapSkillPrompt(opts.text, authoringSkill, opts.skillName);
    }
    case 'profile':
      return wrapProfilePrompt(opts.text, opts.profileName, opts.skills);
    case 'preset':
      return wrapPresetPrompt(opts.text, opts.presetName);
    case 'prompt': {
      const promptSkills =
        (opts.skills?.length ?? 0) > 0 ? await loadPromptSkills(cwd, opts.skills ?? []) : undefined;
      return wrapPromptPrompt(opts.text, opts.promptName, promptSkills);
    }
    case 'text':
      return wrapTextPrompt(opts.text);
  }
};

/** Read a skill's SKILL.md body (for the "include authoring skill" toggle). */
const readSkillMarkdown = async (cwd: string, name: string): Promise<string | undefined> => {
  try {
    return await readFile(join(cwd, '.agents', 'skills', name, 'SKILL.md'), 'utf8');
  } catch {
    return undefined;
  }
};

/** Map a run kind to its agent factory (toolset + system prompt live there). */
const agentFactory = (kind: RunKind) => {
  switch (kind) {
    case 'skill':
      return createSkillAgent;
    case 'profile':
      return createProfileAgent;
    case 'preset':
      return createPresetAgent;
    case 'prompt':
      return createPromptAgent;
    case 'text':
      return createTextAgent;
  }
};

/** Serialize a run record to its on-disk JSON shape. */
const toPersisted = (record: RunRecord): PersistedRun => ({
  runId: record.runId,
  folder: record.folder,
  workspaceId: record.workspaceId,
  cwd: record.cwd,
  kind: record.kind,
  model: record.model,
  status: record.status,
  entries: record.entries,
  tools: record.tools,
  title: record.title,
  sessionFile: record.sessionFile,
  createdAt: record.createdAt,
  updatedAt: Date.now(),
});

/** Build the initial record for a new run (mirrors the conversation exactly). */
const makeRecord = (kind: RunKind, opts: StartRunOptions, text: string): RunRecord => ({
  runId: opts.runId ?? `run-${randomUUID().slice(0, 8)}`,
  folder: opts.folder,
  workspaceId: opts.workspaceId,
  cwd: opts.cwd,
  kind,
  model: opts.model,
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

export const createRunExecutor = (options: RunExecutorOptions): RunExecutor => {
  const records = new Map<string, RunRecord>();
  const pool = new TurnPool(options.maxConcurrent ?? 6);
  const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const send = (
    record: RunRecord,
    phase: ExecutorSkillGen['phase'],
    entry: number,
    text: string,
    status: ExecutorSkillGen['status'] = record.status,
    toolArgs?: unknown,
  ): void => {
    options.emit({
      folder: record.folder,
      runId: record.runId,
      workspaceId: record.workspaceId,
      phase,
      entry,
      status,
      text,
      title: record.title,
      entries: phase === 'start' || phase === 'snapshot' ? record.entries : undefined,
      tools: phase === 'start' || phase === 'snapshot' ? record.tools : undefined,
      toolArgs: phase === 'tool' && status === 'running' ? toolArgs : undefined,
      model: phase === 'start' || phase === 'snapshot' ? record.model : undefined,
    });
  };

  const writeRunMeta = async (record: RunRecord): Promise<void> => {
    record.updatedAt = Date.now();
    try {
      await mkdir(runDir(record.cwd, record.runId), { recursive: true });
      await writeFile(runMetaPath(record.cwd, record.runId), `${JSON.stringify(toPersisted(record), null, 2)}\n`, 'utf8');
    } catch {
      // transient write failures are non-fatal
    }
  };

  const persistRun = (record: RunRecord, immediate = false): void => {
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

  /** Run one turn for a record (first prompt or a follow-up reply), bounded by the pool. */
  const runTurn = (record: RunRecord, prompt: string): void => {
    void pool
      .use(async () => {
        const assistantIdx = record.entries.length - 1;
        if (record.agent === null) {
          try {
            const cwd = options.getCwd(record.folder);
            if (cwd === undefined) throw new Error('Workspace is no longer connected.');
            const factory = agentFactory(record.kind);
            record.agent = await factory(cwd, record.model, {
              sessionDir: runDir(record.cwd, record.runId),
              resumeSessionFile: record.sessionFile,
            });
            record.sessionFile = record.agent.sessionFile;
            persistRun(record, true);
          } catch (error) {
            if (record.stopped === true) return;
            const message = error instanceof Error ? error.message : String(error);
            record.status = 'error';
            record.entries[assistantIdx]!.text = message;
            persistRun(record, true);
            send(record, 'error', assistantIdx, message);
            return;
          }
        }
        const result: SkillRunResult = await promptSkillAgent(
          record.agent,
          prompt,
          (delta) => {
            if (record.stopped === true) return;
            record.entries[assistantIdx]!.text += delta;
            persistRun(record);
            send(record, 'delta', assistantIdx, delta);
          },
          (activity) => {
            if (record.stopped === true) return;
            if (activity.kind === 'start') {
              record.tools.push({
                name: activity.tool,
                status: 'running',
                turn: assistantIdx,
                args: activity.args,
              });
              persistRun(record);
              send(record, 'tool', assistantIdx, activity.tool, 'running', activity.args);
            } else {
              const tool = [...record.tools]
                .toReversed()
                .find((t) => t.name === activity.tool && t.status === 'running');
              if (tool !== undefined) tool.status = activity.kind === 'error' ? 'error' : 'done';
              persistRun(record);
              send(record, 'tool', assistantIdx, activity.tool, activity.kind === 'error' ? 'error' : 'done');
            }
          },
        );
        if (record.stopped === true) return;
        record.status = result.ok
          ? isAwaitingAnswer(record.entries[assistantIdx]!.text)
            ? 'awaiting'
            : 'done'
          : 'error';
        if (!result.ok && record.entries[assistantIdx]!.text === '') {
          record.entries[assistantIdx]!.text = result.error;
        }
        persistRun(record, true);
        send(record, record.status, assistantIdx, record.entries[assistantIdx]!.text);
      })
      .catch((cause) => {
        record.status = 'error';
        const message = cause instanceof Error ? cause.message : String(cause);
        record.entries[record.entries.length - 1]!.text = message;
        persistRun(record, true);
        send(record, 'error', record.entries.length - 1, message);
      });
  };

  return {
    has(runId) {
      return records.has(runId);
    },

    start(kind, opts) {
      void (async () => {
        const prompt = await buildPrompt(kind, opts);
        const record = makeRecord(kind, opts, prompt);
        records.set(record.runId, record);
        persistRun(record, true);
        send(record, 'start', 0, prompt);
        // Fire-and-forget title generation; any failure keeps the prompt as title.
        void generateRunTitle(opts.text, { prefix: titlePrefixFor(kind, opts) }).then((title) => {
          if (title === null || title === '') return;
          record.title = title;
          persistRun(record, true);
          send(record, 'title', 0, title);
        });
        runTurn(record, prompt);
      })();
    },

    reply(runId, text, model) {
      const record = records.get(runId);
      if (record === undefined || record.status === 'running' || text.trim() === '') return;
      if (model !== undefined && model !== '') record.model = model;
      record.entries.push({ role: 'user', text });
      record.entries.push({ role: 'assistant', text: '' });
      record.stopped = false;
      record.status = 'running';
      persistRun(record, true);
      const userIdx = record.entries.length - 2;
      send(record, 'start', userIdx, text);
      runTurn(record, text);
    },

    retry(runId, model) {
      const record = records.get(runId);
      if (record === undefined || record.status === 'running') return;
      // Re-run the LAST user prompt. The trailing assistant slot is reset
      // to empty and re-streamed, so the transcript stays tidy (no stale
      // failed answer or completed summary below the retried one).
      const userIdx = record.entries.findLastIndex((entry) => entry.role === 'user');
      if (userIdx < 0) return;
      const prompt = record.entries[userIdx]!.text;
      let assistantIdx = record.entries.length - 1;
      if (record.entries[assistantIdx]!.role === 'assistant') {
        record.entries[assistantIdx] = { role: 'assistant', text: '' };
      } else {
        record.entries.push({ role: 'assistant', text: '' });
        assistantIdx = record.entries.length - 1;
      }
      if (model !== undefined && model !== '') record.model = model;
      record.stopped = false;
      record.status = 'running';
      // A retry starts from a CLEAN conversation: drop the live agent and
      // its session file, so the re-prompt is answered without the previous
      // (failed or completed) attempt in context. Tool activity is cleared
      // too — a force-stop can leave a tool stuck in `running`, which would
      // otherwise replay as a permanent spinner on the retried turn.
      const agent = record.agent;
      record.agent = null;
      record.sessionFile = undefined;
      record.tools = [];
      if (agent !== null) void disposeSkillAgent(agent);
      persistRun(record, true);
      send(record, 'start', assistantIdx, prompt);
      runTurn(record, prompt);
    },

    snapshot(runId) {
      const record = records.get(runId);
      if (record === undefined) return;
      send(record, 'snapshot', 0, '');
    },

    setStatus(runId, status) {
      const record = records.get(runId);
      if (record === undefined) return;
      record.stopped = true;
      const agent = record.agent;
      record.agent = null;
      if (agent !== null) {
        void disposeSkillAgent(agent);
      }
      record.status = status;
      persistRun(record, true);
      send(record, status, record.entries.length - 1, '');
    },

    async restore(cwd) {
      let entries: Dirent[];
      try {
        entries = await readdir(runsRoot(cwd), { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const runId = entry.name;
        try {
          const raw = await readFile(runMetaPath(cwd, runId), 'utf8');
          const parsed = JSON.parse(raw) as Partial<PersistedRun>;
          if (typeof parsed.runId !== 'string' || parsed.runId === '') continue;
          const record: RunRecord = {
            runId: parsed.runId,
            folder: typeof parsed.folder === 'string' ? parsed.folder : basename(cwd),
            workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : '',
            cwd,
            kind: parsed.kind === 'profile' || parsed.kind === 'preset' || parsed.kind === 'prompt' || parsed.kind === 'text' ? parsed.kind : 'skill',
            model: typeof parsed.model === 'string' ? parsed.model : '',
            title: typeof parsed.title === 'string' ? parsed.title : undefined,
            agent: null,
            status: parsed.status === 'running' ? 'interrupted' : (parsed.status ?? 'interrupted'),
            entries: Array.isArray(parsed.entries) ? parsed.entries : [],
            tools: Array.isArray(parsed.tools) ? parsed.tools : [],
            sessionFile: typeof parsed.sessionFile === 'string' ? parsed.sessionFile : undefined,
            createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
          };
          records.set(record.runId, record);
          send(record, 'snapshot', 0, '');
        } catch {
          // corrupt / unreadable run — skip
        }
      }
    },
  };
};
