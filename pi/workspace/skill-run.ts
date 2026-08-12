/**
 * Agentic skill runs — each run gets its own ISOLATED agent session (never
 * touches the user's main pi session). The agent authors the skill with its
 * tools, streams live deltas, and can be prompted again for follow-up
 * questions ("answer back").
 */

import { Effect } from 'effect';
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { createPersistentAgent, type PersistentAgent } from './runner';
import { resolveInitialModel } from './models-client';

export type SkillRunResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * True when the agent's final message reads as a question awaiting an answer
 * (the agent is instructed to end such messages with "?"). The UI shows the
 * run as "awaiting answer" instead of "done" so the user knows to reply.
 * @param {string} text The final assistant text
 * @returns True when the text ends with a question mark
 */
export const isAwaitingAnswer = (text: string): boolean => text.trim().endsWith('?');

/**
 * System prompt: the agent authors ONE skill under `.agents/skills/` with
 * proper frontmatter, then reports what it created. It has write/edit tools,
 * so it can also fix a skill that already exists at that name.
 */
export const SKILL_AUTHOR_SYSTEM = `You are a skill author for a pi coding agent.

The user will give you a short prompt describing a skill they want. Create a
new skill at .agents/skills/<name>/SKILL.md (choose a kebab-case <name> that
fits the skill), following this exact format:

---
name: <kebab-case-name>
description: <one or two sentences: when to use this skill, what it does>
groups: [<optional comma-separated group tags>]
dependencies: [<optional names of skills this one depends on>]
---

<Body: concise, actionable instructions for the agent that will load this
skill. Use short sections and bullet lists. Include concrete steps, expected
inputs/outputs, and any edge cases. Keep it focused — no filler.>

Rules:
- Always write the frontmatter block exactly as shown (name/description are
  required; groups/dependencies optional but encouraged).
- The description must say WHEN to use the skill (it drives skill selection).
- If the named skill already exists, edit it in place instead of duplicating.
- Do not touch anything outside .agents/skills/.
- If you need clarification, ask a concise question and wait for the answer
  before writing files. Always END your question with a single "?" (the UI
  uses it to show the run is waiting for the user).
- When done, summarize in one short line: the skill name and what it does.`;

/**
 * System prompt: the agent authors ONE profile under
 * `.agents/@montflow/profiles/` (PROFILE.md with frontmatter + Instructions
 * + Review Checklist), then reports what it created.
 */
export const PROFILE_AUTHOR_SYSTEM = `You are a profile author for a montflow workspace.

Profiles define an agent persona. They live at
.agents/@montflow/profiles/<name>/PROFILE.md and consist of a frontmatter
block (name, description, model, skills) plus a body with Instructions and a
Review Checklist.

The user will give you a short prompt describing a profile they want. Create
it at .agents/@montflow/profiles/<name>/PROFILE.md (choose a kebab-case
<name> that fits), following this exact format:

---
name: <kebab-case-name>
description: <one line: the agent's role and what it does>
model: <provider/model-id — the profile's preferred model, or leave empty>
skills:
  - <skill name (SKILL.md frontmatter name) this profile must load>
---

# <Title>

## Instructions

<Concise, actionable instructions for the agent that will use this profile:
how it should behave, what it reviews/does, expected rigor. Short paragraphs
or bullets — no filler.>

## Review Checklist

- [ ] <item a reviewer must verify>
- [ ] <item>

Rules:
- Always write the frontmatter block exactly as shown (name/description are
  required; model/skills optional but encouraged).
- description must be ONE line covering role + job.
- skills must reference EXISTING skills by their SKILL.md frontmatter name —
  read .agents/skills/<name>/SKILL.md to confirm before listing one.
- If the named profile already exists, edit it in place instead of duplicating.
- Do not touch anything outside .agents/@montflow/profiles/.
- If you need clarification, ask a concise question and wait for the answer
  before writing files. Always END your question with a single "?" (the UI
  uses it to show the run is waiting for the user).
- When done, summarize in one short line: the profile name and what it defines.`;

/**
 * System prompt: the agent authors ONE preset at
 * `.agents/@montflow/review-presets/<name>.json` (reference-based loop
 * config, not expanded profiles), then reports what it created/changed.
 */
