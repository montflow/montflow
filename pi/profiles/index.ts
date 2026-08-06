import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import type { AutocompleteItem } from '@earendil-works/pi-tui';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { registerProfileApi } from './api.ts';
import * as Model from './model.ts';
import { USAGE, tryParseOptions, type NewProfileFields, type ProfilesCommand } from './options.ts';
import { readTemplateSync } from './paths.ts';
import { runStore } from './runtime.ts';
import * as Store from './store.ts';
import { runCreateWizard, runEditWizard, warnUnknownSkills } from './wizard.ts';
import { runMainMenu } from './menu.ts';

/**
 * Pi extension: a pure profile store.
 *
 * Profiles live at `.agents/profiles/<name>/PROFILE.md` (structure defined by
 * the bundled TEMPLATE.md). A profile is data — a one-line description (role
 * and what it does), custom instructions, a review checklist, a preferred
 * model, and a list of skills — nothing more.
 *
 * This extension NEVER executes anything: no activation, no model switching,
 * no prompt injection, no skill loading. It only creates/modifies/deletes/lists
 * profiles, and serves profile context to OTHER extensions over the event bus
 * (`profiles:get` / `profiles:list`, see api.ts). In agentic create mode the
 * request is handed to the main agent as a user message; the agent resolves
 * the fields with the user and runs the standalone CLI itself.
 *
 * - Interactive: `/profiles` → menu (new | modify | delete | list)
 * - CLI: `/profiles --new --name ... --description ...` (also `node cli.ts`)
 *
 * Uses Effect v4 for file access, parsing, and error handling.
 */
