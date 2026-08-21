// Wire protocol shared with the router daemon (router.ts) and the pi-side
// backend adapter (ui-server.ts). Keep in sync with those.

export interface FolderInfo {
  id: string
  cwd: string
  name: string
  version: number
  connectedAt: number
  /** What user action started this session's UI (e.g. `/montflow`). */
  initiator?: string
  /** The pi session's own id (from its session file name). */
  sessionId?: string
  /** Workspace this session belongs to (metadata — not its identity). */
  workspaceName?: string
}

export interface UiEntry {
  id: string
  parentId: string | null
  timestamp: string | number
  kind: 'user' | 'assistant' | 'toolResult' | 'custom' | 'other'
  text: string
  toolName?: string
  toolCallId?: string
  isError?: boolean
}

export interface HelloPayload {
  entries: UiEntry[]
  leafId: string | null
  sessionFile: string | null
}

export type ClientCommandType =
  | 'prompt'
  | 'steer'
  | 'followUp'
  | 'command'
  | 'skillAgentic'
  | 'profileAgentic'
  | 'presetAgentic'
  | 'promptAgentic'
  | 'textAgentic'
  | 'textGenerate'
  | 'skillReply'
  | 'skillSnapshot'
  | 'skillSetStatus'
  | 'skillRetry'

export interface ClientCommand {
  type: ClientCommandType
  text: string
  /** Client-generated run id (agentic kinds) or target run id (skillReply/skillSnapshot/skillSetStatus). */
  runId?: string
  /** Target status for skillSetStatus (manual status override / force stop). */
  status?: 'done' | 'error' | 'interrupted'
  /** Include the workspace's authoring-skills skill in the agent's instructions. */
  useAuthoringSkill?: boolean
  /** Skills the generated profile must include (profileAgentic). */
  skills?: string[]
  /** Existing preset name for presetAgentic modify runs (undefined = create a new one). */
  presetName?: string
  /** Existing skill id (directory slug) for skillAgentic modify runs (undefined = create a new one). */
  skillName?: string
  /** Existing profile name for profileAgentic modify runs (undefined = create a new one). */
  profileName?: string
  /** Saved prompt name for promptAgentic runs (used for the run title prefix). */
  promptName?: string
  /** Model for agentic runs (`provider/model-id`), injected by the router. */
  model?: string
}

// --- Router → browser messages ---

export type RouterToBrowser =
  | { type: 'folders'; folders: FolderInfo[]; port: number }
  | { type: 'hello'; folder: string; hello: HelloPayload }
  | { type: 'event'; folder: string; event: Record<string, unknown> }
  | { type: 'notify'; folder: string; message: string; level: 'info' | 'warning' | 'error' }
  | { type: 'folderGone'; folder: string }
  | {
      type: 'skillChanged'
      folder: string | null
      workspaceId: string
      skillId: string
      kind: 'created' | 'updated' | 'deleted'
    }
  | {
      type: 'profileChanged'
      folder: string | null
      workspaceId: string
      profileName: string
      kind: 'created' | 'updated' | 'deleted'
    }
  | {
      type: 'presetChanged'
      folder: string | null
      workspaceId: string
      presetName: string
      kind: 'created' | 'updated' | 'deleted'
    }
  | {
      type: 'promptChanged'
      folder: string | null
      workspaceId: string
      promptName: string
      kind: 'created' | 'updated' | 'deleted'
    }
  | { type: 'sessionChanged'; folder: string; sessionId: string }
  | {
      type: 'modelsChanged'
      /** Pickable models (union across connected sessions). */
      models: ModelChoice[]
      /** Persisted picker selection for agentic runs; null = follow session. */
      selected: string | null
    }
  | {
      type: 'textGen'
      folder: string
      runId: string
      phase: 'start' | 'delta' | 'done' | 'error'
      status: 'running' | 'done' | 'error'
      text: string
    }
  | {
      type: 'skillGen'
      folder: string
      runId: string
      workspaceId: string
      phase: 'start' | 'delta' | 'tool' | 'title' | 'done' | 'awaiting' | 'interrupted' | 'error' | 'snapshot'
      entry: number
      status: 'running' | 'done' | 'awaiting' | 'interrupted' | 'error'
      text: string
      /** Short generated title (opencode big-pickle); undefined until ready. */
      title?: string
      entries?: Array<{ role: 'user' | 'assistant'; text: string }>
      tools?: Array<{ name: string; status: 'running' | 'done' | 'error'; turn: number; args?: unknown }>
      /** Tool-call arguments carried by a `tool` phase start (running only). */
      toolArgs?: unknown
      /** Model the run's agent runs on (set on start/snapshot). */
      model?: string
    }

