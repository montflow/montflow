import { Schema } from 'effect';
import { fieldString, parseMarkdown } from '../frontmatter/index.js';
import type { FieldValue } from '../frontmatter/index.js';

/**
 * The reference entity: one committed `REFERENCE.md` entry per third-party
 * repository, plus the two paths derived from it.
 *
 * On disk:
 *
 *   .agents/@montflow/references/<slug>/REFERENCE.md   # committed registry entry
 *   .agents/references/<slug>                         # gitignored plain git clone
 *
 * The slug is simultaneously the directory name, the frontmatter `name`, and
 * the clone directory name, so the clone path is derived and never stored.
 *
 * The module is pure — no filesystem, no clock, no network.
 */

/** Committed store directory, relative to the workspace root. */
export const STORE_DIR = '.agents/@montflow/references';

/** Gitignored clone root, relative to the workspace root. */
export const CLONE_DIR = '.agents/references';

/** The only accepted entry filename. */
export const ENTRY_FILE = 'REFERENCE.md';

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** ISO calendar date, `YYYY-MM-DD`. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Ref charset: git refname characters, 1-255 chars. */
export const REF_PATTERN = /^[A-Za-z0-9._/-]{1,255}$/;

/** Purely-hex ref: a 7-40 char abbreviated or full commit id. */
export const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/;

/** The canonical frontmatter keys, in authoring order. */
export const REFERENCE_KEYS = ['name', 'url', 'purpose', 'added', 'ref'] as const;

/** Keys that would store the derived clone path; always an error. */
export const FORBIDDEN_KEYS = ['path', 'dir', 'directory', 'clone', 'clonePath'] as const;

/**
 * One registered reference, as the store decodes it.
 *
 * `name` is checked as a slug on construction, so a `Reference` value can never
 * name a path the store cannot derive.
 */
export class Reference extends Schema.Class<Reference>('Reference')({
  /** Slug: directory name, frontmatter `name`, and clone directory name. */
  name: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(64),
    Schema.isPattern(SLUG_PATTERN),
  ),
  /** Upstream repository, always an `https://` URL. */
  url: Schema.String,
  /** One sentence, 1-280 chars, ending with `.`. */
  purpose: Schema.String,
  /** Date the reference was first registered, `YYYY-MM-DD`. */
  added: Schema.String,
  /** Optional branch, tag, or commit pin. */
  ref: Schema.optional(Schema.String),
}) {}

/** Decode untrusted frontmatter or RPC input into a `Reference`. */
export const decodeUnknown = Schema.decodeUnknownEffect(Reference);

/** Encode a `Reference` to its plain object form. */
export const encode = Schema.encodeSync(Reference);

/** A decoded `REFERENCE.md`: the metadata plus the preserved body notes. */
export interface ReferenceDocument {
  readonly reference: Reference;
  readonly body: string;
}

/**
 * True when `name` is a valid reference slug.
 * @param name - candidate slug
 * @returns true for valid slugs
 */
export const isValidName = (name: string): boolean => SLUG_PATTERN.test(name);

/**
 * True when `ref` is a branch, tag, or commit spelling the store accepts.
 *
 * This is the one shape predicate CI `verify` and the git resolver share:
 * charset, no leading `/`, `.` or `-`, no `//`, no `@{`, no trailing `/` or `.`,
 * no `..`, no component ending `.lock`, and a purely-hex value must be a
 * 7-40 char commit id.
 * @param ref - candidate ref
 * @returns true for a valid ref spelling
 */
export const isValidRef = (ref: string): boolean => {
  if (!REF_PATTERN.test(ref)) return false;
  if (ref.startsWith('/') || ref.includes('//') || ref.includes('@{')) return false;
  if (ref.startsWith('.') || ref.startsWith('-')) return false;
  if (ref.endsWith('/') || ref.endsWith('.')) return false;
  if (ref.includes('..')) return false;
  if (ref.split('/').some((component) => component.endsWith('.lock'))) return false;
  if (/^[0-9a-f]+$/.test(ref) && !COMMIT_PATTERN.test(ref)) return false;
  return true;
};

/** Result of validating one candidate git URL. */
export interface UrlValidation {
  readonly valid: boolean;
  /** Why the URL was refused, when it was. */
  readonly reason?: string | undefined;
}

/** A URL carrying an explicit scheme. */
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):\/\//i;

/** An scp-style source such as `git@github.com:owner/repo.git`. */
const SCP_PATTERN = /^[^@\s/]+@[^:\s]+:/;

/**
 * Validate one `add` argument against the store's https-only URL policy.
 *
 * The reason strings are the B002 §2.1 refusal text, so `add` and `update` can
 * report why a URL was rejected without re-deriving the rule.
 * @param url - candidate URL
 * @returns `{ valid: true }`, or `{ valid: false, reason }`
 */
