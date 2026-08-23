/**
 * Router-side review-loop executor — the REAL loop runtime (wiki/loop.md).
 *
 * Owns everything between "user picks a preset + types a prompt" and a
 * finished review loop. Plain-code ORCHESTRATOR (all control: counters,
 * caps, status flips, retries); LLM agents do the work:
 *
 *   scoper (once) → reviewers (fan-out) → aggregator → fixer → supervisor
 *   verdict → counters/caps → next cycle / next loop / awaiting-user.
 *
 * Every agent phase is a REAL isolated pi session whose stream flows through
 * the same `skillGen` wire shape the run executor uses — so each agent gets a
 * run page, live streaming, durable persistence in the router's run store,
 * and notifications for free.
 *
 * State lives in `<cwd>/.agents/@montflow/loops/<loopId>/loop.json`, written
 * by the orchestrator after every transition (crash-safe resume never
 * depends on LLM-written JSON). Artifacts sit alongside: `scope.md`,
 * `diff.patch` (git-unstaged scopes), and `passes/<loop>-<cycle>/` scratch +
 * canonical review files.
 *
 * v1 deviations from the wiki (recorded honestly):
 * - The Bookkeeper LLM is deferred: the orchestrator scaffolds artifacts
 *   deterministically (its counter transitions were always going to be
 *   deterministic anyway).
 * - The aggregator owns fixer SCHEDULING: it writes canonical.md plus a
 *   fix-plan.md (groups = parallel batches, `after` = sequencing, strict
 *   FIX_PLAN_JSON tail). Dispatch is plain code — waves run in dependency
 *   order, one fixer agent per Open finding, bounded by the fixers step's
 *   `concurrency`.
 * - Reviewer sessions are FRESH per turn — the wiki's hybrid rule (wiki §3:
 *   same reviewer sessions across steps 1→4 of ONE cycle, fresh next cycle)
 *   is NOT implemented yet; no context carries anywhere.
 * - The preset's `deadlock` field is validated upstream and ignored (§8).
 *
 * Erasable TypeScript only (the router daemon is plain node).
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect, type Schema } from 'effect';
import { createPersistentAgent, type PersistentAgent } from './runner.ts';
import { parseProfile } from './profiles/model.ts';
import type { PresetLoopConfigDecoded, ReviewerRefDecoded, WorkflowGroupReviewerSchema, WorkflowStepSchema } from './preset-schema.ts';

/** Shape of one decoded workflow step. */
type WorkflowStep = Schema.Schema.Type<typeof WorkflowStepSchema>;
/** One entry in a reviewer-group roster: a bare ref or a wrapped ref + prompt. */
type GroupReviewerEntry = Schema.Schema.Type<typeof WorkflowGroupReviewerSchema>;

// ---------------------------------------------------------------------------
// Public shapes (loop.json on disk + the loopUpdated wire payload)
// ---------------------------------------------------------------------------

export type LoopStatus =
  | 'pending'
  | 'scoping'
  | 'reviewing'
  | 'fixing'
  | 'awaiting-user'
  | 'done'
  | 'incomplete'
  | 'interrupted'
  | 'error';

export interface LoopRosterEntry {
  readonly runId: string;
  readonly label: string;
  readonly kind: 'supervisor' | 'reviewer' | 'fixer';
  model?: string;
  running: boolean;
  outcome?: 'ok' | 'error' | 'interrupted';
  finishedAt?: number;
  summary?: string;
}

export interface LoopHistoryEntry {
  readonly at: number;
  readonly title: string;
  readonly detail?: string;
  readonly runId?: string;
}

/** The full loop state — persisted as loop.json, pushed as `loopUpdated`. */
export interface LoopState {
  readonly id: string;
  readonly preset: string;
  /** Human label from the kickoff goal (agentic scopes). */
  readonly name?: string;
  status: LoopStatus;
  running: boolean;
  /** Independent loop index (1-based). */
  loop: number;
  /** Cycle within the loop (1-based). */
  cycle: number;
  maxLoops: number;
  maxCycles: number;
  /** Open-findings count from the last verdict/aggregation. */
  openIssues: number;
  readonly scopeType: 'git-unstaged' | 'agentic';
  /** Snapshotted preset config — resume works without re-reading the preset file. */
  readonly config: PresetLoopConfigDecoded;
  roster: LoopRosterEntry[];
  history: LoopHistoryEntry[];
  readonly createdAt: number;
  updatedAt: number;
}

/** Inputs a kickoff needs (router resolves paths). */
export interface StartLoopOptions {
  readonly folder: string;
  readonly workspaceId: string;
  readonly cwd: string;
  readonly presetName: string;
  readonly config: PresetLoopConfigDecoded;
  readonly scope: { readonly type: 'git-unstaged' } | { readonly type: 'agentic'; readonly goal: string };
}

export type LoopResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export interface LoopExecutor {
  start(options: StartLoopOptions): Promise<LoopResult<LoopState>>;
  stop(workspaceId: string, loopId: string): Promise<LoopResult<LoopState>>;
  resume(workspaceId: string, loopId: string): Promise<LoopResult<LoopState>>;
  decide(workspaceId: string, loopId: string, action: 'raise-cycles' | 'raise-loops' | 'complete'): Promise<LoopResult<LoopState>>;
  remove(workspaceId: string, loopId: string): Promise<LoopResult<true>>;
  /** All loops for a workspace directory, newest first. Stale running loops are marked interrupted. */
  list(cwd: string): Promise<LoopState[]>;
  get(cwd: string, loopId: string): Promise<LoopState | null>;
}

export interface LoopExecutorOptions {
  /** Stream one agent-run chunk (same wire shape as the run executor's skillGen). */
  emit: (msg: {
    readonly folder: string;
    readonly runId: string;
    readonly workspaceId: string;
    readonly phase: 'start' | 'delta' | 'tool' | 'done' | 'error' | 'interrupted';
    readonly entry: number;
    readonly status: 'running' | 'done' | 'error' | 'interrupted';
    readonly text: string;
    readonly title?: string;
    readonly entries?: readonly { readonly role: 'user' | 'assistant'; readonly text: string }[];
    readonly tools?: readonly { readonly name: string; readonly status: 'running' | 'done' | 'error'; readonly turn: number; readonly args?: unknown }[];
    readonly toolArgs?: unknown;
    readonly model?: string;
  }) => void;
  /** Push a full loop state to browsers after every transition. */
  broadcastLoop: (workspaceId: string, loop: LoopState) => void;
  /** Resolve a workspace id to its directory (for stop/resume/decide by id). */
  getCwd: (workspaceId: string) => string | undefined;
  /** Max simultaneous agent turns across ALL loops. */
  maxConcurrent?: number;
}

// ---------------------------------------------------------------------------
// Disk layout
// ---------------------------------------------------------------------------

const LOOP_DIR = ['.agents', '@montflow', 'loops'] as const;

const loopsRoot = (cwd: string): string => join(cwd, ...LOOP_DIR);
const loopDir = (cwd: string, loopId: string): string => join(loopsRoot(cwd), loopId);
const loopStatePath = (cwd: string, loopId: string): string => join(loopDir(cwd, loopId), 'loop.json');
const passesDir = (cwd: string, loopId: string): string => join(loopDir(cwd, loopId), 'passes');

const isValidLoopId = (id: string): boolean => /^loop_[a-z0-9]+$/.test(id);

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const now = (): number => Date.now();