export const PRESET_AUTHOR_SYSTEM = `You are a preset author for a montflow workspace.

Presets store the loop configuration for adversarial review runs. They live
at .agents/@montflow/review-presets/<name>.json and are JSON objects with
this exact shape:

{
  "version": 1,
  "name": "security-audit",
  "config": {
    "reviewers": [
      { "type": "builtin", "id": "generic" },
      { "type": "profile", "name": "security-auditor", "model": "anthropic/claude-sonnet-4-5" }
    ],
    "supervisor": { "model": "deepseek-v4-pro" },
    "fixerModel": "deepseek-v4-flash-free",
    "maxLoops": 5,
    "maxCycles": 3,
    "deadlock": { "flipThreshold": 2, "action": "escalate" }
  }
}

Schema rules:
- version must be 1; name must be kebab-case and match the file name.
- reviewers: an array of references. type "builtin" uses the catalog id
  (generic, security, quality, technical, guidelines, style, linguist);
  type "profile" references an existing profile by name under
  .agents/@montflow/profiles/<name>/PROFILE.md — READ the profile dir to
  confirm it exists before referencing it. Each ref may optionally carry a
  model override, fallbackModels array, and thinkingLevel
  (off|minimal|low|medium|high|xhigh|max).
- supervisor: an object with model (always), optional fallbackModels and
  thinkingLevel.
- fixerModel: a model id string; optional fixerFallbackModels and
  fixerThinkingLevel.
- maxLoops: number of independent reviewer loops (int > 0);
  maxCycles: cycles per loop (int > 0, optional).
- deadlock: { flipThreshold: int, action: "escalate" }.
- Optional: agentConcurrency (int), supervisorTimeoutMs (int ms).

Store REFERENCES only — never expand a profile's objective/skills into the
preset. Everything derived is resolved from the source at use time.

The user will give you a short prompt. When it names an existing preset,
READ .agents/@montflow/review-presets/<name>.json first and modify it in
place. Otherwise create a new preset and choose a kebab-case <name> that
fits.

Rules:
- Always read existing files before editing them; write valid JSON only.
- Only write inside .agents/@montflow/review-presets/.
- If you need clarification, ask a concise question and wait for the answer
  before writing files. Always END your question with a single "?" (the UI
  uses it to show the run is waiting for the user).
- When done, summarize in one short line: the preset name and what it
  contains/changed.`;

export interface SkillRunAgent {
  readonly agent: PersistentAgent;
  readonly model: string;
  /** Persisted session file (for resume after a restart), or undefined. */
  readonly sessionFile: string | undefined;
}

/** Options for creating/resuming a run's agent session. */
export interface SkillRunSessionOptions {
  /** Persist the conversation to a pi session file in this directory. */
  readonly sessionDir?: string;
  /** Resume an existing session file instead of starting fresh. */
  readonly resumeSessionFile?: string;
}

/**
 * Create a fresh, isolated agent for a skill run.
 *
 * The run model comes from the header picker (`modelOverride`, a
 * `provider/model-id` string) when provided; it is only honored when it is
 * actually pickable in this session, otherwise the session's current model
 * (then the first pickable choice) is used.
 */
export const createSkillAgent = async (
  ctx: ExtensionCommandContext,
  modelOverride?: string,
  options: SkillRunSessionOptions = {},
): Promise<SkillRunAgent> => {
  const model = resolveInitialModel(ctx, modelOverride);
  if (model === undefined) {
    throw new Error('No active model — start a pi session first.');
  }
  const agent = await Effect.runPromise(
    createPersistentAgent({
      model,
      systemPrompt: SKILL_AUTHOR_SYSTEM,
      tools: ['read', 'write', 'edit', 'grep', 'glob'],
      cwd: ctx.cwd,
      sessionDir: options.sessionDir,
      resumeSessionFile: options.resumeSessionFile,
    }),
  );
  return {
    agent,
    model,
    sessionFile: agent.sessionFile(),
  };
};

/**
 * Create a fresh, isolated agent for a profile run (same tools, profile
 * authoring prompt). Shares the model-resolution rules of
 * {@link createSkillAgent}.
 */
export const createProfileAgent = async (
  ctx: ExtensionCommandContext,
  modelOverride?: string,
  options: SkillRunSessionOptions = {},
): Promise<SkillRunAgent> => {
  const model = resolveInitialModel(ctx, modelOverride);
  if (model === undefined) {
    throw new Error('No active model — start a pi session first.');
  }
  const agent = await Effect.runPromise(
    createPersistentAgent({
      model,
      systemPrompt: PROFILE_AUTHOR_SYSTEM,
      tools: ['read', 'write', 'edit', 'grep', 'glob'],
      cwd: ctx.cwd,
      sessionDir: options.sessionDir,
      resumeSessionFile: options.resumeSessionFile,
    }),
  );
  return {
    agent,
    model,
    sessionFile: agent.sessionFile(),
  };
};

