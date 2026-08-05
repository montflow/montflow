import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  buildDeferPrompt,
  copyDeferPromptToClipboard,
  writeDeferPromptToTemp,
  type DeferContext,
} from './defer.ts';
import * as Model from './model.ts';
import type { ProfilesCommand } from './options.ts';
import { readTemplateSync } from './paths.ts';
import { runStore } from './runtime.ts';
import * as Skills from './skills.ts';
import * as Store from './store.ts';


/** Prefilled fields for the create wizard (from CLI flags). */
export interface CreatePrefill {
  readonly name?: string;
  readonly description?: string;
  readonly model?: string;
  readonly skills?: readonly string[];
  readonly purpose?: string;
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

/** Interactive "create profile" flow. Returns the created profile, or null when cancelled. */
export const runCreateWizard = async (
  ctx: ExtensionContext,
  prefill: CreatePrefill = { skills: [] },
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
      (await ctx.ui.input('Role description (one line, e.g. "You are a code reviewer..."):', '')),
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

  const prefilledPurpose = clean(prefill.purpose ?? '');
  let purpose = prefilledPurpose;
  if (purpose === '') {
    const edited = await viewInEditor(ctx, 'Purpose — why this profile exists (what job does the agent do?)', '');
    purpose = edited ?? '';
  }

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

  const profile: Model.Profile = { name, description, model, skills, purpose, instructions, checklist };
  const markdown = Model.renderProfileFromTemplate(readTemplateSync(), profile);

  const preview = await viewInEditor(ctx, `Preview: .agents/profiles/${name}/PROFILE.md`, markdown);
  if (preview === null) {
    ctx.ui.notify('Cancelled.', 'info');
    return null;
  }

  const finalProfile = Model.parseProfile(preview, name);
  const save = await ctx.ui.confirm('Save profile', `Save ${finalProfile.name}?`);
  if (!save) return null;

  await runStore(Store.writeProfileFile(ctx.cwd, finalProfile.name, Model.serializeProfile(finalProfile)));
  await warnUnknownSkills(ctx, finalProfile.skills);
  ctx.ui.notify(`Profile created: .agents/profiles/${finalProfile.name}/PROFILE.md`, 'info');
  return finalProfile;
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

// ─── Defer (clipboard handoff to another agent) ──────────────────────

/** Builds a `new` command with no prefilled fields. */
const emptyNewCommand = (): Extract<ProfilesCommand, { readonly kind: 'new' }> => ({
  kind: 'new',
  fields: {
    name: undefined,
    description: undefined,
    model: undefined,
    skills: [],
    purpose: undefined,
    instructions: undefined,
    instructionsFile: undefined,
    checklist: [],
  },
  force: false,
});

/** Gathers project context (profiles + skills) for a defer prompt. */
const gatherDeferContext = async (ctx: ExtensionContext): Promise<DeferContext> => {
  const [profiles, skillInfos] = await Promise.all([
    runStore(Store.listProfiles(ctx.cwd)),
    runStore(Skills.listSkills(ctx.cwd)),
  ]);
  return { cwd: ctx.cwd, profiles, skills: skillInfos.map((skill) => skill.name) };
};

/** Maps a defer-submenu operation to its target command (undefined = cancelled). */
const deferTargetForOperation = async (
  ctx: ExtensionContext,
  operation: string,
): Promise<ProfilesCommand | undefined> => {
  switch (operation) {
    case 'new':
      return emptyNewCommand();
    case 'list':
      return { kind: 'list' };
    case 'modify': {
      const name = await pickProfile(ctx, 'Modify which profile?');
      return name === null ? undefined : { kind: 'edit', name };
    }
    case 'delete': {
      const name = await pickProfile(ctx, 'Delete which profile?');
      return name === null ? undefined : { kind: 'delete', name, force: true };
    }
    default:
      return undefined;
  }
};

/**
 * Builds a defer prompt for a target command and surfaces it for copying:
 * 1. prints it to stdout in non-TUI modes only (print/JSON — raw stdout
 *    writes corrupt the TUI layout, so never there),
 * 2. writes it to a temp file (always — reliable manual-copy path),
 * 3. best-effort copies it to the system clipboard,
 * 4. on clipboard failure in the TUI, opens a read-only editor preview.
 */
export const runDeferFlow = async (ctx: ExtensionContext, target: ProfilesCommand | undefined): Promise<void> => {
  const prompt = buildDeferPrompt(target, await gatherDeferContext(ctx));

  // Safe stdout output only: print mode / JSON mode. The TUI owns the
  // terminal in raw mode; writing to stdout there breaks its layout.
  if (!ctx.hasUI) {
    console.log(`\n${prompt}\n`);
  }

  let filePath: string | undefined;
  try {
    filePath = await writeDeferPromptToTemp(prompt);
  } catch {
    // Temp write is best-effort.
  }

  try {
    await copyDeferPromptToClipboard(prompt);
    ctx.ui.notify(`Defer prompt copied to clipboard${filePath !== undefined ? ` (also at ${filePath})` : ''}.`, 'info');
  } catch (error) {
    ctx.ui.notify(`Clipboard unavailable: ${error instanceof Error ? error.message : String(error)}`, 'warning');
    if (filePath !== undefined) {
      ctx.ui.notify(`Defer prompt written to ${filePath} — open or cat it to copy manually.`, 'info');
    }
    if (ctx.hasUI) {
      await ctx.ui.editor('Defer prompt (handoff to another agent)', prompt);
    }
  }
};

/** Interactive defer picker: choose the operation, then copy the handoff prompt. */
export const runDeferWizard = async (ctx: ExtensionContext): Promise<void> => {
  const operation = await ctx.ui.select('Defer which action?', ['new', 'modify', 'delete', 'list']);
  if (operation === undefined) return;
  const target = await deferTargetForOperation(ctx, operation);
  if (target === undefined) return;
  await runDeferFlow(ctx, target);
};
