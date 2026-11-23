#!/usr/bin/env bun
/**
 * Import poteto's pstack into montflow's stores, renamed to the mf- namespace.
 *
 *   bun run scripts/import-mfstack.ts [--check]
 *
 * The source is the `plugins` reference clone (`.agents/references/plugins/pstack`), which
 * must sit at the commit pinned by `ref:` in `.agents/@montflow/references/plugins/REFERENCE.md`.
 * `--check` writes nothing and exits 1 when the committed stores drift from a fresh import.
 * `--source`, `--out` and `--commit` override the defaults (tests and dry runs).
 *
 * Writes, relative to --out:
 *   packages/mf-feature/skills/mf-feature/, packages/mf-feature/skills/mf-feature-<name>/   (every pstack skill but the below)
 *   packages/mf-feature/profiles/mf-feature-<agent>/PROFILE.md            (pstack agents)
 *   packages/mf-feature/payload.json                                   (installed by `mf-feature doctor`)
 *   packages/mf-principles/principles/<name>/PRINCIPLE.md          (pstack principle-* skills)
 *   packages/mf-playbooks/playbooks/<name>/PLAYBOOK.md             (pstack poteto-mode playbooks)
 *
 * Not imported: setup-pstack (its roles become `mf-feature roles`), make-bot-ui (Cursor-only).
 * pstack's agents become profiles: poteto-agent is `mf-feature-generic-worker`, comment-sicko is
 * `mf-feature-comment-sicko`.
 * Links resolve against the installed layout under `.agents/`; links to pstack files
 * that are not imported point at the pinned upstream commit on GitHub.
 */
import { createHash } from 'node:crypto';
import * as Fs from 'node:fs';
import * as Path from 'node:path';

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index++) {
  const key = process.argv[index] ?? '';
  if (!key.startsWith('--')) continue;
  const next = process.argv[index + 1];
  if (next === undefined || next.startsWith('--')) args.set(key.slice(2), 'true');
  else {
    args.set(key.slice(2), next);
    index++;
  }
}
const ROOT = Path.resolve(import.meta.dirname, '..');
const REGISTRY = Path.join(ROOT, '.agents/@montflow/references/plugins/REFERENCE.md');
const CLONE = Path.join(ROOT, '.agents/references/plugins');
const pinned = /^ref:\s*([0-9a-f]{40})\s*$/m.exec(Fs.readFileSync(REGISTRY, 'utf8'))?.[1];
const SOURCE = Path.resolve(args.get('source') ?? Path.join(CLONE, 'pstack'));
const OUT = Path.resolve(args.get('out') ?? ROOT);
const COMMIT = args.get('commit') ?? pinned ?? '';
if (!/^[0-9a-f]{40}$/.test(COMMIT)) {
  console.error(`import-mfstack: pin the pstack commit as a 40-char 'ref:' in ${REGISTRY}`);
  process.exit(2);
}
if (!Fs.existsSync(Path.join(SOURCE, 'plugin.json'))) {
  console.error(`import-mfstack: no pstack source at ${SOURCE}; run 'mf-references sync plugins'.`);
  process.exit(2);
}
if (!args.has('source')) {
  const head = Bun.spawnSync(['git', '-C', CLONE, 'rev-parse', 'HEAD']).stdout.toString().trim();
  if (head !== COMMIT) {
    console.error(`import-mfstack: the plugins clone is at ${head}, not the pinned ${COMMIT}.`);
    process.exit(2);
  }
}

const UPSTREAM = `https://github.com/cursor/plugins/blob/${COMMIT}/pstack`;
const SKIPPED = new Set(['setup-pstack', 'make-bot-ui']);
const pluginVersion = (JSON.parse(Fs.readFileSync(Path.join(SOURCE, 'plugin.json'), 'utf8')) as {
  version: string;
}).version;

const allSkillDirs = Fs.readdirSync(Path.join(SOURCE, 'skills')).filter((name) =>
  Fs.existsSync(Path.join(SOURCE, 'skills', name, 'SKILL.md')),
);
const PRINCIPLES = allSkillDirs
  .filter((name) => name.startsWith('principle-'))
  .map((name) => name.slice('principle-'.length));
const SKILLS = allSkillDirs.filter((name) => !name.startsWith('principle-') && !SKIPPED.has(name));
const PLAYBOOK_DIR = Path.join(SOURCE, 'skills', 'poteto-mode', 'playbooks');
const PLAYBOOKS = Fs.readdirSync(PLAYBOOK_DIR)
  .filter((file) => file.endsWith('.md'))
  .map((file) => file.slice(0, -'.md'.length));

/** The mf- name of an imported pstack skill. */
const skillName = (name: string): string =>
  name === 'poteto-mode' ? 'mf-feature' : name === 'poteto-help' ? 'mf-feature-help' : `mf-feature-${name}`;

/** A stable 16-hex id per skill name, so re-imports never churn the id. */
const skillId = (name: string): string =>
  createHash('sha256').update(`montflow:${name}`).digest('hex').slice(0, 16);

// ---------------------------------------------------------------------------
// Paths: pstack source path -> installed path under `.agents/` (or upstream URL)
// ---------------------------------------------------------------------------

/** Installed path (relative to `.agents/`) of a pstack source path, or undefined if not imported. */
const installedPath = (source: string): string | undefined => {
  const parts = source.split('/');
  if (parts[0] !== 'skills' || parts.length < 3) return undefined;
  const dir = parts[1] ?? '';
  if (dir.startsWith('principle-')) {
    return parts[2] === 'SKILL.md'
      ? `@montflow/principles/${dir.slice('principle-'.length)}/PRINCIPLE.md`
      : undefined;
  }
  if (dir === 'poteto-mode' && parts[2] === 'playbooks' && parts.length === 4) {
    return `@montflow/playbooks/${(parts[3] ?? '').replace(/\.md$/, '')}/PLAYBOOK.md`;
  }
  if (!SKILLS.includes(dir)) return undefined;
  return ['skills', skillName(dir), ...parts.slice(2)].join('/');
};

