import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import * as Model from './model.ts';
import { PACKAGE_ROOT, readTemplateSync } from './paths.ts';
import { runStore } from './runtime.ts';
import * as Skills from './skills.ts';
import * as Store from './store.ts';


/** Absolute path to the standalone CLI the agent runs in agentic mode. */
const CLI_PATH = join(PACKAGE_ROOT, 'cli.ts');

/** Prefilled fields for the create wizard (from CLI flags). */
export interface CreatePrefill {
  readonly name?: string;
  readonly description?: string;
  readonly model?: string;
  readonly skills?: readonly string[];
  readonly instructions?: string;
  readonly checklist?: readonly string[];
}

const clean = (value: string | undefined): string => (value ?? '').trim();

/** Asks for a profile name, validating the slug. Returns null on cancel. */
const askName = async (ctx: ExtensionContext, prefill: string): Promise<string | null> => {
  for (;;) {
    const name = await ctx.ui.input('Profile name (slug, e.g. code-reviewer):', prefill);
    if (name === undefined) return null;
    const slug = Model.slugify(name);
    if (!Model.isValidProfileName(slug)) {
      ctx.ui.notify('Invalid name: use lowercase letters, digits, and hyphens.', 'warning');
      continue;
    }
    return slug;
  }
};

/**
 * Multi-select via repeated `ui.select` with live checkmarks.
 * Returns the selected skill names (subset of `available`).
 */
const multiSelect = async (
  ctx: ExtensionContext,
  title: string,
  options: readonly { readonly value: string; readonly label: string }[],
): Promise<string[]> => {
  const selected = new Set<string>();

  for (;;) {
    const items = options.map((option) => {
      const checked = selected.has(option.value) ? '✓ ' : '  ';
      return `${checked}${option.label}`;
    });
    items.push('✓ Done');

    const pick = await ctx.ui.select(`${title} (${selected.size} selected)`, items);
    if (pick === undefined || pick === '✓ Done') break;

    const picked = options.find((option) => `${selected.has(option.value) ? '✓ ' : '  '}${option.label}` === pick);
    if (picked === undefined) break;

    if (selected.has(picked.value)) {
      selected.delete(picked.value);
    } else {
      selected.add(picked.value);
    }
  }

  return [...selected];
};

/** Collects review-checklist items; empty input finishes the list. */
const collectChecklist = async (ctx: ExtensionContext): Promise<string[]> => {
  const items: string[] = [];
  for (;;) {
    const item = await ctx.ui.input(
      items.length === 0
        ? 'Review checklist item (empty to finish):'
        : `Checklist item ${items.length + 1} (empty to finish):`,
      '',
    );
    if (item === undefined || clean(item) === '') break;
    items.push(clean(item));
  }
  return items;
};

/** Picks a profile from a selector; returns null when cancelled or none exist. */
export const pickProfile = async (ctx: ExtensionContext, title: string): Promise<string | null> => {
  const names = await runStore(Store.listProfiles(ctx.cwd));
  if (names.length === 0) {
    ctx.ui.notify('No profiles yet. Create one with "Create profile".', 'info');
    return null;
  }
  if (names.length === 1) return names[0] ?? null;
  const pick = await ctx.ui.select(title, names);
  return pick ?? null;
};

/** Opens content in an editor (Esc cancels → null). */
const viewInEditor = async (ctx: ExtensionContext, title: string, content: string): Promise<string | null> => {
  const edited = await ctx.ui.editor(title, content);
  return edited === undefined ? null : edited;
};

/**
 * Shared tail of both create flows: render to the template, preview in the
 * editor (user may edit anything, including the name/skills in frontmatter),
 * confirm, and save. Returns the saved profile, or null when cancelled.
 */
const previewAndSaveProfile = async (ctx: ExtensionContext, profile: Model.Profile): Promise<Model.Profile | null> => {
  const markdown = Model.renderProfileFromTemplate(readTemplateSync(), profile);

  const preview = await viewInEditor(ctx, `Preview: .agents/profiles/${profile.name}/PROFILE.md`, markdown);
  if (preview === null) {
    ctx.ui.notify('Cancelled.', 'info');
    return null;
  }

  const finalProfile = Model.parseProfile(preview, profile.name);
  const save = await ctx.ui.confirm('Save profile', `Save ${finalProfile.name}?`);
  if (!save) return null;

  await runStore(Store.writeProfileFile(ctx.cwd, finalProfile.name, Model.serializeProfile(finalProfile)));
  await warnUnknownSkills(ctx, finalProfile.skills);
  ctx.ui.notify(`Profile created: .agents/profiles/${finalProfile.name}/PROFILE.md`, 'info');
  return finalProfile;
};

