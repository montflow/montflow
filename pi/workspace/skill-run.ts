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
.agents/@montflow/profiles/<name>/PROFILE.md and follow the bundled
template (profiles/TEMPLATE.md) exactly — frontmatter comment lines
included:

---
name: <kebab-case-name>
description: <one-line description of the agent: its role and what it does, e.g. "You are a senior code reviewer focused on security.">
# Preferred model: provider/model-id, e.g. anthropic/claude-sonnet-4-5 (optional)
model: <provider>/<model-id>
# Skills this profile must load (names from SKILL.md frontmatter)
skills:
  - <skill-name>
---

# <Profile Name>

## Instructions

<Custom system-prompt instructions. How the agent should behave, what to focus on, what to avoid.>

## Review Checklist

- [ ] <What the reviewer must verify before the work is done>
- [ ] <What the reviewer must verify before the work is done>

Rules:
- Always write the frontmatter block exactly in this shape — keep the
  "# Preferred model" and "# Skills this profile must load" comment lines
  verbatim (they document the fields for humans).
- name is required, kebab-case, and matches the profile directory.
- description is required and must be ONE line covering role + job.
- model is optional: when the user gives no preferred model, emit a bare
  "model:" line.
- skills must reference EXISTING skills by their SKILL.md frontmatter name —
  read .agents/skills/<name>/SKILL.md to confirm before listing one. Replace
  the "- <skill-name>" placeholder with one "- <name>" per skill; leave the
  list empty when none apply.
- The body heading is the title-cased profile name (e.g. "Security Reviewer").
- Instructions: concise, actionable system-prompt behavior — how the agent
  should behave, what to focus on, what to avoid. Short paragraphs or bullets.
- Review Checklist: concrete verification items, each on its own "- [ ] " line.
- If the named profile already exists, edit it in place instead of duplicating.
- Do not touch anything outside .agents/@montflow/profiles/.
- If you need clarification, ask a concise question and wait for the answer
  before writing files. Always END your question with a single "?" (the UI
  uses it to show the run is waiting for the user).
- When done, summarize in one short line: the profile name and what it defines.`;

/**
 * System prompt: the agent authors ONE preset at
 * `.agents/@montflow/review-presets/<name>.json` (reference-based loop
 * config), then reports what it created. Loop presets are the config
 * surface for the (being reworked) review loop — the agent writes JSON
 * only, never executes anything.
 */
export const PRESET_AUTHOR_SYSTEM = `You are a preset author for a montflow workspace.

Presets store the loop configuration for adversarial review runs. They live
at .agents/@montflow/review-presets/<name>.json and are JSON objects with
this exact shape:

{
  "version": 1,
  "name": "security-audit",
  "config": {
    "steps": [
      { "id": "s1", "kind": "reviewer-group", "label": "Reviewers", "concurrency": 3,
        "model": "deepseek-v4-pro",
        "reviewers": [
          { "type": "builtin", "id": "generic" },
          { "type": "profile", "name": "security-auditor", "model": "anthropic/claude-sonnet-4-5" }
        ] },
      { "id": "s2", "kind": "fixers", "label": "Fix", "model": "deepseek-v4-flash-free", "concurrency": 2 },
      { "id": "s3", "kind": "human", "label": "Ask the user", "model": "deepseek-v4-pro",
        "prompt": "Present the open findings and ask which to escalate" }
    ],
    "maxLoops": 5,
    "maxCycles": 3,
    "deadlock": { "flipThreshold": 2, "action": "escalate" }
  }
}

Schema rules:
- version must be 1; name must be kebab-case and match the file name.
- steps: an ordered array of steps. Each step has id ("s1", "s2", …) and
  kind, plus an optional label.
  - "reviewer-group": several reviewers in parallel; the aggregation step
    always runs after the group, so the group carries the aggregation
    model. Fields: reviewers (array of refs), model (aggregation model),
    optional fallbackModel (a single model id tried after model),
    optional concurrency (int > 0).
  - "reviewer": one reviewer. Field reviewer: a single ref.
  - "fixers": applies fixes. Field model: a model id string; optional
    fallbackModel, optional concurrency (int > 0).
  - "human": asks the user. Field model: a model id string; optional
    fallbackModel; field prompt: REQUIRED — what to present to the user
    and the question to answer.
- Reviewer refs: type "builtin" uses the catalog id (generic, security,
  quality, technical, guidelines, style, linguist); type "profile"
  references an existing profile by name under
  .agents/@montflow/profiles/<name>/PROFILE.md — READ the profile dir to
  confirm it exists before referencing it. Each ref may optionally carry a
  model override, fallbackModel (a single model id), and thinkingLevel
  (off|minimal|low|medium|high|xhigh|max).
- maxLoops: number of independent reviewer loops (int > 0);
  maxCycles: cycles per loop (int > 0, optional).
- deadlock: { flipThreshold: int, action: "escalate" }.

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

/**
 * System prompt: a plain-text answer agent for the AI-assisted input
 * component. Produces the requested text itself and nothing else — the
 * answer is inserted verbatim into the field the run was launched from.
 */