/** Run ids for a loop agent's stream (`run-…` like the run executor's ids). */
const agentRunId = (): string => `run-${randomUUID().slice(0, 8)}`;

/** Fixers-per-wave bound when the preset's fixers step sets no concurrency. */
const DEFAULT_FIXER_CONCURRENCY = 4;

// ---------------------------------------------------------------------------
// Concurrency pool — bounds simultaneous agent turns across all loops
// ------------------------------------------------------------------------

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
// Role system prompts
// ---------------------------------------------------------------------------

const SCOPER_SYSTEM = `You are the scoper for a code-review loop.

Your job runs EXACTLY ONCE per kickoff: turn the kickoff prompt into a
concrete review scope and write it to the scope.md path given in the task.

scope.md must contain these sections:
- ## Target — one paragraph: what is being reviewed and why
- ## In-scope files — concrete paths (explore the tree to find them)
- ## Out of scope — explicit exclusions
- ## Focus notes — risks, edge cases, and what reviewers should dig into

Rules:
- Explore with read/grep/glob until you can name real paths — never invent them.
- Write ONLY the scope.md file. Change nothing else.
- When done, reply with ONE short paragraph summarizing the scope.`;

const REVIEWER_SYSTEM = `You are one reviewer in an adversarial review loop.

You review READ-ONLY: use read/grep/glob, and NEVER modify, write, or edit
any file. Your findings are harvested from your reply text.

Method:
1. Read the scope file named in your task FIRST — it bounds everything.
2. Review only what the scope covers; ignore out-of-scope areas entirely.
3. Hunt for real problems, not style nits: bugs, security holes, broken
   edge cases, race conditions, missing validation, bad error handling.
4. End your reply with a "## Findings" section. Each finding is one block:

   N. SEVERITY — path/to/file.ts:LINE
   Problem: what is wrong and why it matters.
   Fix: the concrete change to make.

   SEVERITY is CRITICAL, HIGH, MEDIUM, or LOW. Use the real line numbers.
5. If you truly find nothing, end with "## Findings\n\nNone." — say so
   explicitly; never pad with non-issues.`;

const AGGREGATOR_SYSTEM = `You are the aggregator for a review loop.

Several reviewers wrote scratch reports (paths in your task). Merge them
into ONE canonical review file AND a fix plan (both paths in your task).

Canonical format (canonical.md):
# Canonical review

## Findings

N. SEVERITY — path/to/file.ts:LINE — [Open]
   Problem: ...
   Fix: ...

Rules:
- Deduplicate: the same issue reported twice appears ONCE.
- Drop noise: findings outside the scope, style-only nits without substance.
- Keep severity honest — escalate only with evidence.
- Mark every surviving finding "[Open]".
- End the FILE with exactly one line: OPEN_ISSUES: <number of Open findings>

Fix plan (fix-plan.md): follow the template given in your task EXACTLY. It
schedules the fixers:
- One row per Open finding, keyed by its canonical number.
- Groups decide parallelism: findings that touch DIFFERENT files can share
  a group (they run in parallel); findings touching the SAME file MUST be
  in different groups ordered by dependency.
- Sequence groups with "after": severe/independent work first, entangled
  files later.
- End fix-plan.md with the FIX_PLAN_JSON line exactly as the template shows,
  listing every group and finding — it is parsed mechanically; deviations
  fail the aggregation.

You may write ONLY those two files. Reply with a one-paragraph summary of
the merged review and the schedule.`;

const FIXER_SYSTEM = `You are ONE fixer in a review loop's fixer wave.

Your task names the canonical review file and YOUR finding number. Read the
canonical review, find that numbered finding, and fix ONLY it using your
edit tools.

Rules:
- Fix the finding in the file(s) it points at — stay exactly in that scope.
  Other findings are OTHER agents' jobs; do not touch them even if trivial.
- Read each file before editing it; keep surrounding code style.
- If the finding turns out to be wrong or unfixable, do NOT force it — say so.
- Change nothing else: no refactors, no drive-by cleanups.
- Reply with exactly one line: "<N>. fixed — <what you did>" or
  "<N>. skipped — <why>".`;

const SUPERVISOR_SYSTEM = `You are the supervisor of a review loop.

Your ONLY job is the verdict. Read the canonical review file named in the
task and decide whether genuinely actionable issues remain.

Your ENTIRE reply must be exactly one minified JSON object and nothing else:

{"verdict":"issues","openIssues":3}

- verdict is "clean" when zero actionable findings remain, otherwise "issues".
- openIssues is the integer count of remaining Open findings (0 when clean).
- No prose, no markdown fences — ONLY the JSON object.`;

/**
 * The fix-plan template — the aggregator's machine contract for the schedule
 * file (wiki loop.md §5 templates). Loaded from `templates/loop/` next to
 * this module; falls back to the embedded copy when the file is missing.
 */
const FIX_PLAN_TEMPLATE_FALLBACK = `# Fix plan — loop {{LOOP}} cycle {{CYCLE}}

One row per Open finding from canonical.md. Findings that touch the same
files MUST sit in different groups (sequential); independent findings share
a group (parallel). Order groups so dependencies come first and severe
findings land early.

| Finding | Severity | Files | Group |
|---|---|---|---|
| 1 | HIGH — what is wrong, one line | src/a.ts:12 | G1 |

## Execution groups

- G1 (parallel): findings 1, 3 — independent edits
- G2 (after G1): findings 2 — touches src/a.ts like finding 1

FIX_PLAN_JSON: {"groups":[{"id":"G1","findings":[1,3]},{"id":"G2","findings":[2],"after":["G1"]}]}
`;

const loadFixPlanTemplate = async (): Promise<string> => {
  try {
    return await readFile(
      join(dirname(fileURLToPath(import.meta.url)), 'templates', 'loop', 'fix-plan.md'),
      'utf8',
    );
  } catch {
    return FIX_PLAN_TEMPLATE_FALLBACK;
  }
};

/** Lens objectives for builtin reviewer catalog ids (label-only upstream). */
const BUILTIN_LENSES: Record<string, string> = {
  generic: 'Audit the in-scope code for correctness and real defects: logic errors, unhandled edge cases, broken assumptions, and misleading behavior.',
  security: 'Audit the in-scope code for security weaknesses: injection, missing authorization checks, unsafe secrets handling, predictable tokens, insecure defaults, unsafe deserialization.',
  quality: 'Audit the in-scope code for maintainability: duplication, tangled responsibilities, dead code, fragile abstractions — only where they cause real risk or cost.',
  technical: 'Audit the in-scope code for technical soundness: concurrency and race conditions, resource leaks, error propagation, performance traps, API misuse.',
  guidelines: 'Audit the in-scope code against the repository’s own documented conventions (AGENTS.md, READMEs, neighboring modules) and flag real violations.',
  style: 'Audit the in-scope code for readability: unclear naming, misleading structure, inconsistent formatting patterns — flag only what actively impedes readers.',
  linguist: 'Audit user-facing strings, docs, and comments in scope for grammar, clarity, and consistency; flag wording that misleads users or developers.',
};

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

