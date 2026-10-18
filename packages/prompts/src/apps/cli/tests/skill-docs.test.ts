import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Schema } from 'effect';
import * as Vitest from '@effect/vitest';
import * as PromptExecute from '../../../modules/prompt-execute/index.js';
import * as Prompts from '../../../modules/prompts/index.js';

/**
 * The skills this package ships, mirrored into `.agents/skills/` by `doctor`.
 * They are the only place the package tells an agent what the rules are and
 * what real output looks like, so they are worth mechanical guards: a
 * hand-maintained sample drifts the moment a column width changes, and a
 * drifting sample is worse than none — an agent comparing it against real
 * output cannot tell whether the difference means the prompt is broken.
 */

const PACKAGE_SKILLS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'skills',
);

/** The mirror `doctor` maintains under this repo's own `.agents/skills/`. */
const INSTALLED_SKILLS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '.agents',
  'skills',
);

/** Every skill this package ships. */
const SKILL_NAMES = ['montflow-create-pi-prompts', 'montflow-execute-pi-prompts'] as const;

/** Read one file out of a skill directory. */
const read = (dir: string, name: string, file: string): string =>
  readFileSync(resolve(dir, name, file), 'utf8');

/** The packaged execute skill — the one carrying a verified output sample. */
const executeSkill = (): string =>
  read(PACKAGE_SKILLS_DIR, 'montflow-execute-pi-prompts', 'SKILL.md');

/**
 * The fenced block following a `<!-- verified-output:<name> -->` marker.
 * Returns undefined when the marker is absent, so a deleted sample fails
 * loudly rather than silently skipping the comparison.
 */
const documentedBlock = (name: string): string | undefined => {
  const markdown = executeSkill();
  const marker = `<!-- verified-output:${name} -->`;
  const after = markdown.indexOf(marker);
  if (after === -1) return undefined;
  const fence = markdown.indexOf('```', after + marker.length);
  if (fence === -1) return undefined;
  const start = fence + '```'.length;
  const body = markdown.startsWith('\n', start) ? start + 1 : start;
  return markdown.slice(body, markdown.indexOf('```', body)).trimEnd();
};

/** The prompt the skill's `inspect` sample describes. */
const samplePrompt = (): Prompts.Prompt =>
  Schema.decodeUnknownSync(Prompts.Prompt)({
    name: 'commit-message',
    description: 'Draft a commit message.',
    template: 'Draft a message for {{files}}.\n{{#if scope}}Scope: {{scope}}{{else}}all{{/if}}',
    variables: [{ name: 'files' }, { name: 'scope', required: false }],
    skills: ['planning-git-commits'],
    model: 'opencode-go/deepseek-v4.1-flash',
  });

Vitest.describe('packaged skills', () => {
  Vitest.it('ships exactly the skills doctor installs', () => {
    Vitest.expect(readdirSync(PACKAGE_SKILLS_DIR).toSorted()).toStrictEqual([...SKILL_NAMES]);
  });

  Vitest.it.each(SKILL_NAMES)('%s: the installed copy is byte-identical', (name) => {
    // `doctor` repairs drift here, but the test must not depend on that having
    // been run: a mismatch means the next `doctor` would rewrite a file the
    // package still ships.
    for (const file of ['SKILL.md', 'CHANGELOG.md']) {
      Vitest.expect(read(INSTALLED_SKILLS_DIR, name, file)).toBe(
        read(PACKAGE_SKILLS_DIR, name, file),
      );
    }
  });

  Vitest.it.each(SKILL_NAMES)('%s: frontmatter name matches its directory', (name) => {
    Vitest.expect(/^name: (\S+)$/mu.exec(read(PACKAGE_SKILLS_DIR, name, 'SKILL.md'))?.[1]).toBe(
      name,
    );
  });

  Vitest.it.each(SKILL_NAMES)('%s: frontmatter version is the newest changelog entry', (name) => {
    const markdown = read(PACKAGE_SKILLS_DIR, name, 'SKILL.md');
    const version = /^version: (\S+)$/mu.exec(markdown)?.[1];
    Vitest.expect(version).toBeDefined();
    const changelog = read(PACKAGE_SKILLS_DIR, name, 'CHANGELOG.md');
    // The *newest* entry, not merely any entry: a version that appears further
    // down the changelog is exactly how a bump gets forgotten.
    const newest = /^## \[(\S+)\]/mu.exec(changelog)?.[1];
    Vitest.expect(version).toBe(newest);
  });
});