/**
 * Builds the user message handed to the agent in agentic mode: the user's
 * simple prompt plus exactly how to finish — ask when anything is unclear,
 * show the resolved profile and get approval, then run the standalone
 * profiles CLI with the resolved fields.
 */
const buildAgenticPrompt = async (prompt: string, ctx: ExtensionContext): Promise<string> => {
  const [profiles, skillInfos] = await Promise.all([
    runStore(Store.listProfiles(ctx.cwd)),
    runStore(Skills.listSkills(ctx.cwd)),
  ]);
  const skills = skillInfos.map((skill) => skill.name);

  return [
    'Create a new agent profile for this request:',
    '',
    prompt,
    '',
    'An agent profile is stored at `.agents/profiles/<name>/PROFILE.md` and is data only:',
    '- name: lowercase-hyphen slug (required, matches the directory)',
    '- description: one line — who the agent is and what it does (required)',
    '- model: preferred model as provider/model-id (optional)',
    '- skills: names from the available skills list below (optional)',
    '- instructions: custom system-prompt behavior (optional)',
    '- checklist: verification items (optional)',
    '',
    'If anything is unclear, vague, or missing, ask me BEFORE creating anything — do not guess or invent details.',
    '',
    'Once everything is resolved, do this in order:',
    '',
    '1. Show me the exact profile you are about to create (the full PROFILE.md content, or at minimum the complete command with every field filled in).',
    '2. Ask for my approval.',
    '3. Only after I approve, create the profile by running the profiles CLI:',
    '',
    '```bash',
    `node ${CLI_PATH} --new \\`,
    '  --name <lowercase-hyphen-slug> \\',
    '  --description "<one-line description of the agent: its role and what it does>" \\',
    '  [--model <provider>/<model-id>] \\',
    '  [--skills a,b,c] \\',
    '  [--instructions "<custom system-prompt behavior>"] \\',
    '  [--checklist "item1|item2"]',
    '```',
    '',
    `Available skills: ${skills.length === 0 ? 'none' : skills.join(', ')}`,
    `Existing profiles: ${profiles.length === 0 ? 'none' : profiles.join(', ')}`,
    '',
    `If the name already exists, add --force to overwrite — but tell me and ask before overwriting. After creating, verify with \`node ${CLI_PATH} --show <name>\`.`,
  ].join('\n');
};

/**
 * Interactive "create profile" flow. Returns the created profile, or null
 * when cancelled (in agentic mode the profile is created by the agent in a
 * follow-up turn, so this returns null after the handoff).
 */
export const runCreateWizard = async (
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  prefill: CreatePrefill = { skills: [] },
): Promise<Model.Profile | null> => {
  // CLI prefills (e.g. `--new --name foo`) mean the user already started
  // typing values: go straight to the manual flow with those prefills.
  if (prefill.name === undefined && prefill.description === undefined) {
    const mode = await ctx.ui.select('How do you want to create this profile?', [
      'Agentic — describe it; the agent asks what it needs and creates it via the CLI',
      'Manual — step-by-step: name, description, model, skills, instructions, checklist',
    ]);
    if (mode === undefined) return null;
    if (mode.startsWith('Agentic')) {
      return runAgenticWizard(ctx, pi);
    }
  }
  return runManualWizard(ctx, prefill);
};

/**
 * Agentic mode: the user gives a simple prompt, which is handed to the main
 * agent as a user message. The agent asks for anything it needs, then runs
 * the standalone profiles CLI with the resolved fields.
 */