const ALL_NAMES = [...SKILLS, ...SKIPPED, ...PRINCIPLES.map((p) => `principle-${p}`)]
  .toSorted((a, b) => b.length - a.length)
  .map((name) => name.replace(/[-]/g, '\\-'))
  .join('|');

// ---------------------------------------------------------------------------
// Text rewriting
// ---------------------------------------------------------------------------

const residuals = new Map<string, number>();
const noteResidual = (term: string, count: number): void => {
  if (count > 0) residuals.set(term, (residuals.get(term) ?? 0) + count);
};

/** Rewrite one markdown link target found in `fromSource`, for a file installed at `fromInstalled`. */
const rewriteTarget = (target: string, fromSource: string, fromInstalled: string): string => {
  if (/^[a-z]+:/i.test(target) || target.startsWith('#')) return target;
  const [pathPart, anchor] = target.split('#', 2) as [string, string | undefined];
  if (pathPart === '') return target;
  const resolved = Path.posix.normalize(Path.posix.join(Path.posix.dirname(fromSource), pathPart));
  const installed = installedPath(resolved);
  const suffix = anchor === undefined ? '' : `#${anchor}`;
  if (installed === undefined) {
    if (resolved.startsWith('..')) return target;
    return `${UPSTREAM}/${resolved}${suffix}`;
  }
  const relative = Path.posix.relative(Path.posix.dirname(fromInstalled), installed);
  return `${relative === '' ? '.' : relative}${suffix}`;
};