const reviewerLensOf = async (
  ref: ReviewerRefDecoded,
  cwd: string,
): Promise<{ label: string; lens: string }> => {
  if (ref.type === 'profile') {
    const name = ref.name ?? '';
    try {
      const markdown = await readFile(
        join(cwd, '.agents', '@montflow', 'profiles', name, 'PROFILE.md'),
        'utf8',
      );
      const profile = parseProfile(markdown, name);
      const checklist =
        profile.checklist.length > 0
          ? `\nChecklist to verify:\n${profile.checklist.map((item) => `- ${item}`).join('\n')}`
          : '';
      return {
        label: name,
        lens: `${profile.description}\n${profile.instructions}${checklist}`,
      };
    } catch {
      return { label: name, lens: `Follow the profile '${name}'. It could not be read — fall back to a general defect audit.` };
    }
  }
  const id = ref.id ?? 'generic';
  return { label: id, lens: BUILTIN_LENSES[id] ?? BUILTIN_LENSES.generic! };
};

/** Preferred model of a profile reference (read from its PROFILE.md frontmatter). */
const profileModelOf = async (ref: ReviewerRefDecoded, cwd: string): Promise<string | undefined> => {
  if (ref.type !== 'profile' || ref.model !== undefined) return ref.model;
  try {
    const markdown = await readFile(
      join(cwd, '.agents', '@montflow', 'profiles', ref.name ?? '', 'PROFILE.md'),
      'utf8',
    );
    const model = parseProfile(markdown, ref.name ?? '').model;
    return model !== '' ? model : undefined;
  } catch {
    return undefined;
  }
};

// ---------------------------------------------------------------------------
// Verdict parsing
// ---------------------------------------------------------------------------

interface Verdict {
  verdict: 'issues' | 'clean';
  openIssues: number;
}

/** Parse the supervisor's reply as a verdict JSON object (strict). */
export const parseVerdict = (text: string): Verdict | null => {
  try {
    const parsed: unknown = JSON.parse(text.trim());
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { verdict, openIssues } = parsed as Record<string, unknown>;
    if (verdict !== 'issues' && verdict !== 'clean') return null;
    if (typeof openIssues !== 'number' || !Number.isInteger(openIssues) || openIssues < 0) return null;
    if (verdict === 'clean' && openIssues !== 0) return null;
    return { verdict, openIssues };
  } catch {
    return null;
  }
};

/** Count `[Open]`-marked numbered findings in a canonical review (fallback counter). */
export const countOpenFindings = (markdown: string): number =>
  markdown.split('\n').filter((line) => /^\s*\d+\.\s+(CRITICAL|HIGH|MEDIUM|LOW)\b.*\[Open\]/i.test(line)).length;

/** Open-finding count from the canonical review: OPEN_ISSUES marker, falling back to counted rows. */
const markerCount = (canonicalMarkdown: string): number => {
  const marker = /^OPEN_ISSUES:\s*(\d+)\s*$/im.exec(canonicalMarkdown);
  return marker !== null ? Number(marker[1])! : countOpenFindings(canonicalMarkdown);
};

// ---------------------------------------------------------------------------
// Fix-plan parsing — the aggregator's schedule of what gets fixed when
// ---------------------------------------------------------------------------

/** One execution group in a fix plan: findings run in parallel within it. */
export interface FixPlanGroup {
  readonly id: string;
  readonly findings: readonly number[];
  /** Group ids that must complete before this one starts. */
  readonly after: readonly string[];
}

/** A parsed fix plan — groups + their sequencing. */
export interface FixPlan {
  readonly groups: readonly FixPlanGroup[];
}

/**
 * Parse and validate the FIX_PLAN_JSON tail the aggregator must append to
 * fix-plan.md. Strict: every finding appears exactly once, every dependency
 * exists, and the graph is acyclic. A malformed plan is an aggregation
 * failure (retried once upstream, like an empty canonical review).
 */
export const parseFixPlan = (
  markdown: string,
  expectedFindings: number,
): { ok: true; plan: FixPlan } | { ok: false; error: string } => {
  const matches = [...markdown.matchAll(/FIX_PLAN_JSON:\s*(\{[\s\S]*?\})\s*$/gm)];
  if (matches.length === 0) return { ok: false, error: 'fix-plan.md has no FIX_PLAN_JSON tail.' };
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(matches[matches.length - 1]![1]!);
  } catch (cause) {
    return { ok: false, error: `FIX_PLAN_JSON is not valid JSON: ${errorMessage(cause)}` };
  }
  if (typeof parsedJson !== 'object' || parsedJson === null || !Array.isArray((parsedJson as { groups?: unknown }).groups)) {
    return { ok: false, error: 'FIX_PLAN_JSON must be {"groups":[…]}.' };
  }
  const rawGroups = (parsedJson as { groups: unknown[] }).groups;
  if (rawGroups.length === 0) return { ok: false, error: 'FIX_PLAN_JSON has no groups.' };

  const seenFindings = new Map<number, string>();
  const ids = new Set<string>();
  const groups: FixPlanGroup[] = [];
  for (const raw of rawGroups) {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'A group is not an object.' };
    const { id, findings, after } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || id.trim() === '') return { ok: false, error: 'A group has no id.' };
    if (ids.has(id)) return { ok: false, error: `Duplicate group id '${id}'.` };
    if (!Array.isArray(findings) || findings.length === 0) return { ok: false, error: `Group '${id}' has no findings.` };
    for (const finding of findings) {
      if (typeof finding !== 'number' || !Number.isInteger(finding) || finding < 1 || finding > expectedFindings) {
        return { ok: false, error: `Group '${id}' references finding ${String(finding)} outside 1–${expectedFindings}.` };
      }
      const owner = seenFindings.get(finding);
      if (owner !== undefined) return { ok: false, error: `Finding ${finding} appears in both '${owner}' and '${id}'.` };
      seenFindings.set(finding, id);
    }
    if (after !== undefined && (!Array.isArray(after) || after.some((dep) => typeof dep !== 'string'))) {
      return { ok: false, error: `Group '${id}' has a malformed after list.` };
    }
    ids.add(id);
    groups.push({ id, findings: findings as number[], after: (after as string[] | undefined) ?? [] });
  }
  if (seenFindings.size !== expectedFindings) {
    const missing = Array.from({ length: expectedFindings }, (_, i) => i + 1).filter((n) => !seenFindings.has(n));
    return { ok: false, error: `FIX_PLAN_JSON does not cover finding(s): ${missing.join(', ')}.` };
  }
  for (const group of groups) {
    for (const dep of group.after) {
      if (!ids.has(dep)) return { ok: false, error: `Group '${group.id}' depends on unknown group '${dep}'.` };
      if (dep === group.id) return { ok: false, error: `Group '${group.id}' depends on itself.` };
    }
  }

  // Cycle detection (Kahn) — a cyclic plan can never be dispatched.
  const remaining = new Map(groups.map((g) => [g.id, new Set(g.after)]));
  while (remaining.size > 0) {
    const ready = [...remaining.entries()].filter(([, deps]) => deps.size === 0).map(([id]) => id);
    if (ready.length === 0) {
      return { ok: false, error: `FIX_PLAN_JSON groups form a dependency cycle involving: ${[...remaining.keys()].join(', ')}.` };
    }
    for (const id of ready) remaining.delete(id);
    for (const deps of remaining.values()) {
      for (const id of ready) deps.delete(id);
    }
  }

  return { ok: true, plan: { groups } };
};

/**
 * Order a validated plan into dispatch WAVES: wave N contains every group
 * whose dependencies all live in earlier waves. Groups in one wave run in
 * parallel; waves run in sequence.
 */
