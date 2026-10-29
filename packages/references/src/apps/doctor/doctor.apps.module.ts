import { Effect, FileSystem, Path } from 'effect';
import * as Git from '../../modules/git/index.js';
import * as Reference from '../../modules/reference/index.js';
import * as Verifier from '../../modules/verifier/index.js';
import { ReferenceStore } from '../../services/index.js';
import { EMBEDDED_SKILL_PAYLOAD } from './embedded-payload.generated.js';

/**
 * `mf-references doctor` — the binary, and the `/mf-references` slash command of
 * the same name: verify the workspace scaffolding, the committed registry, and
 * the packaged skills, then repair what it can.
 *
 * Eight checks run in a fixed order: `store-root`, `registry`, `clone-root`,
 * `gitkeep`, `gitignore`, `skills-installed`, `skills-current`,
 * `retired-skills`. The first seven can be repaired; the retired-name warning
 * never fails a run because deleting a user skill is a migration decision, not
 * a doctor one.
 *
 * `--check` is report-only: it writes nothing, asserts nothing, and treats
 * every would-be repair as drift so a CI cell can gate on it. No check reads a
 * clone, so a tarball checkout with zero clones is healthy apart from the
 * scaffolding it genuinely lacks.
 */

/** Skills this package ships and `doctor` installs into `.agents/skills/`. */
export const SKILL_NAMES = ['montflow-add-reference', 'montflow-find-reference'] as const;

/** The checks, in the order they run and print. */
export const CHECK_NAMES = [
  'store-root',
  'registry',
  'clone-root',
  'gitkeep',
  'gitignore',
  'skills-installed',
  'skills-current',
  'retired-skills',
] as const;

/** Generic skills this package replaced; `doctor` warns, it never deletes. */
export const RETIRED_SKILL_NAMES = ['adding-references', 'finding-references'] as const;

/** Where one check ended up. */
export type CheckStatus = 'ok' | 'repaired' | 'drifted';

/** One doctor check's outcome. */
export interface DoctorCheck {
  /** Check id, as the report prints it. */
  readonly name: string;
  readonly status: CheckStatus;
  /** One-line explanation of what was found, repaired, or is still wrong. */
  readonly detail: string;
  /**
   * True for an advisory finding that never fails the run — currently only the
   * retired-skill names. `doctor` has no other warning class.
   */
  readonly warning?: boolean;
}

/** One whole doctor run. */
export interface DoctorResult {
  readonly status: CheckStatus;
  /** True when every check is ok or repaired. */
  readonly healthy: boolean;
  readonly checks: ReadonlyArray<DoctorCheck>;
}

/** How to run: repair what can be repaired, or only report. */
export interface DoctorOptions {
  /** Report only — never write and never spawn git. */
  readonly check?: boolean;
  /** How the caller reaches `doctor`, used in the fix-it line. */
  readonly invocation?: string | undefined;
}

/** Default invocation text `doctor` threads into its fix-it hints. */
export const DEFAULT_DOCTOR_INVOCATION = '/mf-references doctor';

/** Every service a doctor run needs. */
export type DoctorDeps =
  | FileSystem.FileSystem
  | Path.Path
  | Git.GitPort
  | ReferenceStore.ReferenceStore;

/** A skill's packaged files, as filename → contents. */
export type SkillPayload = Readonly<Record<string, string>>;

/** Where a resolved payload came from. */
export type PayloadOrigin = 'package' | 'embedded';

/** A skill's payload plus provenance, for the report. */
export interface ResolvedPayload {
  readonly files: SkillPayload;
  readonly origin: PayloadOrigin;
  /** Human-readable location shown in the status line. */
  readonly source: string;
}

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Directory the package ships its skills in. Absent in a compiled binary. */
export const shippedSkillsDir = (path: Path.Path): string =>
  path.join(path.resolve(import.meta.dirname, '..', '..', '..'), 'skills');