export type ServerMessage = RouterToBrowser

// --- UI rendering model (derived from the message stream) ---

export interface UiMsg {
  id: string
  kind: 'user' | 'assistant' | 'tool' | 'system'
  text: string
  ts: number
  toolName?: string
  toolCallId?: string
  isError?: boolean
  status?: 'running' | 'done' | 'error'
  streaming?: boolean
  toolCalls?: Array<{ name: string; id: string }>
}

export interface ToolRun {
  id: string
  toolName: string
  status: 'running' | 'done' | 'error'
  args: string
  result: string
  startedAt: number
}

export interface Toast {
  id: string
  folder: string | null
  message: string
  level: 'info' | 'warning' | 'error'
}

/** Per-folder client state kept in the SPA (switch is instant). */
export interface FolderState {
  hello: HelloPayload | null
  messages: UiMsg[]
  tools: ToolRun[]
  busy: boolean
}

// --- Workspace git info + skills/profiles (router-computed via /api/workspaces/<id>/...) ---

export interface WorkspaceInfoDetail {
  id: string
  folder: string
  repo: string | null
  branch: string | null
  path: string
}

export interface ProfileSummary {
  name: string
  description: string
  model: string
  skills: string[]
}

export interface ProfileDetail extends ProfileSummary {
  instructions: string
  checklist: string[]
  /** Raw PROFILE.md contents (frontmatter + body) for editing. */
  markdown: string
}

export interface SkillSummary {
  id: string
  name: string
  description: string
  groups: string[]
  dependencies: string[]
}

export interface SkillDetail extends SkillSummary {
  markdown: string
}

/** One agentic run as reported by /api/runs (durable snapshot summary). */
export interface RunSummary {
  runId: string
  folder: string
  workspaceId: string
  status: 'running' | 'done' | 'awaiting' | 'interrupted' | 'error'
  /** First user prompt (fallback title). */
  prompt: string
  /** Short generated title (opencode big-pickle); empty until ready. */
  title?: string
  entryCount: number
  toolCount: number
  updatedAt: number
}

export interface WorkspaceInfo {
  id: string
  name: string
  path: string
  connected: boolean
  lastSeen: number
}

/**
 * One pickable model for agentic runs, as reported by the router (unioned
 * across connected pi sessions).
 */
export interface ModelChoice {
  /** Full `provider/model-id` string. */
  id: string
  /** Provider id, e.g. `anthropic`. */
  provider: string
  /** Model id without the provider prefix, e.g. `claude-sonnet-4-5`. */
  modelId: string
  /** Human-readable model name. */
  name: string
  /** True when some connected session has this model active. */
  isCurrent: boolean
}

// --- Presets (filesystem-backed via /api/workspaces/<id>/presets) ---

export interface PresetReviewerRef {
  type: 'builtin' | 'profile'
  id?: string
  name?: string
  model?: string
  /** Single fallback model tried after `model` fails (optional). */
  fallbackModel?: string
}

/**
 * Stored LOOP preset config — the loop vocabulary as steps, plus execution
 * controls (loops × cycles, deadlock).
 */