Vitest.describe('montflow-execute-pi-prompts documented output', () => {
  Vitest.it('shows the exact bytes inspect produces for the sample prompt', () => {
    const documented = documentedBlock('inspect');
    Vitest.expect(documented).toBeDefined();
    Vitest.expect(PromptExecute.table(PromptExecute.inspect({ prompt: samplePrompt() }))).toBe(
      documented,
    );
  });
});

Vitest.describe('montflow-execute-pi-prompts claims', () => {
  Vitest.it('only names subcommands the named surface actually implements', () => {
    // The skill names the CLI two ways — `mf-prompts x` for the binary and
    // `/mf-prompts x` for the slash form — and a third surface, the menu,
    // whose actions are not CLI subcommands. Both are checked against their
    // own allow-list so a typo on either fails here.
    const cli = new Set([
      'doctor',
      'list',
      'show',
      'inspect',
      'execute',
      'render',
      'verify',
      'create',
      'modify',
      'delete',
      'help',
    ]);
    const menu = new Set([
      'browse',
      'create',
      'list',
      'show',
      'inspect',
      'execute',
      'render',
      'modify',
      'delete',
      'doctor',
      'help',
    ]);

    const markdown = executeSkill();
    // The menu is matched first and removed, so its actions never leak into the
    // CLI list — `/mf-prompts-tui` would otherwise look like a CLI command.
    const withoutMenu = markdown.replaceAll('/mf-prompts-tui', '\u0000');

    const cliNames = [...withoutMenu.matchAll(/(?:^|[`/\s])mf-prompts ([a-z-]+)/gu)].map(
      (match) => match[1] ?? '',
    );
    const menuNames = [...markdown.matchAll(/\/mf-prompts-tui ([a-z-]+)/gu)].map(
      (match) => match[1] ?? '',
    );

    Vitest.expect(cliNames.length).toBeGreaterThan(0);
    for (const command of cliNames) Vitest.expect(cli.has(command)).toBe(true);
    for (const command of menuNames) Vitest.expect(menu.has(command)).toBe(true);
  });

  Vitest.it('documents the whole execute refusal vocabulary', () => {
    // Each fragment is produced verbatim by prompt-execute or doctor. If one is
    // renamed, this fails before an agent greps for a stale phrase.
    for (const fragment of [
      'has no model',
      'needs N required values',
      'not valid Handlebars',
      'Prompts skills are not ready',
    ]) {
      Vitest.expect(executeSkill()).toContain(fragment);
    }
  });

  Vitest.it('does not promise an exit code for a slash command', () => {
    Vitest.expect(executeSkill()).not.toMatch(/non-zero exit|exit code of/iu);
  });

  Vitest.it('lists every doctor status the module can report', () => {
    for (const status of ['ok', 'stale', 'mismatched', 'missing', 'installed', 'repaired']) {
      Vitest.expect(executeSkill()).toContain(`\`${status}\``);
    }
  });
});

Vitest.describe('montflow-create-pi-prompts claims', () => {
  const createSkill = (): string =>
    read(PACKAGE_SKILLS_DIR, 'montflow-create-pi-prompts', 'SKILL.md');

  Vitest.it('works its own example: the prompt it teaches verifies clean', () => {
    const raw = JSON.stringify({
      name: 'commit-message',
      description: 'Draft a commit message.',
      template:
        '{{#if scope}}Some text this is the scope: {{scope}}\n{{else}}Use the git to determine the unstaged changes that must be included.{{/if}}',
      variables: [
        {
          name: 'scope',
          label: 'Scope',
          description: 'What to limit to',
          type: 'text',
          required: false,
          default: '',
        },
      ],
      skills: [],
      model: '',
    });
    Vitest.expect(Prompts.verifyPromptFile('commit-message', raw)).toStrictEqual({
      valid: true,
      issues: [],
    });
  });

  Vitest.it('names exactly the seven checks verifyPromptFile performs', () => {
    for (const item of [
      'valid JSON',
      'slug `name` matching the file name',
      'non-empty `description` and `template`',
      'template parses',
      'first-appearance order',
      'legal flat name',
      'both `required` and defaulted',
    ]) {
      Vitest.expect(createSkill()).toContain(item);
    }
  });

  Vitest.it('documents every field the Variable schema has', () => {
    for (const field of ['name', 'label', 'description', 'type', 'required', 'default']) {
      Vitest.expect(createSkill()).toContain(`\`${field}\``);
    }
  });
});