export const TEXT_GENERATOR_SYSTEM = `You are a text generation assistant.

The user will give you a short prompt describing text they want written,
rewritten, or improved. Produce ONLY the requested text itself — no
preamble, no explanation, no markdown code fences, no "Here is ..."
lead-ins, and no trailing commentary. The response is inserted directly
into a text field.

Rules:
- Output exactly the content requested, ready to paste.
- When the user asks for a specific format (JSON, a list, a commit message,
  a description, ...), produce that format directly.
- You may read files in the workspace to ground the answer, but never write
  or edit anything.
- Keep the output self-contained: no references to "I", "I wrote", or to
  the prompt itself.
- If the request is genuinely ambiguous, ask ONE concise clarifying
  question and END it with a single "?".`;

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
 * Create a fresh, isolated agent for an AI-input text run (read-only tools,
 * text-only system prompt). Shares the model-resolution rules of
 * {@link createSkillAgent}. The agent can ground itself in workspace files
 * but has no write tools, so it can never mutate anything.
 */
export const createTextAgent = async (
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
      systemPrompt: TEXT_GENERATOR_SYSTEM,
      tools: ['read', 'grep', 'glob'],
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
 * Wrap a text-generation request for the AI-input agent: the request plus a
 * reminder to answer with the bare text (no wrapping commentary).
 */
export const wrapTextPrompt = (idea: string): string =>
  `Produce the requested text now — output ONLY the final text, nothing else:

${idea.trim()}`;

/**
 * One-shot AI-input text generation. Creates an EPHEMERAL text agent (no
 * persisted session, nothing recorded — explicitly NOT a run), runs a single
 * turn, streams deltas via `onDelta`, and disposes the agent. The final
 * result carries the complete answer text.
 */
export const generateText = async (
  ctx: ExtensionCommandContext,
  modelOverride: string | undefined,
  task: string,
  onDelta: (delta: string) => void,
): Promise<SkillRunResult> => {
  const agent = await createTextAgent(ctx, modelOverride);
  try {
    return await promptSkillAgent(agent, wrapTextPrompt(task), onDelta);
  } finally {
    await disposeSkillAgent(agent);
  }
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
 * Abort the run's in-flight generation (force stop). Best-effort: a provider
 * that ignores the abort can keep generating past this call, so callers must
 * dispose the agent afterwards and treat the session as poisoned (resume
 * recreates it from the persisted session file).
 */
export const abortSkillAgent = async (run: SkillRunAgent): Promise<void> => {
  await Effect.runPromise(run.agent.abort()).catch(() => undefined);
};

/**
 * Wrap a skill idea into an authoring prompt for the agent. When an existing
 * authoring skill is included, its full SKILL.md is appended so the agent
 * follows the workspace's own skill-authoring conventions. When an existing
 * skill id (directory slug) is given, the prompt targets that file so a
 * modify run edits in place instead of creating a duplicate.
 */
export const wrapSkillPrompt = (
  idea: string,
  authoringSkill?: string,
  skillName?: string,
): string => {
  const target =
    skillName !== undefined && skillName.trim() !== ''
      ? `Modify the existing skill '${skillName.trim()}' at .agents/skills/${skillName.trim()}/SKILL.md — read it first, apply the change, and write the updated SKILL.md back.`
      : `Create a new skill for me in .agents/skills/ (one directory with SKILL.md), following the standard format:

---
name: <kebab-case-name>
description: <when to use this skill — drives selection>
groups: [<optional tags>]
dependencies: [<optional skill names>]
---

<Body: concise, actionable instructions — short sections and bullet lists.>`;
  let prompt = `${target}

Skill idea: ${idea.trim()}

Keep it focused and well-structured. Ask me if anything is unclear.`;
  if (authoringSkill !== undefined && authoringSkill.trim() !== '') {
    prompt += `\n\nThis workspace has an authoring skill you MUST follow when writing the skill.\nRead its rules carefully and apply them:\n\n<authoring-skill>\n${authoringSkill.trim()}\n</authoring-skill>`;
  }
  return prompt;
};

/**
 * Wrap a profile idea into an authoring prompt for the agent. When an
 * existing profile name is given, the prompt targets that file so a modify
 * run edits in place instead of creating a duplicate. When the user picked
 * skills in the dialog, they are pinned into the frontmatter template so
 * the agent includes exactly those (and no others).
 */
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

User request: ${idea.trim()}`;
};

export const wrapProfilePrompt = (idea: string, profileName?: string, skills?: readonly string[]): string => {
  const target =
    profileName !== undefined && profileName.trim() !== ''
      ? `Modify the existing profile '${profileName.trim()}' at .agents/@montflow/profiles/${profileName.trim()}/PROFILE.md — read it first, apply the change, and write the updated PROFILE.md back.`
      : `Create a new agent profile for me in .agents/@montflow/profiles/ (one directory with PROFILE.md), following the standard format:`;
  const skillLines =
    skills !== undefined && skills.length > 0
      ? skills.map((skill) => `  - ${skill}`).join('\n')
      : '  - <skill-name>';
  const skillsNote =
    skills !== undefined && skills.length > 0
      ? `\n\nThe profile MUST load exactly these skills — set them in the skills: frontmatter list, in this order, and do not add or drop any: ${skills.join(', ')}.`
      : '';
  return `${target}

---
name: <kebab-case-name>
description: <one-line description of the agent: its role and what it does, e.g. "You are a senior code reviewer focused on security.">
# Preferred model: provider/model-id, e.g. anthropic/claude-sonnet-4-5 (optional)
model: <provider>/<model-id>
# Skills this profile must load (names from SKILL.md frontmatter)
skills:
${skillLines}
---

# <Profile Name>

## Instructions

<Custom system-prompt instructions. How the agent should behave, what to focus on, what to avoid.>

## Review Checklist

- [ ] <What the reviewer must verify before the work is done>
- [ ] <What the reviewer must verify before the work is done>

Profile idea: ${idea.trim()}
${skillsNote}

Keep it focused and well-structured. Ask me if anything is unclear.`;
};
