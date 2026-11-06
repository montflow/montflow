import { Effect } from 'effect';

import { rigorOfSpec } from '../../modules/creation/index.js';
import { parseMarkdown } from '../../modules/frontmatter/index.js';
import { PHASE_PATTERN, parseSpecFile, readSpecVersion } from '../../modules/spec/index.js';
import { type Task, parseTaskFile, phaseOf, phaseRank } from '../../modules/task/index.js';
import type { Rigor } from '../../modules/rigor/index.js';
import type { SpecSnapshot } from '../../modules/structure/index.js';
import { SpecStore } from '../../services/index.js';

import { SURFACE_CODES, SurfaceError, diagnostic } from './cli.shared.module.js';

/** One coded authoring refusal shared by `init`, `new-phase`, and `new-task`. */
export const authoringFailure = (
  operation: string,
  input: {
    readonly code: string;
    readonly path: string;
    readonly field: string;
    readonly problem: string;
    readonly rerun: string;
    readonly expected?: string | undefined;
    readonly actual?: string | undefined;
    readonly fix?: string | undefined;
  },
): SurfaceError =>
  new SurfaceError({
    operation,
    diagnostics: [
      diagnostic({
        code: input.code,
        path: input.path,
        field: input.field,
        problem: input.problem,
        rerun: input.rerun,
        expected: input.expected,
        actual: input.actual,
        fix: input.fix,
      }),
    ],
  });

/** The phase ids of a snapshot, in rank order. */
export const phaseIds = (snapshot: SpecSnapshot): ReadonlyArray<string> => {
  const ids = new Set<string>();
  for (const entry of snapshot.files) {
    const head = entry.path.split('/')[0] ?? '';
    if (PHASE_PATTERN.test(head)) ids.add(head);
  }
  return [...ids].toSorted((a, b) => phaseRank(a) - phaseRank(b));
};

/** Every parsed task in one phase. */
export const tasksIn = (snapshot: SpecSnapshot, phase: string): ReadonlyArray<Task> => {
  const tasks: Array<Task> = [];
  for (const entry of snapshot.files) {
    if ((entry.kind ?? 'file') !== 'file' || !entry.path.endsWith('/TASK.md')) continue;
    const task = parseTaskFile(entry.content);
    if (task !== undefined && phaseOf(task.id) === phase) tasks.push(task);
  }
  return tasks;
};

/** Read one spec, refusing a missing spec or a pre-v2 tree. */
export const readSpec = (
  root: string,
  name: string,
  operation: string,
): Effect.Effect<
  { readonly snapshot: SpecSnapshot; readonly specText: string; readonly rigor: Rigor | undefined },
  SurfaceError | SpecStore.StoreError,
  SpecStore.SpecStore
> =>
  Effect.gen(function* () {
    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.exists(root, name))) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: SURFACE_CODES.unknownSpec,
          path: name,
          field: '--name',
          problem: `Spec '${name}' does not exist under ${root}.`,
          rerun: 'mf-specs list',
        }),
      );
    }
    const snapshot = yield* store.snapshot(root, name);
    const specText = snapshot.files.find((entry) => entry.path === 'SPEC.md')?.content ?? '';
    const parsed = parseMarkdown(specText);
    if (parsed === null || parseSpecFile(specText) === undefined) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: SURFACE_CODES.unknownSpec,
          path: `${name}/SPEC.md`,
          field: 'SPEC.md',
          problem: `Spec '${name}' has no readable SPEC.md.`,
          rerun: `mf-specs check --name ${name}`,
          fix: 'Repair SPEC.md before authoring into the spec.',
        }),
      );
    }
    if (readSpecVersion(parsed.fields).version !== 2) {
      return yield* Effect.fail(
        authoringFailure(operation, {
          code: 'spec.version-outdated',
          path: name,
          field: 'spec-version',
          problem: `Spec '${name}' is not on the v2 standard.`,
          rerun: `mf-specs migrate --name ${name}`,
          expected: 'spec-version: 2',
          actual: 'version 1',
          fix: 'Run migrate, then re-run this verb.',
        }),
      );
    }
    return { snapshot, specText, rigor: rigorOfSpec(specText) };
  });

/** Comma-separated values; blank or absent reads as an empty list. */
export const csv = (value: string | undefined): ReadonlyArray<string> =>
  (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
