import { Effect, FileSystem } from 'effect';

import {
  GATE_CODES,
  type GateStage,
  isPlaceholderCommand,
  stageScope,
} from '../../modules/gates/index.js';
import { isScopeToken, scopeContains } from '../../modules/scheduler/index.js';

import { SurfaceError, diagnostic } from './cli.shared.module.js';

/** The owner of one `GATES.md`: the phase, or one task inside it. */
export interface GateOwner {
  /** Path under the spec directory, e.g. `A` or `A/A001-implement`. */
  readonly prefix: string;
  /** Human label used in messages. */
  readonly label: string;
}

export const gateFailure = (input: {
  readonly code: string;
  readonly path: string;
  readonly field: string;
  readonly problem: string;
  readonly rerun: string;
  readonly expected?: string | undefined;
  readonly actual?: string | undefined;
  readonly fix?: string | undefined;
}): SurfaceError =>
  new SurfaceError({
    operation: 'SpecGate',
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

/** Path of one gate file inside a spec, relative to the spec root. */
export const gateFilePath = (owner: GateOwner, file: string): string => `${owner.prefix}/${file}`;

/** One selected stage plus its command, or the refusal that stops it. */
export type StageSelection =
  | { readonly kind: 'ok'; readonly stages: ReadonlyArray<GateStage> }
  | { readonly kind: 'refused'; readonly error: SurfaceError };

/** Validate one mechanical stage's command line for execution. */
const commandOf = (stage: GateStage, owner: GateOwner, name: string): SurfaceError | undefined => {
  const commands = stage.metadata.filter((entry) => entry.key === 'command');
  const path = gateFilePath(owner, 'GATES.md');
  if (commands.length !== 1) {
    return gateFailure({
      code: GATE_CODES.malformedMetadata,
      path,
      field: 'GATES.md',
      problem: `Mechanical stage ${stage.stage ?? '?'} must carry exactly one \`command:\` line; found ${commands.length}.`,
      rerun: `mf-specs gate run --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''}`,
      expected: 'exactly one `command: <shell command>`',
      actual: `${commands.length} command lines`,
      fix: 'Add one `command:` line between the stage heading and its first checklist item.',
    });
  }
  const command = stage.command ?? '';
  if (command.trim() === '') {
    return gateFailure({
      code: GATE_CODES.malformedMetadata,
      path,
      field: 'GATES.md',
      problem: `Mechanical stage ${stage.stage ?? '?'} has an empty \`command:\` line.`,
      rerun: `mf-specs gate run --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''}`,
      expected: 'a shell command to execute',
      actual: 'empty',
      fix: 'Write the command that proves this stage.',
    });
  }
  if (isPlaceholderCommand(command)) {
    return gateFailure({
      code: GATE_CODES.placeholderCommand,
      path,
      field: 'GATES.md',
      problem: `Mechanical stage ${stage.stage ?? '?'} command is still a placeholder: '${command}'.`,
      rerun: `mf-specs gate run --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''}`,
      expected: 'the real command that proves this stage',
      actual: command,
      fix: 'Replace the placeholder with the command the stage actually runs.',
    });
  }
  return undefined;
};

/**
 * Select the stages one run executes. `--stage` selects exactly one and is
 * refused for an unknown, unclassified, or subjective stage; the default and
 * `--all` select every mechanical stage in ascending order.
 * @param stages - every parsed stage
 * @param owner - owner for messages
 * @param name - spec name for the repair command
 * @param options - stage/all selection
 * @returns the selected stages or one refusal
 */
export const selectStages = (
  stages: ReadonlyArray<GateStage>,
  owner: GateOwner,
  name: string,
  options: { readonly stage?: number | undefined; readonly all?: boolean | undefined },
): StageSelection => {
  if (options.stage !== undefined) {
    const stage = stages.find((candidate) => candidate.stage === options.stage);
    if (stage === undefined) {
      return {
        kind: 'refused',
        error: gateFailure({
          code: GATE_CODES.stageUnknown,
          path: gateFilePath(owner, 'GATES.md'),
          field: '--stage',
          problem: `${owner.label} has no stage ${options.stage}.`,
          rerun: `mf-specs gate run --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''}`,
          expected: 'a stage number declared in GATES.md',
          actual: String(options.stage),
          fix: 'Pick a stage number this GATES.md declares.',
        }),
      };
    }
    if (stage.kind === undefined) {
      return {
        kind: 'refused',
        error: gateFailure({
          code: GATE_CODES.kindMissing,
          path: gateFilePath(owner, 'GATES.md'),
          field: 'GATES.md',
          problem: `Stage ${options.stage} has no (mechanical) or (subjective) kind, so it is not runnable.`,
          rerun: `mf-specs gate run --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''}`,
          expected: 'a classified stage heading',
          actual: stage.heading,
          fix: 'Add `(mechanical)` to the stage heading and a `command:` line.',
        }),
      };
    }
    if (stage.kind === 'subjective') {
      return {
        kind: 'refused',
        error: gateFailure({
          code: GATE_CODES.notMechanical,
          path: gateFilePath(owner, 'GATES.md'),
          field: '--stage',
          problem: `Stage ${options.stage} is subjective; a reviewer records it, the CLI never runs it.`,
          rerun: `mf-specs gate record --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''} --stage ${options.stage} --judge <slug> --verdict pass|fail --note <text>`,
          expected: 'a mechanical stage for `gate run`',
          actual: stage.heading,
          fix: 'Have the named reviewer record this stage with `gate record`.',
        }),
      };
    }
    const problem = commandOf(stage, owner, name);
    return problem === undefined
      ? { kind: 'ok', stages: [stage] }
      : { kind: 'refused', error: problem };
  }

  const mechanical = stages
    .filter((stage) => stage.kind === 'mechanical')
    .toSorted((left, right) => (left.stage ?? 0) - (right.stage ?? 0));
  if (mechanical.length === 0) {
    return {
      kind: 'refused',
      error: gateFailure({
        code: GATE_CODES.noMechanicalStages,
        path: gateFilePath(owner, 'GATES.md'),
        field: 'GATES.md',
        problem: `${owner.label} declares no mechanical stage to run.`,
        rerun: `mf-specs gate run --name ${name} --phase ${owner.prefix.split('/')[0] ?? ''}`,
        expected: 'at least one stage classified `(mechanical)` with a `command:` line',
        actual: 'no mechanical stages',
        fix: 'Classify a stage as mechanical and name its command, or use `gate record` for a subjective review.',
      }),
    };
  }
  for (const stage of mechanical) {
    const problem = commandOf(stage, owner, name);
    if (problem !== undefined) return { kind: 'refused', error: problem };
  }
  return { kind: 'ok', stages: mechanical };
};

/** Everything the pre-pass needs to resolve and validate one stage's scope. */
export interface StageScopeInput {
  /** Owner the run belongs to. */
  readonly owner: GateOwner;
  /** Owner-relative `GATES.md` path used in refusals. */
  readonly gatesPath: string;
  /** Spec name for the repair command. */
  readonly name: string;
  /** Phase id for the repair command. */
  readonly phase: string;
  /** Selected stages, in run order. */
  readonly stages: ReadonlyArray<GateStage>;
  /** Scope a stage without a `scope:` line inherits, when it has one. */
  readonly fallbackScope: ReadonlyArray<string> | undefined;
  /** `--scope` override, when the caller passed one. */
  readonly explicitScope: ReadonlyArray<string> | undefined;
  /** Confirm every path in a scope exists, naming the stage on refusal. */
  readonly exists: (
    scopes: ReadonlyArray<string>,
    stage: string,
  ) => Effect.Effect<void, SurfaceError, FileSystem.FileSystem>;
}

/**
 * Resolve every selected stage's declared scope and validate it — missing,
 * malformed, nonexistent, and the explicit override's coverage — before any
 * stage runs, so a usage error never leaves earlier stages executed and their
 * records appended.
 * @param input - owner, gates path, selection, fallback/override scopes, and the existence check
 * @returns each selected stage's declared scope, in run order
 */
export const resolveStageScopes = (
  input: StageScopeInput,
): Effect.Effect<
  ReadonlyArray<ReadonlyArray<string> | undefined>,
  SurfaceError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const { owner, gatesPath, name, phase, stages, fallbackScope, explicitScope } = input;
    const declaredScopes = stages.map((stage) => stageScope(stage) ?? fallbackScope);
    const stageLabel = (index: number): string => `stage ${stages[index]?.stage ?? index}`;
    for (const [index] of stages.entries()) {
      const declared = declaredScopes[index];
      const scopes = explicitScope ?? declared;
      if (scopes === undefined) {
        return yield* Effect.fail(
          gateFailure({
            code: GATE_CODES.scopeMissing,
            path: gatesPath,
            field: 'scope',
            problem: `${owner.label} ${stageLabel(index)} has no resolvable scope.`,
            rerun: `mf-specs gate run --name ${name} --phase ${phase}`,
            expected: 'a `scope:` line, a task `write-scope:`, or `--scope`',
            actual: 'no scope',
            fix: 'Declare `scope: <path[,path]>` on every selected stage, or give the task a `write-scope:` field.',
          }),
        );
      }
      const badScope = scopes.find((token) => !isScopeToken(token));
      if (badScope !== undefined) {
        return yield* Effect.fail(
          gateFailure({
            code: GATE_CODES.invalidScope,
            path: badScope,
            field: 'scope',
            problem: `${owner.label} ${stageLabel(index)} declares scope '${badScope}', which is outside the scope grammar.`,
            rerun: `mf-specs gate run --name ${name} --phase ${phase}`,
            expected: 'a repo-root-relative path (optional trailing /), comma-separated, or `repo`',
            actual: badScope,
            fix: 'Remove the leading /, `..`, glob, or whitespace from the scope.',
          }),
        );
      }
      if (
        explicitScope !== undefined &&
        declared !== undefined &&
        !scopeContains(explicitScope, declared)
      ) {
        return yield* Effect.fail(
          gateFailure({
            code: GATE_CODES.invalidScope,
            path: explicitScope.join(','),
            field: '--scope',
            problem: `--scope '${explicitScope.join(',')}' does not cover ${stageLabel(index)}'s declared scope '${declared.join(',')}'.`,
            rerun: `mf-specs gate run --name ${name} --phase ${phase} --scope ${declared.join(',')}`,
            expected: `a scope covering '${declared.join(',')}'`,
            actual: explicitScope.join(','),
            fix: 'Widen --scope to cover every selected stage; a narrower run cannot prove the stage.',
          }),
        );
      }
      // Existence, named by stage, before the first execution.
      yield* input.exists(scopes, stageLabel(index));
    }
    return declaredScopes;
  });
