import { Effect } from 'effect';
import * as Principle from '../../modules/principle/index.js';
import { PrincipleStore } from '../../services/index.js';

/**
 * Headless engines for the principle store: structured arguments in, data out,
 * failures as a displayable string. No argv and no output, so every front end
 * shares one behaviour. `root` is always the workspace root; the store is
 * `<root>/.agents/@montflow/principles`.
 */

/** The store layer every engine needs; the binary provides it. */
export const Live = PrincipleStore.Default;

/** One `list` row: the index line agents read. */
export interface ListRow {
  readonly name: string;
  readonly description: string;
}

/** One principle's verification result, paired with its name. */
export interface VerifyEntry {
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
 * Every principle that decodes, as its index line.
 * @param root - workspace root
 * @returns name-sorted rows
 */
export const list = (
  root: string,
): Effect.Effect<ReadonlyArray<ListRow>, string, PrincipleStore.PrincipleStore> =>
  Effect.gen(function* () {
    const store = yield* PrincipleStore.PrincipleStore;
    const principles = yield* store.list(root).pipe(Effect.mapError(storeMessage));
    return principles.map(({ name, description }) => ({ name, description }));
  });

/**
 * One principle's file bytes, unchanged.
 * @param root - workspace root
 * @param name - principle slug
 * @param invocation - caller form named in the refusal
 * @returns the raw file, failing with a fix-it line when the name is unknown
 */
export const show = (
  root: string,
  name: string,
  invocation: string,
): Effect.Effect<string, string, PrincipleStore.PrincipleStore> =>
  Effect.gen(function* () {
    const store = yield* PrincipleStore.PrincipleStore;
    return yield* store
      .readRaw(root, name)
      .pipe(
        Effect.mapError((error) => `${error.message} Run \`${invocation} list\` to see the store.`),
      );
  });

/**
 * Mechanically verify one principle or the whole store, reading raw files so
 * a file the store cannot decode is reported rather than skipped.
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
    const raws = yield* store.readAllRaw(root).pipe(Effect.mapError(storeMessage));
    const selected =
      options.name === undefined ? raws : raws.filter((entry) => entry.name === options.name);
    const entries: ReadonlyArray<VerifyEntry> =
      options.name !== undefined && selected.length === 0
        ? [{ name: options.name, result: notFound }]
        : selected.map(({ name, raw }) => ({ name, result: Principle.verifyFile(name, raw) }));
    const issues = entries.flatMap((entry) => entry.result.issues);
    const issueCount = Principle.errorCount(issues);
    return { entries, issueCount, warningCount: issues.length - issueCount };
  });