export default function profilesExtension(pi: ExtensionAPI): void {
  registerProfileApi(pi);

  // ─── /profiles command ─────────────────────────────────────────────
  pi.registerCommand('profiles', {
    description:
      'Store agent profiles (.agents/profiles/<name>/PROFILE.md): ' +
      'new, modify, delete, list. No args opens the interactive menu.',
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const subcommands = ['new', 'list', 'show', 'modify', 'delete', 'template', 'help'];
      const matches: AutocompleteItem[] = subcommands
        .filter((sub) => sub.startsWith(prefix))
        .map((sub) => ({ value: sub, label: sub }));
      return matches.length > 0 ? matches : null;
    },
    handler: async (args, ctx) => {
      const parsed = tryParseOptions(args);
      if (!parsed.ok) {
        ctx.ui.notify(parsed.err instanceof Error ? parsed.err.message : String(parsed.err), 'error');
        return;
      }
      const command = parsed.command ?? { kind: 'menu' };
      await dispatch(ctx, command);
    },
  });

  // ─── Command dispatch ──────────────────────────────────────────────
  const dispatch = async (ctx: ExtensionContext, command: ProfilesCommand): Promise<void> => {
    switch (command.kind) {
      case 'help':
        await viewText(ctx, 'profiles — usage', USAGE);
        return;
      case 'menu':
        if (ctx.hasUI) {
          await runMainMenu(ctx, pi);
        } else {
          ctx.ui.notify('Run /profiles inside the TUI for the interactive menu (new | modify | delete | list).', 'info');
        }
        return;
      case 'list': {
        const names = await runStore(Store.listProfiles(ctx.cwd));
        if (names.length === 0) {
          ctx.ui.notify('No profiles yet. Create one with /profiles --new.', 'info');
          return;
        }
        const pick = await ctx.ui.select('Profiles', names);
        if (pick !== undefined) {
          const markdown = await runStore(Store.readProfileFile(ctx.cwd, pick));
          await viewText(ctx, `Profile: ${pick}`, markdown);
        }
        return;
      }
      case 'template':
        await viewText(ctx, 'TEMPLATE.md (read-only)', readTemplateSync());
        return;
      case 'show': {
        if (command.name === '') {
          ctx.ui.notify('Usage: /profiles --show <name>', 'error');
          return;
        }
        try {
          const markdown = await runStore(Store.readProfileFile(ctx.cwd, command.name));
          await viewText(ctx, `Profile: ${command.name}`, markdown);
        } catch (error) {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
        }
        return;
      }
      case 'edit': {
        if (command.name === '' && !ctx.hasUI) {
          ctx.ui.notify('Usage: /profiles --modify <name> (interactive modify needs the TUI)', 'error');
          return;
        }
        await runEditWizard(ctx, command.name === '' ? undefined : command.name);
        return;
      }
      case 'delete': {
        if (command.name === '') {
          ctx.ui.notify('Usage: /profiles --delete <name>', 'error');
          return;
        }
        let confirmed = command.force;
        if (!confirmed && ctx.hasUI) {
          confirmed = await ctx.ui.confirm('Delete profile', `Permanently delete ${command.name}?`);
        }
        if (!confirmed) {
          ctx.ui.notify('Deletion cancelled.', 'info');
          return;
        }
        await runStore(Store.deleteProfileDir(ctx.cwd, command.name));
        ctx.ui.notify(`Deleted profile: ${command.name}`, 'info');
        return;
      }
      case 'new': {
        await handleNew(ctx, command.fields, command.force);
        return;
      }
    }
  };

  // ─── /profiles --new handling ───────────────────────────────────────
  const handleNew = async (
    ctx: ExtensionContext,
    fields: NewProfileFields,
    force: boolean,
  ): Promise<void> => {
    const complete = fields.name !== undefined && fields.description !== undefined;

    // Interactive fallback: any missing field runs the wizard with prefills.
    if (!complete && ctx.hasUI) {
      const profile = await runCreateWizard(ctx, pi, {
        name: fields.name,
        description: fields.description,
        model: fields.model,
        skills: fields.skills,
        instructions: fields.instructions,
        checklist: fields.checklist,
      });
      if (profile !== null) {
        ctx.ui.notify(`Profile created: .agents/profiles/${profile.name}/PROFILE.md`, 'info');
      }
      return;
    }
    if (!complete) {
      ctx.ui.notify(
        'Usage: /profiles --new --name <slug> --description "<text>" ' +
          '[--model provider/model] [--skills a,b,c] [--instructions "<text>"]',
        'error',
      );
      return;
    }

    const name = Model.slugify(fields.name ?? '');
    if (!Model.isValidProfileName(name)) {
      ctx.ui.notify(`Invalid profile name: ${fields.name}`, 'error');
      return;
    }

    const exists = await runStore(Store.profileExists(ctx.cwd, name));
    if (exists && !force) {
      ctx.ui.notify(`Profile already exists: ${name} (use --force to overwrite)`, 'error');
      return;
    }

    let instructions = fields.instructions ?? '';
    if (fields.instructionsFile !== undefined && fields.instructionsFile.trim() !== '') {
      const content = await runStore(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem;
          return yield* fileSystem.readFileString(fields.instructionsFile ?? '', 'utf8');
        }).pipe(Effect.orElseSucceed(() => '')),
      );
      instructions = content !== '' ? content : instructions;
      if (content === '') ctx.ui.notify(`Could not read --instructions-file: ${fields.instructionsFile}`, 'warning');
    }

    const profile = Model.validateProfileFields({
      name,
      description: fields.description ?? '',
      model: fields.model ?? '',
      skills: fields.skills,
      instructions,
      checklist: fields.checklist,
    });
    if (profile === undefined) {
      ctx.ui.notify(`Invalid profile fields: ${fields.name}`, 'error');
      return;
    }

    const markdown = Model.renderProfileFromTemplate(readTemplateSync(), profile);
    await runStore(Store.writeProfileFile(ctx.cwd, name, markdown));
    await warnUnknownSkills(ctx, profile.skills);
    ctx.ui.notify(`Profile created: .agents/profiles/${name}/PROFILE.md`, 'info');
  };
}

/** Serves profile context to other extensions over the event bus. */
// (registerProfileApi lives in api.ts)

/** Opens content in the editor (TUI) or notifies a summary otherwise. */
const viewText = async (ctx: ExtensionContext, title: string, content: string): Promise<void> => {
  if (ctx.hasUI) {
    await ctx.ui.editor(title, content);
  } else {
    const firstLine = content.split('\n').find((line) => line.trim() !== '') ?? '(empty)';
    ctx.ui.notify(`${title}: ${firstLine}`, 'info');
  }
};