export interface PresetLoopConfig extends PresetStepConfig {
  maxLoops: number
  maxCycles?: number
  deadlock: { flipThreshold: number; action: 'escalate' }
  /** Supervisor verdict turn at the end of each cycle (issues remain: yes/no). */
  supervisor?: { model?: string; fallbackModel?: string }
  /** Bookkeeper agent — creates loop scaffolding/artifacts from templates. */
  bookkeeper?: { model?: string; fallbackModel?: string }
}

/** One reviewer inside a reviewer-group roster: a ref plus an optional per-reviewer prompt. */
export interface PresetGroupReviewer {
  reviewer: PresetReviewerRef
  prompt?: string
}

/** Roster entries may be legacy bare refs or the richer { reviewer, prompt? } shape. */
export type PresetGroupReviewerEntry = PresetReviewerRef | PresetGroupReviewer

/**
 * One step in a loop or pipeline preset. Deliberately loose — nothing is
 * destroyed for hand-written kinds. Loop kinds: `reviewer-group`, `reviewer`,
 * `aggregation`, `fixers`, `human`.
 */
export interface PresetWorkflowStep {
  id: string
  kind: string
  label?: string
  params?: Record<string, unknown>
  /** Reviewer roster inside a reviewer-group step (each with an optional prompt). */
  reviewers?: PresetGroupReviewerEntry[]
  /** Selected reviewer for a single reviewer step; undefined = unconfigured (invalid). */
  reviewer?: PresetReviewerRef
  /** Optional extra instructions (reviewer focus, or the required human-interruptor prompt). */
  prompt?: string
  /** Model override for aggregation / fixers / human steps. */
  model?: string
  /** Single fallback model tried after `model` fails (optional). */
  fallbackModel?: string
  /** Parallel agent count for reviewer-group / fixers steps. */
  concurrency?: number
}

/** A config that is an ordered step pipeline (shared by loop and pipeline presets). */
export interface PresetStepConfig {
  steps: PresetWorkflowStep[]
}

/** Stored PIPELINE preset config — an open-ended step pipeline (schematized, not executed). */
export interface PresetWorkflowConfig extends PresetStepConfig {
  description?: string
  /** Global prompt injected into every agent run in this pipeline. */
  prompt?: string
}

export type PresetConfig = PresetLoopConfig | PresetWorkflowConfig

export type PresetType = 'loop' | 'pipeline'

export interface PresetSummary {
  name: string
  /** Preset format version — always 1 today; undefined for unparseable files. */
  version?: number
  /** 'loop' or 'pipeline'; undefined for legacy files (loops) or invalid files. */
  type?: PresetType
  config?: PresetConfig
  error?: string
}

/** One parameter of a prompt — a named placeholder filled when the prompt is run. */
export interface PromptVariable {
  /** Identifier matched in the template as `{{name}}`. */
  name: string
  /** Human-readable label shown in the run dialog. */
  label?: string
  /** Help text under the field in the run dialog. */
  description?: string
  /** `text` (single line) or `textarea` (multi-line); defaults to `text`. */
  type?: 'text' | 'textarea'
  /** True when the run dialog must collect a value before dispatching (default true). */
  required?: boolean
  /** Seed value pre-filled in the run dialog. */
  default?: string
}

/** A saved prompt (prompt factory) — a template plus its variable placeholders. */
export interface PromptSummary {
  name: string
  /** Prompt format version — always 1 today; undefined for unparseable files. */
  version?: number
  /** Optional one-line summary. */
  description?: string
  /** The prompt template with `{{variable}}` placeholders. */
  template?: string
  /** Ordered variable definitions (order controls the run dialog layout). */
  variables?: PromptVariable[]
  /** Workspace skills (by SKILL.md frontmatter name) loaded into the run's context. */
  skills?: string[]
  error?: string
}

/**
 * Lifecycle status of a review loop (driven by the supervisor's state file
 * — the kickoff step, its resolved scope, and the pass/cycle progress).
 */