/** Directory `doctor` installs one skill into. */
export const installedSkillDir = (path: Path.Path, root: string, name: string): string =>
  path.join(root, '.agents', 'skills', name);

/** True when `file` exists; never fails. */
const exists = (fs: FileSystem.FileSystem, file: string): Effect.Effect<boolean> =>
  fs.exists(file).pipe(Effect.orElseSucceed(() => false));

/** One file's contents, or undefined when it is absent. */
const readIfPresent = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<string | undefined> =>
  fs.readFileString(file).pipe(Effect.orElseSucceed(() => undefined));

/** Sorted file names directly under a directory; empty when it cannot be read. */
const listFiles = (fs: FileSystem.FileSystem, dir: string): Effect.Effect<ReadonlyArray<string>> =>
  fs.readDirectory(dir).pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));

/**
 * Outcome of reading one packaged skill's own files: a payload, or the reason
 * it cannot be one. A skill payload is a flat name→text map, so a directory
 * (or any non-regular entry) beside `SKILL.md` is not carryable.
 */
type PackageRead =
  | { readonly kind: 'files'; readonly files: SkillPayload }
  | { readonly kind: 'no-skill' }
  | { readonly kind: 'not-a-dir' }
  | { readonly kind: 'unreadable-dir' }
  | { readonly kind: 'not-a-file'; readonly entry: string }
  | { readonly kind: 'unreadable'; readonly entry: string };

/** Read a skill's files from a directory on disk, keyed by file name. */
const readFromPackage = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
): Effect.Effect<PackageRead> =>
  Effect.gen(function* () {
    const entries = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => undefined));
    if (entries === undefined) {
      const info = yield* fs.stat(dir).pipe(Effect.orElseSucceed(() => undefined));
      if (info === undefined) return { kind: 'no-skill' } as const;
      return info.type === 'Directory'
        ? ({ kind: 'unreadable-dir' } as const)
        : ({ kind: 'not-a-dir' } as const);
    }
    const names = entries.filter((name) => !name.startsWith('.')).toSorted();
    if (!names.includes('SKILL.md')) return { kind: 'no-skill' } as const;
    const files: Record<string, string> = {};
    for (const name of names) {
      const full = path.join(dir, name);
      const info = yield* fs.stat(full).pipe(Effect.orElseSucceed(() => undefined));
      if (info === undefined) return { kind: 'unreadable', entry: name } as const;
      if (info.type !== 'File') return { kind: 'not-a-file', entry: name } as const;
      const text = yield* readIfPresent(fs, full);
      if (text === undefined) return { kind: 'unreadable', entry: name } as const;
      files[name] = text;
    }
    return { kind: 'files', files } as const;
  }).pipe(Effect.orDie);

/**
 * Resolve one skill's payload, preferring the package directory and falling
 * back to the embedded copy for a compiled binary.
 * @param fs - filesystem service
 * @param path - path service
 * @param name - skill name
 * @param shippedDir - the package `skills/` directory, which may not exist
 * @returns the payload and its origin, or undefined when it is unavailable
 */
export const readPayload = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  name: string,
  shippedDir: string,
): Effect.Effect<ResolvedPayload | undefined> =>
  readFromPackage(fs, path, path.join(shippedDir, name)).pipe(
    Effect.map((fromDisk) => {
      if (fromDisk.kind === 'files') {
        return {
          files: fromDisk.files,
          origin: 'package',
          source: path.join(shippedDir, name),
        } satisfies ResolvedPayload;
      }
      const embedded = EMBEDDED_SKILL_PAYLOAD[name];
      return embedded === undefined
        ? undefined
        : ({
            files: embedded,
            origin: 'embedded',
            source: 'embedded in this build',
          } satisfies ResolvedPayload);
    }),
  );

