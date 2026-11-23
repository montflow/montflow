import { Effect } from 'effect';
import * as Extension from '../../modules/extension/index.js';
import * as Principle from '../../modules/principle/index.js';
import { PrincipleStore } from '../../services/index.js';

/**
 * Headless engines for the principle store: structured arguments in, data out,
 * failures as a displayable string. No argv and no output, so every front end
 * shares one behaviour. `root` is always the workspace root. Two stores are
 * read: the repo's extensions at `<root>/.agents/@montflow/mf-mode/extensions/principles`
 * first, then the shipped `<root>/.agents/@montflow/principles`.
 */

/** The store layer every engine needs; the binary provides it. */
export const Live = PrincipleStore.Default;

/** One `list` row: the index line agents read. */
export interface ListRow {
  readonly name: string;
  readonly description: string;
  /** Where the entry came from; a row not shipped names it. */
  readonly source: Extension.Source;
}

/** One principle's verification result, paired with its name. */
export interface VerifyEntry {
  /** The principle name, or `extension/<name>` for an extension. */
  readonly name: string;
  readonly result: Principle.VerifyResult;
}

/** A verification report: the whole store, or one named principle. */
export interface VerifyReport {
  readonly entries: ReadonlyArray<VerifyEntry>;
  /** Error-severity findings across every entry. */
  readonly issueCount: number;
  /** Warning-severity findings across every entry. */
  readonly warningCount: number;
}

/** What `verify` should cover. */
export interface VerifyOptions {
  /** One principle; omit for the whole store. */
  readonly name?: string | undefined;
  /** Verify the whole store. Refused together with `name`. */
  readonly all?: boolean | undefined;
  /** Caller form named in refusals (`mf-mode principles`). */
  readonly invocation: string;
}

const storeMessage = (error: PrincipleStore.StoreError): string => error.message;

/** A requested-but-absent principle, reported rather than dropped. */
const notFound: Principle.VerifyResult = {
  valid: false,
  issues: [{ field: 'principle', message: `No ${Principle.FILE} in the store.` }],
};

/**
 * Every resolved principle that decodes, as its index line.
 * @param root - workspace root
 * @returns name-sorted rows, each with its source
 */
export const list = (
  root: string,
): Effect.Effect<ReadonlyArray<ListRow>, string, PrincipleStore.PrincipleStore> =>
  Effect.gen(function* () {
    const store = yield* PrincipleStore.PrincipleStore;
    const { entries } = yield* store.resolve(root).pipe(Effect.mapError(storeMessage));
    const rows = yield* Effect.forEach(entries, ({ name, source, text }) =>
      Principle.decodeFile(name, text).pipe(
        Effect.map(({ description }): ListRow | undefined => ({ name, description, source })),
        Effect.orElseSucceed(() => undefined),
      ),
    );
    return rows.filter((row): row is ListRow => row !== undefined);
  });

/**
 * One resolved principle: its provenance line, then the document. A shipped,
 * replacing, or added principle prints its file bytes unchanged.
 * @param root - workspace root
 * @param name - principle slug
 * @param invocation - caller form named in the refusal
 * @returns the text to print, failing with a fix-it line when the name is unknown
 */
export const show = (
  root: string,
  name: string,
  invocation: string,
): Effect.Effect<string, string, PrincipleStore.PrincipleStore> =>
  Effect.gen(function* () {
    const store = yield* PrincipleStore.PrincipleStore;
    const { entries } = yield* store.resolve(root).pipe(Effect.mapError(storeMessage));
    const entry = entries.find((candidate) => candidate.name === name);
    if (entry === undefined || entry.text === '') {
      return yield* Effect.fail(
        `Unknown principle '${name}'. Run \`${invocation} list\` to see the store.`,
      );
    }
    return `${Extension.provenance(entry.source, entry.name)}\n${entry.text}`;
  });

/**
 * One extension's findings: why its `extends` does not resolve, or what its
 * resolved document breaks.
 * @param resolution - both stores, resolved
 * @param name - the extension's directory name
 * @returns the extension's result
 */
const verifyExtension = (
  resolution: Extension.Resolution,
  name: string,
): Principle.VerifyResult => {
  const entry = resolution.entries.find(
    (candidate) => candidate.name === name && candidate.source.kind === 'extension',
  );
  const issues: ReadonlyArray<Principle.VerifyIssue> = [
    ...resolution.issues
      .filter((issue) => issue.name === name)
      .map(({ field, message }) => ({ field, message })),
    ...(entry === undefined ? [] : Principle.verifyFile(name, entry.text).issues),
  ];
  return { valid: !issues.some(Principle.isError), issues };
};

/**
 * Mechanically verify one principle or the whole store, reading raw files so
 * a file the store cannot decode is reported rather than skipped. Each
 * extension is reported as `extension/<name>`, verified as the document it
 * resolves to.
 * @param root - workspace root
 * @param options - the one name or `all`, plus the caller form
 * @returns the report, failing on a usage refusal or an unreadable store
 */
export const verify = (
  root: string,
  options: VerifyOptions,
): Effect.Effect<VerifyReport, string, PrincipleStore.PrincipleStore> =>
  Effect.gen(function* () {
    if (options.all === true && options.name !== undefined) {
      return yield* Effect.fail(
        `usage: pass either <name> or --all, not both (${options.invocation} verify <name>)`,
      );
    }
    const store = yield* PrincipleStore.PrincipleStore;
    const [shipped, extensions] = yield* Effect.all([
      store.readAllRaw(root),
      store.readExtensionsRaw(root),
    ]).pipe(Effect.mapError(storeMessage));
    const resolution = Extension.resolve(shipped, extensions, Principle.KIND);
    const picked = (raws: ReadonlyArray<PrincipleStore.RawEntry>) =>
      options.name === undefined ? raws : raws.filter((entry) => entry.name === options.name);
    const selected: ReadonlyArray<VerifyEntry> = [
      ...picked(shipped).map(({ name, raw }) => ({
        name,
        result: Principle.verifyFile(name, raw),
      })),
      ...picked(extensions).map(({ name }) => ({
        name: `extension/${name}`,
        result: verifyExtension(resolution, name),
      })),
    ];
    const entries: ReadonlyArray<VerifyEntry> =
      options.name !== undefined && selected.length === 0
        ? [{ name: options.name, result: notFound }]
        : selected;
    const issues = entries.flatMap((entry) => entry.result.issues);
    const issueCount = Principle.errorCount(issues);
    return { entries, issueCount, warningCount: issues.length - issueCount };
  });