export type LoopStatus =
  | 'kickoff'
  | 'scoping'
  | 'reviewing'
  | 'fixing'
  | 'awaiting-user'
  | 'done'
  | 'deadlocked'
  | 'interrupted'
  | 'error'

/** Row summary for the workspace Loops section. */
export interface LoopSummary {
  /** Loop id — the kickoff/resume identity (run-scoped like a run id). */
  id: string
  /** Preset this loop is bound to, once the kickoff resolves it. */
  preset?: string
  /** Current lifecycle status (mirrors the supervisor's state file). */
  status: LoopStatus
  /** True while the supervisor is actively working this loop. */
  running: boolean
  /** Last state-file write (ms epoch) — for relative timestamps. */
  updatedAt: number
}

/** Role a loop agent plays. */
export type LoopAgentKind = 'supervisor' | 'reviewer' | 'fixer' | 'human'

/** An agent working on (or that worked on) a loop — its live thoughts live in a run. */
export interface LoopAgent {
  /** The underlying run — open `/runs/<id>/` to see its live thoughts. */
  runId: string
  /** Human label, e.g. "Supervisor", "Reviewer: security", "Fixer". */
  label: string
  kind: LoopAgentKind
  /** Model this agent runs on. */
  model?: string
  /** Working now (false once complete) vs. done. */
  running: boolean
  /** Terminal outcome when !running. */
  outcome?: 'ok' | 'error' | 'interrupted'
  /** When it finished (ms epoch), when done. */
  finishedAt?: number
  /** Free-text summary of what it produced. */
  summary?: string
}

/** One entry in a loop's history timeline. */
export interface LoopHistoryEntry {
  /** Timestamp (ms epoch). */
  at: number
  /** Short title, e.g. "Supervisor resolved scope". */
  title: string
  /** Detail/description. */
  detail?: string
  /** Linked run, when this entry was an agent's work. */
  runId?: string
}

/** Rich detail view for a loop — status plus its agents and history. */
export interface LoopDetail extends LoopSummary {
  /** Pass/cycle progress when the loop is mid-flight. */
  loop?: number
  cycle?: number
  maxLoops?: number
  maxCycles?: number
  /** Agents currently working (open their run to see live thoughts). */
  agents: LoopAgent[]
  /** Chronological history of completed work. */
  history: LoopHistoryEntry[]
}

export interface BuiltinReviewerInfo {
  id: string
  label: string
}

// --- Event payload helpers (defensive parsing of forwarded pi events) ---

export interface AssistantMessageEvent {
  type: string
  contentIndex?: number
  delta?: string
  content?: string
  toolCall?: { id?: string; name?: string }
}

export interface EventToolExecution {
  type?: string
  toolCallId?: string
  toolName?: string
  args?: unknown
  result?: { content?: unknown }
  partialResult?: { content?: unknown }
  isError?: boolean
}

/** Extract plain text from a message content (string or block array). */
export function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const b = block as { type?: string; text?: string; thinking?: string }
        if (b.type === 'text' && typeof b.text === 'string') return b.text
        if (b.type === 'thinking' && typeof b.thinking === 'string') return b.thinking
        return ''
      })
      .filter((t) => t !== '')
      .join('\n')
  }
  return ''
}

/** Extract tool calls from an assistant message content array. */
export function contentToToolCalls(content: unknown): Array<{ name: string; id: string }> {
  if (!Array.isArray(content)) return []
  return content
    .map((block) => block as { type?: string; name?: string; id?: string })
    .filter((b) => b.type === 'toolCall' && typeof b.name === 'string')
    .map((b) => ({ name: b.name ?? 'tool', id: b.id ?? `${b.name}-${Math.random().toString(36).slice(2, 8)}` }))
}

/** Truncate long tool output for compact rendering. */
export function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… (${text.length - max} more chars)`
}
