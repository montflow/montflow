import { fieldString } from '../frontmatter/index.js';
import type { FieldValue } from '../frontmatter/index.js';
import * as Reference from '../reference/index.js';
import { compareUnpinned } from '../git/index.js';
import type { CloneObservation } from '../git/index.js';

/**
 * CI-safe registry verification: committed bytes only, with no clone, no
 * network, and no clock read. {@link verifyStore} is the pure whole-store pass;
 * {@link verifyClone} is the additive clone-scope check `verify --clones` calls
 * with a {@link CloneObservation}, never by reading a clone itself.
 */

/** Severity of one finding; warnings never fail a result alone. */
export type IssueSeverity = 'error' | 'warning';

/** One verification finding, shaped like the shared repo issue contract. */
export interface Issue {
  /** Frontmatter field, or structural token, the finding is attributed to. */
  readonly field: string;
  readonly message: string;
  readonly severity?: IssueSeverity | undefined;
  readonly fix?: string | undefined;
  /** 1-based line in the entry file, when the finding has one. */
  readonly line?: number | undefined;
}

/** Result of verifying one entry, one clone, or the whole store. */
export interface VerifyResult {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<Issue>;
}

/** One store entry's findings, attributed to its store-relative entry path. */
export interface VerifiedEntry {
  /** Store-relative entry path, or the bare slug for store-level classes. */
  readonly entry: string;
  readonly issues: ReadonlyArray<Issue>;
}

/** Whole-store verification result, one block per scanned entry. */
export interface StoreVerifyResult {
  readonly valid: boolean;
  readonly entries: ReadonlyArray<VerifiedEntry>;
}

/** One directory the store scan found, before verification. */
export interface StoreEntrySource {
  /** Directory name under the store root; also the expected `name`. */
  readonly slug: string;
  /** Raw `REFERENCE.md`, or undefined when the directory has no entry file. */
  readonly raw?: string | undefined;
  /** Files beside `REFERENCE.md` that the store does not expect. */
  readonly extraFiles?: ReadonlyArray<string> | undefined;
}

/** Snapshot of a store root, `present: false` when the directory is absent. */
export interface StoreSnapshot {
  readonly present: boolean;
  readonly entries: ReadonlyArray<StoreEntrySource>;
}

/** Options shared by the verifiers. */
export interface VerifyOptions {
  /** Workspace root, used only to render the derived clone path in a message. */
  readonly root?: string | undefined;
  /** CLI invocation named by actionable messages. */
  readonly invocation?: string | undefined;
}

/** Default invocation used when a caller does not pass one. */
export const DEFAULT_INVOCATION = '/mf-references';

/** Every clone-scope issue id, emitted only by `verify --clones`. */
export const CLONE_ISSUE_IDS = [
  'clone-missing',
  'clone-path',
  'clone-not-git',
  'clone-origin',
  'clone-dirty',
  'clone-head',
  'ref-unresolvable',
] as const;

/** Canonical keys as a string set, for unknown-field checks. */
const KNOWN_KEY_SET: ReadonlySet<string> = new Set(Reference.REFERENCE_KEYS);

/** Forbidden clone-path keys as a string set. */
const FORBIDDEN_KEY_SET: ReadonlySet<string> = new Set(Reference.FORBIDDEN_KEYS);

/**
 * Build one error-severity issue.
 * @param field - the field or structural token that failed
 * @param message - what is wrong and what the correct shape is
 * @param fix - concrete instruction for the author, when one applies
 * @returns the issue
 */
export const issue = (field: string, message: string, fix?: string): Issue =>
  fix === undefined ? { field, message } : { field, message, fix };

/**
 * Build one warning-severity issue, advisory and never fatal on its own.
 * @param field - the field that is suspect
 * @param message - what to change and why
 * @returns the warning
 */
export const warning = (field: string, message: string): Issue => ({
  field,
  message,
  severity: 'warning',
});

/** True when `found` is an error-severity finding. */
export const isError = (found: Issue): boolean => (found.severity ?? 'error') === 'error';

/** True when `found` is a warning-severity finding. */
export const isWarning = (found: Issue): boolean => found.severity === 'warning';

/** How many findings in `issues` are errors. */
export const errorCount = (issues: ReadonlyArray<Issue>): number => issues.filter(isError).length;

/** How many findings in `issues` are warnings. */
export const warningCount = (issues: ReadonlyArray<Issue>): number =>
  issues.filter(isWarning).length;