const runAgenticWizard = async (ctx: ExtensionContext, pi: ExtensionAPI): Promise<Model.Profile | null> => {
  const prompt = await ctx.ui.input(
    'Describe the profile you want (who it is, what it does, how it should behave):',
    '',
  );
  if (prompt === undefined) return null;
  const promptText = prompt.trim();
  if (promptText === '') {
    ctx.ui.notify('Cancelled: describe the profile you want.', 'info');
    return null;
  }

  if (!ctx.isIdle()) {
    ctx.ui.notify('The agent is busy — try again when it finishes.', 'warning');
    return null;
  }

  const message = await buildAgenticPrompt(promptText, ctx);
  try {
    pi.sendUserMessage(message);
  } catch (error) {
    ctx.ui.notify(
      `Could not hand off to the agent: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
    return null;
  }

  ctx.ui.notify('Handed off to the agent — it will ask for anything it needs, then create the profile.', 'info');
  return null;
};

/** Manual mode: step-by-step field collection (no agentic help). */
const runManualWizard = async (
  ctx: ExtensionContext,
  prefill: CreatePrefill,
): Promise<Model.Profile | null> => {
  const name = await askName(ctx, prefill.name ?? '');
  if (name === null) return null;

  const exists = await runStore(Store.profileExists(ctx.cwd, name));
  if (exists) {
    const overwrite = await ctx.ui.confirm('Profile exists', `${name} already exists. Overwrite it?`);
    if (!overwrite) return null;
  }

  const description = clean(
    prefill.description ??
      (await ctx.ui.input(
        'Description (one line — who the agent is and what it does, e.g. "You are a code reviewer..."):',
        '',
      )),
  );
  if (description === '') {
    ctx.ui.notify('Cancelled: description is required.', 'info');
    return null;
  }

  const model = clean(prefill.model ?? (await ctx.ui.input('Preferred model (provider/model-id, optional):', '')));

  const available = await runStore(Skills.listSkills(ctx.cwd));
  const skills =
    prefill.skills && prefill.skills.length > 0
      ? [...prefill.skills]
      : available.length > 0
        ? await multiSelect(
            ctx,
            'Skills this profile must load',
            available.map((skill) => ({ value: skill.name, label: skill.name })),
          )
        : [];

  const prefilledInstructions = clean(prefill.instructions ?? '');
  let instructions = prefilledInstructions;
  if (instructions === '') {
    const edited = await viewInEditor(ctx, 'Instructions — custom system-prompt behavior', '');
    instructions = edited ?? '';
  }

  const checklist =
    prefill.checklist && prefill.checklist.length > 0
      ? [...prefill.checklist]
      : await collectChecklist(ctx);

  const profile: Model.Profile = { name, description, model, skills, instructions, checklist };
  return previewAndSaveProfile(ctx, profile);
};

/** Interactive "modify profile" flow. Returns true when saved. */
export const runEditWizard = async (ctx: ExtensionContext, name?: string): Promise<boolean> => {
  const profileName = name ?? (await pickProfile(ctx, 'Modify which profile?'));
  if (profileName === null) return false;

  const markdown = await runStore(Store.readProfileFile(ctx.cwd, profileName));
  const edited = await viewInEditor(ctx, `Modify: .agents/profiles/${profileName}/PROFILE.md`, markdown);
  if (edited === null) return false;

  let parsed = Model.parseProfile(edited, profileName);
  if (parsed.name !== profileName) {
    ctx.ui.notify(
      `Frontmatter name "${parsed.name}" does not match directory "${profileName}" — keeping "${profileName}".`,
      'warning',
    );
    parsed = { ...parsed, name: profileName };
  }

  const save = await ctx.ui.confirm('Save changes', `Save ${profileName}?`);
  if (!save) return false;

  await runStore(Store.writeProfileFile(ctx.cwd, profileName, Model.serializeProfile(parsed)));
  await warnUnknownSkills(ctx, parsed.skills);
  ctx.ui.notify(`Saved: .agents/profiles/${profileName}/PROFILE.md`, 'info');
  return true;
};

/** Interactive "delete profile" flow. Returns true when deleted. */
export const runDeleteWizard = async (ctx: ExtensionContext, name?: string): Promise<boolean> => {
  const profileName = name ?? (await pickProfile(ctx, 'Delete which profile?'));
  if (profileName === null) return false;

  const confirm = await ctx.ui.confirm('Delete profile', `Permanently delete ${profileName}?`);
  if (!confirm) return false;

  await runStore(Store.deleteProfileDir(ctx.cwd, profileName));
  ctx.ui.notify(`Deleted profile: ${profileName}`, 'info');
  return true;
};

/** Interactive "show profile" flow. */
export const runShowWizard = async (ctx: ExtensionContext, name?: string): Promise<void> => {
  const profileName = name ?? (await pickProfile(ctx, 'Show which profile?'));
  if (profileName === null) return;

  const markdown = await runStore(Store.readProfileFile(ctx.cwd, profileName));
  await viewInEditor(ctx, `Profile: ${profileName} (read-only — Esc to close)`, markdown);
};

/** Warns about skills listed in a profile that are not installed in `.agents/skills/`. */
export const warnUnknownSkills = async (ctx: ExtensionContext, skills: readonly string[]): Promise<void> => {
  if (skills.length === 0) return;
  const known = await runStore(Skills.knownSkillNames(ctx.cwd));
  const missing = skills.filter((skill) => !known.has(skill));
  if (missing.length > 0) {
    ctx.ui.notify(`Unknown skills in profile: ${missing.join(', ')} (not found in .agents/skills/)`, 'warning');
  }
};