/** Write a payload's files into the target directory. */
const writePayload = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
  files: SkillPayload,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    yield* fs
      .makeDirectory(target, { recursive: true })
      .pipe(
        Effect.mapError(
          (cause) => `failed: doctor could not create '${target}': ${reasonOf(cause)}`,
        ),
      );
    for (const [name, text] of Object.entries(files)) {
      const to = path.join(target, name);
      yield* fs
        .writeFileString(to, text)
        .pipe(
          Effect.mapError((cause) => `failed: doctor could not write '${to}': ${reasonOf(cause)}`),
        );
    }
  });

/** Describe the first file whose installed contents differ from the payload. */
const firstDifference = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
  files: SkillPayload,
): Effect.Effect<string | undefined> =>
  Effect.gen(function* () {
    for (const [name, shipped] of Object.entries(files)) {
      const installed = yield* readIfPresent(fs, path.join(target, name));
      if (installed === shipped) continue;
      return installed === undefined
        ? `${name} is missing from the installed copy`
        : `${name} differs from the packaged version`;
    }
    return undefined;
  }).pipe(Effect.orDie);

/** The skills extension runtime, resolved lazily. */
type SkillsLib = typeof import('@montflow/skills');

let cached: Promise<SkillsLib> | undefined;

/** Single lazy import: a failure clears the cache so the next run retries. */
const importOnce = (): Promise<SkillsLib> => {
  cached ??= import('@montflow/skills').catch((cause: unknown) => {
    cached = undefined;
    throw cause;
  });
  return cached;
};

/** The skills runtime, or undefined when it is unavailable — never fails. */
const loadSkills = (): Effect.Effect<SkillsLib | undefined> =>
  Effect.tryPromise(() => importOnce()).pipe(Effect.orElseSucceed(() => undefined));

/** One-line rendering of a standard-verifier failure, or undefined when valid. */
const standardIssue = (libs: SkillsLib, name: string, markdown: string): string | undefined => {
  const result = libs.Skill.verifyStandardSkillFile(name, markdown);
  if (result.valid) return undefined;
  return result.issues.map((found) => `[${found.field}] ${found.message}`).join('; ');
};

/** One verification issue, attributed to its entry. */
const describeIssue = (entry: string, found: Verifier.Issue): string =>
  `${entry} [${found.field}] ${found.message}`;

/** One committed packaged skill's verification block. */
export interface PackagedSkillReport {
  /** Workspace-relative `SKILL.md` path the block is attributed to. */
  readonly path: string;
  readonly valid: boolean;
  readonly issues: ReadonlyArray<Verifier.Issue>;
}

/** Options for {@link verifyPackagedSkills}. */
export interface PackagedSkillOptions {
  /** Override the shipped `skills/` directory (tests and non-package roots). */
  readonly skillsDir?: string | undefined;
}

/**
 * Verify the committed packaged-skill bytes: every shipped skill must exist,
 * carry a `SKILL.md` that passes the `@montflow/skills` standard, and — for the
 * shipped directory — match the embedded payload byte for byte.
 *
 * `doctor` owns the installed copies and their freshness; this pass owns the
 * committed source, so `verify` alone can fail on a broken packaged skill.
 * When the shipped `skills/` directory exists it is the source of truth: a
 * missing skill directory or `SKILL.md` is an issue, never a fallback to the
 * embedded copy (that fallback is only for a compiled binary with no source).
 * Never fails: unavailable evidence is reported as an error issue.
 * @param options - shipped-directory override
 * @returns one block per shipped skill
 */