/**
 * Create a fresh, isolated agent for a preset run (same tools, preset
 * authoring prompt). Shares the model-resolution rules of
 * {@link createSkillAgent}.
 */
export const createPresetAgent = async (
  ctx: ExtensionCommandContext,
  modelOverride?: string,
  options: SkillRunSessionOptions = {},
): Promise<SkillRunAgent> => {
  const model = resolveInitialModel(ctx, modelOverride);
  if (model === undefined) {
    throw new Error('No active model — start a pi session first.');
  }
  const agent = await Effect.runPromise(
    createPersistentAgent({
      model,
      systemPrompt: PRESET_AUTHOR_SYSTEM,
      tools: ['read', 'write', 'edit', 'grep', 'glob'],
      cwd: ctx.cwd,
      sessionDir: options.sessionDir,
      resumeSessionFile: options.resumeSessionFile,
    }),
  );
  return {
    agent,
    model,
    sessionFile: agent.sessionFile(),
  };
};

/**
 * Wrap a preset request into an authoring prompt for the agent. When an
 * existing preset name is given, the prompt targets that file so a modify
 * run edits in place instead of creating a duplicate.
 */
export const wrapPresetPrompt = (idea: string, presetName?: string): string => {
  const target =
    presetName !== undefined && presetName.trim() !== ''
      ? `Modify the existing preset '${presetName.trim()}' at .agents/@montflow/review-presets/${presetName.trim()}.json — read it first, apply the change, and write the updated JSON back.`
      : `Create a new preset in .agents/@montflow/review-presets/ — pick a kebab-case <name>.json that fits the request.`;
  return `${target}

Request: ${idea.trim()}

Keep the stored JSON schema-exact and minimal. Ask me if anything is unclear.`;
};

/**
 * Prompt the run's agent (first turn or a follow-up reply). Text deltas are
 * forwarded to `onDelta`; tool activity to `onTool`; the session keeps its
 * context across turns.
 */
export const promptSkillAgent = async (
  run: SkillRunAgent,
  task: string,
  onDelta: (delta: string) => void,
  onTool?: (activity: { kind: 'start' | 'end' | 'error'; tool: string }) => void,
): Promise<SkillRunResult> => {
  try {
    const result = await Effect.runPromise(
      run.agent.prompt(task, undefined, onTool, (delta, kind) => {
        if (kind === 'text') onDelta(delta);
      }),
    );
    if (result.error !== undefined) return { ok: false, error: result.error };
    return { ok: true, text: result.text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

/** Release the run's agent session. */
export const disposeSkillAgent = async (run: SkillRunAgent): Promise<void> => {
  await Effect.runPromise(run.agent.dispose()).catch(() => undefined);
};

/**
 * Wrap a skill idea into an authoring prompt for the agent. When an existing
 * authoring skill is included, its full SKILL.md is appended so the agent
 * follows the workspace's own skill-authoring conventions.
 */
export const wrapSkillPrompt = (idea: string, authoringSkill?: string): string => {
  const base = `Create a new skill for me in .agents/skills/ (one directory with SKILL.md), following the standard format:

---
name: <kebab-case-name>
description: <when to use this skill — drives selection>
groups: [<optional tags>]
dependencies: [<optional skill names>]
---

<Body: concise, actionable instructions — short sections and bullet lists.>

Skill idea: ${idea.trim()}

Keep it focused and well-structured. Ask me if anything is unclear.`;
  if (authoringSkill === undefined || authoringSkill.trim() === '') return base;
  return `${base}\n\nThis workspace has an authoring skill you MUST follow when writing the skill.\nRead its rules carefully and apply them:\n\n<authoring-skill>\n${authoringSkill.trim()}\n</authoring-skill>`;
};

/**
 * Wrap a profile idea into an authoring prompt for the agent.
 */
export const wrapProfilePrompt = (idea: string): string => {
  return `Create a new agent profile for me in .agents/@montflow/profiles/ (one directory with PROFILE.md), following the standard format:

---
name: <kebab-case-name>
description: <one line: role and what it does>
model: <provider/model-id preferred model, or empty>
skills:
  - <skill names this profile must load>
---

# <Title>

## Instructions

<Concise, actionable instructions>

## Review Checklist

- [ ] <checklist items>

Profile idea: ${idea.trim()}

Keep it focused and well-structured. Ask me if anything is unclear.`;
};
