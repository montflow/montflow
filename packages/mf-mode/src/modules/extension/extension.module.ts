import {
  type FieldValue,
  type ParsedMarkdown,
  fieldString,
  parseMarkdown,
} from '../frontmatter/index.js';

/**
 * Repo extensions to the shipped playbooks and principles. A consumer repo
 * owns `.agents/@montflow/mf-mode/extensions/<store>/<name>/<FILE>` and commits
 * it; mf-mode only reads it. A reader sees the extension first and falls back
 * to the shipped entry. Pure: the stores read the files, this decides what a
 * reader sees.
 *
 * An extension with no `extends` replaces the shipped entry of its name, or
 * adds a new one. An extension with `extends: <shipped name>` resolves to the
 * shipped document with its frontmatter lists unioned and the extension's body
 * appended under `## Local additions`.
 */

/** The extension stores' root, relative to the workspace root. */
export const STORE_ROOT = ['.agents', '@montflow', 'mf-mode', 'extensions'] as const;

/** The heading an `extends` extension's body is appended under. */
export const ADDITIONS_HEADING = 'Local additions';

/** Where a resolved entry came from. */
export type Source =
  | { readonly kind: 'shipped' }
  | { readonly kind: 'extension'; readonly mode: 'adds' }
  | { readonly kind: 'extension'; readonly mode: 'replaces' }
  | { readonly kind: 'extension'; readonly mode: 'extends'; readonly target: string };

/** One entry file, undecoded. */
export interface RawEntry {
  readonly name: string;
  readonly raw: string;
}

/** One name as a reader sees it. */
export interface Resolved {
  /** The entry's directory name, in whichever store it came from. */
  readonly name: string;
  readonly source: Source;
  /** The document `show` prints after its provenance line. */
  readonly text: string;
}

/** Why one extension does not resolve. */
export interface Issue {
  readonly name: string;
  readonly field: string;
  readonly message: string;
}

/** Every entry a reader sees, plus the extensions that could not resolve. */
export interface Resolution {
  /** Extension over shipped, name-sorted. */
  readonly entries: ReadonlyArray<Resolved>;
  /** Extensions left out of `entries` because their `extends` names no shipped entry. */
  readonly issues: ReadonlyArray<Issue>;
}

/** What differs between the stores an extension can extend. */
export interface Kind {
  /** Singular noun named in findings: `playbook`, `principle`. */
  readonly noun: string;
  /** Frontmatter lists an `extends` extension unions with its target's. */
  readonly lists: ReadonlyArray<string>;
}

const SHIPPED: Source = { kind: 'shipped' };

/**
 * The first line `show` prints: where the document came from.
 * @param source - the resolved entry's source
 * @param name - the resolved entry's name
 * @returns `source=shipped`, `source=extension`, `source=extension replaces=<name>`, or `source=extension extends=<target>`
 */
export const provenance = (source: Source, name: string): string => {
  if (source.kind === 'shipped') return 'source=shipped';
  if (source.mode === 'adds') return 'source=extension';
  if (source.mode === 'replaces') return `source=extension replaces=${name}`;
  return `source=extension extends=${source.target}`;
};

/**
 * One list field after an `extends` merge: the shipped items, then the
 * extension's new ones, order kept. A scalar from the extension passes
 * through so verification rejects it.
 * @param base - the shipped value
 * @param extra - the extension's value
 * @returns the merged value, or undefined when neither side has the field
 */
const union = (
  base: FieldValue | undefined,
  extra: FieldValue | undefined,
): FieldValue | undefined => {
  if (extra === undefined) return base;
  if (!Array.isArray(extra)) return extra;
  return [...new Set([...(Array.isArray(base) ? base : []), ...extra])];
};

/** One frontmatter field in the shipped files' form. */
const fieldLine = ([key, value]: readonly [string, FieldValue]): string => {
  if (Array.isArray(value)) return [`${key}:`, ...value.map((item) => `  - ${item}`)].join('\n');
  if (value === '') return `${key}:`;
  return key === 'description' ? `${key}: "${value}"` : `${key}: ${value}`;
};

/**
 * The document an `extends` extension resolves to: the shipped frontmatter
 * with the extension's `name`, its `description` when it has one, and each
 * list unioned; then the shipped body with the extension's body appended
 * under {@link ADDITIONS_HEADING}.
 * @param base - the shipped entry, parsed
 * @param extension - the extension, parsed
 * @param kind - which lists union
 * @returns the merged markdown
 */
const merge = (base: ParsedMarkdown, extension: ParsedMarkdown, kind: Kind): string => {
  const description = (fieldString(extension.fields, 'description') ?? '').trim();
  const fields = new Map(Object.entries(base.fields));
  fields.set('name', fieldString(extension.fields, 'name') ?? '');
  if (description !== '') fields.set('description', description);
  for (const key of kind.lists) {
    const value = union(base.fields[key], extension.fields[key]);
    if (value !== undefined) fields.set(key, value);
  }
  const additions = extension.body.trim();
  const body =
    additions === ''
      ? base.body.trim()
      : `${base.body.trim()}\n\n## ${ADDITIONS_HEADING}\n\n${additions}`;
  return `---\n${[...fields].map(fieldLine).join('\n')}\n---\n\n${body}\n`;
};

/**
 * Resolve the shipped store and the extension store into what a reader sees.
 * An extension wins over the shipped entry of its name. One whose `extends`
 * names no shipped entry is left out and reported.
 * @param shipped - the shipped store's entries
 * @param extensions - the extension store's entries
 * @param kind - the store's noun and list fields
 * @returns every resolved entry, name-sorted, and the extensions that did not resolve
 */
export const resolve = (
  shipped: ReadonlyArray<RawEntry>,
  extensions: ReadonlyArray<RawEntry>,
  kind: Kind,
): Resolution => {
  const bases = new Map(shipped.map((entry) => [entry.name, entry.raw]));
  const entries = new Map<string, Resolved>(
    shipped.map(({ name, raw }) => [name, { name, source: SHIPPED, text: raw }]),
  );
  const issues: Array<Issue> = [];
  for (const { name, raw } of extensions) {
    const parsed = parseMarkdown(raw);
    const target = parsed?.fields['extends'];
    if (parsed === null || target === undefined) {
      const mode = bases.has(name) ? 'replaces' : 'adds';
      entries.set(name, { name, source: { kind: 'extension', mode }, text: raw });
      continue;
    }
    if (Array.isArray(target)) {
      issues.push({ name, field: 'extends', message: `Must name one shipped ${kind.noun}.` });
      continue;
    }
    const base = parseMarkdown(bases.get(target) ?? '');
    if (base === null) {
      issues.push({
        name,
        field: 'extends',
        message: `Must name a shipped ${kind.noun}; '${target}' is not one.`,
      });
      continue;
    }
    entries.set(name, {
      name,
      source: { kind: 'extension', mode: 'extends', target },
      text: merge(base, parsed, kind),
    });
  }
  return {
    entries: [...entries.values()].toSorted((a, b) => (a.name < b.name ? -1 : 1)),
    issues,
  };
};