export const validateUrl = (url: string): UrlValidation => {
  const trimmed = url.trim();
  if (trimmed === '') return { valid: false, reason: 'empty url' };
  if (/[\s\\]/.test(trimmed) || [...trimmed].some((char) => char.charCodeAt(0) < 0x20)) {
    return { valid: false, reason: 'invalid path' };
  }

  const scheme = SCHEME_PATTERN.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme !== undefined) {
    if (scheme === 'ssh') {
      return { valid: false, reason: 'ssh URLs are not stored; use the https URL' };
    }
    if (scheme === 'http') {
      return { valid: false, reason: 'insecure scheme http; use https://' };
    }
    if (scheme === 'git') {
      return { valid: false, reason: 'insecure scheme git; use https://' };
    }
    if (scheme === 'file') {
      return {
        valid: false,
        reason: 'local paths and file:// are not accepted; use the https URL',
      };
    }
    if (scheme !== 'https') {
      return { valid: false, reason: `unsupported scheme ${scheme}; use https://` };
    }
  } else if (SCP_PATTERN.test(trimmed)) {
    return { valid: false, reason: 'scp-style sources are not stored; use the https URL' };
  } else if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('~/')
  ) {
    return {
      valid: false,
      reason: 'local paths and file:// are not accepted; use the https URL',
    };
  } else {
    return { valid: false, reason: 'missing scheme; use https://' };
  }

  if (trimmed.includes('?') || trimmed.includes('#')) {
    return { valid: false, reason: 'query strings and fragments are not allowed' };
  }

  const afterScheme = trimmed.slice(trimmed.indexOf('://') + 3);
  const pathStart = afterScheme.indexOf('/');
  const rawPath = pathStart === -1 ? '' : afterScheme.slice(pathStart);
  const segments = rawPath.split('/').filter((segment) => segment !== '');
  if (segments.length < 2) {
    return { valid: false, reason: 'missing repository path (expected <host>/<owner>/<repo>)' };
  }
  if (rawPath.includes('//')) return { valid: false, reason: 'invalid path' };
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return { valid: false, reason: 'invalid path' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'invalid url' };
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return { valid: false, reason: 'credentials are not allowed' };
  }
  if (!parsed.hostname.includes('.')) return { valid: false, reason: 'invalid host' };

  const last = segments.at(-1) ?? '';
  if (last.endsWith('.git')) {
    const withoutSuffix = last.slice(0, -4);
    if (withoutSuffix.endsWith('.git') || withoutSuffix === '') {
      return { valid: false, reason: 'invalid path' };
    }
  }
  return { valid: true };
};

/**
 * True when `url` is an `https://` repository URL with at least two path
 * segments and no credentials, query, or fragment.
 * @param url - candidate URL
 * @returns true for an accepted store URL
 */
export const isValidUrl = (url: string): boolean => validateUrl(url).valid;

/** The fields `reference_find` matches a query against. */
export interface MatchableReference {
  /** Entry slug. */
  readonly name: string;
  /** Stored https URL. */
  readonly url: string;
  /** One-sentence purpose. */
  readonly purpose: string;
  /** The `REFERENCE.md` body notes, when the caller has them. */
  readonly notes?: string | undefined;
}

/**
 * Case-insensitive substring match over slug, URL, purpose, and notes — the
 * predicate behind `reference_find`. Pure, so the tool and its test share it.
 * @param reference - the fields to search
 * @param query - the raw query; surrounding whitespace is ignored
 * @returns true when any field contains the query
 */
export const matches = (reference: MatchableReference, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (needle === '') return false;
  return [reference.name, reference.url, reference.purpose, reference.notes ?? ''].some((value) =>
    value.toLowerCase().includes(needle),
  );
};

/**
 * The comparison key for duplicate detection: trim, drop trailing slashes, drop
 * one trailing `.git`, lowercase. Display never uses this value.
 * @param url - the stored URL
 * @returns the normalized comparison key
 */
export const normalizeUrl = (url: string): string =>
  url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();

/** Trim, drop trailing slashes, drop one `.git`, lowercase, normalise separators. */
const comparisonKey = (pathPart: string): string =>
  pathPart
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();

/**
 * Normalize an `origin` URL into a comparison key a stored https URL can match.
 *
 * Unlike {@link normalizeUrl}, this accepts the ssh and scp spellings a
 * pre-existing clone may carry, because ownership proof must still work for
 * clones created by hand. It is never reachable from an `add` argument.
 * @param url - an origin URL, or any spelling
 * @returns `<host>/<path>`, or undefined when the spelling has no key
 */