export const verifyPackagedSkills = (
  options: PackagedSkillOptions = {},
): Effect.Effect<ReadonlyArray<PackagedSkillReport>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const shipped = options.skillsDir ?? shippedSkillsDir(path);
    const shippedPresent = yield* exists(fs, shipped);
    // A broken skills root is one cause for every skill, so name it directly
    // instead of reporting each skill as missing from an unreadable directory.
    let rootProblem: string | undefined;
    if (shippedPresent) {
      const info = yield* fs.stat(shipped).pipe(Effect.orElseSucceed(() => undefined));
      if (info === undefined) {
        rootProblem = `Packaged skills directory '${shipped}' cannot be read.`;
      } else if (info.type !== 'Directory') {
        rootProblem = `Packaged skills path '${shipped}' is not a directory.`;
      } else if (
        (yield* fs.readDirectory(shipped).pipe(Effect.orElseSucceed(() => undefined))) === undefined
      ) {
        rootProblem = `Packaged skills directory '${shipped}' cannot be read.`;
      }
    }
    const libs = yield* loadSkills();
    const reports: Array<PackagedSkillReport> = [];

    for (const name of SKILL_NAMES) {
      const issues: Array<Verifier.Issue> = [];
      const sourceDir = path.join(shipped, name);
      let files: SkillPayload | undefined;
      if (rootProblem !== undefined) {
        issues.push(Verifier.issue('payload', rootProblem));
      } else if (shippedPresent) {
        const read = yield* readFromPackage(fs, path, sourceDir);
        if (read.kind === 'files') {
          files = read.files;
        } else {
          const dirPresent = yield* exists(fs, sourceDir);
          const message =
            read.kind === 'no-skill'
              ? dirPresent
                ? `Packaged skill '${name}' has no SKILL.md.`
                : `Packaged skill '${name}' is missing from '${sourceDir}'.`
              : read.kind === 'unreadable-dir'
                ? `Packaged skill '${name}' directory '${sourceDir}' cannot be read.`
                : read.kind === 'not-a-dir'
                  ? `Packaged skill '${name}' path '${sourceDir}' is not a directory.`
                  : read.kind === 'not-a-file'
                    ? `Packaged skill '${name}' contains '${read.entry}', which is not a regular file and cannot be carried in the payload.`
                    : `Packaged skill '${name}' has an unreadable '${read.entry}'.`;
          issues.push(Verifier.issue('payload', message));
        }
      } else {
        const payload = yield* readPayload(fs, path, name, shipped);
        if (payload === undefined) {
          issues.push(
            Verifier.issue('payload', `Packaged skill '${name}' is unavailable in this build.`),
          );
        } else {
          files = payload.files;
        }
      }
      if (files !== undefined) {
        const markdown = files['SKILL.md'];
        if (markdown === undefined) {
          issues.push(Verifier.issue('payload', `Packaged skill '${name}' has no SKILL.md.`));
        } else if (libs === undefined) {
          issues.push(
            Verifier.issue(
              'payload',
              `Could not load @montflow/skills to verify packaged skill '${name}'.`,
            ),
          );
        } else {
          for (const found of libs.Skill.verifyStandardSkillFile(name, markdown).issues) {
            issues.push(Verifier.issue(found.field, found.message));
          }
        }
        if (options.skillsDir === undefined) {
          const embedded = EMBEDDED_SKILL_PAYLOAD[name];
          if (embedded !== undefined && !samePayload(embedded, files)) {
            issues.push(
              Verifier.issue(
                'payload',
                `Embedded copy of '${name}' differs from the committed skill files; run 'bun run --cwd packages/references generate:payload'.`,
              ),
            );
          }
        }
      }
      reports.push({
        path: `packages/references/skills/${name}/SKILL.md`,
        valid: Verifier.noErrors(issues),
        issues,
      });
    }
    return reports;
  });

/** Bounded, order-independent payload equality for one skill. */
const samePayload = (left: SkillPayload, right: SkillPayload): boolean => {
  const leftNames = Object.keys(left).toSorted();
  const rightNames = Object.keys(right).toSorted();
  if (leftNames.length !== rightNames.length) return false;
  return leftNames.every((name, index) => name === rightNames[index] && left[name] === right[name]);
};

const check = (name: string, status: CheckStatus, detail: string, warning = false): DoctorCheck =>
  warning ? { name, status, detail, warning: true } : { name, status, detail };

/**
 * Check the workspace scaffolding, the registry, and the packaged skills, and
 * unless `check` is set repair what can be repaired. Idempotent: a healthy
 * workspace is never rewritten.
 * @param root - workspace root that owns `.agents/`
 * @param options - set `check` to report without writing
 * @returns one outcome per check, the aggregate status, and whether it is healthy
 */