export const computeFixWaves = (plan: FixPlan): FixPlanGroup[][] => {
  const byId = new Map(plan.groups.map((g) => [g.id, g]));
  const levelOf = new Map<string, number>();
  const waves: FixPlanGroup[][] = [];
  while (levelOf.size < plan.groups.length) {
    const wave = plan.groups.filter(
      (g) => !levelOf.has(g.id) && g.after.every((dep) => levelOf.has(dep)),
    );
    if (wave.length === 0) break; // unreachable for validated plans (acyclic)
    for (const g of wave) levelOf.set(g.id, waves.length);
    waves.push(wave);
  }
  // Keep the byId map referenced for clarity; not needed at runtime.
  void byId;
  return waves;
};

/**
 * Validate the v1 input domain: a preset is runnable iff its steps are
 * exactly `[reviewer-group, fixers]` with a configured roster (preset.md §3).
 * Anything else is rejected before start with a clear error — never half-run.
 */
export const validateLoopConfig = (config: PresetLoopConfigDecoded): string | null => {
  const steps = config.steps;
  if (steps.length !== 2) {
    return 'Only the fixed [reviewer-group, fixers] structure is executable — this preset has a different step list.';
  }
  const [group, fixers] = steps;
  if (group === undefined || fixers === undefined) {
    return 'Only the fixed [reviewer-group, fixers] structure is executable — this preset has a different step list.';
  }
  if (group.kind !== 'reviewer-group') {
    return `Step 1 must be a reviewer-group (got '${group.kind}').`;
  }
  if ((group.reviewers ?? []).length === 0) {
    return 'The reviewer-group step has no reviewers configured.';
  }
  if (fixers.kind !== 'fixers') {
    return `Step 2 must be fixers (got '${fixers.kind}').`;
  }
  // Model governance: every role must resolve from user-set preset models —
  // a kickoff that would spend tokens on an unset model is rejected outright.
  const roles = resolveRoleModels(config);
  for (const [role, chain] of Object.entries(roles)) {
    if (chain.model === '') {
      return `No model set for the ${role} role — set it on the preset (steps, supervisor, or scoper). Loops never run on a model the preset did not choose.`;
    }
  }
  return null;
};

interface ModelChain {
  /** Primary model — always user-set (preset step/role or profile frontmatter). */
  model: string;
  /** Single fallback tried after the primary fails. */
  fallbackModel?: string;
}

/** Per-role model chains resolved from the preset config — nothing else. */
export interface RoleModels {
  scoper: ModelChain;
  aggregation: ModelChain;
  fixers: ModelChain;
  supervisor: ModelChain;
}

/** A role config (model + optional fallback) as stored on a preset. */
interface RoleConfig {
  readonly model?: string;
  readonly fallbackModel?: string;
}

const fromRole = (
  role: RoleConfig | undefined,
): ModelChain | null =>
  role?.model !== undefined && role.model !== ''
    ? { model: role.model, fallbackModel: role.fallbackModel }
    : null;

/**
 * Resolve EVERY role's model STRICTLY from the preset config. The UI header
 * picker and any ambient session state are deliberately ignored: tokens must
 * never be spent on a model the preset did not set.
 *
 * Chain per role (each link is something the user explicitly configured):
 * - scoper:    config.scoper → config.supervisor → reviewer-group's model
 * - aggregate: reviewer-group's model (the group owns its aggregation turn)
 * - fixers:    fixers step's model
 * - supervisor: config.supervisor → reviewer-group's model
 */
export const resolveRoleModels = (config: PresetLoopConfigDecoded): RoleModels => {
  const group = config.steps[0];
  const fixersStep = config.steps[1];
  const groupChain: ModelChain = {
    model: group?.model ?? '',
    fallbackModel: group?.fallbackModel,
  };
  return {
    scoper:
      fromRole(config.scoper) ?? fromRole(config.supervisor) ?? groupChain,
    aggregation: groupChain,
    fixers: {
      model: fixersStep?.model ?? '',
      fallbackModel: fixersStep?.fallbackModel,
    },
    supervisor: fromRole(config.supervisor) ?? groupChain,
  };
};

/** Capture the workspace's uncommitted diff (`git diff HEAD`) for git-unstaged scopes. */
const gitDiffHead = (cwd: string): Promise<string> =>
  new Promise((resolveDiff) => {
    execFile('git', ['diff', 'HEAD'], { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      resolveDiff(error === undefined ? stdout : '');
    });
  });

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

interface LoopRuntime {
  readonly state: LoopState;
  readonly folder: string;
  readonly workspaceId: string;
  readonly cwd: string;
  /** Per-role model chains, resolved ONCE from the snapshotted preset config. */
  readonly roles: RoleModels;
}

/** Internal control-flow signal: the user stopped this loop mid-drive. */
class StopSignal extends Error {
  constructor() {
    super('stopped');
  }
}