export const normalizeOriginUrl = (url: string): string | undefined => {
  const trimmed = url.trim();
  if (trimmed === '') return undefined;
  const scheme = SCHEME_PATTERN.exec(trimmed)?.[1]?.toLowerCase();
  let host: string;
  let pathPart: string;
  if (scheme !== undefined) {
    if (scheme !== 'https' && scheme !== 'ssh') return undefined;
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return undefined;
    }
    host = parsed.hostname;
    pathPart = parsed.pathname;
  } else if (SCP_PATTERN.test(trimmed)) {
    const separator = trimmed.indexOf(':');
    const authority = trimmed.slice(0, separator);
    const at = authority.indexOf('@');
    host = at === -1 ? authority : authority.slice(at + 1);
    pathPart = trimmed.slice(separator + 1);
  } else {
    return undefined;
  }
  const key = comparisonKey(pathPart);
  if (host === '' || key === '') return undefined;
  return `${host.toLowerCase()}/${key}`;
};

/**
 * Derive the default slug from a repository URL's final path segment.
 * @param url - the validated https URL
 * @returns the slug, or undefined when nothing usable remains
 */
export const deriveSlug = (url: string): string | undefined => {
  let pathname: string;
  try {
    pathname = new URL(url.trim()).pathname;
  } catch {
    return undefined;
  }
  const segments = pathname.split('/').filter((segment) => segment !== '');
  const last = segments.at(-1)?.replace(/\.git$/, '');
  if (last === undefined) return undefined;
  const slug = last
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length <= 64 && isValidName(slug) ? slug : undefined;
};

/**
 * Derive the clone path for a slug. Never stored, never read from disk.
 * @param root - workspace root
 * @param slug - entry slug
 * @returns `<root>/.agents/references/<slug>`
 */
export const clonePath = (root: string, slug: string): string => {
  const trimmedRoot = root.replace(/\/+$/, '');
  return `${trimmedRoot}/${CLONE_DIR}/${slug}`;
};

/** Store-relative path of one entry, used to attribute verifier findings. */
export const entryPath = (slug: string): string => `${STORE_DIR}/${slug}/${ENTRY_FILE}`;

/** Raw frontmatter plus body, before schema decoding. */
export interface ParsedReferenceFile {
  readonly fields: Record<string, FieldValue>;
  readonly body: string;
}

/**
 * Parse `REFERENCE.md` into raw frontmatter fields plus the untouched body.
 * @param markdown - raw file contents
 * @returns parsed fields plus body, or null when the frontmatter block is missing
 */
export const parseReferenceFile = (markdown: string): ParsedReferenceFile | null =>
  parseMarkdown(markdown);

/** Schema input built from parsed scalar fields. */
interface ReferenceInput {
  name: string;
  url: string;
  purpose: string;
  added: string;
  ref?: string;
}

/** Normalize parsed fields into the five-field schema input. */
const referenceInput = (fields: Record<string, FieldValue>): ReferenceInput => {
  const ref = fieldString(fields, 'ref');
  const input: ReferenceInput = {
    name: fieldString(fields, 'name') ?? '',
    url: fieldString(fields, 'url') ?? '',
    purpose: fieldString(fields, 'purpose') ?? '',
    added: fieldString(fields, 'added') ?? '',
  };
  if (ref !== undefined) input.ref = ref;
  return input;
};

/**
 * Decode a `REFERENCE.md` into a schema-validated `Reference` and its body.
 * @param markdown - raw file contents
 * @returns the document, or undefined when the frontmatter or a field is invalid
 */
export const decodeReferenceFile = (markdown: string): ReferenceDocument | undefined => {
  const parsed = parseReferenceFile(markdown);
  if (parsed === null) return undefined;
  try {
    const reference = Schema.decodeUnknownSync(Reference)(referenceInput(parsed.fields));
    return { reference, body: parsed.body };
  } catch {
    return undefined;
  }
};

/**
 * Encode a `Reference` plus body into canonical `REFERENCE.md` bytes: the five
 * fields in authoring order, `ref` omitted when absent, then the body verbatim.
 * @param document - reference metadata plus the body notes to preserve
 * @returns canonical file contents
 */
export const encodeReferenceFile = (document: ReferenceDocument): string => {
  const { reference, body } = document;
  const lines = [
    '---',
    `name: ${reference.name}`,
    `url: ${reference.url}`,
    `purpose: ${reference.purpose}`,
    `added: ${reference.added}`,
  ];
  if (reference.ref !== undefined && reference.ref !== '') lines.push(`ref: ${reference.ref}`);
  lines.push('---');
  return `${lines.join('\n')}\n${body}`;
};
