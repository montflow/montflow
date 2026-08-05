import { copyToClipboard } from '@earendil-works/pi-coding-agent';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProfilesCommand } from './options.ts';
import { PACKAGE_ROOT } from './paths.ts';

/**
 * Defer mode: instead of executing a profiles operation, build a self-contained
 * handoff prompt for ANOTHER agent describing how to perform the operation with
 * the standalone CLI, and copy it to the clipboard.
 *
 * The receiving agent reads the prompt, fills in the arguments from its own
 * task context, replies with the exact command, and runs it with the bash tool.
 */

/** Absolute path to the standalone CLI (valid in any project). */
const CLI_PATH = join(PACKAGE_ROOT, 'cli.ts');

/** Context gathered by the caller and embedded in the prompt. */
export interface DeferContext {
  readonly cwd: string;
  readonly profiles: readonly string[];
  readonly skills: readonly string[];
}

const contextSection = (context: DeferContext): string => {
  const lines: string[] = [];
  lines.push('## Context');
  lines.push('');
  lines.push(`- Project directory: ${context.cwd}`);
  lines.push(
    `- Existing profiles: ${context.profiles.length === 0 ? 'none' : context.profiles.join(', ')}`,
  );
  lines.push(
    `- Available skills (valid values for --skills): ${context.skills.length === 0 ? 'none' : context.skills.join(', ')}`,
  );
  return lines.join('\n');
};

const taskSection = (task: string): string =>
  ['## Your task', '', task].join('\n');

const verifySection = (name: string): string =>
  [
    '4. Verify the file exists and looks right:',
    `   cat .agents/profiles/${name}/PROFILE.md`,
  ].join('\n');

/** Handoff prompt for `--new`. */
const buildNewPrompt = (command: Extract<ProfilesCommand, { readonly kind: 'new' }>, context: DeferContext): string => {
  const hints: string[] = [];
  if (command.fields.name !== undefined) hints.push(`- Requested name: ${command.fields.name}`);
  if (command.fields.description !== undefined) hints.push(`- Requested description: ${command.fields.description}`);
  if (command.fields.model !== undefined) hints.push(`- Requested model: ${command.fields.model}`);

  const hintSection = hints.length > 0 ? `## Hints from the person who deferred this\n\n${hints.join('\n')}\n\n` : '';

  return [
    `# Handoff: create an agent profile`,
    '',
    `You are another agent working in the project at:`,
    `  ${context.cwd}`,
    '',
    `A task was deferred to you: **create a new agent profile** using the profiles CLI.`,
    '',
    `Profiles are stored at \`.agents/profiles/<name>/PROFILE.md\`. The profiles extension only stores profile data (role description, purpose, instructions, review checklist, preferred model, skills) — it never executes anything.`,
    '',
    '## Run this command, filling in the arguments',
    '',
    '```bash',
    `node ${CLI_PATH} --new \\`,
    '  --name <lowercase-hyphen-slug> \\',
    '  --description "<one-line role description, e.g. \\"You are ...\\">" \\',
    '  [--model <provider>/<model-id>] \\',
    '  [--skills a,b,c] \\',
    '  [--purpose "<why this profile exists>"] \\',
    '  [--instructions "<custom system-prompt behavior>"] \\',
    '  [--checklist "item1|item2"]',
    '```',
    '',
    '`--name` and `--description` are required. `--name` must be lowercase letters, digits, and hyphens. All other flags are optional; omit them when the task gives no basis for them.',
    '',
    hintSection,
    `${contextSection(context)}`,
    '',
    taskSection(
      [
        '1. From the task you were given, decide the profile\'s `--name` (a lowercase-hyphen slug), `--description`, and any optional fields (model, skills, purpose, instructions, checklist).',
        '2. Reply with the exact command, then run it with the bash tool in the project directory.',
        '3. If the profile already exists, add `--force` to overwrite it.',
        '',
        verifySection('<name>'),
      ].join('\n'),
    ),
    '',
  ].join('\n');
};

/** Handoff prompt for `--modify` (CLI modify is interactive-only → edit the file directly). */
const buildModifyPrompt = (name: string, context: DeferContext): string => [
  `# Handoff: modify an agent profile`,
  '',
  `You are another agent working in the project at:`,
  `  ${context.cwd}`,
  '',
  `A task was deferred to you: **modify the profile \`${name}\`**.`,
  '',
  `The profile lives at \`.agents/profiles/${name}/PROFILE.md\`. The profiles extension only stores profile data — edit the file directly:`,
  '',
  '1. Read `.agents/profiles/' + name + '/PROFILE.md` and the template at `.agents/profiles/TEMPLATE.md` (or the bundled TEMPLATE.md) for the canonical structure.',
  '2. Edit the frontmatter (`name`, `description`, `model`, `skills`) and the body sections (`## Purpose`, `## Instructions`, `## Review Checklist`).',
  '3. Keep `name:` matching the directory name (`' + name + '`).',
  '4. Run `node ' + CLI_PATH + ' --show ' + name + '` afterwards to verify the file parses.',
  '',
  `${contextSection(context)}`,
  '',
  taskSection(
    [
      '1. Apply the requested changes to `.agents/profiles/' + name + '/PROFILE.md` using read + write.',
      '2. Reply with a short summary of what changed.',
    ].join('\n'),
  ),
  '',
].join('\n');