export const runDoctor = (
  root: string,
  options: DoctorOptions = {},
): Effect.Effect<DoctorResult, string, DoctorDeps> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const git = yield* Git.GitPort;
    const store = yield* ReferenceStore.ReferenceStore;
    const reportOnly = options.check === true;
    const invocation = options.invocation ?? DEFAULT_DOCTOR_INVOCATION;
    const checks: Array<DoctorCheck> = [];

    // 1. store-root — the committed registry directory.
    const storeDir = path.join(root, Reference.STORE_DIR);
    if (yield* exists(fs, storeDir)) {
      checks.push(check('store-root', 'ok', `present ${Reference.STORE_DIR}`));
    } else if (reportOnly) {
      checks.push(check('store-root', 'drifted', `missing ${Reference.STORE_DIR}`));
    } else {
      yield* fs
        .makeDirectory(storeDir, { recursive: true })
        .pipe(
          Effect.mapError(
            (cause) =>
              `failed: doctor could not create '${Reference.STORE_DIR}': ${reasonOf(cause)}`,
          ),
        );
      checks.push(check('store-root', 'repaired', `created ${Reference.STORE_DIR}`));
    }

    // 2. registry — CI-safe verification of committed bytes, never a clone.
    const snapshot = yield* store
      .scan(root)
      .pipe(Effect.mapError((error) => `failed: ${error.reason}`));
    if (!snapshot.present) {
      checks.push(check('registry', 'drifted', `store-root missing; nothing to verify`));
    } else {
      const verified = Verifier.verifyStore(snapshot, { root, invocation });
      const issues = verified.entries.flatMap((entry) =>
        entry.issues.map((found) => ({ entry: entry.entry, found })),
      );
      const errors = issues.filter(({ found }) => Verifier.isError(found));
      const warnings = issues.filter(({ found }) => Verifier.isWarning(found));
      const warningDetail =
        warnings.length === 0
          ? ''
          : ` warnings=${warnings.length} ${warnings
              .map(({ entry, found }) => describeIssue(entry, found))
              .join('; ')}`;
      if (errors.length === 0) {
        checks.push(check('registry', 'ok', `issues=0${warningDetail}`));
      } else {
        checks.push(
          check(
            'registry',
            'drifted',
            `issues=${errors.length}${warningDetail} ${errors
              .map(({ entry, found }) => describeIssue(entry, found))
              .join('; ')}`,
          ),
        );
      }
    }

    // 3. clone-root — the gitignored directory clones live under.
    const cloneRoot = path.join(root, Reference.CLONE_DIR);
    if (yield* exists(fs, cloneRoot)) {
      checks.push(check('clone-root', 'ok', `present ${Reference.CLONE_DIR}`));
    } else if (reportOnly) {
      checks.push(check('clone-root', 'drifted', `missing ${Reference.CLONE_DIR}`));
    } else {
      yield* fs
        .makeDirectory(cloneRoot, { recursive: true })
        .pipe(
          Effect.mapError(
            (cause) =>
              `failed: doctor could not create '${Reference.CLONE_DIR}': ${reasonOf(cause)}`,
          ),
        );
      checks.push(check('clone-root', 'repaired', `created ${Reference.CLONE_DIR}`));
    }

    // 4. gitkeep — a tracked placeholder the ignore rule would otherwise hide.
    const keepRelative = `${Reference.CLONE_DIR}/.gitkeep`;
    const keep = path.join(root, Reference.CLONE_DIR, '.gitkeep');
    if (yield* exists(fs, keep)) {
      checks.push(check('gitkeep', 'ok', `present ${keepRelative}`));
    } else if (reportOnly) {
      checks.push(check('gitkeep', 'drifted', `missing ${keepRelative}`));
    } else {
      yield* fs
        .writeFileString(keep, '')
        .pipe(
          Effect.mapError(
            (cause) => `failed: doctor could not write '${keepRelative}': ${reasonOf(cause)}`,
          ),
        );
      const gitDir = yield* exists(fs, path.join(root, '.git'));
      if (!gitDir) {
        checks.push(check('gitkeep', 'repaired', `created ${keepRelative} (not a git work tree)`));
      } else {
        const staged = yield* git.addForce(root, [keepRelative]);
        if (staged.ok) {
          checks.push(check('gitkeep', 'repaired', `created ${keepRelative}`));
        } else {
          checks.push(
            check(
              'gitkeep',
              'drifted',
              `created ${keepRelative} but could not stage it: ${staged.message}`,
            ),
          );
        }
      }
    }

    // 5. gitignore — one predicate, one line, never a negation or a duplicate.
    const ignoreFile = path.join(root, '.gitignore');
    const ignoreText = yield* fs.readFileString(ignoreFile).pipe(Effect.orElseSucceed(() => ''));
    if (Git.hasIgnoreRule(ignoreText)) {
      checks.push(check('gitignore', 'ok', `present ${Reference.CLONE_DIR}`));
    } else if (reportOnly) {
      checks.push(check('gitignore', 'drifted', `missing ${Reference.CLONE_DIR}`));
    } else {
      yield* fs
        .writeFileString(ignoreFile, Git.appendIgnoreRule(ignoreText))
        .pipe(
          Effect.mapError(
            (cause) => `failed: doctor could not write '.gitignore': ${reasonOf(cause)}`,
          ),
        );
      checks.push(check('gitignore', 'repaired', `appended ${Reference.CLONE_DIR}`));
    }

    // Resolve both payloads once; skills-installed and skills-current share them.
    const shipped = shippedSkillsDir(path);
    const payloads = new Map<string, ResolvedPayload | undefined>();
    for (const name of SKILL_NAMES) {
      payloads.set(name, yield* readPayload(fs, path, name, shipped));
    }
    const origins = [
      ...new Set(
        [...payloads.values()]
          .map((payload) => payload?.origin)
          .filter((origin): origin is PayloadOrigin => origin !== undefined),
      ),
    ];
    const originDetail = origins.length === 0 ? '' : ` origin=${origins.join('+')}`;

    // 6. skills-installed — presence only; freshness is the next check.
    const missingSkills: Array<string> = [];
    for (const name of SKILL_NAMES) {
      const names = (yield* listFiles(fs, installedSkillDir(path, root, name)))
        .filter((file) => !file.startsWith('.'))
        .toSorted();
      if (!names.includes('SKILL.md')) missingSkills.push(name);
    }
    if (missingSkills.length === 0) {
      checks.push(
        check('skills-installed', 'ok', `installed=${SKILL_NAMES.length}${originDetail}`),
      );
    } else if (reportOnly) {
      checks.push(check('skills-installed', 'drifted', `missing ${missingSkills.join(', ')}`));
    } else {
      for (const name of missingSkills) {
        const payload = payloads.get(name);
        if (payload === undefined) {
          return yield* Effect.fail(
            `failed: packaged skill '${name}' is not available on disk at '${path.join(shipped, name)}' and is not embedded in this build — reinstall @montflow/references`,
          );
        }
        yield* writePayload(fs, path, installedSkillDir(path, root, name), payload.files);
      }
      checks.push(
        check(
          'skills-installed',
          'repaired',
          `installed ${missingSkills.join(', ')}${originDetail}`,
        ),
      );
    }

    // 7. skills-current — byte freshness, file-set mismatches, and the standard.
    const libs = yield* loadSkills();
    const currentProblems: Array<string> = [];
    const currentNotes: Array<string> = [];
    let rewrote = false;
    for (const name of SKILL_NAMES) {
      const target = installedSkillDir(path, root, name);
      const payload = payloads.get(name);
      if (payload === undefined) {
        currentProblems.push(`payload unavailable for ${name}`);
        continue;
      }
      const installedNames = (yield* listFiles(fs, target))
        .filter((file) => !file.startsWith('.'))
        .toSorted();
      if (!installedNames.includes('SKILL.md')) {
        currentProblems.push(`missing ${name}`);
        continue;
      }
      const payloadNames = Object.keys(payload.files).toSorted();
      const extras = installedNames.filter((file) => !payloadNames.includes(file));
      const absent = payloadNames.filter((file) => !installedNames.includes(file));
      const difference =
        absent.length === 0 ? yield* firstDifference(fs, path, target, payload.files) : undefined;

      if (absent.length > 0 || difference !== undefined) {
        if (reportOnly) {
          currentProblems.push(
            absent.length > 0
              ? `mismatched ${name}: missing ${absent.join(', ')}`
              : `stale ${name}: ${difference ?? 'content differs'}`,
          );
        } else {
          yield* writePayload(fs, path, target, payload.files);
          rewrote = true;
          currentNotes.push(`rewrote ${name}`);
        }
      }
      if (extras.length > 0) {
        currentNotes.push(`extra file(s): ${extras.join(', ')} in ${name}`);
      }

      const installed = yield* readIfPresent(fs, path.join(target, 'SKILL.md'));
      if (installed === undefined) {
        currentProblems.push(`missing ${name}`);
        continue;
      }
      if (libs === undefined) {
        currentProblems.push(`could not load @montflow/skills to verify ${name}`);
        continue;
      }
      const invalid = standardIssue(libs, name, installed);
      if (invalid !== undefined) currentProblems.push(`invalid ${name}: ${invalid}`);
    }
    const currentDetail = [
      `skills=${SKILL_NAMES.length}`,
      ...currentNotes,
      ...(origins.length === 0 ? [] : [`origin=${origins.join('+')}`]),
    ].join(' ');
    if (currentProblems.length > 0) {
      checks.push(check('skills-current', 'drifted', currentProblems.join('; ')));
    } else if (rewrote) {
      checks.push(check('skills-current', 'repaired', currentDetail));
    } else {
      checks.push(check('skills-current', 'ok', currentDetail));
    }

    // 8. retired-skills — advisory only; deleting a user skill is not doctor's job.
    const retired: Array<string> = [];
    for (const name of RETIRED_SKILL_NAMES) {
      if (yield* exists(fs, installedSkillDir(path, root, name))) retired.push(name);
    }
    if (retired.length === 0) {
      checks.push(check('retired-skills', 'ok', 'none'));
    } else {
      checks.push(
        check(
          'retired-skills',
          'ok',
          `warning: retired names ${RETIRED_SKILL_NAMES.join(' and ')}; present: ${retired.join(', ')}; remove with git rm -r ${retired
            .map((name) => `.agents/skills/${name}`)
            .join(' ')}`,
          true,
        ),
      );
    }

    const drifted = checks.filter((entry) => entry.status === 'drifted').length;
    const repaired = checks.filter((entry) => entry.status === 'repaired').length;
    return {
      status: drifted > 0 ? 'drifted' : repaired > 0 ? 'repaired' : 'ok',
      healthy: drifted === 0,
      checks,
    };
  });

/**
 * The short message a gate stops on. Deliberately terse: the full report is one
 * command away.
 * @param result - result from a {@link runDoctor} call
 * @param invocation - how the caller reaches `doctor`, so the advice is typeable
 * @returns one or two lines naming what is wrong and the fix
 */
export const doctorGateMessage = (
  result: DoctorResult,
  invocation: string = DEFAULT_DOCTOR_INVOCATION,
): string => {
  const broken = result.checks.filter((entry) => entry.status === 'drifted');
  return [
    `Reference workspace is not ready: ${broken
      .map((entry) => `${entry.name} (${entry.detail})`)
      .join('; ')}.`,
    `Run \`${invocation}\` to repair, then retry.`,
  ].join('\n');
};