/** True when `issues` holds no error-severity finding. */
export const noErrors = (issues: ReadonlyArray<Issue>): boolean => errorCount(issues) === 0;

/** One required scalar field's parsed shape. */
type ScalarField =
  | { readonly kind: 'missing' }
  | { readonly kind: 'list'; readonly items: ReadonlyArray<string> }
  | { readonly kind: 'value'; readonly value: string };

/** Classify one field so the verifier can name a wrong shape, not just absence. */
const scalarField = (fields: Record<string, FieldValue>, key: string): ScalarField => {
  const value = fields[key];
  if (value === undefined) return { kind: 'missing' };
  if (Array.isArray(value)) return { kind: 'list', items: value };
  return { kind: 'value', value };
};

/** True when a required scalar is absent or the parser read an empty value. */
const absentList = (field: ScalarField): boolean =>
  field.kind === 'list' && field.items.length === 0;

/** True when a URL parses and uses the https scheme. */
const hasHttpsScheme = (url: string): boolean => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

/** First seven characters of a commit id, or `(none)`. */
const sha7 = (sha: string | undefined): string =>
  sha === undefined || sha === '' ? '(none)' : sha.slice(0, 7);

/** Every level-1 heading line in `body`. */
const levelOneHeadings = (body: string): ReadonlyArray<string> =>
  body.split(/\r?\n/).filter((line) => /^#(?!#)\s+\S/.test(line));

/**
 * Mechanically verify one `REFERENCE.md` against the B001 store contract.
 * Pure — no IO; the caller supplies the raw bytes and the directory name.
 * @param slug - entry directory name
 * @param markdown - raw `REFERENCE.md` contents
 * @param options - root/invocation used only in message text
 * @returns the result; `valid` is true only with zero error-severity issues
 */
export const verifyReferenceFile = (
  slug: string,
  markdown: string,
  options: VerifyOptions = {},
): VerifyResult => {
  const issues: Array<Issue> = [];
  const parsed = Reference.parseReferenceFile(markdown);
  if (parsed === null) {
    return { valid: false, issues: [issue('frontmatter', 'Missing frontmatter block.')] };
  }
  const { fields, body } = parsed;
  const root = options.root ?? '<root>';

  const name = scalarField(fields, 'name');
  if (name.kind === 'missing' || absentList(name)) {
    issues.push(issue('name', 'Required frontmatter field is missing or empty.'));
  } else if (name.kind === 'list') {
    issues.push(issue('name', 'Must be lowercase alphanumeric groups joined by single hyphens.'));
  } else {
    if (name.value.length > 64) issues.push(issue('name', 'Must be 1-64 chars.'));
    if (!Reference.SLUG_PATTERN.test(name.value)) {
      issues.push(issue('name', 'Must be lowercase alphanumeric groups joined by single hyphens.'));
    }
    if (name.value !== slug) {
      issues.push(issue('name', `Must match the directory name '${slug}'.`));
    }
  }

  const url = scalarField(fields, 'url');
  if (url.kind === 'missing' || absentList(url)) {
    issues.push(issue('url', 'Required frontmatter field is missing or empty.'));
  } else if (url.kind === 'list' || !hasHttpsScheme(url.value)) {
    issues.push(issue('url', 'Must be an https:// URL; ssh and scp-style sources are not stored.'));
  } else if (!Reference.isValidUrl(url.value)) {
    issues.push(
      issue(
        'url',
        'Must be https://<host>/<owner>/<repo>[.git] with no credentials, query, or fragment.',
      ),
    );
  }

  const purpose = scalarField(fields, 'purpose');
  if (purpose.kind === 'missing' || absentList(purpose)) {
    issues.push(issue('purpose', 'Required frontmatter field is missing or empty.'));
  } else if (purpose.kind === 'list') {
    issues.push(issue('purpose', "Must be one sentence without '#' or ': '."));
  } else {
    if (purpose.value.length < 1 || purpose.value.length > 280) {
      issues.push(issue('purpose', 'Must be 1-280 chars.'));
    }
    if (purpose.value.includes('#') || purpose.value.includes(': ')) {
      issues.push(issue('purpose', "Must be one sentence without '#' or ': '."));
    }
    if (!purpose.value.endsWith('.')) {
      issues.push(issue('purpose', "Must end with '.'."));
    }
  }

  const added = scalarField(fields, 'added');
  if (added.kind === 'missing' || absentList(added)) {
    issues.push(issue('added', 'Required frontmatter field is missing or empty.'));
  } else if (added.kind === 'list' || !Reference.ISO_DATE_PATTERN.test(added.value)) {
    issues.push(issue('added', 'Must be an ISO date (YYYY-MM-DD).'));
  }

  const rawRef = fields.ref;
  if (rawRef !== undefined) {
    if (Array.isArray(rawRef)) {
      if (rawRef.length === 0) {
        issues.push(
          warning('ref', 'Drop the empty ref line; omit the key for a default-branch entry.'),
        );
      } else {
        issues.push(issue('ref', 'Must be a branch, tag, or 7-40 char commit id.'));
      }
    } else if (rawRef.trim() === '') {
      issues.push(
        warning('ref', 'Drop the empty ref line; omit the key for a default-branch entry.'),
      );
    } else if (!Reference.isValidRef(rawRef)) {
      issues.push(issue('ref', 'Must be a branch, tag, or 7-40 char commit id.'));
    }
  }

  for (const key of Object.keys(fields)) {
    if (KNOWN_KEY_SET.has(key)) continue;
    if (FORBIDDEN_KEY_SET.has(key)) {
      issues.push(
        issue(
          key,
          `The clone path is derived as ${root}/${Reference.CLONE_DIR}/${slug}; it is never stored.`,
        ),
      );
    } else {
      issues.push(
        warning(key, 'Unknown frontmatter field; allowed keys are name, url, purpose, added, ref.'),
      );
    }
  }

  if (!/^#\s+Notes\s*$/m.test(body)) {
    issues.push(issue('body', 'Missing `# Notes` section.'));
  }
  if (levelOneHeadings(body).length > 1) {
    issues.push(issue('body', "Must contain exactly one '# Notes' heading."));
  }
  if (body.includes(`${Reference.CLONE_DIR}/`)) {
    issues.push(
      issue('body', 'Body restates the derived clone path; clone state is derived at read time.'),
    );
  }

  return { valid: noErrors(issues), issues };
};

/** One parsed duplicate key candidate. */
interface DuplicateCandidate {
  readonly slug: string;
  readonly value: string;
}

/** Add duplicate findings to the per-entry result map. */
const applyDuplicates = (
  results: Map<string, Array<Issue>>,
  candidates: ReadonlyArray<DuplicateCandidate>,
  field: 'name' | 'url',
): void => {
  const groups = new Map<string, Array<string>>();
  for (const candidate of candidates) {
    const owners = groups.get(candidate.value) ?? [];
    owners.push(candidate.slug);
    groups.set(candidate.value, owners);
  }
  for (const owners of groups.values()) {
    if (owners.length < 2) continue;
    const first = owners[0] ?? '';
    for (const owner of owners.slice(1)) {
      const issues = results.get(owner);
      if (issues === undefined) continue;
      issues.push(
        issue(
          field,
          field === 'name'
            ? `Duplicate slug; also declared by '${first}'.`
            : `Duplicate URL after normalization; already registered as '${first}'.`,
        ),
      );
    }
  }
};

/**
 * Mechanically verify a whole store snapshot. Clone-free: every input is
 * committed store state the caller read, and no clone path is touched.
 * @param snapshot - scanned store contents, including `present: false` for a missing root
 * @param options - root/invocation used only in message text
 * @returns one block per entry plus store-level findings; `valid` ignores warnings
 */
export const verifyStore = (
  snapshot: StoreSnapshot,
  options: VerifyOptions = {},
): StoreVerifyResult => {
  if (!snapshot.present) {
    return {
      valid: false,
      entries: [
        {
          entry: Reference.STORE_DIR,
          issues: [
            issue(
              'store',
              `Store root ${Reference.STORE_DIR}/ is missing; run '${options.invocation ?? DEFAULT_INVOCATION} doctor'.`,
            ),
          ],
        },
      ],
    };
  }

  const entries = snapshot.entries.toSorted((left, right) => left.slug.localeCompare(right.slug));
  const results = new Map<string, Array<Issue>>();
  const nameCandidates: Array<DuplicateCandidate> = [];
  const urlCandidates: Array<DuplicateCandidate> = [];

  for (const entry of entries) {
    const issues: Array<Issue> = [];
    results.set(entry.slug, issues);

    if (!Reference.isValidName(entry.slug)) {
      issues.push(issue('entry', `Directory name '${entry.slug}' is not a valid slug.`));
    }

    for (const file of entry.extraFiles ?? []) {
      issues.push(warning('entry', `Unexpected file '${file}' in the entry directory.`));
    }

    if (entry.raw === undefined) {
      issues.push(issue('entry', `Directory '${entry.slug}' has no ${Reference.ENTRY_FILE}.`));
      continue;
    }

    const verified = verifyReferenceFile(entry.slug, entry.raw, options);
    issues.push(...verified.issues);

    const parsed = Reference.parseReferenceFile(entry.raw);
    if (parsed !== null) {
      const name = fieldString(parsed.fields, 'name');
      if (name !== undefined && name.trim() !== '') {
        nameCandidates.push({ slug: entry.slug, value: name });
      }
      const url = fieldString(parsed.fields, 'url');
      if (url !== undefined && url.trim() !== '') {
        urlCandidates.push({ slug: entry.slug, value: Reference.normalizeUrl(url) });
      }
    }
  }

  applyDuplicates(results, nameCandidates, 'name');
  applyDuplicates(results, urlCandidates, 'url');

  const verifiedEntries: Array<VerifiedEntry> = entries.map((entry) => ({
    entry: Reference.entryPath(entry.slug),
    issues: results.get(entry.slug) ?? [],
  }));
  const allIssues = verifiedEntries.flatMap((entry) => entry.issues);
  return { valid: noErrors(allIssues), entries: verifiedEntries };
};

/**
 * Map one clone observation onto the clone-scope issue classes. Additive — the
 * caller obtains the observation from `CloneProbe` and opts into this pass.
 * @param observation - read-only clone state
 * @param reference - the entry whose recorded `ref`/URL are compared
 * @param options - invocation named by actionable messages
 * @returns the clone-scope findings
 */
export const verifyClone = (
  observation: CloneObservation,
  reference: Reference.Reference,
  options: VerifyOptions = {},
): VerifyResult => {
  const issues: Array<Issue> = [];
  const invocation = options.invocation ?? DEFAULT_INVOCATION;

  if (!observation.present) {
    issues.push(issue('path', `Clone is missing; run '${invocation} sync ${reference.name}'.`));
    return { valid: false, issues };
  }
  if (!observation.isDirectory) {
    issues.push(
      issue('path', `Clone path '${observation.path}' is not a directory (file or symlink).`),
    );
    return { valid: false, issues };
  }
  if (!observation.gitWorkTree) {
    issues.push(issue('git', 'Not a git work tree.'));
    return { valid: false, issues };
  }
  if (observation.dirtyError !== undefined) {
    issues.push(issue('dirty', `Clone status could not be read: ${observation.dirtyError}.`));
  } else if (observation.dirtyPaths > 0) {
    issues.push(issue('dirty', `Clone has ${observation.dirtyPaths} changed paths.`));
  }
  if (!observation.matchesOrigin) {
    issues.push(
      issue(
        'origin',
        `Clone origin '${observation.origin ?? '(none)'}' does not match '${reference.url}'.`,
      ),
    );
  }
  if (reference.ref !== undefined && reference.ref !== '') {
    if (observation.refResolved === false) {
      issues.push(issue('ref', `Ref '${reference.ref}' does not resolve in the clone.`));
    } else if (!observation.matchesRef) {
      issues.push(
        issue(
          'head',
          `Clone HEAD ${sha7(observation.head)} does not match ref '${reference.ref}' (${sha7(observation.resolvedRefHead)}).`,
        ),
      );
    }
  } else {
    const comparison = compareUnpinned(observation.currentRef, observation.defaultBranch);
    if (comparison.kind === 'no-upstream') {
      issues.push(
        issue(
          'head',
          `Clone records no origin default branch; run '${invocation} sync ${reference.name}'.`,
        ),
      );
    } else if (comparison.kind === 'detached') {
      issues.push(
        issue('head', `Clone HEAD is detached; expected branch '${comparison.expected}'.`),
      );
    } else if (comparison.kind === 'branch') {
      issues.push(
        issue(
          'head',
          `Clone is on branch '${comparison.current}', expected '${comparison.expected}'.`,
        ),
      );
    }
  }

  return { valid: noErrors(issues), issues };
};