/** Handoff prompt for `--delete`. */
const buildDeletePrompt = (name: string, context: DeferContext): string => [
  `# Handoff: delete an agent profile`,
  '',
  `You are another agent working in the project at:`,
  `  ${context.cwd}`,
  '',
  `A task was deferred to you: **delete the profile \`${name}\`**.`,
  '',
  '## Run this command',
  '',
  '```bash',
  `node ${CLI_PATH} --delete ${name} --force`,
  '```',
  '',
  'The standalone CLI is non-interactive, so deletion requires `--force` (the equivalent of confirming). Only proceed if the task clearly calls for deleting this profile.',
  '',
  `${contextSection(context)}`,
  '',
  taskSection(
    [
      '1. Confirm the profile to delete is the right one (check the task).',
      '2. Run the command above with the bash tool in the project directory.',
      '3. Verify it is gone: `node ' + CLI_PATH + ' --list`',
    ].join('\n'),
  ),
  '',
].join('\n');

/** Handoff prompt for `--list`. */
const buildListPrompt = (context: DeferContext): string => [
  `# Handoff: list agent profiles`,
  '',
  `You are another agent working in the project at:`,
  `  ${context.cwd}`,
  '',
  'A task was deferred to you: **list the agent profiles** in this project.',
  '',
  '## Run this command',
  '',
  '```bash',
  `node ${CLI_PATH} --list`,
  '```',
  '',
  `${contextSection(context)}`,
  '',
  taskSection(
    [
      '1. Run the command above with the bash tool in the project directory.',
      '2. Report the profile names. For any profile the task needs, also run:',
      `   node ${CLI_PATH} --show <name>`,
    ].join('\n'),
  ),
  '',
].join('\n');

/** Generic handoff prompt (no operation chosen). */
const buildOperationPicker = (context: DeferContext): string => [
  `# Handoff: manage agent profiles`,
  '',
  `You are another agent working in the project at:`,
  `  ${context.cwd}`,
  '',
  'A task was deferred to you that involves managing an agent profile.',
  '',
  'Profiles are stored at `.agents/profiles/<name>/PROFILE.md` (data only — the profiles extension never executes anything).',
  '',
  '## Pick the operation the task needs and run it with the bash tool in the project directory',
  '',
  '```bash',
  `# create a profile`,
  `node ${CLI_PATH} --new --name <slug> --description "<role description>" [--skills a,b,c]`,
  '',
  '# list profiles',
  `node ${CLI_PATH} --list`,
  '',
  '# show a profile',
  `node ${CLI_PATH} --show <name>`,
  '',
  '# delete a profile (non-interactive requires --force)',
  `node ${CLI_PATH} --delete <name> --force`,
  '',
  '# modify a profile (interactive-only in the CLI: edit .agents/profiles/<name>/PROFILE.md directly)',
  '```',
  '',
  `${contextSection(context)}`,
  '',
  taskSection(
    [
      '1. Decide which operation (new | list | modify | delete) the task needs.',
      '2. Reply with the exact command, then run it.',
      '3. Verify the result before finishing.',
    ].join('\n'),
  ),
  '',
].join('\n');

/**
 * Builds the handoff prompt for a deferred command.
 * `command` is the target operation (never a `defer` wrapper); undefined when
 * no operation was chosen (prompt tells the receiving agent to pick one).
 */
export const buildDeferPrompt = (command: ProfilesCommand | undefined, context: DeferContext): string => {
  if (command === undefined) return buildOperationPicker(context);
  switch (command.kind) {
    case 'new':
      return buildNewPrompt(command, context);
    case 'edit':
      return buildModifyPrompt(command.name, context);
    case 'delete':
      return buildDeletePrompt(command.name, context);
    case 'list':
      return buildListPrompt(context);
    default:
      return buildOperationPicker(context);
  }
};

/** Copies text to the system clipboard (pi's cross-platform utility). */
export const copyDeferPromptToClipboard = async (prompt: string): Promise<void> => {
  await copyToClipboard(prompt);
};

/**
 * Writes the prompt to a temp file so it can always be opened/copied manually
 * (the system clipboard may be unavailable, e.g. headless/remote sessions).
 * Returns the file path.
 */
export const writeDeferPromptToTemp = async (prompt: string): Promise<string> => {
  const file = join(tmpdir(), `profiles-defer-${Date.now()}.md`);
  await writeFile(file, prompt, 'utf8');
  return file;
};