/** Rename pstack names in prose (never inside link targets). */
const rewriteProse = (text: string): string => {
  let out = text;
  // `playbooks/x.md` -> `mf-playbooks show x`
  out = out.replace(
    /`(?:\.\.\/)?playbooks\/([a-z0-9-]+)\.md`/g,
    (_match, name: string) => `\`mf-playbooks show ${name}\``,
  );
  // **principle-x** (skill) -> **x** principle
  out = out.replace(
    /\*\*principle-([a-z0-9-]+)\*\*( principle)?( skill)?/g,
    (_match, name: string) => `**${name}** principle`,
  );
  // remaining principle-x mentions of known principles
  out = out.replace(/(?<![a-z0-9/-])principle-([a-z0-9-]+)(?![a-z0-9-])/g, (match, name: string) =>
    PRINCIPLES.includes(name) ? name : match,
  );
  // **skill** -> **mf-feature-skill**
  out = out.replace(/\*\*([a-z0-9-]+)\*\*/g, (match, name: string) =>
    SKILLS.includes(name) ? `**${skillName(name)}**` : match,
  );
  // `skill` -> `mf-feature-skill`
  out = out.replace(/`([a-z0-9-]+)`/g, (match, name: string) =>
    SKILLS.includes(name) ? `\`${skillName(name)}\`` : match,
  );
  // /pstack:skill and /skill slash commands
  out = out.replace(/\/pstack:([a-z0-9-]+)/g, (_match, name: string) =>
    SKILLS.includes(name) ? `/${skillName(name)}` : `/${name}`,
  );
  out = out.replace(
    /(^|[\s(`"'])\/([a-z0-9-]+)(?![a-z0-9/-])/gm,
    (match, lead: string, name: string) => (SKILLS.includes(name) ? `${lead}/${skillName(name)}` : match),
  );
  out = out.replace(/(?<![a-z0-9-])poteto-mode(?![a-z0-9-])/g, 'mf-feature');
  out = out.replace(/(?<![a-z0-9-])poteto-help(?![a-z0-9-])/g, 'mf-feature-help');
  out = out.replace(/pstack:poteto-agent/g, 'poteto-agent');
  out = out.replace(/(?<![a-z0-9-])poteto-agent(?![a-z0-9-])/g, 'mf-feature-generic-worker');
  out = out.replace(/(?<![a-z0-9-])comment-sicko(?![a-z0-9-])/g, 'mf-feature-comment-sicko');
  out = out.replace(/(?<![a-z0-9-])pstack(?![a-z0-9-])/g, 'mfstack');
  out = out.replace(/(?<![a-z0-9-])Pstack(?![a-z0-9-])/g, 'MFStack');
  for (const [pattern, replacement] of NEUTRAL) out = out.replace(pattern, replacement as never);
  return out;
};

/**
 * pstack's model roles, keyed by the label its `pstack-models` rule used. Each becomes a
 * montflow role, resolved to a harness and model by `mf-feature roles resolve <role>`.
 */
const ROLES: Readonly<Record<string, string>> = {
  'feature, refactoring': 'feature',
  feature: 'feature',
  refactoring: 'feature',
  'bug-fix': 'bug-fix',
  'perf-issue': 'perf-issue',
  hillclimb: 'hillclimb',
  'judgment and prose': 'judgment',
  'arena runners': 'arena-runners',
  'arena cross-judge pool': 'arena-judges',
  'swarm workers': 'swarm-workers',
  'interrogate reviewers': 'interrogate-reviewers',
};
const ROLE_LABELS = Object.keys(ROLES)
  .toSorted((a, b) => b.length - a.length)
  .map((label) => label.replace(/[-]/g, '\\-'))
  .join('|');
const HARNESSES = 'the harnesses reference of the **mf-feature** skill';

/**
 * Harness-neutral wording: pstack names Cursor's tools, paths and model slugs; montflow's
 * text names the concept and leaves the per-harness detail to `mf-feature/references/harnesses.md`.
 */
const NEUTRAL: ReadonlyArray<readonly [RegExp, string | ((...groups: Array<string>) => string)]> = [
  // Model roles -> roles resolved by `mf-feature roles resolve`.
  [
    new RegExp(`the \`(${ROLE_LABELS})\` line in \`~/\\.cursor/rules/pstack-models\\.mdc\``, 'g'),
    (_m, label) => `the \`${ROLES[label ?? '']}\` role (\`mf-feature roles resolve ${ROLES[label ?? '']}\`)`,
  ],
  [new RegExp(`\`(${ROLE_LABELS})\` line`, 'g'), (_m, label) => `\`${ROLES[label ?? '']}\` role`],
  [new RegExp(`\`(${ROLE_LABELS})\``, 'g'), (_m, label) => `\`${ROLES[label ?? '']}\``],
  [
    /your configured ([a-z-]+) model \(default `[^`]+`\)/g,
    (_m, role) => `the \`${ROLES[role ?? ''] ?? role}\` role's model`,
  ],
  [/`~\/\.cursor\/rules\/pstack-models\.mdc`/g, 'your roles (`mf-feature roles`)'],
  // Todo lists.
  [/the todolist tool/g, 'the todo list'],
  [/\btodolist\b/g, 'todo list'],
  // Skill directories.
  [/~\/\.cursor\/skills\//g, '~/.agents/skills/'],
  [/\.cursor\/skills\//g, '.agents/skills/'],
  // Transcripts.
  [/`~\/\.cursor\/projects\/\*\/`/g, "other workspaces' transcript folders"],
  [
    /The system prompt names the workspace's `agent-transcripts\/` directory\. Use only that path\./g,
    `${HARNESSES.replace(/^t/, 'T')} names where your harness keeps this workspace's transcripts. Use only that path.`,
  ],
  [
    /the active workspace's `agent-transcripts\/` directory \(the system prompt names (?:the|this) path\.? ?/g,
    `the active workspace's transcript directory (${HARNESSES} names it. `,
  ],
  [/the active workspace's `agent-transcripts\/` directory/g, "the active workspace's transcript directory"],
  // Loops and wake-ups.
  [/Cursor's `\/loop` command \(a built-in, not a mfstack skill\)/g, `your harness's loop or wake-up mechanism (${HARNESSES} lists them)`],
  [/Cursor's `\/loop` command/g, "your harness's loop or wake-up mechanism"],
  [/`\/loop 1h`/g, 'an hourly loop'],
  [/`\/loop`/g, 'a loop'],
  [/(?<![\w/])\/loop until/g, 'loop until'],
  // Questions.
  [/the `AskQuestion` tool \(structured multi-choice\)/g, "your harness's structured question tool (multi-choice)"],
  [/`AskQuestion`/g, "your harness's question tool"],
  // Authoring skills: montflow's own skill tooling replaces Cursor's built-in.
  [/the \*\*create-skill\*\* skill \(Cursor's built-in for authoring SKILL\.md files\)/g, 'the **mf-create-skills** skill'],
  [/Cursor's built-in `create-skill` skill/g, 'the **mf-create-skills** skill'],
  [/Cursor's built-in `create-skill`/g, 'the **mf-create-skills** skill'],
  [/, not Cursor's built-in babysit skill/g, ''],
  // Subagents.
  [/Spawn one Task subagent with `subagent_type: generalPurpose` and `readonly: true`/g, 'Spawn one read-only, general-purpose subagent'],
  [/Spawn `Task` with `subagent_type: "([a-z-]+)"`/g, 'Spawn a subagent with the `$1` profile'],
  [/`subagent_type: "([a-z-]+)"`/g, 'the `$1` profile'],
  [/Spawn each adversary as `generalPurpose`/g, 'Spawn each adversary as a general-purpose subagent'],
  [/Substituting `generalPurpose`/g, 'Substituting a general-purpose subagent'],
  [/each a Cursor cloud agent,/g, 'each an isolated agent (a cloud agent or its own worktree),'],
  [/Each owner is a Cursor cloud agent that/g, 'Each owner is an isolated agent (a cloud agent or its own worktree) that'],
  [/runs on `claude-opus-5-5-medium-fast`/g, 'runs on the cheapest model that can do it'],
];

const RESIDUAL_TERMS = [
  'setup-pstack',
  'pstack-models',
  '.cursor/',
  'AskQuestion',
  'generalPurpose',
  'subagent_type',
  '`Task`',
  'Custom Mode',
  'Cursor',
  'cursor.com',
  '-fast`',
  'gemini-',
  '/loop',
];

/** Rewrite a markdown document: link targets by path, prose by name. */
const rewriteDocument = (text: string, fromSource: string, fromInstalled: string): string => {
  const pieces: Array<string> = [];
  const pattern = /\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    pieces.push(rewriteProse(text.slice(last, index)));
    pieces.push(`](${rewriteTarget(match[1] ?? '', fromSource, fromInstalled)})`);
    last = index + match[0].length;
  }
  pieces.push(rewriteProse(text.slice(last)));
  return pieces.join('');
};

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

interface Parsed {
  readonly fields: Map<string, string>;
  readonly body: string;
}

const parseFrontmatter = (text: string): Parsed => {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (match === null) return { fields: new Map(), body: text };
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? '').split('\n')) {
    const field = /^([\w-]+):\s*(.*)$/.exec(line);
    if (field !== null) fields.set(field[1] ?? '', field[2] ?? '');
  }
  return { fields, body: text.slice(match[0].length) };
};

/** A YAML double-quoted scalar. */
const quote = (value: string): string => JSON.stringify(value);

/** Read a scalar that may be YAML double-quoted. */
const unquote = (value: string): string =>
  value.startsWith('"') ? (JSON.parse(value) as string) : value;

const frontmatter = (entries: ReadonlyArray<readonly [string, string | ReadonlyArray<string>]>): string => {
  const lines = ['---'];
  for (const [key, value] of entries) {
    if (typeof value === 'string') lines.push(`${key}: ${value}`);
    else if (value.length > 0) lines.push(`${key}:`, ...value.map((item) => `  - ${item}`));
  }
  lines.push('---', '');
  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

const written = new Map<string, Buffer | string>();
/**
 * Where a logical path lands in the checkout. Skills and edits are addressed by their
 * installed path (`.agents/skills/<name>/…`); the mode package ships them, so they are
 * written under `packages/mf-feature/` and `mf-feature doctor` installs them.
 */
const placed = (relative: string): string =>
  relative.startsWith('.agents/skills/')
    ? `packages/mf-feature/skills/${relative.slice('.agents/skills/'.length)}`
    : relative.startsWith('packages/mf-profiles/profiles/mf-feature-')
      ? `packages/mf-feature/profiles/${relative.slice('packages/mf-profiles/profiles/'.length)}`
      : relative;

const write = (relative: string, content: Buffer | string): void => {
  written.set(relative, content);
};

const walk = (dir: string): ReadonlyArray<string> =>
  Fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = Path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') return [];
      return walk(full);
    }
    return [full];
  });

// Skills
for (const dir of SKILLS) {
  const sourceDir = Path.join(SOURCE, 'skills', dir);
  for (const file of walk(sourceDir)) {
    const rel = Path.relative(Path.join(SOURCE), file).split(Path.sep).join('/');
    if (dir === 'poteto-mode' && rel.startsWith('skills/poteto-mode/playbooks/')) continue;
    // Upstream test suites (statechart's is ~4 MB of fixtures) are not part of a skill an agent runs.
    if (/^skills\/[^/]+\/scripts\/test\//.test(rel)) continue;
    const installed = installedPath(rel);
    if (installed === undefined) continue;
    const target = `.agents/${installed}`;
    if (!file.endsWith('.md')) {
      write(target, Fs.readFileSync(file));
      continue;
    }
    const text = Fs.readFileSync(file, 'utf8');
    if (!rel.endsWith('/SKILL.md') || rel.split('/').length !== 3) {
      write(target, rewriteDocument(text, rel, installed));
      continue;
    }
    const parsed = parseFrontmatter(text);
    const name = skillName(dir);
    const description = rewriteProse(unquote(parsed.fields.get('description') ?? ''));
    const head = frontmatter([
      ['name', name],
      ['description', quote(description)],
      ['id', skillId(name)],
      ['author', 'Lauren Tan'],
      ['version', pluginVersion],
      ['license', 'MIT'],
      ...(parsed.fields.get('disable-model-invocation') === 'true'
        ? ([['disable-model-invocation', 'true']] as const)
        : []),
    ]);
    write(target, `${head}\n${rewriteDocument(parsed.body.replace(/^\n+/, ''), rel, installed)}`);
  }
}

// Agents -> profiles. A profile is a persona: `# Title`, `## Instructions`, `## Review Checklist`.
const AGENTS: ReadonlyArray<{
  readonly source: string;
  readonly name: string;
  readonly title: string;
  readonly skills: ReadonlyArray<string>;
  readonly edits: ReadonlyArray<readonly [string, string]>;
  readonly checklist: ReadonlyArray<string>;
}> = [
  {
    source: 'agents/poteto-agent.md',
    name: 'mf-feature-generic-worker',
    title: 'MF feature generic worker',
    skills: ['mf-feature'],
    edits: [
      [
        "With no path, before any other work, search `~/.cursor/plugins/` for a file whose path ends in `skills/mf-feature/SKILL.md`. If more than one file matches, use the copy whose `.cursor-plugin/plugin.json` has the highest `version`. Your skill catalog hides this skill, so a missing catalog entry does not mean mfstack is absent.",
        'With no path, use `.agents/skills/mf-feature/SKILL.md` under the workspace root. A skill catalog may hide this skill, so a missing catalog entry does not mean mfstack is absent.',
      ],
      [
        'Navigate to a leaf `principle-*` skill whenever you apply that principle.',
        'Read a principle in full with `mf-principles show <name>` whenever you apply it.',
      ],
      ['every Task spawn', 'every subagent it spawns'],
    ],
    checklist: [
      'Read the mf-feature skill and its worker.md before any other work.',
      'Read every principle you applied with `mf-principles show` and cited it.',
      'Stayed inside the scope the kickoff gave, and reported what you verified and how.',
    ],
  },
  {
    source: 'agents/comment-sicko.md',
    name: 'mf-feature-comment-sicko',
    title: 'MF feature comment sicko',
    skills: ['mf-feature-why'],
    edits: [],
    checklist: [
      'Every comment outside the keep list is deleted.',
      'Every guilty symbol is flagged `MUST KILL` with one line.',
      'No application code was written or changed.',
      'The report names touched files, the deletion count, the flags, and the skips.',
    ],
  },
];
for (const agent of AGENTS) {
  const parsed = parseFrontmatter(Fs.readFileSync(Path.join(SOURCE, agent.source), 'utf8'));
  const installed = `@montflow/profiles/${agent.name}/PROFILE.md`;
  let body = rewriteDocument(parsed.body.replace(/^\n+/, ''), agent.source, installed);
  body = body.replace(/^#\s+.*\n+/, '');
  for (const [find, replace] of agent.edits) {
    if (body.split(find).length !== 2) throw new Error(`agent edit in ${agent.name} did not match once: ${find.slice(0, 60)}…`);
    body = body.replace(find, replace);
  }
  const description = rewriteProse(unquote(parsed.fields.get('description') ?? ''));
  write(
    `packages/mf-profiles/profiles/${agent.name}/PROFILE.md`,
    `${frontmatter([
      ['name', agent.name],
      ['description', quote(description)],
      ['model', ''],
      ['skills', agent.skills],
    ]).replace('model: \n', 'model:\n')}\n# ${agent.title}\n\n## Instructions\n\n${body.trim()}\n\n## Review Checklist\n\n${agent.checklist
      .map((item) => `- [ ] ${item}`)
      .join('\n')}\n`,
  );
}

// Principles
for (const name of PRINCIPLES) {
  const rel = `skills/principle-${name}/SKILL.md`;
  const installed = installedPath(rel) ?? '';
  const parsed = parseFrontmatter(Fs.readFileSync(Path.join(SOURCE, rel), 'utf8'));
  const description = rewriteProse(unquote(parsed.fields.get('description') ?? ''));
  write(
    `packages/mf-principles/principles/${name}/PRINCIPLE.md`,
    `${frontmatter([
      ['name', name],
      ['description', quote(description)],
    ])}\n${rewriteDocument(parsed.body.replace(/^\n+/, ''), rel, installed)}`,
  );
}

// Playbooks: description from the README table, references from the body.
const readme = Fs.readFileSync(Path.join(SOURCE, 'README.md'), 'utf8');
const playbookDescription = (name: string): string => {
  const row = new RegExp(`\\|\\s*\\[[^\\]]+\\]\\(\\./skills/poteto-mode/playbooks/${name}\\.md\\)\\s*\\|\\s*(.+?)\\s*\\|`).exec(readme);
  const text = (row?.[1] ?? '').trim();
  return text === '' ? '' : text.charAt(0).toUpperCase() + text.slice(1);
};
const playbookTitles = new Map<string, string>();
for (const name of PLAYBOOKS) {
  const first = Fs.readFileSync(Path.join(PLAYBOOK_DIR, `${name}.md`), 'utf8').split('\n')[0] ?? '';
  playbookTitles.set(first.replace(/^#+\s*/, '').trim().toLowerCase(), name);
}
const missingDescriptions: Array<string> = [];
for (const name of PLAYBOOKS) {
  const rel = `skills/poteto-mode/playbooks/${name}.md`;
  const installed = installedPath(rel) ?? '';
  let body = rewriteDocument(Fs.readFileSync(Path.join(SOURCE, rel), 'utf8'), rel, installed);
  body = body.replace(/^#{1,6}\s+(.+)$/m, '# $1');
  body = body.replace(/^\*\*Reply:\*\*\s*(.*)$/m, '## Reply\n\n$1');
  const skills = [...new Set([...body.matchAll(/\bmf-feature(?:-[a-z0-9-]+)?\b/g)].map((m) => m[0]))]
    .filter((skill) => SKILLS.some((dir) => skillName(dir) === skill))
    .toSorted();
  const principles = PRINCIPLES.filter((principle) =>
    new RegExp(`\\*\\*${principle}\\*\\* principle|/principles/${principle}/`).test(body),
  );
  const playbooks = [...body.matchAll(/\*\*([^*]+)\*\*/g)]
    .map((m) => playbookTitles.get((m[1] ?? '').trim().toLowerCase()))
    .filter((other): other is string => other !== undefined && other !== name);
  const description = playbookDescription(name);
  if (description === '') missingDescriptions.push(name);
  write(
    `packages/mf-playbooks/playbooks/${name}/PLAYBOOK.md`,
    `${frontmatter([
      ['name', name],
      ['description', quote(description)],
      ['skills', skills],
      ['principles', principles],
      ['playbooks', [...new Set(playbooks)].toSorted()],
    ])}\n${body.replace(/^\n+/, '')}`,
  );
}

// Hand edits on top of the mechanical rename. Each `find` must match exactly once, so an
// upstream rewording fails the import instead of silently dropping the edit.
const EDITS: ReadonlyArray<{ readonly file: string; readonly find: string; readonly replace: string }> = [
  {
    file: '.agents/skills/mf-feature/SKILL.md',
    find: `description: "poteto's agent style for concise, detailed responses, deliberate subagents, unslopped prose, simple code, and verified work. Use for poteto, /mf-feature, or requests to work in this style."`,
    replace: `description: "The mfstack agent style, from poteto's pstack: concise, detailed responses, deliberate subagents, unslopped prose, simple code, and verified work. Use for /mf-feature, or requests to work in this style."`,
  },
  { file: '.agents/skills/mf-feature/SKILL.md', find: '# Poteto mode\n', replace: '# MF feature\n' },
  {
    file: '.agents/skills/mf-feature/SKILL.md',
    find: 'Bundled skills live at `../<name>/SKILL.md` from this file,',
    replace:
      'Bundled skills live at `../mf-feature-<name>/SKILL.md` from this file, principles in the principles store (`mf-principles`), and playbooks in the playbooks store (`mf-playbooks`),',
  },
  {
    file: '.agents/skills/mf-feature/SKILL.md',
    find: 'Read the leaf skill in full for any principle you apply. Each entry names when it applies. Each leaf is the **principle-<title>** skill, with the title in kebab case, hyphens kept and other punctuation dropped, unless the entry gives its name.',
    replace:
      'Read the principle in full with `mf-principles show <name>` before you apply it. Each entry names when it applies. The name is the title in kebab case, hyphens kept and other punctuation dropped, unless the entry gives its name. `mf-principles list` prints every principle with when it applies.',
  },
  {
    file: '.agents/skills/mf-feature/SKILL.md',
    find: 'Match the task to a playbook and open its steps at `playbooks/<title>.md`, with the title in kebab case.',
    replace:
      'Match the task to a playbook and open its steps with `mf-playbooks show <name>`, the title in kebab case. `mf-playbooks list` prints every playbook with what it is for.',
  },
];
for (const edit of EDITS) {
  const current = written.get(edit.file);
  if (typeof current !== 'string') throw new Error(`edit target missing: ${edit.file}`);
  const count = current.split(edit.find).length - 1;
  if (count !== 1) throw new Error(`edit in ${edit.file} matched ${count} times: ${edit.find.slice(0, 60)}…`);
  written.set(edit.file, current.replace(edit.find, edit.replace));
}

/**
 * Whole-line rewrites for harness-specific passages: the one line starting with `line`
 * is replaced (an empty `replace` drops it). Zero or several matches fail the import.
 */
const LINE_EDITS: ReadonlyArray<{ readonly file: string; readonly line: string; readonly replace: string }> = [
  // mf-feature: subagents and models by role, not Cursor's Task fields and slugs.
  {
    file: '.agents/skills/mf-feature/SKILL.md',
    line: '**Use the `mf-feature-generic-worker` profile for any subagent you spawn directly inside a playbook step.**',
    replace:
      '**Use the `mf-feature-generic-worker` profile for any subagent you spawn directly inside a playbook step.** The chat that receives `/mf-feature` runs the playbook itself. Routed workflow skills (`mf-feature-interrogate`, `mf-feature-swarm`) pick their own subagents. Respect them. How your harness spawns a subagent, runs it in the background, or gives it its own checkout is in [the harnesses reference](references/harnesses.md).',
  },
  {
    file: '.agents/skills/mf-feature/SKILL.md',
    line: '**Defaults for every `Task` call.**',
    replace:
      '**Defaults for every subagent.** Run it in the background when your harness can, point it at files instead of inlining context, and give it an explicit model per role. Before you spawn any subagent, run `mf-feature roles resolve <role>` and do exactly what each seat line\'s `next=` says. `run=native`: spawn the `mf-feature-generic-worker` profile with your own subagent tool, on the seat\'s model and effort (`model=default` means the defaults below). `run=dispatch`: write the brief to a file and run `mf-feature dispatch <role> --seat <n> --brief <file>`, adding `--read-only` for a reviewer or judge; it runs the seat headless on its harness and prints the report. `run=dropped`: skip the seat and say so. Never pick a harness or model yourself, and never start another harness\'s CLI by hand. If `resolve` cannot tell which harness you run in, rerun it with `--harness` naming yours. The roles are `feature` (feature and refactoring), `bug-fix`, `perf-issue`, `hillclimb`, `judgment` (prose and judgment), `swarm-workers` (trivial mechanical edits and verification), and the panels `arena-runners`, `arena-judges` and `interrogate-reviewers`. A role you set overrides the defaults below and the role models in the routed skills (`mf-feature-arena`, `mf-feature-swarm`, `mf-feature-interrogate`). An unset role resolves to the defaults below on the current harness.',
  },
  {
    file: '.agents/skills/mf-feature/SKILL.md',
    line: '- Code, prose, and judgment: `claude-opus-5-5-xhigh-fast`.',
    replace: '- Code, prose, and judgment: the strongest model your harness offers, at its highest effort short of the maximum.',
  },
  {
    file: '.agents/skills/mf-feature/SKILL.md',
    line: '- Trivial mechanical edits: `claude-opus-5-5-high-fast`.',
    replace: '- Trivial mechanical edits: the same model one effort step lower.',
  },
  {
    file: '.agents/skills/mf-feature/SKILL.md',
    line: '- Diverse review and design panels:',
    replace:
      '- Diverse review and design panels: one runner on each of three vendors\' models when your harness offers them, otherwise three runs of the strongest model with different briefs.',
  },
  {
    file: '.agents/skills/mf-feature/SKILL.md',
    line: '**Fable 5.2 is an exception.**',
    replace:
      '**The most expensive model is an exception.** It runs outside a panel only when the user named it for this task or two runs of the default model on the same brief failed its check. Say which. Difficulty alone never qualifies.',
  },
  {
    file: '.agents/skills/mf-feature/SKILL.md',
    line: '**Match the model to the job.**',
    replace:
      '**Match the model to the job.** Start from the role\'s resolved seat or default, keep its family, and set the effort the job needs. Panel seats keep their listed effort. Raise any other role one step for the hardest or subtlest work, lower it one step for judgment, and two or more steps for routine work. No role runs at the maximum effort unless its seat says so. Verification always runs on the `swarm-workers` model. If your harness rejects a model, never pass it again: fall back as [the harnesses reference](references/harnesses.md) says, and say so.',
  },
  // Routed skills: roles and the harnesses reference.
  {
    file: '.agents/skills/mf-feature-swarm/SKILL.md',
    line: '3. Pick the worker model from the `swarm-workers` role',
    replace:
      '3. Pick the worker seat with `mf-feature roles resolve swarm-workers`. An unset role resolves to the trivial-edits default in the Subagents section of the **mf-feature** skill, on the current harness. If your harness rejects a model, fall back as its harnesses reference says, and say so. For a model race, name each arm\'s harness and model up front. Pick each subagent\'s reasoning level for the job, per the Subagents section of the **mf-feature** skill.',
  },
  {
    file: '.agents/skills/mf-feature-swarm/SKILL.md',
    line: 'Spawn all N workers in one message with',
    replace:
      'Spawn all N workers at once as general-purpose subagents, each isolated in its own checkout and running in the background where your harness allows (the harnesses reference of the **mf-feature** skill maps both), with the step 3 model. Run a worker in the shared checkout only when it needs something on the user\'s computer.',
  },
  {
    file: '.agents/skills/mf-feature-arena/SKILL.md',
    line: '3. Pick the runners from the `arena-runners` role',
    replace:
      '3. Pick the runners with `mf-feature roles resolve arena-runners`: one runner per seat, each on the harness and model it resolves to. An unset role resolves to the panel default in the Subagents section of the **mf-feature** skill. A seat with no available harness is dropped and reported; keep at least two runners, and say so. Spawn more for multiple design directions, and repeat one model when the work is generation-bound, not judgment-sensitive. Pick each subagent\'s reasoning level per the Subagents section of the **mf-feature** skill.',
  },
  {
    file: '.agents/skills/mf-feature-arena/SKILL.md',
    line: 'After all Phase B candidates complete, spawn one readonly judge',
    replace:
      'After all Phase B candidates complete, spawn one read-only judge from `mf-feature roles resolve arena-judges`. The judge is never from the parent\'s vendor, so take the first seat from another vendor. If you do not know the parent\'s model, take the first seat and say that the vendor check did not run. If no seat is available, skip the judge, and say so. While you read in Phase D, the judge scores each candidate, by path label, on each rubric criterion and recommends a base.',
  },
  {
    file: '.agents/skills/mf-feature-recall/SKILL.md',
    line: 'Transcripts live at `~/.cursor/projects/',
    replace:
      'Transcripts live where your harness keeps them; the harnesses reference of the **mf-feature** skill names the folder and its naming rule for each harness. Read only this workspace\'s transcripts. Every line is one chat message.',
  },
  // mf-feature-help: montflow setup instead of Cursor's plugin install and setup-pstack.
  { file: '.agents/skills/mf-feature-help/SKILL.md', line: '# Poteto help', replace: '# MF feature help' },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: 'A message that asks for work, such as "use mfstack to fix this bug", is not a help question.',
    replace:
      'A message that asks for work, such as "use mfstack to fix this bug", is not a help question. Read [`mf-feature`](../mf-feature/SKILL.md) and do the work under it.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: '- No your roles (`mf-feature roles`) means',
    replace:
      '- No roles set (`mf-feature roles` shows none) means nobody has chosen harnesses and models for the roles, so every role uses its default model on the current harness.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: '- Now: give them `/setup-pstack` to type',
    replace:
      '- Now: walk them through `mf-feature roles set <role> …` for the roles they care about, and answer their question too.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: '- Later: answer their question, and add one line',
    replace:
      '- Later: answer their question, and add one line saying every role keeps its default model until they set roles with `mf-feature roles set`.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: '1. Install with `/add-plugin mfstack`',
    replace:
      "1. Install montflow in the repository: the montflow README's quick start syncs the `mf-feature` skills and installs the principles, playbooks and profiles with each CLI's `doctor`.",
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: '2. Run [`/setup-pstack`]',
    replace:
      '2. Optionally choose, per role, an ordered list of harness and model preferences with `mf-feature roles set`. Without them every role uses the defaults in the Subagents section of the **mf-feature** skill. Then offer once each to generate a verification skill (`/mf-feature-create-verification-skill`) and a formal verification skill for the project, unless the project already has one.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: 'Installing changes nothing until the user invokes a skill.',
    replace:
      'Installing changes nothing until the user invokes a skill. The montflow README and its wiki page on mf-feature have the details. Offer to word their first prompt with them, per [`references/prompting.md`](references/prompting.md).',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: 'If cost is the worry,',
    replace:
      'If cost is the worry, say where the tokens go and how to spend fewer. mfstack spends extra tokens on subagents and review panels. Point the roles at cheaper models with `mf-feature roles set`. A panel with fewer seats runs fewer subagents, one per seat. Save `/mf-feature` for work that needs rigor.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: 'mfstack is built for Cursor,',
    replace:
      'mfstack is written for any harness that reads Agent Skills: Claude Code, Codex, OpenCode, Pi and Cursor among them. Its text names concepts (spawn a subagent, ask a structured question, keep a todo list), and [the harnesses reference](../mf-feature/references/harnesses.md) maps each one to your harness. A step that needs a feature your harness lacks is skipped with a one-line note.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: 'Other tools can read the skills,',
    replace: '',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: '- Option+Enter on Mac or Alt+Enter on Windows,',
    replace:
      '- A harness that can keep a skill on for every turn (Cursor calls this a Custom Mode) keeps `/mf-feature` in context until the user turns it off.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: "- Cursor's docs list Custom Modes",
    replace: '- Everywhere else, start each new task with `/mf-feature`.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: "Link [Cursor's skills docs]",
    replace:
      'Mid-chat, "new task" makes the mode match a fresh playbook. `/mf-feature` already uses `mf-feature-generic-worker` for the subagents its playbook steps spawn. To get the same style from a subagent of your own, spawn it with the `mf-feature-generic-worker` profile.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: '| Pick a model for each role and a reasoning budget |',
    replace: '| Pick a harness and model for each role | `mf-feature roles set` |',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: '- `/deslop`, `control-cli`, and `control-ui` ship in the `cursor-team-kit` plugin.',
    replace: '- `/deslop`, `control-cli`, and `control-ui` belong to other Cursor plugins; montflow does not ship them.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: '- a loop and `/create-skill` are Cursor built-ins.',
    replace:
      "- Loops and wake-ups come from your harness (the harnesses reference lists them). Skill authoring is the **mf-create-skills** skill.",
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: 'Without `/mf-feature`, a phrase such as "babysit this pr"',
    replace:
      'Without `/mf-feature`, a phrase such as "babysit this pr" can start your harness\'s own skill for the same job instead. `mf-playbooks list` lists every playbook.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: "mfstack has no planning skill. Cursor's Plan Mode works alongside it.",
    replace:
      "mfstack has no planning skill. Your harness's plan mode, if it has one, works alongside it. For work that spans phases or stacked PRs, asking `/mf-feature` for a plan runs the [Multi-phase plan playbook](../../@montflow/playbooks/multi-phase-plan/PLAYBOOK.md), which writes the plan and doesn't implement it. For a design question, the Prototype playbook or `/mf-feature-architect` settles it in code first.",
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: 'Principles are one-rule skills that `/mf-feature` reads',
    replace:
      'Principles are one-rule documents in the principles store that `/mf-feature` reads and cites in its replies. The user rarely asks for one. They steer with the names instead, as in "apply prove it works. show me the real output." `mf-principles list` lists them, and `mf-principles show <name>` prints one.',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: '| The mode stopped applying after a few turns |',
    replace:
      '| The mode stopped applying after a few turns | Start each task with `/mf-feature`, or keep it on every turn if your harness can. |',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: '| A new model choice had no effect |',
    replace: '| A new model choice had no effect | Roles resolve when a subagent is spawned. Check `mf-feature roles resolve <role>` and start a new task. |',
  },
  {
    file: '.agents/skills/mf-feature-help/SKILL.md',
    line: "| A skill didn't load on its own |",
    replace:
      "| A skill didn't load on its own | mfstack skills load when the user types them or when `/mf-feature` runs them, and it doesn't run every skill. |",
  },
];
for (const edit of LINE_EDITS) {
  const current = written.get(edit.file);
  if (typeof current !== 'string') throw new Error(`line edit target missing: ${edit.file}`);
  const lines = current.split('\n');
  const hits = lines.flatMap((text, index) => (text.startsWith(edit.line) ? [index] : []));
  if (hits.length !== 1) throw new Error(`line edit in ${edit.file} matched ${hits.length} lines: ${edit.line.slice(0, 60)}…`);
  const index = hits[0] ?? 0;
  if (edit.replace === '') {
    lines.splice(index, lines[index + 1] === '' ? 2 : 1);
  } else {
    lines[index] = edit.replace;
  }
  written.set(edit.file, lines.join('\n'));
}

// Harness-specific terms left in the imported text after every rewrite (harnesses.md and the
// review-bot reference name them on purpose).
for (const [file, content] of written) {
  if (typeof content !== 'string' || !file.endsWith('.md')) continue;
  if (file.includes('/scripts/') || file.endsWith('bugbot-triage.md')) continue;
  for (const term of RESIDUAL_TERMS) noteResidual(term, content.split(term).length - 1);
}

// montflow's own harness map ships inside the mf-feature skill.
write(
  '.agents/skills/mf-feature/references/harnesses.md',
  Fs.readFileSync(Path.join(ROOT, 'scripts/mfstack/harnesses.md')),
);

// License notice travels with every store that carries pstack text.
const license = Fs.readFileSync(Path.join(SOURCE, 'LICENSE'));
for (const dir of ['packages/mf-principles', 'packages/mf-playbooks', 'packages/mf-feature', '.agents/skills/mf-feature']) {
  write(`${dir}/LICENSE-pstack`, license);
}

// Payload manifests list every imported principle and playbook, so doctor installs them all.
const manifest = (pkg: string, kind: string, store: string, names: ReadonlyArray<string>): string =>
  `${JSON.stringify(
    {
      schema: 1,
      package: pkg,
      payloads: names.toSorted().map((name) => ({
        kind,
        name,
        source: `${store}/${name}`,
        target: `.agents/@montflow/${store}/${name}`,
      })),
    },
    null,
    2,
  )}\n`;
write('packages/mf-principles/payload.json', manifest('@montflow/principles', 'principle', 'principles', PRINCIPLES));
write('packages/mf-playbooks/payload.json', manifest('@montflow/playbooks', 'playbook', 'playbooks', PLAYBOOKS));

// The mode package ships every mf-feature skill and profile.
{
  const skills = [...new Set([...written.keys()].filter((key) => key.startsWith('.agents/skills/')).map((key) => key.split('/')[2] ?? ''))].toSorted();
  const payloads = [
    ...skills.map((name) => ({ kind: 'skill', name, source: `skills/${name}`, target: `.agents/skills/${name}` })),
    ...AGENTS.map((agent) => agent.name).toSorted().map((name) => ({ kind: 'profile', name, source: `profiles/${name}`, target: `.agents/@montflow/profiles/${name}` })),
  ];
  write('packages/mf-feature/payload.json', `${JSON.stringify({ schema: 1, package: '@montflow/feature', payloads }, null, 2)}\n`);
}

// The profiles manifest lists montflow's own profiles; the mf-feature-* ones moved to the mode package.
{
  const path = Path.join(OUT, 'packages/mf-profiles/payload.json');
  const current = Fs.existsSync(path)
    ? (JSON.parse(Fs.readFileSync(path, 'utf8')) as { schema: number; package: string; payloads: Array<{ kind: string; name: string; source: string; target: string }> })
    : { schema: 1, package: '@montflow/profiles', payloads: [] };
  const kept = current.payloads.filter((entry) => !(entry.kind === 'profile' && entry.name.startsWith('mf-feature-')));
  const profiles = kept.filter((entry) => entry.kind === 'profile').toSorted((a, b) => a.name.localeCompare(b.name));
  const others = kept.filter((entry) => entry.kind !== 'profile');
  write('packages/mf-profiles/payload.json', `${JSON.stringify({ ...current, payloads: [...profiles, ...others] }, null, 2)}\n`);
}

// Every logical path lands where its package ships it.
const placedWritten = new Map([...written].map(([key, value]) => [placed(key), value]));
written.clear();
for (const [key, value] of placedWritten) written.set(key, value);

/** Directories whose contents this import owns entirely; anything else in them is stale. */
const OWNED = [
  'packages/mf-principles/principles',
  'packages/mf-playbooks/playbooks',
  'packages/mf-feature/skills',
  'packages/mf-feature/profiles',
];
const stale = OWNED.flatMap((dir) =>
  Fs.existsSync(Path.join(OUT, dir))
    ? walk(Path.join(OUT, dir)).map((file) => Path.relative(OUT, file).split(Path.sep).join('/'))
    : [],
).filter((file) => !written.has(file));

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const check = args.get('check') === 'true';
let drift = 0;
for (const [relative, content] of [...written].toSorted(([a], [b]) => a.localeCompare(b))) {
  const full = Path.join(OUT, relative);
  const want = typeof content === 'string' ? Buffer.from(content) : content;
  const have = Fs.existsSync(full) ? Fs.readFileSync(full) : undefined;
  if (have !== undefined && have.equals(want)) continue;
  drift++;
  if (check) {
    console.log(`drift ${relative}`);
    continue;
  }
  Fs.mkdirSync(Path.dirname(full), { recursive: true });
  Fs.writeFileSync(full, want);
}
for (const relative of stale) {
  drift++;
  if (check) console.log(`stale ${relative}`);
  else Fs.rmSync(Path.join(OUT, relative));
}

console.log(
  `pstack ${pluginVersion} @ ${COMMIT.slice(0, 8)}: ${SKILLS.length} skills, ${PRINCIPLES.length} principles, ${PLAYBOOKS.length} playbooks, ${written.size} files, ${drift} ${check ? 'drifted' : 'written'}`,
);
if (missingDescriptions.length > 0) console.log(`playbooks without a README description: ${missingDescriptions.join(', ')}`);
console.log(
  `harness-specific terms left: ${[...residuals].map(([term, count]) => `${term}=${count}`).join(' ') || 'none'}`,
);
if (check && drift > 0) process.exitCode = 1;
