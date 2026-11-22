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
 *   .agents/skills/mf-mode/, .agents/skills/mf-mode-<name>/   (every pstack skill but the below)
 *   packages/principles/principles/<name>/PRINCIPLE.md          (pstack principle-* skills)
 *   packages/playbooks/playbooks/<name>/PLAYBOOK.md             (pstack poteto-mode playbooks)
 *
 * Not imported: setup-pstack (its roles become profiles), make-bot-ui (Cursor-only).
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
  name === 'poteto-mode' ? 'mf-mode' : name === 'poteto-help' ? 'mf-mode-help' : `mf-mode-${name}`;

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
  // **skill** -> **mf-mode-skill**
  out = out.replace(/\*\*([a-z0-9-]+)\*\*/g, (match, name: string) =>
    SKILLS.includes(name) ? `**${skillName(name)}**` : match,
  );
  // `skill` -> `mf-mode-skill`
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
  out = out.replace(/(?<![a-z0-9-])poteto-mode(?![a-z0-9-])/g, 'mf-mode');
  out = out.replace(/(?<![a-z0-9-])poteto-help(?![a-z0-9-])/g, 'mf-mode-help');
  out = out.replace(/(?<![a-z0-9-])poteto-agent(?![a-z0-9-])/g, 'mf-agent');
  out = out.replace(/pstack:mf-agent/g, 'mf-agent');
  out = out.replace(/(?<![a-z0-9-])pstack(?![a-z0-9-])/g, 'mfstack');
  out = out.replace(/(?<![a-z0-9-])Pstack(?![a-z0-9-])/g, 'MFStack');
  for (const term of ['setup-pstack', 'pstack-models', 'poteto', 'Poteto', '.cursor/', 'Bugbot', 'AskQuestion', 'generalPurpose']) {
    noteResidual(term, out.split(term).length - 1);
  }
  return out;
};

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

// Principles
for (const name of PRINCIPLES) {
  const rel = `skills/principle-${name}/SKILL.md`;
  const installed = installedPath(rel) ?? '';
  const parsed = parseFrontmatter(Fs.readFileSync(Path.join(SOURCE, rel), 'utf8'));
  const description = rewriteProse(unquote(parsed.fields.get('description') ?? ''));
  write(
    `packages/principles/principles/${name}/PRINCIPLE.md`,
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
  const skills = [...new Set([...body.matchAll(/\bmf-mode(?:-[a-z0-9-]+)?\b/g)].map((m) => m[0]))]
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
    `packages/playbooks/playbooks/${name}/PLAYBOOK.md`,
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
    file: '.agents/skills/mf-mode/SKILL.md',
    find: `description: "poteto's agent style for concise, detailed responses, deliberate subagents, unslopped prose, simple code, and verified work. Use for poteto, /mf-mode, or requests to work in this style."`,
    replace: `description: "The mfstack agent style, from poteto's pstack: concise, detailed responses, deliberate subagents, unslopped prose, simple code, and verified work. Use for /mf-mode, or requests to work in this style."`,
  },
  { file: '.agents/skills/mf-mode/SKILL.md', find: '# Poteto mode\n', replace: '# MF mode\n' },
  {
    file: '.agents/skills/mf-mode/SKILL.md',
    find: 'Bundled skills live at `../<name>/SKILL.md` from this file,',
    replace:
      'Bundled skills live at `../mf-mode-<name>/SKILL.md` from this file, principles in the principles store (`mf-principles`), and playbooks in the playbooks store (`mf-playbooks`),',
  },
  {
    file: '.agents/skills/mf-mode/SKILL.md',
    find: 'Read the leaf skill in full for any principle you apply. Each entry names when it applies. Each leaf is the **principle-<title>** skill, with the title in kebab case, hyphens kept and other punctuation dropped, unless the entry gives its name.',
    replace:
      'Read the principle in full with `mf-principles show <name>` before you apply it. Each entry names when it applies. The name is the title in kebab case, hyphens kept and other punctuation dropped, unless the entry gives its name. `mf-principles list` prints every principle with when it applies.',
  },
  {
    file: '.agents/skills/mf-mode/SKILL.md',
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

// License notice travels with every store that carries pstack text.
const license = Fs.readFileSync(Path.join(SOURCE, 'LICENSE'));
for (const dir of ['packages/principles', 'packages/playbooks', '.agents/skills/mf-mode']) {
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
write('packages/principles/payload.json', manifest('@montflow/principles', 'principle', 'principles', PRINCIPLES));
write('packages/playbooks/payload.json', manifest('@montflow/playbooks', 'playbook', 'playbooks', PLAYBOOKS));

/** Directories whose contents this import owns entirely; anything else in them is stale. */
const OWNED = [
  'packages/principles/principles',
  'packages/playbooks/playbooks',
  ...Fs.existsSync(Path.join(OUT, '.agents/skills'))
    ? Fs.readdirSync(Path.join(OUT, '.agents/skills'))
        .filter((name) => name === 'mf-mode' || name.startsWith('mf-mode-'))
        .map((name) => `.agents/skills/${name}`)
    : [],
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
  `residual terms (need a patch): ${[...residuals].map(([term, count]) => `${term}=${count}`).join(' ') || 'none'}`,
);
if (check && drift > 0) process.exitCode = 1;