export const createLoopExecutor = (options: LoopExecutorOptions): LoopExecutor => {
  const pool = new TurnPool(options.maxConcurrent ?? 6);
  /** loopId → live runtime (present while a driver is running). */
  const runtimes = new Map<string, LoopRuntime>();
  /** loopId → agents alive in a turn right now (stopped on Stop). */
  const activeAgents = new Map<string, Set<PersistentAgent>>();

  // --- state writes -------------------------------------------------------

  const persist = async (runtime: LoopRuntime): Promise<void> => {
    const { state } = runtime;
    state.updatedAt = now();
    try {
      await mkdir(loopDir(runtime.cwd, state.id), { recursive: true });
      await writeFile(loopStatePath(runtime.cwd, state.id), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch {
      // transient write failures are non-fatal
    }
    options.broadcastLoop(runtime.workspaceId, state);
  };

  const addHistory = async (runtime: LoopRuntime, title: string, detail?: string, runId?: string): Promise<void> => {
    runtime.state.history.push({ at: now(), title, detail, runId });
    await persist(runtime);
  };

  // --- agent turns --------------------------------------------------------

  /**
   * One agent turn: isolated ephemeral session, streamed through the same
   * wire shapes as ordinary runs (so the SPA's run pages just work). Bounded
   * by the shared pool. Resolves to the final assistant text or an error.
   */
  const runTurn = async (
    runtime: LoopRuntime,
    spec: {
      label: string;
      kind: LoopRosterEntry['kind'];
      /** Model chain: primary + optional fallback — both user-set. */
      chain: ModelChain;
      systemPrompt: string;
      tools: readonly string[];
      task: string;
    },
  ): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
    const { state } = runtime;
    const runId = agentRunId();
    const rosterEntry: LoopRosterEntry = {
      runId,
      label: spec.label,
      kind: spec.kind,
      model: spec.chain.model || undefined,
      running: true,
    };
    state.roster.push(rosterEntry);
    await persist(runtime);

    const entries: [{ role: 'user'; text: string }, { role: 'assistant'; text: string }] = [
      { role: 'user', text: spec.task },
      { role: 'assistant', text: '' },
    ];
    const tools: Array<{ name: string; status: 'running' | 'done' | 'error'; turn: number; args?: unknown }> = [];
    const send = (
      phase: 'start' | 'delta' | 'tool' | 'done' | 'error' | 'interrupted',
      status: 'running' | 'done' | 'error' | 'interrupted',
      text: string,
      toolArgs?: unknown,
      model?: string,
    ): void => {
      options.emit({
        folder: runtime.folder,
        runId,
        workspaceId: runtime.workspaceId,
        phase,
        entry: 1,
        status,
        text,
        title: spec.label,
        entries: phase === 'start' ? entries : undefined,
        tools: phase === 'start' ? tools : undefined,
        toolArgs: phase === 'tool' && status === 'running' ? toolArgs : undefined,
        model: phase === 'start' ? (model ?? spec.chain.model) : undefined,
      });
    };

    send('start', 'running', '');

    const finish = async (outcome: 'ok' | 'error' | 'interrupted', text: string, error?: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
      rosterEntry.running = false;
      rosterEntry.outcome = outcome;
      rosterEntry.finishedAt = now();
      rosterEntry.summary = text.split('\n').find((line) => line.trim() !== '')?.slice(0, 200);
      await persist(runtime);
      if (outcome === 'ok') {
        send('done', 'done', text);
        return { ok: true, text };
      }
      send(outcome === 'interrupted' ? 'interrupted' : 'error', outcome === 'interrupted' ? 'interrupted' : 'error', error ?? text);
      return { ok: false, error: error ?? text };
    };

    if (spec.chain.model === '') {
      const message = `No model set for the ${spec.label} role — the preset must choose one.`;
      entries[1]!.text = message;
      return finish('error', message, message);
    }

    // Model chain: primary first, then the preset's fallback. A failed turn
    // (provider error, empty response, timeout) moves to the next link; each
    // attempt gets a FRESH session (a failed session may be poisoned).
    const models = [spec.chain.model, ...(spec.chain.fallbackModel ? [spec.chain.fallbackModel] : [])];
    let lastError = '';
    for (let attempt = 0; attempt < models.length; attempt++) {
      const model = models[attempt]!;
      if (attempt > 0) {
        // The fallback is now what the roster entry shows and streams.
        rosterEntry.model = model;
      }
      const outcome = await runTurnOnModel(runtime, state.id, spec, model, entries, tools, send);
      if (outcome.ok) {
        return finish('ok', outcome.text);
      }
      lastError = outcome.error;
      if (stopped(state.id)) break;
      if (attempt < models.length - 1) {
        await addHistory(runtime, `${spec.label}: falling back`, `${model} failed (${lastError.slice(0, 160)}) → trying ${models[attempt + 1]}.`);
      }
    }
    entries[1]!.text = lastError;
    return finish('error', lastError, lastError);
  };

  /** One model attempt of a turn: fresh ephemeral session, streamed. */
  const runTurnOnModel = async (
    runtime: LoopRuntime,
    loopId: string,
    spec: {
      systemPrompt: string;
      tools: readonly string[];
      task: string;
    },
    model: string,
    entries: [{ role: 'user'; text: string }, { role: 'assistant'; text: string }],
    tools: Array<{ name: string; status: 'running' | 'done' | 'error'; turn: number; args?: unknown }>,
    send: (phase: 'start' | 'delta' | 'tool' | 'done' | 'error' | 'interrupted', status: 'running' | 'done' | 'error' | 'interrupted', text: string, toolArgs?: unknown, model?: string) => void,
  ): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
    let disposedAgent: PersistentAgent | undefined;
    try {
      const result = await pool.use(async () => {
        const created = await Effect.runPromise(
          createPersistentAgent({
            model,
            systemPrompt: spec.systemPrompt,
            tools: [...spec.tools],
            cwd: runtime.cwd,
          }),
        );
        disposedAgent = created;
        let agents = activeAgents.get(loopId);
        if (agents === undefined) {
          agents = new Set();
          activeAgents.set(loopId, agents);
        }
        agents.add(created);

        if (stopped(loopId)) throw new StopSignal();

        const turnResult = await Effect.runPromise(
          created.prompt(
            spec.task,
            undefined,
            (activity) => {
              if (activity.kind === 'start') {
                tools.push({ name: activity.tool, status: 'running', turn: 1, args: activity.args });
                send('tool', 'running', activity.tool, activity.args);
              } else {
                const tool = [...tools].toReversed().find((t) => t.name === activity.tool && t.status === 'running');
                if (tool !== undefined) tool.status = activity.kind === 'error' ? 'error' : 'done';
                send('tool', activity.kind === 'error' ? 'error' : 'done', activity.tool);
              }
            },
            (delta, kind) => {
              if (kind !== 'text') return;
              entries[1]!.text += delta;
              send('delta', 'running', delta);
            },
          ),
        );
        return turnResult;
      });

      if (stopped(loopId)) throw new StopSignal();

      const text = result.text;
      entries[1]!.text = text;
      if (result.error !== undefined) {
        return { ok: false, error: text === '' ? result.error : `${result.error} (${text.slice(0, 120)})` };
      }
      return { ok: true, text };
    } catch (cause) {
      if (cause instanceof StopSignal) throw cause;
      return { ok: false, error: errorMessage(cause) };
    } finally {
      if (disposedAgent !== undefined) {
        activeAgents.get(loopId)?.delete(disposedAgent);
        void Effect.runPromise(disposedAgent.dispose()).catch(() => undefined);
      }
    }
  };

  // --- stop coordination --------------------------------------------------

  const stopped = (loopId: string): boolean => !runtimes.has(loopId);

  const abortAgents = (loopId: string): void => {
    const agents = activeAgents.get(loopId);
    if (agents === undefined) return;
    for (const agent of agents) {
      void Effect.runPromise(agent.abort()).catch(() => undefined);
    }
  };

  // --- phases ---------------------------------------------------------------

  /** Scoper: once per kickoff. Writes `<dir>/scope.md`. */
  const runScoper = async (runtime: LoopRuntime, scopePath: string, diffPath: string | null): Promise<void> => {
    const goalText =
      runtime.state.scopeType === 'agentic'
        ? `Kickoff goal:\n${(runtime.state.name ?? '').trim()}`
        : `The current UNCOMMITTED changes are being reviewed. ${diffPath !== null ? `A unified diff of them is at ${diffPath} — read it first.` : 'No diff file was captured — derive the target from the repo state.'}`;
    const task = `Write the review scope to ${scopePath} (absolute path — write exactly there).\n\n${goalText}\n\nExplore the repository at ${runtime.cwd} enough to name real in-scope files.`;
    const result = await runTurn(runtime, {
      label: 'Scoper',
      kind: 'supervisor',
      chain: runtime.roles.scoper,
      systemPrompt: SCOPER_SYSTEM,
      tools: ['read', 'grep', 'glob', 'write'],
      task,
    });
    if (!result.ok) throw new Error(`Scoper failed: ${result.error}`);
    runtime.state.status = 'reviewing';
    await addHistory(runtime, 'Scope resolved', result.text.slice(0, 300));
  };

  /**
   * One cycle: reviewer fan-out → aggregation → fix-plan validation. The
   * aggregator owns the SCHEDULING DECISIONS (groups, order); it writes
   * canonical.md + fix-plan.md. Returns all three artifacts.
   */
  const runReviewPhase = async (
    runtime: LoopRuntime,
    group: WorkflowStep,
    cycleDir: string,
  ): Promise<{ canonicalPath: string; openCount: number; plan: FixPlan }> => {
    const scratchDir = join(cycleDir, 'scratch');
    await mkdir(scratchDir, { recursive: true });
    const scopePath = join(loopDir(runtime.cwd, runtime.state.id), 'scope.md');

    // Fan out the reviewer-group's roster (bounded by the shared pool).
    const groupEntries: readonly GroupReviewerEntry[] = group.reviewers ?? [];
    const results = await Promise.all(
      groupEntries.map(async (entry, index) => {
        const ref: ReviewerRefDecoded = 'reviewer' in entry ? entry.reviewer : entry;
        const { label, lens } = await reviewerLensOf(ref, runtime.cwd);
        // Chain: explicit ref model → the referenced profile's preferred
        // model → the group's model. Every link is user-set.
        const preferred = await profileModelOf(ref, runtime.cwd);
        const chain: ModelChain = {
          model: ref.model ?? preferred ?? runtime.roles.aggregation.model,
          fallbackModel: ref.fallbackModel ?? runtime.roles.aggregation.fallbackModel,
        };
        const extraPrompt =
          'reviewer' in entry && typeof entry.prompt === 'string' && entry.prompt.trim() !== ''
            ? `\nExtra instructions for you specifically: ${entry.prompt}`
            : '';
        return runTurn(runtime, {
          label: `Reviewer: ${label}`,
          kind: 'reviewer',
          chain,
          systemPrompt: REVIEWER_SYSTEM,
          tools: ['read', 'grep', 'glob'],
          task: `Review pass — loop ${runtime.state.loop}, cycle ${runtime.state.cycle}.\n\nScope file: ${scopePath} — read it FIRST; it defines everything in and out of scope.\n\nYour lens:\n${lens}${extraPrompt}\n\nRepository root: ${runtime.cwd}`,
        }).then(async (result) => {
          const file = join(scratchDir, `${index + 1}-${label.replace(/[^a-zA-Z0-9_-]+/g, '-')}.md`);
          const body = result.ok
            ? result.text
            : `Reviewer failed: ${result.error}`;
          await writeFile(file, `${body}\n`, 'utf8');
          return { ok: result.ok, file };
        });
      }),
    );

    const failed = results.filter((r) => !r.ok).length;
    if (failed === groupEntries.length) throw new Error('Every reviewer failed — see the reviewers’ runs.');

    // Aggregation — always agent-driven, retried once on failure (wiki §4).
    // Writes BOTH artifacts: canonical review + the fixer schedule.
    const canonicalPath = join(cycleDir, 'canonical.md');
    const planPath = join(cycleDir, 'fix-plan.md');
    const fixPlanTemplate = await loadFixPlanTemplate();
    const aggregateTask = (): string =>
      `Merge the reviewer scratch reports into the canonical review AND write the fix plan.

Scratch reports:
${results.map((r) => `- ${r.file}`).join('\n')}

Write the canonical review to ${canonicalPath} (absolute path).
Write the fix plan to ${planPath} (absolute path), following this template EXACTLY:

<fix-plan-template>
${fixPlanTemplate.trim()}
</fix-plan-template>

It covers loop ${runtime.state.loop}, cycle ${runtime.state.cycle}.`;
    const aggregate = (): Promise<{ ok: true; text: string } | { ok: false; error: string }> =>
      runTurn(runtime, {
        label: 'Aggregator',
        kind: 'supervisor',
        chain: runtime.roles.aggregation,
        systemPrompt: AGGREGATOR_SYSTEM,
        tools: ['read', 'grep', 'glob', 'write'],
        task: aggregateTask(),
      });
    let aggregated = await aggregate();
    if (!aggregated.ok) aggregated = await aggregate();
    if (!aggregated.ok) throw new Error(`Aggregation failed: ${aggregated.error}`);

    const readArtifacts = async (): Promise<{ canonical: string; planMarkdown: string }> => {
      const [canonical, planMarkdown] = await Promise.all([
        readFile(canonicalPath, 'utf8').catch(() => ''),
        readFile(planPath, 'utf8').catch(() => ''),
      ]);
      return { canonical, planMarkdown };
    };

    // Empty/malformed artifacts ⇒ one more aggregation attempt (wiki §4),
    // then give up. A malformed FIX_PLAN_JSON counts as malformed. A clean
    // pass (zero open findings) needs no plan at all.
    const emptyPlan: { ok: true; plan: FixPlan } = { ok: true, plan: { groups: [] } };
    let { canonical: canonicalMarkdown, planMarkdown } = await readArtifacts();
    let openCount = markerCount(canonicalMarkdown);
    let plan = openCount === 0 ? emptyPlan : parseFixPlan(planMarkdown, openCount);
    if (canonicalMarkdown.trim() === '' || !plan.ok) {
      aggregated = await aggregate();
      if (!aggregated.ok) {
        throw new Error(`Aggregation retry failed: ${plan.ok ? 'no canonical review' : plan.error}`);
      }
      ({ canonical: canonicalMarkdown, planMarkdown } = await readArtifacts());
      if (canonicalMarkdown.trim() === '') throw new Error('Aggregation produced an empty canonical review.');
      openCount = markerCount(canonicalMarkdown);
      plan = openCount === 0 ? emptyPlan : parseFixPlan(planMarkdown, openCount);
      if (!plan.ok) throw new Error(`Aggregation produced an invalid fix plan: ${plan.error}`);
    }

    // Track the open-issue count early (verdict confirms/corrects it later).
    runtime.state.openIssues = openCount;
    await addHistory(
      runtime,
      `Cycle ${runtime.state.cycle} reviewed`,
      `${groupEntries.length} reviewer(s) → ${openCount} open finding(s) in ${plan.plan.groups.length} schedule group(s).${failed > 0 ? ` ${failed} reviewer(s) errored.` : ''}`,
    );
    return { canonicalPath, openCount, plan: plan.plan };
  };

  /**
   * Fixer phase — dispatches ONE fixer agent PER OPEN FINDING, following the
   * aggregator's fix plan mechanically:
   *
   *   waves (dependency order from the plan) run in sequence; within a wave
   *   all of the wave's fixers start in parallel, bounded by the preset's
   *   `concurrency` for the fixers step (and the executor's global pool).
   *
   * The schedule was decided by the aggregator (an LLM); dispatch is plain
   * code — no tokens spent on moving counters or starting agents.
   */
  const runFixerPhase = async (
    runtime: LoopRuntime,
    fixersStep: WorkflowStep,
    canonicalPath: string,
    plan: FixPlan,
  ): Promise<void> => {
    runtime.state.status = 'fixing';
    await persist(runtime);

    // Per-step concurrency bound (int > 0), on top of the global turn pool.
    const concurrency =
      typeof fixersStep.concurrency === 'number' && Number.isInteger(fixersStep.concurrency) && fixersStep.concurrency > 0
        ? fixersStep.concurrency
        : DEFAULT_FIXER_CONCURRENCY;
    const wavePool = new TurnPool(concurrency);
    const findingById = new Map(plan.groups.flatMap((g) => g.findings.map((f) => [f, g] as const)));

    const fixOne = async (findingNumber: number): Promise<'fixed' | 'skipped' | 'failed'> => {
      const result = await runTurn(runtime, {
        label: `Fixer: finding ${findingNumber}`,
        kind: 'fixer',
        chain: runtime.roles.fixers,
        systemPrompt: FIXER_SYSTEM,
        tools: ['read', 'write', 'edit', 'grep', 'glob'],
        task: `Fix finding ${findingNumber} ONLY.

Canonical review: ${canonicalPath} (absolute path — read it first, locate "${findingNumber}." under ## Findings).
Repository root: ${runtime.cwd}
Leave the canonical file and the fix plan untouched — the NEXT review pass re-verifies.`,
      });
      if (!result.ok) return 'failed';
      return /^\s*\d+\.\s+fixed\b/i.test(result.text) ? 'fixed' : 'skipped';
    };

    const waves = computeFixWaves(plan);
    let fixed = 0;
    let skipped = 0;
    let failed = 0;
    for (let index = 0; index < waves.length; index++) {
      if (stopped(runtime.state.id)) throw new StopSignal();
      const wave = waves[index]!;
      const findingsInWave = wave.flatMap((g) => g.findings);
      await addHistory(
        runtime,
        `Wave ${index + 1}/${waves.length} dispatched`,
        `${wave.map((g) => g.id).join(', ')} → finding(s) ${findingsInWave.join(', ')} (${concurrency} at a time).`,
      );
      const outcomes = await Promise.all(
        findingsInWave.map((findingNumber) => wavePool.use(() => fixOne(findingNumber))),
      );
      fixed += outcomes.filter((o) => o === 'fixed').length;
      skipped += outcomes.filter((o) => o === 'skipped').length;
      failed += outcomes.filter((o) => o === 'failed').length;
      // A stop mid-wave unwinds via the StopSignal thrown inside runTurn —
      // outcomes for aborted turns come back as 'failed', handled there.
    }

    if (stopped(runtime.state.id)) throw new StopSignal();
    if (plan.groups.length > 0) {
      await addHistory(
        runtime,
        'Fixer waves complete',
        `${plan.groups.length} group(s) · ${fixed} fixed, ${skipped} skipped, ${failed} failed across ${Object.keys(findingById).length} finding(s).`,
      );
    }
  };

  /** Supervisor verdict — structured JSON tail, re-prompted once on malformed output (wiki §4). */
  const runVerdict = async (runtime: LoopRuntime, canonicalPath: string): Promise<Verdict> => {
    const ask = (task: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> =>
      runTurn(runtime, {
        label: 'Supervisor',
        kind: 'supervisor',
        chain: runtime.roles.supervisor,
        systemPrompt: SUPERVISOR_SYSTEM,
        tools: ['read', 'grep', 'glob'],
        task,
      });

    const verdictResult = await ask(`Read ${canonicalPath} and render the verdict.`);
    if (!verdictResult.ok) throw new Error(`Supervisor verdict failed: ${verdictResult.error}`);
    let verdict = parseVerdict(verdictResult.text);
    if (verdict === null) {
      // Malformed verdict tail ⇒ one verdict-only re-prompt (wiki §4).
      const retry = await ask(`Your previous reply was not the required JSON object. Read ${canonicalPath} if needed, then reply with ONLY {"verdict":"issues"|"clean","openIssues":N}.`);
      if (!retry.ok) throw new Error(`Supervisor verdict failed: ${retry.error}`);
      verdict = parseVerdict(retry.text);
    }
    if (verdict === null) throw new Error(`Supervisor returned a malformed verdict: ${verdictResult.text.slice(0, 200)}`);
    runtime.state.openIssues = verdict.openIssues;
    return verdict;
  };

  // --- the driver ---------------------------------------------------------

  /**
   * Drives one loop from its CURRENT status until a terminal state. All
   * counter transitions + status flips happen HERE — plain code, never an
   * agent (wiki §1 division of authority).
   */
  const drive = async (runtime: LoopRuntime): Promise<void> => {
    const { state } = runtime;
    const steps = state.config.steps;
    const group = steps[0]!;
    const fixers = steps[1]!;
    try {
      if (state.status === 'pending') {
        state.status = 'scoping';
        await persist(runtime);
        const scopePath = join(loopDir(runtime.cwd, state.id), 'scope.md');
        const diffPath = state.scopeType === 'git-unstaged' ? join(loopDir(runtime.cwd, state.id), 'diff.patch') : null;
        await runScoper(runtime, scopePath, diffPath);
      }

      while (true) {
        if (stopped(state.id)) throw new StopSignal();
        state.status = 'reviewing';
        await persist(runtime);
        const cycleDir = join(passesDir(runtime.cwd, state.id), `${state.loop}-${state.cycle}`);
        await mkdir(cycleDir, { recursive: true });

        const { canonicalPath, plan } = await runReviewPhase(runtime, group, cycleDir);
        await runFixerPhase(runtime, fixers, canonicalPath, plan);

        const verdict = await runVerdict(runtime, canonicalPath);

        if (verdict.verdict === 'clean' && verdict.openIssues === 0) {
          state.status = 'done';
          state.running = false;
          await addHistory(runtime, 'Verdict: clean', 'Zero open issues remain — loop done.');
          break;
        }

        // Continuation happens only while strictly under both caps (wiki §3).
        if (state.cycle < state.maxCycles) {
          state.cycle += 1;
          await addHistory(runtime, `Issues remain (${verdict.openIssues}) — next cycle ${state.cycle}/${state.maxCycles}`);
          continue;
        }
        if (state.loop < state.maxLoops) {
          state.loop += 1;
          state.cycle = 1;
          await addHistory(runtime, `Issues remain (${verdict.openIssues}) — next independent loop ${state.loop}/${state.maxLoops}`);
          continue;
        }

        state.status = 'awaiting-user';
        state.running = false;
        await addHistory(
          runtime,
          'Caps exhausted',
          `${verdict.openIssues} open issue(s) remain. Raise a cap or mark the loop incomplete.`,
        );
        break;
      }
    } catch (cause) {
      state.running = false;
      if (cause instanceof StopSignal) {
        state.status = 'interrupted';
        await addHistory(runtime, 'Stopped', 'Interrupted by the user.');
      } else {
        state.status = 'error';
        const message = cause instanceof Error ? cause.message : String(cause);
        await addHistory(runtime, 'Error', message.slice(0, 500));
      }
    } finally {
      runtimes.delete(state.id);
      activeAgents.delete(state.id);
      // Never leave phantom agents "working" in the persisted state — an
      // aborted mid-turn agent skips its own finish() bookkeeping.
      for (const rosterEntry of state.roster) {
        if (rosterEntry.running) {
          rosterEntry.running = false;
          rosterEntry.outcome = state.status === 'done' ? 'ok' : 'interrupted';
          rosterEntry.finishedAt = now();
        }
      }
      await persist(runtime);
    }
  };

  /** Validate the v1 input domain: steps must be exactly [reviewer-group, fixers]. */
  const validateConfig = (config: PresetLoopConfigDecoded): string | null => validateLoopConfig(config);

  // --- lifecycle API --------------------------------------------------------

  const executor: LoopExecutor = {
    async start(startOptions) {
      const invalid = validateConfig(startOptions.config);
      if (invalid !== null) return { ok: false, error: invalid };

      const id = `loop_${randomUUID().slice(0, 6)}`;
      const maxCycles = startOptions.config.maxCycles ?? startOptions.config.maxLoops;
      // Resolve all role models from the preset ONCE — the executor never
      // consults ambient session state for models.
      const roles = resolveRoleModels(startOptions.config);
      const state: LoopState = {
        id,
        preset: startOptions.presetName,
        name: startOptions.scope.type === 'agentic' ? startOptions.scope.goal.trim() : undefined,
        status: 'pending',
        running: true,
        loop: 1,
        cycle: 1,
        maxLoops: startOptions.config.maxLoops,
        maxCycles,
        openIssues: 0,
        scopeType: startOptions.scope.type,
        config: startOptions.config,
        roster: [],
        history: [{ at: now(), title: 'Kicked off', detail: `Preset ${startOptions.presetName} · scope: ${startOptions.scope.type}` }],
        createdAt: now(),
        updatedAt: now(),
      };
      const runtime: LoopRuntime = { state, ...startOptions, roles };
      runtimes.set(id, runtime);

      try {
        await mkdir(loopDir(startOptions.cwd, id), { recursive: true });
        if (startOptions.scope.type === 'git-unstaged') {
          const diff = await gitDiffHead(startOptions.cwd);
          await writeFile(join(loopDir(startOptions.cwd, id), 'diff.patch'), diff, 'utf8');
          if (diff.trim() === '') {
            await addHistory(runtime, 'Warning', 'No uncommitted changes found — the scoper will still run, but there may be nothing to review.');
          }
        }
        await persist(runtime);
      } catch (cause) {
        runtimes.delete(id);
        return { ok: false, error: `Failed to scaffold the loop directory: ${errorMessage(cause)}` };
      }

      // Drive asynchronously — kickoff returns immediately with the row.
      void drive(runtime);
      return { ok: true, value: state };
    },

    async stop(workspaceId, loopId) {
      const runtime = runtimes.get(loopId);
      if (runtime !== undefined && runtime.workspaceId === workspaceId) {
        runtimes.delete(loopId); // `stopped()` flips true → driver unwinds
        abortAgents(loopId);
        runtime.state.running = false;
        await persist(runtime);
        return { ok: true, value: runtime.state };
      }
      // Not live — mark a stale/interrupted loop as interrupted on disk.
      const cwd = options.getCwd(workspaceId);
      if (cwd === undefined) return { ok: false, error: 'Unknown workspace.' };
      const loaded = await executor.get(cwd, loopId);
      if (loaded === null) return { ok: false, error: 'Loop not found.' };
      loaded.running = false;
      if (loaded.status !== 'done' && loaded.status !== 'incomplete' && loaded.status !== 'error') {
        loaded.status = 'interrupted';
      }
      await persist({ state: loaded, folder: '', workspaceId, cwd, roles: resolveRoleModels(loaded.config) });
      return { ok: true, value: loaded };
    },

    async resume(workspaceId, loopId) {
      const existing = runtimes.get(loopId);
      if (existing !== undefined) return { ok: false, error: 'Loop is already running.' };
      const cwd = options.getCwd(workspaceId);
      if (cwd === undefined) return { ok: false, error: 'Unknown workspace.' };
      const loaded = await executor.get(cwd, loopId);
      if (loaded === null) return { ok: false, error: 'Loop not found.' };
      if (loaded.status === 'done') return { ok: false, error: 'Loop is already done.' };
      if (loaded.status === 'awaiting-user') {
        return { ok: false, error: 'Caps are exhausted — raise a cap or mark the loop incomplete first.' };
      }
      if (loaded.status !== 'interrupted' && loaded.status !== 'error' && loaded.status !== 'incomplete') {
        return { ok: false, error: `Loop cannot be resumed from '${loaded.status}'.` };
      }

      const runtime: LoopRuntime = {
        state: loaded,
        folder: '',
        workspaceId,
        cwd,
        // Role models come from the SNAPSHOTTED config — resume never
        // consults the picker or any other ambient model state.
        roles: resolveRoleModels(loaded.config),
      };
      loaded.running = true;
      await addHistory(runtime, 'Resumed', `Continuing from '${loaded.status}' at loop ${loaded.loop}, cycle ${loaded.cycle}.`);
      runtimes.set(loopId, runtime);
      void drive(runtime);
      return { ok: true, value: loaded };
    },

    async decide(workspaceId, loopId, action) {
      const existing = runtimes.get(loopId);
      if (existing !== undefined) return { ok: false, error: 'Loop is running — stop it first.' };
      const cwd = options.getCwd(workspaceId);
      if (cwd === undefined) return { ok: false, error: 'Unknown workspace.' };
      const loaded = await executor.get(cwd, loopId);
      if (loaded === null) return { ok: false, error: 'Loop not found.' };
      if (loaded.status !== 'awaiting-user') return { ok: false, error: `Loop is not awaiting a decision ('${loaded.status}').` };

      if (action === 'complete') {
        loaded.status = 'incomplete';
        loaded.running = false;
        await addHistory({ state: loaded, folder: '', workspaceId, cwd, roles: resolveRoleModels(loaded.config) }, 'Marked incomplete', 'Findings preserved; caps stay as-is.');
        return { ok: true, value: loaded };
      }

      // Explicit budget edit — never implicit (wiki §3). The raised budget
      // buys exactly one more pass, and the counters move onto it now so the
      // resumed drive runs an honestly-numbered NEW cycle/loop.
      if (action === 'raise-cycles') {
        loaded.maxCycles += 1;
        loaded.cycle += 1;
      } else {
        loaded.maxLoops += 1;
        loaded.loop += 1;
        loaded.cycle = 1;
      }
      loaded.status = 'reviewing';
      loaded.running = true;
      const runtime: LoopRuntime = {
        state: loaded,
        folder: '',
        workspaceId,
        cwd,
        roles: resolveRoleModels(loaded.config),
      };
      runtimes.set(loopId, runtime);
      await addHistory(runtime, action === 'raise-cycles' ? 'Cycle cap raised' : 'Loop cap raised', `Continuing at loop ${loaded.loop}, cycle ${loaded.cycle}.`);
      void drive(runtime);
      return { ok: true, value: loaded };
    },

    async remove(workspaceId, loopId) {
      if (runtimes.has(loopId)) return { ok: false, error: 'Stop the loop before deleting it.' };
      const cwd = options.getCwd(workspaceId);
      if (cwd === undefined) return { ok: false, error: 'Unknown workspace.' };
      if (!isValidLoopId(loopId)) return { ok: false, error: 'Invalid loop id.' };
      try {
        await rm(loopDir(cwd, loopId), { recursive: true, force: true });
        return { ok: true, value: true };
      } catch (cause) {
        return { ok: false, error: `Failed to delete the loop: ${errorMessage(cause)}` };
      }
    },

    async list(cwd) {
      let ids: readonly Dirent[] = [];
      try {
        ids = await readdir(loopsRoot(cwd), { withFileTypes: true });
      } catch {
        return []; // directory missing → no loops yet
      }
      const states: LoopState[] = [];
      for (const entry of ids) {
        if (!entry.isDirectory() || !isValidLoopId(entry.name)) continue;
        try {
          const raw = await readFile(loopStatePath(cwd, entry.name), 'utf8');
          const state = JSON.parse(raw) as LoopState;
          if (typeof state.id !== 'string' || state.id !== entry.name) continue;
          // Crash recovery: a loop marked running with no live driver is stale.
          if (state.running === true && !runtimes.has(state.id)) {
            state.running = false;
            state.status = state.status === 'done' ? 'done' : 'interrupted';
            for (const rosterEntry of state.roster) {
              if (rosterEntry.running) {
                rosterEntry.running = false;
                rosterEntry.outcome = 'interrupted';
                rosterEntry.finishedAt = state.updatedAt;
              }
            }
            await writeFile(loopStatePath(cwd, state.id), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
          }
          states.push(state);
        } catch {
          // corrupt/unreadable loop.json — skip
        }
      }
      return states.toSorted((a, b) => b.updatedAt - a.updatedAt);
    },

    async get(cwd, loopId) {
      const live = [...runtimes.values()].find((runtime) => runtime.state.id === loopId);
      if (live !== undefined && live.cwd === cwd) return live.state;
      try {
        const raw = await readFile(loopStatePath(cwd, loopId), 'utf8');
        return JSON.parse(raw) as LoopState;
      } catch {
        return null;
      }
    },
  };

  return executor;
};
